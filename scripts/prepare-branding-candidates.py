"""Prepare an isolated delivery candidate, including required still images.

Copies only hash-verified trial files into a fresh .cache directory. This does
not replace production assets, edit runtime manifests, or open a user profile.
"""
import argparse
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import shutil

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location('branding_preview', ROOT/'scripts/preview-video-branding.py')
preview = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(preview)


def probe_media(file):
    reader = preview.imageio_ffmpeg.read_frames(str(file), pix_fmt='rgba',
                                               input_params=['-c:v', 'libvpx-vp9'])
    try:
        return next(reader)
    finally:
        reader.close()


def prepare(manifest_file, destination):
    destination = destination.resolve()
    if not destination.is_relative_to(ROOT/'.cache') or destination == ROOT/'.cache' or destination.exists():
        raise ValueError('Choose a fresh candidate directory inside project .cache')
    entries = json.loads(manifest_file.read_text(encoding='utf-8-sig')).get('reports')
    if not isinstance(entries, list) or not entries:
        raise ValueError('No candidate reports')
    approved_reference = (ROOT/'assets/character/qiqi-chibi-v5-knot-sprout.png').resolve()
    checked = []
    ids = set()
    for entry in entries:
        report_file = (ROOT/entry['path']).resolve()
        if not report_file.is_relative_to(ROOT):
            raise ValueError('Candidate report escapes project')
        report_bytes = report_file.read_bytes()
        if hashlib.sha256(report_bytes).hexdigest() != entry['sha256']:
            raise ValueError('Candidate report changed')
        report = json.loads(report_bytes.decode('utf-8-sig'))
        clip_id = report['id']
        if not isinstance(clip_id, str) or clip_id in ids or not clip_id.replace('-', '').isalnum() or not clip_id.isascii():
            raise ValueError('Invalid or duplicate candidate id')
        ids.add(clip_id)
        for key in ('source', 'output', 'reference'):
            file = (ROOT/report[key]).resolve()
            if not file.is_relative_to(ROOT) or preview.sha(file) != report[key+'Sha256']:
                raise ValueError('Candidate media changed')
        alpha = report.get('encodedAlpha', {})
        if report.get('sourceAlphaPreservedBeforeEncoding') is not True or alpha.get('verifiedFrames') != report['frames'] or type(alpha.get('maxError')) not in (int,float) or not 0 <= alpha['maxError'] <= 1:
            raise ValueError('Candidate alpha verification missing or failed')
        config = report.get('config', report)
        width,height = config['width'],config['height']
        if type(report['frames']) is not int or report['frames'] < 1 or type(report['fps']) not in (int,float) or not math.isfinite(report['fps']) or report['fps'] <= 0:
            raise ValueError('Invalid candidate timing')
        if any(type(v) is not int or not 0 < v <= 4096 for v in (width,height)):
            raise ValueError('Invalid candidate dimensions')
        if (ROOT/report['reference']).resolve() != approved_reference:
            raise ValueError('Candidate uses a different character reference')
        metadata = probe_media(ROOT/report['output'])
        if tuple(metadata.get('source_size', ())) != (width,height) or tuple(metadata.get('size', ())) != (width,height):
            raise ValueError('Actual candidate dimensions differ from report')
        actual_fps = metadata.get('fps')
        if not isinstance(actual_fps, (int,float)) or not math.isfinite(actual_fps) or abs(actual_fps-report['fps']) > .01:
            raise ValueError('Actual candidate frame rate differs from report')
        duration = metadata.get('duration')
        if isinstance(duration, (int,float)) and math.isfinite(duration) and abs(duration-report['frames']/report['fps']) > .12:
            raise ValueError('Actual candidate duration differs from report')
        checked.append((report_file,report,width,height,entry['sha256']))
    destination.mkdir(parents=True)
    (destination/'media').mkdir()
    (destination/'posters').mkdir()
    result = {'schemaVersion':1,'status':'prepared-for-review-not-installed',
        'productionModified':False,'userProfileOpened':False,'visualApproval':False,
        'inputManifest':preview.relative(manifest_file),'inputManifestSha256':preview.sha(manifest_file),
        'clips':[],'integrationRequirements':[
            'Update action references and asset hashes together.',
            'Garden runtime video AND last-frame poster hashes must change together.',
            'Keep the existing drag phase mapping and update every verified phase as one pack.',
            'The renderer portrait and plugin/static fallback artwork must use the approved reference.',
            'Do not replace user-imported media or alter currency, garden, journal, timer or conversation data.']}
    for report_file,report,width,height,report_digest in checked:
        clip_id=report['id']
        output=destination/'media'/f'{clip_id}.webm'
        shutil.copy2(ROOT/report['output'],output)
        if preview.sha(output) != report['outputSha256']:
            raise ValueError('Candidate media changed during copying')
        first,last,count=None,None,0
        for frame in preview.frames(output,width,height):
            if first is None:
                first=frame.copy()
            last=frame
            count+=1
        if count != report['frames']:
            raise ValueError('Copied candidate frame count changed')
        files={}
        for label,frame in [('first',first),('last',last)]:
            image=destination/'posters'/f'{clip_id}.{label}.png'
            Image.fromarray(frame).save(image)
            files[label]={'path':image.relative_to(destination).as_posix(),'sha256':preview.sha(image)}
        result['clips'].append({'id':clip_id,'media':output.relative_to(destination).as_posix(),
            'mediaSha256':preview.sha(output),'bytes':output.stat().st_size,
            'source':report['source'],'sourceSha256':report['sourceSha256'],
            'trialReport':preview.relative(report_file),'trialReportSha256':report_digest,
            'width':width,'height':height,'frames':count,'fps':report['fps'],
            'actualMediaMetadataVerified':True,
            'posters':files,'runtimePoster':files['last' if clip_id.startswith('garden-') else 'first'],
            'recordedEncodedAlpha':report['encodedAlpha']})
        print(f'{clip_id}: copied and generated first/last RGBA posters',flush=True)
    reference = ROOT/'assets/character/qiqi-chibi-v5-knot-sprout.png'
    fallback=destination/'character.png'
    shutil.copy2(reference,fallback)
    if preview.sha(fallback) != checked[0][1]['referenceSha256']:
        raise ValueError('Character reference changed during copying')
    result['fallbackArtwork']={'path':'character.png','sha256':preview.sha(fallback)}
    for report_file,report,_,_,report_digest in checked:
        if preview.sha(report_file) != report_digest:
            raise ValueError('Candidate report changed during preparation')
        for key in ('source','output','reference'):
            if preview.sha(ROOT/report[key]) != report[key+'Sha256']:
                raise ValueError('Candidate input changed during preparation')
    (destination/'manifest.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    return result


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest',required=True)
    parser.add_argument('--output',required=True)
    args=parser.parse_args()
    prepare((ROOT/args.manifest).resolve(),(ROOT/args.output).resolve())
