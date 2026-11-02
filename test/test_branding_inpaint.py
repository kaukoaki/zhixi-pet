"""Local neural repair must preserve foreground, domain boundaries and alpha."""
from pathlib import Path
import importlib.util
from types import SimpleNamespace
import unittest
from unittest import mock

import numpy as np


spec = importlib.util.spec_from_file_location(
    'branding_inpaint', Path(__file__).resolve().parents[1] / 'scripts/branding-inpaint.py')
inpaint = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inpaint)


class FakeSession:
    def __init__(self, output=None):
        self.calls = []
        self.output = output

    def get_inputs(self):
        return [SimpleNamespace(name=name, type='tensor(float)', shape=['batch', channels, 512, 512])
                for name, channels in [('image', 3), ('mask', 1)]]

    def get_outputs(self):
        return [SimpleNamespace(name='output', type='tensor(float)', shape=['batch', 3, 512, 512])]

    def run(self, names, values):
        self.calls.append((names, values))
        if self.output is not None:
            return [self.output]
        # BGR means the resulting repaired RGB must be 210, 120, 30.
        value = np.empty((1, 3, 512, 512), np.float32)
        value[:, 0], value[:, 1], value[:, 2] = 30, 120, 210
        return [value]


class BrandingInpaintTest(unittest.TestCase):
    def setUp(self):
        self.frame = np.full((64, 80, 4), [210, 220, 230, 255], np.uint8)
        self.frame[20:25, :, 3] = np.arange(80, dtype=np.uint8) * 3
        self.quad = [[20.3, 15.4], [47.6, 17.2], [46.8, 44.4], [18.7, 42.1]]

    def test_exact_domain_foreground_and_alpha_are_protected(self):
        original = self.frame.copy()
        foreground = np.zeros(self.frame.shape[:2], np.uint8)
        foreground[:, 31:35] = 255
        foreground[30:32, :] = 1  # Even a feathered edge is protected.
        session = FakeSession()
        result, stats = inpaint.apply_session(self.frame, self.quad, session,
                                              context=64, occlusion=foreground)
        allowed = inpaint.repair_mask(self.frame, self.quad, foreground)
        np.testing.assert_array_equal(result[~allowed], original[~allowed])
        np.testing.assert_array_equal(result[:, :, 3], original[:, :, 3])
        np.testing.assert_array_equal(self.frame, original)
        self.assertTrue(np.all(result[allowed, :3] == [210, 120, 30]))
        # Verify analytic boundary independently: x=20 is outside the first edge.
        self.assertFalse(allowed[16, 20])
        self.assertEqual(stats['repair_pixels'], int(allowed.sum()))
        self.assertIsNone(stats['skipped'])

    def test_inputs_use_bgr_0_to_1_and_binary_mask(self):
        self.frame[:] = [60, 120, 240, 255]
        session = FakeSession()
        inpaint.apply_session(self.frame, self.quad, session, context=64)
        names, values = session.calls[0]
        self.assertEqual(names, ['output'])
        self.assertEqual(values['image'].dtype, np.float32)
        self.assertEqual(values['image'].shape, (1, 3, 512, 512))
        np.testing.assert_allclose(values['image'][0, :, 0, 0], np.array([240, 120, 60])/255)
        self.assertEqual(values['mask'].shape, (1, 1, 512, 512))
        self.assertEqual(set(np.unique(values['mask'])), {0., 1.})

    def test_hidden_or_transparent_domain_skips_inference(self):
        for foreground in [np.ones((64, 80), bool), np.full((64, 80), .01, np.float32)]:
            with self.subTest(dtype=foreground.dtype):
                session = FakeSession()
                result, stats = inpaint.apply_session(self.frame, self.quad, session,
                                                      context=64, occlusion=foreground)
                self.assertEqual(session.calls, [])
                self.assertEqual(stats['skipped'], 'hidden-quad')
                np.testing.assert_array_equal(result, self.frame)
        self.frame[:, :, 3] = 179
        session = FakeSession()
        result, _ = inpaint.apply_session(self.frame, self.quad, session)
        self.assertEqual(session.calls, [])
        np.testing.assert_array_equal(result, self.frame)

    def test_edge_and_small_source_crop_is_within_real_pixels(self):
        frame = np.full((40, 50, 4), [220, 221, 222, 255], np.uint8)
        quad = [[0, 0], [12, 0], [12, 12], [0, 12]]
        result, stats = inpaint.apply_session(frame, quad, FakeSession(), context=256)
        self.assertEqual(stats['crop'], [0, 0, 50, 40])
        allowed = inpaint.repair_mask(frame, quad)
        np.testing.assert_array_equal(result[~allowed], frame[~allowed])

    def test_domain_larger_than_context_is_refused_without_truncation(self):
        quad = [[5, 5], [65, 5], [65, 30], [5, 30]]
        session = FakeSession()
        with self.assertRaisesRegex(ValueError, 'does not fit'):
            inpaint.apply_session(self.frame, quad, session, context=32)
        self.assertEqual(session.calls, [])

    def test_invalid_masks_quads_and_context_are_refused(self):
        bad_masks = [np.zeros((2, 2)), np.full((64, 80), np.nan),
                     np.full((64, 80), -1, np.int16), np.full((64, 80), 256, np.int16)]
        for mask in bad_masks:
            with self.subTest(mask_shape=mask.shape):
                with self.assertRaises(ValueError):
                    inpaint.apply_session(self.frame, self.quad, FakeSession(), occlusion=mask)
        for quad in [[[0, 0], [5, 5], [0, 5], [5, 0]], [[-1, 0], [5, 0], [5, 5], [0, 5]],
                     [[0, 0], [np.nan, 0], [5, 5], [0, 5]]]:
            with self.subTest(quad=quad):
                with self.assertRaises(ValueError):
                    inpaint.apply_session(self.frame, quad, FakeSession())
        for value in [31, 2049, True, 256.0]:
            with self.assertRaises(ValueError):
                inpaint.apply_session(self.frame, self.quad, FakeSession(), context=value)

    def test_bad_tensor_contract_and_outputs_fail_before_pixels_can_change(self):
        original = self.frame.copy()
        wrong = FakeSession()
        wrong.get_inputs = lambda: [SimpleNamespace(name='image', type='tensor(float)', shape=[1, 3, 256, 256])]
        with self.assertRaisesRegex(ValueError, 'input/output'):
            inpaint.apply_session(self.frame, self.quad, wrong)
        self.assertEqual(wrong.calls, [])
        bad_outputs = [np.zeros((1, 3, 32, 32), np.float32),
                       np.zeros((1, 3, 512, 512), np.float64),
                       np.full((1, 3, 512, 512), np.nan, np.float32),
                       np.full((1, 3, 512, 512), 300, np.float32)]
        for value in bad_outputs:
            with self.subTest(shape=value.shape, dtype=value.dtype):
                with self.assertRaises(ValueError):
                    inpaint.apply_session(self.frame, self.quad, FakeSession(value))
                np.testing.assert_array_equal(self.frame, original)

    def test_only_pinned_cache_model_is_accepted(self):
        with self.assertRaisesRegex(ValueError, '.cache/models'):
            inpaint.LocalInpainter(inpaint.ROOT/'actions/production/untrusted.onnx')
        # Do not load the optional runtime or allocate a real neural model.
        fake_path = inpaint.ROOT/'.cache/models/fake-inpaint-test.onnx'
        with mock.patch.object(Path, 'open', mock.mock_open(read_data=b'wrong artifact')):
            with self.assertRaisesRegex(ValueError, 'SHA256'):
                inpaint.LocalInpainter(fake_path)

    def test_invalid_provider_is_refused_before_model_access(self):
        for provider in ['auto', 'gpu', None]:
            with self.assertRaisesRegex(ValueError, 'provider'):
                inpaint.LocalInpainter(inpaint.ROOT/'.cache/models/absent.onnx', provider=provider)

    def test_cuda_request_never_silently_falls_back_to_cpu(self):
        for advertised, active, message in [
                (['CPUExecutionProvider'], ['CPUExecutionProvider'], 'unavailable'),
                (['CUDAExecutionProvider', 'CPUExecutionProvider'], ['CPUExecutionProvider'], 'initialize')]:
            with self.subTest(advertised=advertised):
                worker = object.__new__(inpaint.LocalInpainter)
                worker.provider = 'cuda'
                worker.threads = 2
                worker.model_path = Path('pinned-float-model.onnx')
                worker._session = None
                fake = mock.Mock()
                fake.get_available_providers.return_value = advertised
                fake.InferenceSession.return_value.get_providers.return_value = active
                with mock.patch.dict('sys.modules', {'onnxruntime': fake}):
                    with self.assertRaisesRegex(ValueError, message):
                        worker._load_session()
                self.assertIsNone(worker._session)
                if 'CUDAExecutionProvider' not in advertised:
                    fake.InferenceSession.assert_not_called()

    def test_cuda_session_keeps_float32_and_explicit_cpu_shape_fallback(self):
        worker = object.__new__(inpaint.LocalInpainter)
        worker.provider = 'cuda'
        worker.threads = 2
        worker.model_path = Path('pinned-float-model.onnx')
        worker._session = None
        session = FakeSession()
        session.get_providers = lambda: ['CUDAExecutionProvider', 'CPUExecutionProvider']
        fake = mock.Mock()
        fake.__version__ = 'test-runtime'
        fake.get_available_providers.return_value = session.get_providers()
        fake.InferenceSession.return_value = session
        with mock.patch.dict('sys.modules', {'onnxruntime': fake}):
            self.assertIs(worker._load_session(), session)
            self.assertIs(worker._load_session(), session)
        fake.InferenceSession.assert_called_once()
        providers = fake.InferenceSession.call_args.kwargs['providers']
        self.assertEqual(providers[0][0], 'CUDAExecutionProvider')
        self.assertEqual(providers[0][1]['use_tf32'], 0)
        self.assertEqual(providers[1], 'CPUExecutionProvider')
        self.assertEqual(worker.runtime_version, 'test-runtime')


if __name__ == '__main__':
    unittest.main()
