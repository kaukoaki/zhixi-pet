"""Recheck production branding without depending on disposable trial caches.

Checks every decoded frame and produces enlarged samples for human inspection.
Sampling is not an automatic assertion that the artwork is visually correct.
"""
import argparse
import hashlib
import importlib.util
import itertools
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location('preview', ROOT/'scripts/preview-video-branding.py')
preview = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(preview)

RISK_FRAMES = {
    'drag': [17,21,193], 'focus': [97,108,140,170], 'pat': [114,117,119],
    'wallet': [74,110,160,218,230], 'wallet-low': [60,80,90,110,195],
    'wallet-careful': [40,72,73,74,78,80,94,96,98,111],
    'wallet-empty': [32,34,50,60,102,103,140,225],
    'wallet-wait': [31,74,110,160,195,218,230],
    'pomodoro-start': [136,137,138,160,222,230],
    'pomodoro-doze': [90,110,139], 'pomodoro-remind': [100,125,155],
    'pomodoro-peek': [197,198,200,239,241,242],
    'pomodoro-finish': [213,214,215,216,217,218,229,282,290],
    'garden-water': [189,190,223,297,310,460,469],
    'garden-tomato-ripe': [358],
    'garden-strawberry-grow': [146,206,331,338,350,420,422,435],
    'garden-watermelon-grow': [143,144,147,149,150],
}


def sha(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def project(relative):
    file = (ROOT/relative).resolve()
    if not file.is_relative_to(ROOT):
        raise ValueError('Path escapes project')
    return file


def region(row, part, width, height):
    q = row.get(part, {}).get('quad')
    if q is None:
        return None
    q = np.asarray(q)
    lo = np.maximum(np.floor(q.min(0)-10), 0).astype(int)
    hi = np.minimum(np.ceil(q.max(0)+10), [width,height]).astype(int)
    return (slice(lo[1],hi[1]),slice(lo[0],hi[0]))


def tile(frame, row, clip, index):
    out = Image.new('RGB',(320,180),'#e9e5f1')
    for column,part in enumerate(['chest','hair']):
        box = region(row,part,clip['width'],clip['height'])
        crop = Image.fromarray(frame[box] if box else frame)
        crop.thumbnail((153,152),Image.Resampling.LANCZOS)
        background = Image.new('RGBA',crop.size,'#e9e5f1')
        background.alpha_composite(crop)
        out.paste(background.convert('RGB'),(column*160+(155-crop.width)//2,0))
    ImageDraw.Draw(out).text((4,158),f"{clip['id']} f{index}",fill='#302638')
    return out


def spaced(rows,key,count,length,reverse=False):
    selected=[]
    for row in sorted(rows,key=lambda r:r[key],reverse=reverse):
        i=row['frame']
        if all(abs(i-j)>=max(1,length//10) for j in selected):
            selected.append(i)
            if len(selected)==count:break
    return selected


def audit(output, ids=None):
    output=output.resolve()
    if not output.is_relative_to(ROOT/'.cache') or output.exists():
        raise ValueError('Choose a fresh output directory inside project .cache')
    output.mkdir(parents=True)
    installation=json.loads((ROOT/'actions/branding-installation.json').read_text(encoding='utf-8'))
    result={'status':'running','visualApproval':False,'clips':[],'source':'production media and embedded QA snapshots'}
    for clip in installation['clips']:
        if ids and clip['id'] not in ids:continue
        source,media=project(clip['source']),project(clip['media'])
        if sha(source)!=clip['sourceSha256'] or sha(media)!=clip['mediaSha256']:
            raise ValueError('Production media checksum mismatch: '+clip['id'])
        qa=json.loads(project(clip['qa']).read_text(encoding='utf-8'))
        report=qa['trialReportSnapshot']
        if report['sourceSha256']!=clip['sourceSha256'] or report['outputSha256']!=clip['mediaSha256']:
            raise ValueError('Embedded trial snapshot differs from production')
        if len(report['perFrame'])!=clip['frames']:raise ValueError('Incomplete per-frame provenance')
        posters={}
        for part,key in [('first','firstFrame'),('last','lastFrame')]:
            file=project(clip[key])
            if sha(file)!=clip[key+'Sha256']:raise ValueError('Poster checksum mismatch')
            posters[part]=np.array(Image.open(file).convert('RGBA'))
        rows=[];crops={};width,height=clip['width'],clip['height'];max_alpha=0;first=last=None
        for i,pair in enumerate(itertools.zip_longest(preview.frames(source,width,height),preview.frames(media,width,height))):
            before,after=pair
            if before is None or after is None or i>=clip['frames']:
                raise ValueError('Decoded frame count mismatch: '+clip['id'])
            if first is None:first=after.copy()
            last=after
            provenance=report['perFrame'][i]
            error=int(np.abs(before[:,:,3].astype(np.int16)-after[:,:,3].astype(np.int16)).max())
            max_alpha=max(max_alpha,error)
            if error>1:raise ValueError('Alpha changed beyond 1/255: '+clip['id'])
            row={'frame':i,'alphaMaxError':error}
            for part in ['chest','hair']:
                box=region(provenance,part,width,height)
                if box:
                    a=before[box][:,:,:3].astype(np.int16);b=after[box][:,:,:3].astype(np.int16)
                    difference=np.abs(a-b).max(2)
                    row[part+'ChangedPixels']=int(np.count_nonzero(difference>4))
                    if part=='chest':
                        r,g,blue=a.transpose(2,0,1)
                        warm=(r>95)&(r-g>6)&(g-blue>4)&(r-blue>20)
                        row['warmSourcePixelsRetained']=int(np.count_nonzero(warm&(difference<=4)))
                else:
                    row[part+'ChangedPixels']=0
                    if part=='chest':row['warmSourcePixelsRetained']=0
            rows.append(row);crops[i]=tile(after,provenance,clip,i)
        if len(rows)!=clip['frames']:raise ValueError('Incomplete decoded clip')
        if not np.array_equal(first,posters['first']) or not np.array_equal(last,posters['last']):
            raise ValueError('Poster is not the decoded endpoint: '+clip['id'])
        chosen=set(np.linspace(0,len(rows)-1,12).astype(int).tolist())
        chosen.update(RISK_FRAMES.get(clip['id'],[]))
        for key,reverse in [('warmSourcePixelsRetained',True),('hairChangedPixels',False),('chestChangedPixels',False)]:
            chosen.update(spaced(rows,key,3,len(rows),reverse))
        chosen=sorted(i for i in chosen if 0<=i<len(rows))
        sheet=Image.new('RGB',(1280,180*((len(chosen)+3)//4)),'white')
        for n,i in enumerate(chosen):sheet.paste(crops[i],(n%4*320,n//4*180))
        sheet.save(output/(clip['id']+'.jpg'),quality=95)
        (output/(clip['id']+'-frames.json')).write_text(json.dumps(rows,indent=2),encoding='utf-8')
        item={'id':clip['id'],'media':clip['media'],'mediaSha256':clip['mediaSha256'],'frames':len(rows),'fps':clip['fps'],
              'maxAlphaError':max_alpha,'decodedEndpointPostersMatch':True,'reviewSampleFrames':chosen,'visualApproval':False}
        result['clips'].append(item)
        (output/'report.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
        print(clip['id'],len(rows),'alpha',max_alpha,'samples',len(chosen),flush=True)
    result.update(status='technical-pass-visual-review-pending',frames=sum(x['frames'] for x in result['clips']))
    (output/'report.json').write_text(json.dumps(result,indent=2),encoding='utf-8')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',required=True)
    parser.add_argument('--ids',nargs='*')
    args=parser.parse_args()
    audit(ROOT/args.output,args.ids)
