"""Optional local LaMa repair inside an explicitly reviewed garment domain.

This development tool loads only the pinned model already in ``.cache/models``.
It never downloads a model, uploads an image, infers a repair domain, or writes
media. Only RGB at opaque, unoccluded pixel centres inside the supplied convex
quad can change. A plausible model result still requires visual/video review.
"""
from pathlib import Path
import hashlib
import time

import cv2
import numpy as np


ROOT = Path(__file__).resolve().parent.parent
MODEL_SHA256 = '7df918ac3921d3daf0aae1d219776cf0dc4e4935f035af81841b40adcf74fdf2'
FLOAT_MODEL_SHA256 = '8de2164d55c759b65ba69c2414baf1403fab172ba5c4f3f9167391780eb13b42'
FIXED_MODEL_SHA256 = 'd5d8aaf29a3fd1905bfe0042029ae0dafc4daf6d1cffea2dbc81e21d0dc02dd2'
MODEL_SIZE = 512
BACKGROUND_RGB = np.float32([233, 229, 241])


def _context(value):
    if isinstance(value, bool) or not isinstance(value, (int, np.integer)) or not 32 <= value <= 2048:
        raise ValueError('context must be an integer in 32..2048')
    return int(value)


def _frame(value):
    value = np.asarray(value)
    if value.dtype != np.uint8 or value.ndim != 3 or value.shape[2] != 4 or min(value.shape[:2]) < 1:
        raise ValueError('Expected nonempty uint8 straight-alpha RGBA')
    return value


def repair_mask(frame_rgba, repair_quad, occlusion=None):
    """Return a bool mask; every nonzero foreground value protects its pixel.

    Test pixel centres against the exact quad, avoiding rounded polygon vertices
    that could grow a fractional boundary into adjacent trim or foreground.
    """
    frame = _frame(frame_rgba)
    height, width = frame.shape[:2]
    quad = np.asarray(repair_quad, np.float64)
    if quad.shape != (4, 2) or not np.isfinite(quad).all():
        raise ValueError('repair_quad must contain four finite x,y points')
    if not cv2.isContourConvex(quad.astype(np.float32)) or abs(cv2.contourArea(quad.astype(np.float32))) < 4:
        raise ValueError('repair_quad must be a convex noncrossing polygon of area >= 4')
    if (quad < 0).any() or (quad[:, 0] > width-1).any() or (quad[:, 1] > height-1).any():
        raise ValueError('repair_quad must remain inside the source frame')
    if abs(cv2.contourArea(quad.astype(np.float32))) > height * width * .35:
        raise ValueError('repair_quad exceeds the safe frame fraction')
    lo = np.floor(quad.min(0)).astype(int)
    hi = np.ceil(quad.max(0)).astype(int) + 1
    yy, xx = np.mgrid[lo[1]:hi[1], lo[0]:hi[0]]
    sides = []
    for a, b in zip(quad, np.roll(quad, -1, axis=0)):
        sides.append((b[0]-a[0]) * (yy-a[1]) - (b[1]-a[1]) * (xx-a[0]))
    sides = np.asarray(sides)
    inside = (sides >= 0).all(0) | (sides <= 0).all(0)
    mask = np.zeros((height, width), bool)
    mask[lo[1]:hi[1], lo[0]:hi[0]] = inside
    mask &= frame[:, :, 3] >= 180
    if occlusion is not None:
        blocked = np.asarray(occlusion)
        if blocked.shape != mask.shape:
            raise ValueError('occlusion must match source height/width')
        if blocked.dtype == np.bool_:
            pass
        elif np.issubdtype(blocked.dtype, np.integer):
            if (blocked < 0).any() or (blocked > 255).any():
                raise ValueError('Integer occlusion values must be in 0..255')
        elif np.issubdtype(blocked.dtype, np.floating):
            if not np.isfinite(blocked).all() or (blocked < 0).any() or (blocked > 1).any():
                raise ValueError('Float occlusion values must be in 0..1')
        else:
            raise ValueError('Unsupported occlusion dtype')
        mask &= blocked == 0
    return mask


def validate_session(session):
    """Refuse a different tensor contract before any inference can run."""
    inputs = session.get_inputs()
    outputs = session.get_outputs()
    expected = {'image': 3, 'mask': 1}
    if len(inputs) != 2 or {v.name for v in inputs} != set(expected) or len(outputs) != 1:
        raise ValueError('Unexpected local LaMa input/output names')
    for node in [*inputs, *outputs]:
        channels = expected.get(node.name, 3)
        shape = node.shape
        if (node.type != 'tensor(float)' or len(shape) != 4 or
                shape[0] not in (None, 'batch', 1) or
                list(shape[1:]) != [channels, MODEL_SIZE, MODEL_SIZE]):
            raise ValueError('Local LaMa requires fixed float NCHW 512 tensors')
    if outputs[0].name != 'output':
        raise ValueError('Unexpected local LaMa output name')


def apply_session(frame_rgba, repair_quad, session, *, context=256, occlusion=None):
    """Apply a supplied session; exported for deterministic boundary tests.

    Normal callers should use ``LocalInpainter`` so the model path and content
    are verified. This lower-level function still validates tensor contracts,
    masks and output before copying any prediction into its returned frame.
    """
    frame = _frame(frame_rgba)
    context = _context(context)
    mask = repair_mask(frame, repair_quad, occlusion)
    count = int(np.count_nonzero(mask))
    stats = {'repair_method': 'local-lama', 'repair_pixels': count,
             'alpha_changed': 0, 'skipped': None, 'context': context,
             'inference_seconds': 0.0}
    if not count:
        stats['skipped'] = 'hidden-quad'
        return frame.copy(), stats
    height, width = frame.shape[:2]
    cw, ch = min(context, width), min(context, height)
    centre = np.asarray(repair_quad, np.float64).mean(0)
    x0 = int(np.clip(np.rint(centre[0]-cw/2), 0, width-cw))
    y0 = int(np.clip(np.rint(centre[1]-ch/2), 0, height-ch))
    x1, y1 = x0+cw, y0+ch
    selected = mask[y0:y1, x0:x1]
    if np.count_nonzero(selected) != count:
        raise ValueError('Reviewed repair domain does not fit the selected context')
    roi = frame[y0:y1, x0:x1]
    alpha = roi[:, :, 3:].astype(np.float32) / 255
    rgb = roi[:, :, :3] * alpha + BACKGROUND_RGB * (1-alpha)
    bgr = cv2.resize(rgb.astype(np.uint8)[:, :, ::-1], (MODEL_SIZE, MODEL_SIZE))
    image = np.ascontiguousarray(bgr.transpose(2, 0, 1)[None], dtype=np.float32) / 255
    resized_mask = cv2.resize(selected.astype(np.uint8), (MODEL_SIZE, MODEL_SIZE),
                              interpolation=cv2.INTER_NEAREST)
    if not np.any(resized_mask):
        raise ValueError('Reviewed repair mask disappeared at model resolution')
    inputs = {'image': image,
              'mask': np.ascontiguousarray(resized_mask[None, None], dtype=np.float32)}
    validate_session(session)
    started = time.perf_counter()
    values = session.run(['output'], inputs)
    stats['inference_seconds'] = round(time.perf_counter()-started, 4)
    if len(values) != 1:
        raise ValueError('Local LaMa returned an unexpected output count')
    output = np.asarray(values[0])
    if (output.shape != (1, 3, MODEL_SIZE, MODEL_SIZE) or output.dtype != np.float32 or
            not np.isfinite(output).all()):
        raise ValueError('Local LaMa returned invalid shape, dtype or nonfinite values')
    # This pinned export already clamps BGR intensities to the display range.
    # Refuse a different/broken output instead of hiding it through clipping.
    minimum, maximum = float(output.min()), float(output.max())
    if minimum < 0 or maximum > 255:
        raise ValueError('Local LaMa returned intensities outside its BGR 0..255 contract')
    stats.update(output_min=minimum, output_max=maximum, crop=[x0, y0, x1, y1])
    rgb = output[0].transpose(1, 2, 0).astype(np.uint8)[:, :, ::-1]
    predicted = cv2.resize(rgb, (cw, ch), interpolation=cv2.INTER_AREA)
    result = frame.copy()
    destination = result[y0:y1, x0:x1, :3]
    destination[selected] = predicted[selected]
    return result, stats


class LocalInpainter:
    """Verified local CPU model, loaded only on the first visible repair."""
    def __init__(self, model_path, context=256, threads=4, provider='cpu'):
        self.context = _context(context)
        if provider not in ('cpu', 'cuda'):
            raise ValueError('Local inpainting provider must be cpu or cuda')
        self.provider = provider
        self.runtime_version = None
        if isinstance(threads, bool) or not isinstance(threads, int) or not 1 <= threads <= 16:
            raise ValueError('threads must be an integer in 1..16')
        self.threads = threads
        self.model_path = Path(model_path).resolve()
        if not self.model_path.is_relative_to((ROOT / '.cache/models').resolve()) or self.model_path.suffix != '.onnx':
            raise ValueError('Local LaMa must already exist under project .cache/models')
        digest = hashlib.sha256()
        with self.model_path.open('rb') as source:
            for chunk in iter(lambda: source.read(1024*1024), b''):
                digest.update(chunk)
        self.model_sha256 = digest.hexdigest()
        if self.model_sha256 not in (MODEL_SHA256, FLOAT_MODEL_SHA256, FIXED_MODEL_SHA256):
            raise ValueError('Local LaMa model SHA256 differs from the pinned artifact')
        if provider == 'cuda' and self.model_sha256 not in (FLOAT_MODEL_SHA256, FIXED_MODEL_SHA256):
            raise ValueError('CUDA requires the pinned float model with constant weights dequantized')
        self._session = None

    def _load_session(self):
        if self._session is None:
            import onnxruntime as ort
            options = ort.SessionOptions()
            options.log_severity_level = 3
            options.intra_op_num_threads = self.threads
            options.inter_op_num_threads = 1
            providers = ['CPUExecutionProvider']
            if self.provider == 'cuda':
                if 'CUDAExecutionProvider' not in ort.get_available_providers():
                    raise ValueError('Requested CUDA execution provider is unavailable')
                providers = [('CUDAExecutionProvider', {
                    'device_id': 0, 'cudnn_conv_algo_search': 'HEURISTIC',
                    'do_copy_in_default_stream': True, 'use_tf32': 0}),
                    'CPUExecutionProvider']
            session = ort.InferenceSession(str(self.model_path), sess_options=options,
                                           providers=providers)
            if self.provider == 'cuda' and 'CUDAExecutionProvider' not in session.get_providers():
                raise ValueError('Requested CUDA execution provider failed to initialize')
            validate_session(session)
            self._session = session
            self.runtime_version = ort.__version__
        return self._session

    def inpaint(self, frame_rgba, repair_quad, occlusion=None):
        # Hidden/all-transparent domains do not even import the optional runtime.
        if not np.any(repair_mask(frame_rgba, repair_quad, occlusion)):
            return _frame(frame_rgba).copy(), {
                'repair_method': 'local-lama', 'repair_pixels': 0, 'alpha_changed': 0,
                'skipped': 'hidden-quad', 'context': self.context, 'inference_seconds': 0.0,
                'model_sha256': self.model_sha256}
        result, stats = apply_session(frame_rgba, repair_quad, self._load_session(),
                                     context=self.context, occlusion=occlusion)
        stats['model_sha256'] = self.model_sha256
        return result, stats
