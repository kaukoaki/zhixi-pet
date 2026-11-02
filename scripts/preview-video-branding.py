"""Offline non-destructive costume-edit pilot; never registers production media.

Consumes manually reviewed tracking anchors. Writes versioned RGBA WebM trials,
per-frame coverage and before/after contact sheets outside the production tree.
"""
from pathlib import Path
import argparse
import hashlib
import importlib.util
import json
import subprocess
import sys
import time
from collections import Counter
from itertools import zip_longest

import cv2
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / '.cache/video-tools'))
import imageio_ffmpeg
cv2.setNumThreads(2)


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / filename)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


tracking = module('branding_tracking', 'branding-tracking.py')
composite = module('branding_composite', 'branding-composite.py')
LOCAL_PLANE = np.float32([[0, 0], [100, 0], [100, 100], [0, 100]])


def map_from_plane(points, parent_quad):
    parent = tracking._quad(parent_quad)
    matrix = cv2.getPerspectiveTransform(LOCAL_PLANE, parent)
    value = np.asarray(points, np.float32)
    if value.ndim != 2 or value.shape[1] != 2 or not np.isfinite(value).all():
        raise ValueError('Local-plane points must contain finite x,y pairs')
    return cv2.perspectiveTransform(value[None], matrix)[0]


def relative(file):
    return file.resolve().relative_to(ROOT).as_posix()


def sha(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def config_sha(config):
    canonical = json.dumps(config, sort_keys=True, separators=(',', ':'), ensure_ascii=False)
    return hashlib.sha256(canonical.encode('utf-8')).hexdigest()


def frames(file, width, height):
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    command = [ffmpeg, '-hide_banner', '-loglevel', 'error', '-nostdin',
               '-c:v', 'libvpx-vp9', '-i', str(file), '-f', 'rawvideo',
               '-pix_fmt', 'rgba', 'pipe:1']
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    size = width * height * 4
    try:
        while True:
            buffer = bytearray()
            while len(buffer) < size:
                part = process.stdout.read(size - len(buffer))
                if not part:
                    break
                buffer.extend(part)
            if not buffer:
                break
            if len(buffer) != size:
                raise RuntimeError('Incomplete decoded frame')
            yield np.frombuffer(buffer, np.uint8).reshape(height, width, 4).copy()
        if process.wait() != 0:
            raise RuntimeError('Video decode failed: ' + process.stderr.read().decode(errors='replace'))
    finally:
        if process.poll() is None:
            process.terminate()
            process.wait()
        process.stdout.close()
        process.stderr.close()


class AnchoredTrack:
    def __init__(self, config):
        self.config = config
        self.anchors = {item['frame']: item for item in config['keyframes']}
        self.hidden = True
        self.tracker = None
        self.locator = None
        self.reference_quad = None
        self.reference_features = None

    def update(self, frame, index, parent=None):
        if self.config.get('mode') == 'relative':
            if parent is None or not parent.get('visible'):
                return {'frame':index, 'quad':None, 'visible':False, 'confidence':0,
                        'reason':'parent-plane-unavailable'}
            state = tracking.interpolate_keyframes(self.config['keyframes'], index,
                max_gap=self.config.get('max_gap', 90))
            if state['visible']:
                state['quad'] = map_from_plane(state['quad'], parent['quad']).tolist()
                state['confidence'] = min(state['confidence'], parent['confidence'])
                state['reason'] = 'relative-plane'
            return state
        if self.config.get('mode') == 'manual':
            return tracking.interpolate_keyframes(self.config['keyframes'], index, max_gap=self.config.get('max_gap', 90))
        anchor = self.anchors.get(index)
        if anchor is not None:
            self.hidden = not anchor.get('visible', True)
            if not self.hidden:
                quad = anchor.get('quad') or tracking.box_quad(anchor['box'])
                features = anchor.get('feature_quad')
                if 'feature_box' in anchor:
                    features = tracking.box_quad(anchor['feature_box'])
                self.tracker = tracking.PlanarTracker(frame, quad, feature_quad=features,
                    frame_index=index, **self.config.get('options', {}))
                if self.config.get('reacquire'):
                    self.reference_quad = np.asarray(quad, np.float32)
                    self.reference_features = np.asarray(features if features is not None else quad, np.float32)
                    search = self.config.get('search_region')
                    try:
                        self.locator = tracking.TemplateLocator([{'image':frame, 'quad':quad,
                            'feature_quad':self.reference_features}], search_region=search)
                    except ValueError:
                        self.locator = None
                return self.tracker.last
        if self.hidden or self.tracker is None:
            return {'visible': False, 'reason': 'manual-hidden', 'confidence': 0, 'quad': None}
        state = self.tracker.update(frame, index)
        if not state['visible'] and self.locator is not None:
            found = self.locator.locate(frame, frame_index=index)
            if found['visible']:
                quad = np.asarray(found['quad'], np.float32)
                matrix = cv2.getAffineTransform(self.reference_quad[:3], quad[:3])
                features = cv2.transform(self.reference_features[None], matrix)[0]
                self.tracker = tracking.PlanarTracker(frame, quad, feature_quad=features,
                    frame_index=index, **self.config.get('options', {}))
                return found
        return state


def flatten(frame, size):
    value = Image.fromarray(frame, 'RGBA')
    value.thumbnail((size, size), Image.Resampling.LANCZOS)
    background = Image.new('RGBA', (size, size), '#e9e5f1')
    background.alpha_composite(value, ((size-value.width)//2, (size-value.height)//2))
    return background.convert('RGB')


def dark_cape_guard(frame, repair_quad, occlusion=None):
    """Explicit foreground profile for reviewed black-cape/ivory-shirt shots.

    Only dark components connected to OUTSIDE the reviewed repair domain are
    protected. An isolated dark old-logo stroke inside the shirt stays editable.
    This is never enabled by default and does not classify skin or white cloth.
    """
    domain = np.zeros(frame.shape[:2], np.uint8)
    cv2.fillConvexPoly(domain, np.rint(repair_quad).astype(np.int32), 255)
    dark = ((np.max(frame[:,:,:3], axis=2) < 135) & (frame[:,:,3] >= 180)).astype(np.uint8)
    dark = cv2.morphologyEx(dark,cv2.MORPH_CLOSE,np.ones((3,3),np.uint8))
    if occlusion is not None:
        # A glyph can visually touch a foreground cuff. Its strokes must not
        # inherit the cuff's foreground classification through that connection.
        # The explicit matte is still unioned back after this connectivity test.
        dark[(np.asarray(occlusion)>0)&(domain>0)]=0
    _, labels = cv2.connectedComponents(dark,connectivity=8)
    seeds = np.unique(labels[(domain == 0) & (dark > 0)])
    seeds = seeds[seeds > 0]
    if not len(seeds):
        return np.zeros(frame.shape[:2],np.uint8)
    mask = np.isin(labels,seeds).astype(np.uint8)*255
    return cv2.dilate(mask,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(5,5)))


def local_patch(frame, quad, asset, chest=False, options=None, occlusion_polygons=(), repair_quad=None,
                cleanup_polygons=(), donor_exclusion_polygons=None):
    q = np.asarray(quad, np.float32)
    rq = None if repair_quad is None else np.asarray(repair_quad, np.float32)
    if rq is not None and not chest:
        raise ValueError('A separate repair domain only applies to the chest')
    if cleanup_polygons and not chest:
        raise ValueError('Explicit ink cleanup only applies to the chest')
    if donor_exclusion_polygons is not None and not chest:
        raise ValueError('Explicit donor exclusions only apply to the chest')
    extent = q if rq is None else np.concatenate([q, rq])
    margin = (extent.max(axis=0)-extent.min(axis=0))*.45+4
    x0, y0 = np.maximum(0, np.floor(extent.min(axis=0)-margin)).astype(int)
    x1, y1 = np.minimum([frame.shape[1], frame.shape[0]], np.ceil(extent.max(axis=0)+margin)).astype(int)
    if x1 <= x0 or y1 <= y0:
        return {'skipped': 'offscreen', 'overlay_pixels': 0}
    roi = frame[y0:y1, x0:x1]
    occlusion = None
    if occlusion_polygons:
        occlusion = np.zeros(roi.shape[:2], np.uint8)
        for polygon in occlusion_polygons:
            # Rasterize in full-frame coordinates first. Round-to-even is not
            # invariant under an odd integer ROI shift for half-pixel points.
            points = np.rint(np.asarray(polygon)).astype(np.int32)-np.int32([x0, y0])
            cv2.fillPoly(occlusion, [points], 255)
    if chest:
        settings = dict(options or {})
        profile = settings.pop('foreground_profile',None)
        if profile is not None:
            if profile != 'dark-cape':
                raise ValueError('Unknown explicit foreground profile')
            guard = dark_cape_guard(roi,(q if rq is None else rq)-[x0,y0],occlusion=occlusion)
            occlusion = guard if occlusion is None else np.maximum(occlusion,guard)
        extra = {} if rq is None else {'repair_quad': rq-[x0,y0]}
        if donor_exclusion_polygons is not None:
            excluded = np.zeros(roi.shape[:2],np.uint8)
            for polygon in donor_exclusion_polygons:
                points = np.rint(np.asarray(polygon)).astype(np.int32)-np.int32([x0,y0])
                cv2.fillPoly(excluded,[points],255)
            extra['donor_exclusion_mask'] = excluded
        if cleanup_polygons:
            cleanup = np.zeros(roi.shape[:2], np.uint8)
            for polygon in cleanup_polygons:
                points = np.rint(np.asarray(polygon)).astype(np.int32)-np.int32([x0,y0])
                cv2.fillPoly(cleanup, [points], 255)
            extra['extra_repair_mask'] = cleanup
        result, stats = composite.replace_chest(roi, q-[x0, y0], asset,
            occlusion=occlusion, **extra, **settings)
        if profile is not None:
            stats.update(foreground_profile=profile,foreground_pixels=int(np.count_nonzero(guard)))
    else:
        result, stats = composite.apply_hair(roi, q-[x0, y0], asset,
                                             occlusion=occlusion, **dict(options or {}))
    frame[y0:y1, x0:x1] = result
    return stats


def manual_polygons(config, index, part='chest', parent_quad=None):
    if part not in ('chest', 'hair'):
        raise ValueError('Only chest and hair foreground masks are supported')
    result = [p for span in config.get(part+'_occlusions', [])
        if span['start'] <= index <= span['end'] for p in span['polygons']]
    keys = config.get(part+'_occlusion_keyframes', [])
    exact = next((item for item in keys if item['frame'] == index), None)
    if exact:
        result += exact['polygons']
    else:
        before = [item for item in keys if item['frame'] < index]
        after = [item for item in keys if item['frame'] > index]
        if before and after:
            left, right = max(before, key=lambda x:x['frame']), min(after, key=lambda x:x['frame'])
            if len(left['polygons']) == len(right['polygons']):
                weight = (index-left['frame'])/(right['frame']-left['frame'])
                for a, b in zip(left['polygons'], right['polygons']):
                    if np.asarray(a).shape != np.asarray(b).shape:
                        raise ValueError('Occlusion polygon vertex counts must match')
                    result.append((np.asarray(a)*(1-weight)+np.asarray(b)*weight).tolist())
    space = config.get(part+'_occlusion_space', 'screen')
    if space != 'screen':
        if space not in ('chest', 'hair') or parent_quad is None:
            raise ValueError('Local foreground masks require a visible chest/hair parent plane')
        result = [map_from_plane(polygon, parent_quad).tolist() for polygon in result]
    return result


def composite_options(config,index,part='chest'):
    if part not in ('chest', 'hair'):
        raise ValueError('Unknown composite part')
    options=dict(config.get(part+'_composite',{}))
    for span in config.get(part+'_composite_overrides',[]):
        if span['start']>span['end']:
            raise ValueError('Composite override frame range is reversed')
        if span['start']<=index<=span['end']:
            options.update(span['options'])
    return options


def manual_cleanup_polygons(config, index):
    """Residual-ink corrections are explicit for one frame; never interpolate."""
    keys = config.get('chest_cleanup_keyframes', [])
    matches = [key for key in keys if key['frame'] == index]
    if len(matches) > 1:
        raise ValueError('Duplicate explicit cleanup frame')
    return matches[0]['polygons'] if matches else []


def local_inpaint_patch(frame, quad, asset, inpainter, repair_quad, *,
                        occlusion_polygons=(), options=None):
    """Opt-in local model cleanup inside a separately reviewed fabric domain."""
    settings = dict(options or {})
    profile = settings.pop('foreground_profile', None)
    opacity = settings.pop('opacity', 1.0)
    blur = settings.pop('overlay_blur_sigma', 0.0)
    if settings:
        raise ValueError('Local inpainting accepts only opacity, overlay_blur_sigma and foreground_profile composite options')
    if profile not in (None, 'dark-cape'):
        raise ValueError('Unknown explicit foreground profile')
    if not np.isfinite(opacity) or not 0 <= opacity <= 1:
        raise ValueError('opacity must be in 0..1')
    occlusion = np.zeros(frame.shape[:2], np.uint8)
    for polygon in occlusion_polygons:
        cv2.fillPoly(occlusion, [np.rint(polygon).astype(np.int32)], 255)
    if profile is not None:
        guard = dark_cape_guard(frame, repair_quad, occlusion)
        occlusion = np.maximum(occlusion, guard)
    cleaned, stats = inpainter.inpaint(frame, repair_quad, occlusion=occlusion)
    if stats.get('skipped'):
        stats['overlay_pixels'] = 0
        return stats
    # The chest texture is already a transparent cutout. Composite it without
    # another ink detector, which would try to erase the newly restored cloth.
    result, overlay = composite.apply_hair(cleaned, quad, asset,
        occlusion=occlusion, opacity=opacity, overlay_blur_sigma=blur)
    frame[:] = result
    stats.update(overlay, repair_quad_explicit=True)
    if profile is not None:
        stats.update(foreground_profile=profile, foreground_pixels=int(np.count_nonzero(guard)))
    return stats


def manual_donor_polygons(config, index):
    keys = config.get('chest_donor_exclusion_keyframes')
    if keys is None:
        return None
    matches = [key for key in keys if key['frame'] == index]
    if len(matches) != 1:
        raise ValueError('Donor exclusions require exactly one entry for each decoded frame')
    return matches[0]['polygons']


def load_reviewed_chest_patches(config, root=None):
    """Load bounded, hash-pinned chest crops for reviewed blended source poses."""
    root = (ROOT if root is None else root).resolve()
    loaded = {}
    for item in config.get('reviewed_chest_patches', []):
        if set(item) != {'frame', 'box', 'image', 'sha256', 'sourceFrameSha256'}:
            raise ValueError('Reviewed chest patch metadata is incomplete')
        index, box = item['frame'], item['box']
        if type(index) is not int or not 0 <= index < config['frames'] or index in loaded:
            raise ValueError('Reviewed chest patches require unique valid frames')
        if not isinstance(box, list) or len(box) != 4 or any(type(v) is not int for v in box):
            raise ValueError('Reviewed chest patch box requires integer x/y/width/height')
        x, y, width, height = box
        if (min(x,y) < 0 or min(width,height) < 1 or x+width > config['width'] or
                y+height > config['height'] or width*height > config['width']*config['height']*.03):
            raise ValueError('Reviewed chest patch exceeds its bounded frame region')
        file = (root / item['image']).resolve()
        if not file.is_relative_to(root) or sha(file) != item['sha256']:
            raise ValueError('Reviewed chest patch image changed or escapes project')
        pixels = np.array(Image.open(file))
        if pixels.dtype != np.uint8 or pixels.shape != (height,width,3):
            raise ValueError('Reviewed chest patches must be exact-size RGB crops')
        if not isinstance(item['sourceFrameSha256'],str) or len(item['sourceFrameSha256']) != 64:
            raise ValueError('Reviewed chest patch requires an exact source frame hash')
        loaded[index] = {**item, 'pixels': pixels}
    return loaded


def apply_reviewed_chest_patch(edited, original, item):
    if hashlib.sha256(original.tobytes()).hexdigest() != item['sourceFrameSha256']:
        raise ValueError('Reviewed chest patch source frame changed')
    x,y,width,height = item['box']
    before = edited[y:y+height,x:x+width,:3]
    count = int(np.count_nonzero(np.any(before != item['pixels'],axis=2)))
    before[:] = item['pixels']
    return {'repair_method':'reviewed-chest-patch', 'patchSha256':item['sha256'],
            'sourceFrameSha256':item['sourceFrameSha256'], 'box':item['box'],
            'overlay_pixels':count, 'alpha_changed':0, 'skipped':None}


def run(config, destination):
    started = time.perf_counter()
    source = (ROOT / config['source']).resolve()
    if not source.is_relative_to(ROOT / 'actions/production') or source.suffix != '.webm':
        raise ValueError('Only reviewed local production WebM inputs are allowed')
    if source.is_relative_to(destination):
        raise ValueError('Input and output must remain separate')
    source_digest = sha(source)
    if config.get('sourceSha256', source_digest) != source_digest:
        raise ValueError('The source video differs from the reviewed anchor configuration')
    inpainter = None
    inpaint_settings = config.get('chest_local_inpaint')
    if inpaint_settings is not None:
        if 'chest' not in config or 'chest_repair' not in config:
            raise ValueError('Local inpainting requires chest tracking and an explicit repair domain')
        if set(inpaint_settings) - {'model', 'context', 'threads', 'exclude_frames', 'provider'}:
            raise ValueError('Unknown local inpainting setting')
        excluded = inpaint_settings.get('exclude_frames', [])
        if (not isinstance(excluded, list) or any(type(i) is not int or not 0 <= i < config['frames'] for i in excluded)
                or len(set(excluded)) != len(excluded)):
            raise ValueError('Local inpainting exclusions require unique valid frame indices')
        inpaint = module('branding_inpaint', 'branding-inpaint.py')
        inpainter = inpaint.LocalInpainter(ROOT / inpaint_settings['model'],
            context=inpaint_settings.get('context', 256), threads=inpaint_settings.get('threads', 4),
            provider=inpaint_settings.get('provider', 'cpu'))
    chest_patches = load_reviewed_chest_patches(config)
    if chest_patches and 'chest' not in config:
        raise ValueError('Reviewed chest patches require a chest animation track')
    destination.mkdir(parents=True, exist_ok=True)
    reference = ROOT / 'assets/character/qiqi-chibi-v5-knot-sprout.png'
    assets = composite.extract_assets(np.asarray(Image.open(reference).convert('RGBA')))
    width, height, fps = config['width'], config['height'], config['fps']
    output = destination / (config['id'] + '-branding-pilot-v1.webm')
    report_file = destination / (config['id'] + '-branding-pilot-v1.json')
    if output.exists() or report_file.exists():
        raise FileExistsError('Choose a fresh trial directory; existing trials are preserved')
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    command = [ffmpeg, '-hide_banner', '-loglevel', 'error', '-nostdin', '-n',
               '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', f'{width}x{height}',
               '-framerate', str(fps), '-i', 'pipe:0', '-an', '-c:v', 'libvpx-vp9',
               '-pix_fmt', 'yuva420p', '-auto-alt-ref', '0', '-lossless', '1',
               '-deadline', 'realtime', '-cpu-used', '5', '-row-mt', '1',
               '-threads', '4', '-metadata:s:v:0', 'alpha_mode=1', str(output)]
    tracks = {name: AnchoredTrack(config[name]) for name in ['chest', 'hair'] if name in config}
    repair_track = AnchoredTrack(config['chest_repair']) if 'chest_repair' in config else None
    metrics, samples = [], []
    sample_indices = set(config.get('samples', [0, config['frames']//2, config['frames']-1]))
    with (destination / (config['id'] + '.encode.log')).open('wb') as log:
        encoder = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=log)
        try:
            for index, original in enumerate(frames(source, width, height)):
                edited = original.copy()
                row = {'frame': index}
                states = {name: tracker.update(original, index) for name, tracker in tracks.items()}
                repair_parent = config.get('chest_repair', {}).get('relative_to', 'chest')
                repair_state = repair_track.update(original, index, parent=states.get(repair_parent)) if repair_track else None
                if repair_state is not None:
                    row['chest_repair'] = {key: repair_state[key] for key in ['visible', 'confidence', 'reason']}
                    if repair_state['visible']:
                        row['chest_repair']['quad'] = np.asarray(repair_state['quad']).tolist()
                for name, state in states.items():
                    row[name] = {key: state[key] for key in ['visible', 'confidence', 'reason']}
                    if name == 'chest' and index in chest_patches:
                        item = chest_patches[index]
                        row[name].update(visible=True, confidence=1., reason='reviewed-blended-source-pose',
                            quad=tracking.box_quad(item['box']).tolist(),
                            composite=apply_reviewed_chest_patch(edited, original, item))
                        continue
                    if state['visible']:
                        row[name]['quad'] = np.asarray(state['quad']).tolist()
                        if name == 'chest' and repair_state is not None and not repair_state['visible']:
                            row[name]['composite'] = {'skipped': 'repair-domain-unavailable', 'overlay_pixels': 0}
                            continue
                        mask_space = config.get(name+'_occlusion_space', 'screen')
                        mask_parent = states.get(mask_space)
                        if mask_space != 'screen' and (mask_parent is None or not mask_parent['visible']):
                            row[name]['composite'] = {'skipped':'mask-parent-unavailable', 'overlay_pixels':0}
                            continue
                        polygons = manual_polygons(config, index, name,
                            parent_quad=mask_parent['quad'] if mask_parent is not None else None)
                        if name == 'chest' and inpainter is not None and index not in inpaint_settings.get('exclude_frames', []):
                            stats = local_inpaint_patch(edited, state['quad'], assets[name],
                                inpainter, repair_state['quad'], occlusion_polygons=polygons,
                                options=composite_options(config,index,name))
                        else:
                            stats = local_patch(edited, state['quad'], assets[name], chest=name=='chest',
                                options=composite_options(config,index,name), occlusion_polygons=polygons,
                                repair_quad=repair_state['quad'] if name=='chest' and repair_state is not None else None,
                                cleanup_polygons=manual_cleanup_polygons(config,index) if name=='chest' else (),
                                donor_exclusion_polygons=manual_donor_polygons(config,index) if name=='chest' else None)
                        row[name]['composite'] = stats
                if np.any(edited[:, :, 3] != original[:, :, 3]):
                    raise RuntimeError('An edit changed the original alpha plane')
                encoder.stdin.write(edited.tobytes())
                metrics.append(row)
                if inpainter is not None and index % 30 == 0:
                    print(json.dumps({'id':config['id'], 'processedFrames':index+1,
                        'totalFrames':config['frames'], 'repair_method':'local-lama'}), flush=True)
                if index in sample_indices:
                    samples.append((index, original.copy(), edited.copy()))
            encoder.stdin.close()
            if encoder.wait() != 0:
                raise RuntimeError('Trial encoding failed')
        except BaseException:
            if encoder.poll() is None:
                encoder.terminate()
                encoder.wait()
            raise
    if len(metrics) != config['frames']:
        raise RuntimeError('Decoded frame count differs from reviewed source metadata')
    # VP9 alpha has a one-level rounding difference even in lossless mode.
    # Measure decoded pixels rather than assuming an encoder flag proves it.
    decoded, max_alpha_error, changed_alpha_pixels = 0, 0, 0
    for original, encoded in zip_longest(frames(source, width, height), frames(output, width, height)):
        if original is None or encoded is None:
            raise RuntimeError('Encoded frame count changed')
        alpha_error = np.abs(original[:, :, 3].astype(np.int16)-encoded[:, :, 3].astype(np.int16))
        max_alpha_error = max(max_alpha_error, int(alpha_error.max()))
        changed_alpha_pixels += int(np.count_nonzero(alpha_error))
        decoded += 1
    if decoded != len(metrics) or max_alpha_error > 1:
        raise RuntimeError('Encoded media failed the frame-count/alpha check')
    cell = 240
    sheet = Image.new('RGB', (cell*4, (len(samples)+1)//2*(cell+26)), '#e9e5f1')
    draw = ImageDraw.Draw(sheet)
    for position, (index, before, after) in enumerate(samples):
        x, y = position % 2 * cell*2, position // 2 * (cell+26)
        sheet.paste(flatten(before, cell), (x, y))
        sheet.paste(flatten(after, cell), (x+cell, y))
        draw.text((x+5, y+cell+4), f'frame {index}: before / after', fill='#51485d')
    sheet.save(destination / (config['id'] + '-comparison.jpg'), quality=93)
    coverage = {name: {'tracked': sum(row[name]['visible'] for row in metrics),
        'applied': sum(row[name].get('composite', {}).get('overlay_pixels', 0) > 0 for row in metrics),
        'reasons': dict(Counter(row[name].get('composite', {}).get('skipped') or row[name]['reason'] for row in metrics))}
        for name in tracks}
    if sha(source) != source_digest:
        raise RuntimeError('The source video changed during this preview')
    report = {'status': 'pilot-requires-visual-review', 'id': config['id'],
        'source': relative(source), 'sourceSha256': source_digest,
        'reference': relative(reference), 'referenceSha256': sha(reference),
        'output': relative(output), 'outputSha256': sha(output), 'frames': len(metrics),
        'fps': fps, 'sourceAlphaPreservedBeforeEncoding': True,
        'encodedAlpha': {'verifiedFrames': decoded, 'maxError': max_alpha_error,
                         'changedPixels': changed_alpha_pixels, 'allowedMaxError': 1},
        'configSha256': config_sha(config), 'config': config,
        'toolingSha256': {name: sha(ROOT / 'scripts' / name) for name in
            ['preview-video-branding.py', 'branding-tracking.py', 'branding-composite.py']},
        'newVideoGenerationCalls': 0, 'registeredInRuntime': False,
        'processingSeconds': round(time.perf_counter()-started, 2),
        'coverage': coverage, 'perFrame': metrics}
    if inpainter is not None:
        report['localInpaint'] = {'model': inpaint_settings['model'],
            'modelSha256': inpainter.model_sha256, 'context': inpaint_settings.get('context', 256),
            'provider': inpainter.provider, 'runtimeVersion': inpainter.runtime_version,
            'excludedFrames': inpaint_settings.get('exclude_frames', []),
            'toolSha256': sha(ROOT / 'scripts/branding-inpaint.py'), 'sourceImagesUploaded': False}
    report_file.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({'id': config['id'], 'frames': len(metrics), 'coverage': coverage,
        'output': relative(output)}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--ids', nargs='+')
    arguments = parser.parse_args()
    target = (ROOT / arguments.output).resolve()
    if not target.is_relative_to(ROOT / '.cache'):
        raise ValueError('Trial output must remain inside the project .cache directory')
    settings = json.loads((ROOT / arguments.config).read_text(encoding='utf-8-sig'))
    for item in settings['clips']:
        if arguments.ids and item['id'] not in arguments.ids:
            continue
        run(item, target)
