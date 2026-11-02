"""Build the reviewed garden scene library without changing source footage.

Neutral-background segmentation is specific to the inspected 640px garden clips.
Retains the girl, separate pot, plant and can; encodes real alpha and verifies it.
"""
from pathlib import Path
import hashlib
import json
import subprocess
import sys
import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
BASE = ROOT / 'actions/production/14-garden'
sys.path.insert(0, str(ROOT / '.cache/video-tools'))
import imageio_ffmpeg
cv2.setNumThreads(2)


def digest(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def relative(file):
    return file.relative_to(ROOT).as_posix()


def write_json(file, value):
    file.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def matte(rgb, water=False):
    height, width = rgb.shape[:2]
    color = rgb.astype(np.float32)
    background = np.median(rgb[:int(height * .35), :int(width * .12)].reshape(-1, 3), axis=0)
    neutral = ((np.max(np.abs(color - background), axis=2) < 14) & (np.ptp(color, axis=2) < 32)).astype(np.uint8)
    # All reviewed artwork ends above this line; the platform text is below it.
    bottom = round(height * 590 / 640)
    neutral[bottom:] = 1
    kernel = np.ones((3, 3), np.uint8)
    neutral = cv2.morphologyEx(neutral, cv2.MORPH_OPEN, kernel)
    _, labels, _, _ = cv2.connectedComponentsWithStats(neutral, connectivity=8)
    border = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    mask = (~np.isin(labels, border[border > 0])).astype(np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    # Seal tiny compressed-outline gaps, preserving enclosed pale hair and can.
    flood = mask.copy()
    cv2.floodFill(flood, None, (0, 0), 1)
    mask |= 1 - flood
    count, components, stats, centers = cv2.connectedComponentsWithStats(mask, connectivity=8)
    kept = []
    for index in range(1, count):
        x, y, w, h, area = stats[index]
        cx, cy = centers[index]
        stray_puddle = water and 210 / 640 * width < cx < 280 / 640 * width and cy > 550 / 640 * height
        if area >= 24 and y + h <= bottom and not stray_puddle:
            kept.append(index)
    mask = np.isin(components, kept).astype(np.uint8)
    # The standing can handle contains background, unlike its cream body.
    mask[round(.75 * height):bottom, round(585 / 640 * width):][neutral[round(.75 * height):bottom, round(585 / 640 * width):] > 0] = 0
    mask[bottom:] = 0
    alpha = mask.astype(np.float32)
    inner = cv2.erode(mask, kernel)
    edge = mask != inner
    alpha[edge] = cv2.GaussianBlur(alpha, (3, 3), .55)[edge]
    partial = (alpha > 0) & (alpha < 1)
    color[partial] = (color[partial] - background * (1 - alpha[partial, None])) / alpha[partial, None]
    rgba = np.dstack([np.clip(color, 0, 255).astype(np.uint8), np.round(alpha * 255).astype(np.uint8)])
    rgba[alpha == 0, :3] = 0
    return rgba


def build(identifier, source):
    output = BASE / 'processed' / (identifier + '-v1.webm')
    report_file = output.with_suffix('.json')
    source_sha = digest(source)
    if report_file.exists() and output.exists():
        old = json.loads(report_file.read_text(encoding='utf-8'))
        if old.get('source_sha256') == source_sha and old.get('processor_revision') == 1 and old.get('media_sha256') == digest(output):
            return old
    cap = cv2.VideoCapture(str(source))
    fps = cap.get(cv2.CAP_PROP_FPS)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width, height = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    if (width, height, fps) != (640, 640, 30):
        raise ValueError('Unreviewed garden dimensions or frame rate')
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    command = [ffmpeg, '-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', f'{width}x{height}', '-framerate', str(fps), '-i', 'pipe:0', '-an', '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-auto-alt-ref', '0', '-crf', '28', '-b:v', '0', '-deadline', 'realtime', '-cpu-used', '5', '-row-mt', '1', '-threads', '4', '-metadata:s:v:0', 'alpha_mode=1', str(output)]
    log_file = ROOT / '.cache/garden-matte' / (identifier + '.log')
    log_file.parent.mkdir(exist_ok=True)
    count, first, final, minimum, maximum = 0, None, None, 255, 0
    with log_file.open('wb') as log:
        encoder = subprocess.Popen(command, stdin=subprocess.PIPE, stderr=log)
        try:
            while True:
                ok, frame = cap.read()
                if not ok:
                    break
                rgba = matte(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB), identifier == 'garden-water')
                if count == 0:
                    first = rgba.copy()
                if count == total - 3:
                    final = rgba.copy()
                minimum = min(minimum, int(rgba[:, :, 3].min()))
                maximum = max(maximum, int(rgba[:, :, 3].max()))
                encoder.stdin.write(rgba.tobytes())
                count += 1
            encoder.stdin.close()
            if encoder.wait(timeout=60) != 0:
                raise RuntimeError('Garden encoder failed: ' + relative(log_file))
        except BaseException:
            encoder.kill()
            raise
        finally:
            cap.release()
    if count != total or minimum != 0 or maximum != 255:
        raise RuntimeError('Garden frame count or alpha failed')
    # libvpx decoder is required for actual WebM alpha, including every frame.
    decoder = subprocess.Popen([ffmpeg, '-hide_banner', '-loglevel', 'error', '-c:v', 'libvpx-vp9', '-i', str(output), '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    decoded = 0
    frame_bytes = width * height * 4
    decoded_min, decoded_max = 255, 0
    while True:
        raw = bytearray()
        while len(raw) < frame_bytes:
            part = decoder.stdout.read(frame_bytes - len(raw))
            if not part:
                break
            raw.extend(part)
        if not raw:
            break
        if len(raw) != frame_bytes:
            raise RuntimeError('Incomplete decoded garden frame')
        alpha = np.frombuffer(raw, np.uint8).reshape(height, width, 4)[:, :, 3]
        decoded_min, decoded_max = min(decoded_min, int(alpha.min())), max(decoded_max, int(alpha.max()))
        if alpha[594:].max() > 2 or (alpha == 255).mean() < .10:
            decoder.kill()
            raise RuntimeError(f'Garden alpha verification failed at frame {decoded}: strip={alpha[594:].max()}, opaque={(alpha == 255).mean():.3f}')
        decoded += 1
    if decoder.wait(timeout=30) != 0 or decoded != count:
        raise RuntimeError('Garden full decode failed')
    first_path, final_path = output.with_suffix('.first-frame.png'), output.with_suffix('.last-frame.png')
    Image.fromarray(first).save(first_path)
    Image.fromarray(final).save(final_path)
    report = {'source': relative(source), 'source_sha256': source_sha, 'output': relative(output), 'media_sha256': digest(output), 'processor_revision': 1, 'width': width, 'height': height, 'fps': fps, 'source_frames': total, 'frames': count, 'seconds': count / fps, 'file_bytes': output.stat().st_size, 'decoded_frames': decoded, 'decoded_alpha_min': decoded_min, 'decoded_alpha_max': decoded_max, 'first_frame': relative(first_path), 'poster': relative(final_path), 'poster_sha256': digest(final_path), 'audio': False, 'cleanup': 'inspected border-connected neutral background; separate props retained; bottom platform-mark strip transparent; isolated watering puddle excluded', 'source_unchanged': digest(source) == source_sha}
    write_json(report_file, report)
    print(json.dumps({'id': identifier, 'frames': count, 'seconds': count / fps, 'decoded': decoded}), flush=True)
    return report


def main():
    inputs = [('garden-plant', 'source/garden-plant-v2-source.mp4'), ('garden-water', 'source/garden-water-soil-v2-source.mp4'), ('garden-tomato-grow', 'source/garden-tomato-grow-v2-source.mp4'), ('garden-tomato-bloom', 'processed/garden-tomato-bloom-v3.scene.mp4'), ('garden-tomato-ripe', 'processed/garden-tomato-ripe-v3.scene.mp4'), ('garden-strawberry-grow', 'processed/garden-strawberry-grow-v3.scene.mp4'), ('garden-strawberry-bloom', 'processed/garden-strawberry-bloom-v4.scene.mp4'), ('garden-strawberry-ripe', 'processed/garden-strawberry-ripe-v4.scene.mp4'), ('garden-watermelon-grow', 'processed/garden-watermelon-grow-v4.scene.mp4'), ('garden-watermelon-bloom', 'processed/garden-watermelon-bloom-v4.scene.mp4'), ('garden-watermelon-ripe', 'processed/garden-watermelon-ripe-v4.scene.mp4')]
    clips = []
    for identifier, name in inputs:
        report = build(identifier, BASE / name)
        clips.append({'id': identifier, 'media': report['output'], 'mediaSha256': report['media_sha256'], 'poster': report['poster'], 'posterSha256': report['poster_sha256'], 'seconds': report['seconds']})
    write_json(BASE / 'runtime.json', {'schemaVersion': 1, 'clips': clips, 'fruitCounts': {'tomato': 4, 'strawberry': 3, 'watermelon': 1}, 'harvest': 'reuse-celebration-and-inventory-feedback', 'generationRequired': False})


if __name__ == '__main__':
    main()
