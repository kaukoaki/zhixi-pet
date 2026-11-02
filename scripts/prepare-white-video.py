"""Matte a neutral white/black pet video, optionally trim and make an alpha loop.

Keeps the source unchanged. Intended only for the inspected neutral white source,
not arbitrary scenes. Requires NumPy, OpenCV, Pillow and imageio-ffmpeg.
"""
from pathlib import Path
import argparse
import hashlib
import json
import subprocess
import sys
import cv2
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / '.cache' / 'video-tools'))
import imageio_ffmpeg

def report_path(file):
    try:
        return file.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return str(file)

def region_argument(value):
    try:
        region = tuple(int(part) for part in value.split(','))
    except ValueError as error:
        raise argparse.ArgumentTypeError('Region must be x,y,width,height in pixels') from error
    if len(region) != 4 or region[0] < 0 or region[1] < 0 or region[2] <= 0 or region[3] <= 0:
        raise argparse.ArgumentTypeError('Region must have nonnegative x,y and positive width,height')
    return region


def matte(rgb, threshold, background='white', shadow_threshold=210, keep_regions=(), seal_effect_gaps=0):
    height, width = rgb.shape[:2]
    if seal_effect_gaps not in (0, 3, 5, 7):
        raise ValueError('Effect gap kernel must be 0, 3, 5 or 7')
    for rx, ry, rw, rh in keep_regions:
        if rx < 0 or ry < 0 or rw <= 0 or rh <= 0 or rx + rw > width or ry + rh > height:
            raise ValueError('Keep region must lie within the video frame')
    low, high = rgb.min(2), rgb.max(2)
    if background == 'black':
        neutral = (high <= threshold).astype('uint8')
    else:
        neutral = ((low >= threshold) & (high.astype('int16') - low.astype('int16') <= 27)).astype('uint8')
    # The inspected source has a pale neutral ground shadow below the calves.
    # Expand only the border-connected background test in that lower region;
    # the enclosed whites and dark outlines of the boots remain foreground.
    if background == 'white':
        neutral[int(rgb.shape[0] * .90):] |= ((low[int(rgb.shape[0] * .90):] >= shadow_threshold) &
            (high[int(rgb.shape[0] * .90):].astype('int16') - low[int(rgb.shape[0] * .90):].astype('int16') <= 35)).astype('uint8')
        if seal_effect_gaps:
            # Close tiny threshold/compression gaps in approved comic outlines,
            # so enclosed pale fills cannot leak into the outside background.
            kernel = np.ones((seal_effect_gaps, seal_effect_gaps), 'uint8')
            for rx, ry, rw, rh in keep_regions:
                roi = neutral[ry:ry+rh, rx:rx+rw]
                neutral[ry:ry+rh, rx:rx+rw] = cv2.morphologyEx(roi, cv2.MORPH_OPEN, kernel)
    _, labels, region_stats, region_centers = cv2.connectedComponentsWithStats(neutral, connectivity=8)
    border = np.unique(np.concatenate((labels[0], labels[-1], labels[:, 0], labels[:, -1])))
    outside = np.isin(labels, border[border > 0])
    if background == 'black':
        # This character's pale hair encloses several background gaps. Preserve
        # the dark clothing and bow, but remove sizable black pockets in the
        # surrounding hair rather than leaving black islands on a light desktop.
        height, width = rgb.shape[:2]
        for region in range(1, len(region_stats)):
            if region_stats[region, cv2.CC_STAT_AREA] < 16 or region in border:
                continue
            cx, cy = region_centers[region] / np.array([width, height])
            body = .25 < cx < .77 and cy > .43
            bow = .70 < cx < .87 and .24 < cy < .47
            if not body and not bow:
                outside[labels == region] = True
    mask = (~outside).astype('uint8')
    count, components, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    if count < 2:
        raise ValueError('No foreground character found')
    kept = [1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])]
    # Approved detached effects (speech bubbles, symbols and their tails) may
    # live outside the character. Keep whole components fully inside explicitly
    # inspected regions; do not retain a rectangular patch of the background.
    height, width = rgb.shape[:2]
    for rx, ry, rw, rh in keep_regions:
        for region in range(1, count):
            x, y, w, h, area = stats[region]
            if area >= 3 and rx <= x and ry <= y and x + w <= rx + rw and y + h <= ry + rh:
                kept.append(region)
    mask = np.isin(components, kept).astype('uint8')
    alpha = mask.astype('float32')
    inner = cv2.erode(mask, np.ones((3,3), 'uint8'))
    edge = (mask != inner)
    alpha[edge] = cv2.GaussianBlur(alpha, (3,3), .55)[edge]
    color = rgb.astype('float32')
    partial = (alpha > 0) & (alpha < 1)
    matte_color = 0 if background == 'black' else 255
    color[partial] = (color[partial] - matte_color * (1 - alpha[partial, None])) / alpha[partial, None]
    rgba = np.dstack((np.clip(color, 0, 255).astype('uint8'), np.round(alpha * 255).astype('uint8')))
    rgba[alpha == 0, :3] = 0
    return rgba

def blend(a, b, weight):
    a, b = a.astype('float32') / 255, b.astype('float32') / 255
    alpha = a[:,:,3:] * (1-weight) + b[:,:,3:] * weight
    premult = a[:,:,:3]*a[:,:,3:]*(1-weight) + b[:,:,:3]*b[:,:,3:]*weight
    rgb = np.divide(premult, alpha, out=np.zeros_like(premult), where=alpha > 1e-6)
    return np.round(np.clip(np.concatenate((rgb,alpha),2),0,1)*255).astype('uint8')

def clean_dark_text(rgb, regions=(), text_mask=None):
    """Repair inspected dark neutral text only inside explicit video regions.

    Source frames stay untouched. Region detection excludes saturated furniture;
    an explicit fixed mask repairs only its inspected pixels, protecting moving art.
    """
    if not regions and text_mask is None:
        return rgb
    height, width = rgb.shape[:2]
    if text_mask is not None and (text_mask.shape != (height, width) or text_mask.dtype != np.uint8):
        raise ValueError('Text cleanup mask must be a frame-sized uint8 grayscale image')
    mask = text_mask.copy() if text_mask is not None else np.zeros((height, width), dtype='uint8')
    for x, y, w, h in regions:
        if min(x, y) < 0 or min(w, h) <= 0 or x+w > width or y+h > height:
            raise ValueError('Text cleanup region must lie within the video frame')
        roi = rgb[y:y+h, x:x+w].astype('int16')
        ink = ((roi.max(2) <= 145) & (roi.max(2)-roi.min(2) <= 65)).astype('uint8')*255
        ink = cv2.dilate(ink, np.ones((5,5), 'uint8'))
        mask[y:y+h, x:x+w] |= ink
    return cv2.inpaint(rgb, mask, 3, cv2.INPAINT_TELEA) if mask.any() else rgb


def main(args):
    source, output = args.source.resolve(), args.output.resolve()
    if source == output:
        raise ValueError('Output must not replace the source')
    output.parent.mkdir(parents=True, exist_ok=True)
    cap = cv2.VideoCapture(str(source))
    fps = cap.get(cv2.CAP_PROP_FPS)
    if not cap.isOpened() or fps <= 0:
        raise ValueError('Cannot decode source video')
    mask_path = getattr(args, 'clean_text_mask', None)
    text_mask = cv2.imread(str(mask_path), cv2.IMREAD_GRAYSCALE) if mask_path else None
    if mask_path and text_mask is None:
        raise ValueError('Cannot read the explicit text cleanup mask')
    frames = []; source_frames = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        index = source_frames; source_frames += 1
        if index >= args.start_frame and (args.end_frame is None or index < args.end_frame):
            rgb = clean_dark_text(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB), getattr(args, 'clean_text_region', ()), text_mask)
            frames.append(matte(rgb, args.threshold, args.background, args.shadow_threshold, args.keep_region, args.seal_effect_gaps))
    cap.release()
    if len(frames) < 12:
        raise ValueError('Source too short')
    if args.speed <= 0:
        raise ValueError('Speed must be positive')
    selected_frames = len(frames)
    if args.speed != 1:
        # Keep the native frame rate, with an explicitly shortened transition.
        # The longer held loop is never accelerated with the transition clips.
        indices = np.linspace(0, len(frames)-1, max(2, round(len(frames)/args.speed))).round().astype(int)
        frames = [frames[index] for index in indices]
    overlap = min(args.overlap, len(frames)//5)
    # End blends into the beginning; the wrap then continues into frame overlap.
    result = frames[overlap:-overlap] + [blend(frames[-overlap+i], frames[i], (i+1)/overlap) for i in range(overlap)] if overlap else frames
    h,w = result[0].shape[:2]
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    command = [ffmpeg, '-y', '-hide_banner', '-loglevel', 'warning', '-f', 'rawvideo', '-pix_fmt', 'rgba',
               '-s', f'{w}x{h}', '-framerate', str(fps), '-i', 'pipe:0', '-an', '-c:v', 'libvpx-vp9',
               '-pix_fmt', 'yuva420p', '-auto-alt-ref', '0', '-crf', '28', '-b:v', '0', '-row-mt', '1',
               '-threads', '4', '-metadata:s:v:0', 'alpha_mode=1', str(output)]
    with output.with_suffix('.encode.log').open('wb') as log:
        encoder = subprocess.Popen(command, stdin=subprocess.PIPE, stderr=log, stdout=subprocess.DEVNULL)
        try:
            for frame in result:
                encoder.stdin.write(frame.tobytes())
            encoder.stdin.close()
            if encoder.wait() != 0:
                raise RuntimeError('VP9 encoding failed; see encode log')
        except BaseException:
            encoder.kill()
            raise
    # Verify real decoded alpha, not just container metadata.
    decoded = subprocess.run([ffmpeg, '-hide_banner', '-loglevel','error','-c:v','libvpx-vp9','-i',str(output),
                              '-frames:v','1','-f','rawvideo','-pix_fmt','rgba','pipe:1'], check=True, capture_output=True).stdout
    check = np.frombuffer(decoded, 'uint8').reshape(h,w,4)
    if not ((check[:,:,3] == 0).mean() > .1 and (check[:,:,3] == 255).mean() > .1):
        raise RuntimeError('Decoded output does not contain the expected transparent subject')
    sheet = Image.new('RGB', (960,700), '#d7dee7')
    for i, index in enumerate([0,len(result)//4,len(result)//2,len(result)*3//4,len(result)-2,len(result)-1]):
        image = Image.fromarray(result[index], 'RGBA'); image.thumbnail((300,300),Image.Resampling.LANCZOS)
        bg = '#273148' if i < 3 else '#91b9c4'
        cell = Image.new('RGB',(320,350),bg); cell.paste(image,((320-image.width)//2,8),image)
        ImageDraw.Draw(cell).text((8,325),f'frame {index}, {index/fps:.2f}s',fill='white')
        sheet.paste(cell,((i%3)*320,(i//3)*350))
    sheet.save(output.with_suffix('.review.jpg'))
    # A decoded frame is also useful for actual-size review.
    Image.fromarray(check, 'RGBA').save(output.with_suffix('.first-frame.png'))
    report = {'source':report_path(source),'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
              'output':report_path(output),'width':w,'height':h,'fps':fps,'source_frames':source_frames,
              'start_frame':args.start_frame,'end_frame_exclusive':args.end_frame,'selected_frames':selected_frames,'background':args.background,
              'frames':len(result),'seconds':len(result)/fps,'overlap_frames':overlap,
              'speed':args.speed,'white_threshold':args.threshold,'shadow_threshold':args.shadow_threshold,'keep_regions':args.keep_region,'seal_effect_gaps':args.seal_effect_gaps,'clean_text_regions':getattr(args,'clean_text_region',[]),'decoded_alpha_min':int(check[:,:,3].min()),
              'top_edge_contact_frames':sum(bool(frame[0,:,3].max()) for frame in frames),
              'decoded_alpha_max':int(check[:,:,3].max()),'transparent_fraction':float((check[:,:,3]==0).mean()),
              'file_bytes':output.stat().st_size}
    if mask_path:
        report['clean_text_mask'] = report_path(mask_path)
        report['clean_text_mask_sha256'] = hashlib.sha256(mask_path.read_bytes()).hexdigest()
    output.with_suffix('.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source',type=Path); parser.add_argument('output',type=Path)
    parser.add_argument('--threshold',type=int,default=234); parser.add_argument('--overlap',type=int,default=8)
    parser.add_argument('--background',choices=['white','black'],default='white')
    parser.add_argument('--shadow-threshold',type=int,default=210)
    parser.add_argument('--keep-region',type=region_argument,action='append',default=[],metavar='X,Y,W,H',
                        help='Keep detached foreground components within an inspected pixel region; repeatable')
    parser.add_argument('--seal-effect-gaps',type=int,choices=[0,3,5,7],default=0,
                        help='Seal tiny gaps in white-background comic outlines inside keep regions; kernel size in pixels')
    parser.add_argument('--speed',type=float,default=1)
    parser.add_argument('--clean-text-region',type=region_argument,action='append',default=[],metavar='X,Y,W,H',help='Inpaint inspected dark neutral video text inside this bounded region')
    parser.add_argument('--clean-text-mask',type=Path,help='Inpaint only an inspected fixed grayscale pixel mask; avoids selecting moving dark artwork')
    parser.add_argument('--start-frame',type=int,default=0); parser.add_argument('--end-frame',type=int)
    main(parser.parse_args())
