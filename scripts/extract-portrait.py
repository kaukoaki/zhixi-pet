"""Extract the user-approved white-background artwork without redrawing it.

User explicitly authorized local extraction. Only border-connected neutral white
is removed; enclosed white hair, clothes and highlights stay opaque. The largest
connected subject keeps the character while discarding detached chat icons.
"""
from pathlib import Path
import argparse
import cv2
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent

def extract(source: Path):
    rgb = np.asarray(Image.open(source).convert('RGB')).copy()
    low, high = rgb.min(axis=2), rgb.max(axis=2)
    white = ((low >= 242) & (high.astype(int) - low.astype(int) <= 17)).astype('uint8')
    count, labels = cv2.connectedComponents(white, connectivity=8)
    border = np.unique(np.concatenate((labels[0], labels[-1], labels[:, 0], labels[:, -1])))
    border = border[border != 0]
    outside = np.isin(labels, border)
    candidate = (~outside).astype('uint8')
    count, labels, stats, _ = cv2.connectedComponentsWithStats(candidate, connectivity=8)
    subject = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
    mask = (labels == subject).astype('uint8')
    # Keep the original interior untouched; add a one-pixel anti-aliased edge.
    alpha = mask.astype('float32')
    inner = cv2.erode(mask, np.ones((3, 3), np.uint8))
    edge = (mask != inner)
    blur = cv2.GaussianBlur(alpha, (3,3), .55)
    alpha[edge] = blur[edge]
    # Undo the white matte only at those partial edge pixels.
    color = rgb.astype('float32')
    partial = (alpha > 0) & (alpha < 1)
    color[partial] = (color[partial] - 255 * (1 - alpha[partial, None])) / alpha[partial, None]
    rgba = np.dstack((np.clip(color,0,255).astype('uint8'), np.round(alpha*255).astype('uint8')))
    rgba[alpha == 0, :3] = 0
    output = Image.fromarray(rgba, 'RGBA')
    directory = ROOT / 'assets' / 'character'
    directory.mkdir(parents=True, exist_ok=True)
    output.save(directory / 'qiqi-idle.png')
    # Check the actual alpha on both light and dark backgrounds at real pet size.
    preview = Image.new('RGB', (1000, 620), '#f1eff7')
    draw = ImageDraw.Draw(preview)
    for index, background in enumerate(('#e8eef5', '#283046', '#83a9b9')):
        x = index * 330
        draw.rectangle((x, 0, x+329, 619), fill=background)
        large = output.copy(); large.thumbnail((320, 450), Image.Resampling.LANCZOS)
        preview.paste(large, (x+(330-large.width)//2, 16), large)
        small = output.resize((150,150), Image.Resampling.LANCZOS)
        preview.paste(small, (x+90, 458), small)
    preview.save(ROOT / 'docs' / 'portrait-alpha-review.png')
    print({'source': str(source), 'output': str(directory / 'qiqi-idle.png'), 'size': output.size,
           'transparent_fraction': round(float((alpha==0).mean()), 3),
           'opaque_fraction': round(float((alpha==1).mean()), 3), 'components_removed': count-2})

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    extract(parser.parse_args().source)
