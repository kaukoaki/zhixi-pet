"""Bind reviewed screen-space cleanup/foreground keys to the live shirt plane.

Only creates a new trial configuration. It never updates production media or
certifies the interpolated in-between frames as visually reviewed.
"""
import argparse
import copy
import importlib.util
import json
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location('branding_preview', ROOT / 'scripts/preview-video-branding.py')
preview = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(preview)


def local_points(points, parent_quad):
    matrix = cv2.getPerspectiveTransform(np.asarray(parent_quad, np.float32), preview.LOCAL_PLANE)
    return cv2.perspectiveTransform(np.asarray(points, np.float32)[None], matrix)[0]


def bind_clip(original):
    config = copy.deepcopy(original)
    if config['chest_repair'].get('mode') == 'relative' or config.get('chest_occlusion_space','screen') != 'screen':
        raise ValueError('This configuration is already bound to a garment plane')
    source = (ROOT/config['source']).resolve()
    if not source.is_relative_to(ROOT/'actions/production') or source.suffix != '.webm':
        raise ValueError('Only production WebM inputs are allowed')
    digest = preview.sha(source)
    if config.get('sourceSha256',digest) != digest:
        raise ValueError('Source differs from the reviewed manual coordinates')
    desired = {key['frame'] for key in config['chest_repair']['keyframes']}
    desired.update(key['frame'] for key in config.get('chest_occlusion_keyframes',[]))
    track = preview.AnchoredTrack(config['chest'])
    parents = {}
    count = 0
    for index,frame in enumerate(preview.frames(source,config['width'],config['height'])):
        state = track.update(frame,index)
        if index in desired:
            if not state['visible']:
                raise ValueError(f"{config['id']}: no trustworthy parent at manual frame {index}")
            parents[index] = np.asarray(state['quad'],np.float32)
        count += 1
    if count != config['frames'] or set(parents) != desired:
        raise ValueError('Source frames no longer match the reviewed configuration')
    for key in config['chest_repair']['keyframes']:
        if not key.get('visible',True):
            continue
        quad = key.get('quad')
        if quad is None:
            quad = preview.tracking.box_quad(key.pop('box'))
        key['quad'] = local_points(quad,parents[key['frame']]).round(6).tolist()
    config['chest_repair'].update(mode='relative',relative_to='chest')
    for key in config.get('chest_occlusion_keyframes',[]):
        key['polygons'] = [local_points(p,parents[key['frame']]).round(6).tolist() for p in key['polygons']]
    if config.get('chest_occlusions'):
        raise ValueError('Convert constant screen-space occlusion spans to explicit keys first')
    config['chest_occlusion_space'] = 'chest'
    if 'localQa' in config:
        config['previousScreenSpaceQa'] = config.pop('localQa')
    config['localQa'] = {'status':'bound-needs-fresh-intermediate-and-encoded-visual-review',
        'note':'Original screen-space manual keys remain exact at their frames. Intermediate masks follow the actual tracked garment; shape changes still need visual checks.'}
    config['sourceSha256'] = digest
    config['bindingProvenance'] = {'coordinateSystem':'canonical chest plane 0..100',
        'originalConfigSha256':preview.config_sha(original),
        'scriptSha256':preview.sha(Path(__file__).resolve()),
        'manualParentFrames':sorted(desired)}
    print(config['id']+': '+str(len(desired))+' keys bound',flush=True)
    return config


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config',required=True)
    parser.add_argument('--output',required=True)
    args = parser.parse_args()
    output = (ROOT/args.output).resolve()
    if not output.is_relative_to(ROOT/'.cache') or output.exists():
        raise ValueError('Choose a fresh configuration file inside the project .cache')
    source = json.loads((ROOT/args.config).read_text(encoding='utf-8-sig'))
    source['clips'] = [bind_clip(config) for config in source['clips']]
    source['status'] = 'garment-bound-domain-trial-not-production'
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(source,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
