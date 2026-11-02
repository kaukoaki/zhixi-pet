"""Enlarged source/encoded comparisons for a non-destructive branding trial.

Verifies the recorded media hashes before extracting frames. This tool creates
review images only; it never marks a clip approved or changes the action library.
"""
import argparse
import importlib.util
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location('branding_preview', ROOT / 'scripts/preview-video-branding.py')
preview = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(preview)


def review(report_path, output, part='chest', indices=None):
    if part not in ('chest', 'hair'):
        raise ValueError('Choose chest or hair')
    output = output.resolve()
    if not output.is_relative_to(ROOT / '.cache'):
        raise ValueError('Review images must remain in the project .cache')
    if output.exists():
        raise FileExistsError('Choose a fresh review image name')
    report = json.loads(report_path.read_text(encoding='utf-8-sig'))
    source, encoded = [(ROOT / report[k]).resolve() for k in ('source', 'output')]
    for media, digest in [(source, 'sourceSha256'), (encoded, 'outputSha256')]:
        if not media.is_relative_to(ROOT) or preview.sha(media) != report[digest]:
            raise ValueError('Review media differs from the trial report')
    width, height = report.get('config', {}).get('width'), report.get('config', {}).get('height')
    if not width or not height:
        raise ValueError('Re-render this legacy trial to record dimensions and configuration')
    if indices is None:
        indices = sorted(set(np.linspace(0, report['frames']-1, 7).astype(int).tolist()))
    if not indices or any(i < 0 or i >= report['frames'] for i in indices):
        raise ValueError('Review frame indices are outside the recorded source')
    pairs = {}
    last_requested = max(indices)
    for index, (before, after) in enumerate(zip(preview.frames(source, width, height),
                                               preview.frames(encoded, width, height))):
        if index in indices:
            pairs[index] = (before, after)
        if index >= last_requested:
            break
    if len(pairs) != len(set(indices)):
        raise ValueError('Review frame count differs from the report')
    sheet = Image.new('RGB', (720, len(indices)*290), '#e1dbe8')
    draw = ImageDraw.Draw(sheet)
    for row, index in enumerate(indices):
        state = report['perFrame'][index][part]
        q = state.get('quad')
        if q is None:
            # Hidden frames still get a full-character comparison so reviewers
            # can inspect whether hiding was physically correct.
            box = (0, 0, width, height)
        else:
            q = np.asarray(q)
            pad = np.maximum((q.max(0)-q.min(0))*.18, 6)
            lo = np.maximum(np.floor(q.min(0)-pad), 0).astype(int)
            hi = np.minimum(np.ceil(q.max(0)+pad), [width, height]).astype(int)
            box = tuple([*lo, *hi])
        for column, frame in enumerate(pairs[index]):
            crop = Image.fromarray(frame).crop(box)
            scale = 260/max(crop.size)
            crop = crop.resize(tuple(max(1, round(v*scale)) for v in crop.size), Image.Resampling.LANCZOS)
            tile = Image.new('RGBA', (260, 260), '#e9e5f1')
            tile.alpha_composite(crop, ((260-crop.width)//2, (260-crop.height)//2))
            sheet.paste(tile.convert('RGB'), (column*360+30, row*290+22))
        label = f"{report['id']} frame {index}: source / encoded; {part} visible={state['visible']}"
        draw.text((6, row*290+4), label, fill='#42384d')
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output, quality=95)
    print(output)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--report', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--part', choices=['chest', 'hair'], default='chest')
    parser.add_argument('--frames', type=int, nargs='+')
    args = parser.parse_args()
    review(ROOT / args.report, ROOT / args.output, args.part, args.frames)
