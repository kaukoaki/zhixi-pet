"""Offline, tracked costume replacement for the reviewed Zhixi footage.

All arrays are straight-alpha uint8 RGBA, NOT OpenCV's default BGRA.  This module
never writes a source asset or infers pose: a caller supplies reviewed quads and
optional frame-sized occlusion masks (255/True means hidden).  Quads are TL, TR,
BR, BL and map the complete extracted texture rectangle.  A low-confidence or
hidden pose must not be passed as a visible quad.
"""
from pathlib import Path

import cv2
import numpy as np


REFERENCE_SIZE = (1254, 1254)
CHEST_RECT = (595, 690, 701, 787)
HAIR_RECT = (849, 358, 944, 649)


def _rgba(value):
    value = np.asarray(value)
    if value.dtype != np.uint8 or value.ndim != 3 or value.shape[2] != 4:
        raise ValueError('Expected uint8 straight-alpha RGBA')
    return value


def _polygon_mask(shape, polygons, origin=(0, 0), soften=.45):
    """Supersampled masks limit feathering to the approved artwork contour."""
    height, width = shape
    scale = 4
    mask = np.zeros((height * scale, width * scale), np.uint8)
    ox, oy = origin
    for polygon in polygons:
        points = np.rint((np.asarray(polygon, np.float32) - [ox, oy]) * scale).astype(np.int32)
        cv2.fillPoly(mask, [points], 255, lineType=cv2.LINE_AA)
    mask = cv2.resize(mask, (width, height), interpolation=cv2.INTER_AREA)
    if soften:
        mask = cv2.GaussianBlur(mask, (3, 3), soften)
    return mask


def _asset(reference, rect, mask, name):
    x0, y0, x1, y1 = rect
    texture = reference[y0:y1, x0:x1].copy()
    texture[:, :, 3] = np.rint(texture[:, :, 3].astype(np.float32) * mask / 255).astype(np.uint8)
    texture[texture[:, :, 3] == 0, :3] = 0
    return {'name': name, 'rgba': texture, 'source_rect': list(rect),
            'reference_size': list(REFERENCE_SIZE)}


def extract_assets(reference_rgba):
    """Extract the approved v5 sprout/star and white knot/pendant, without hair.

    Manual silhouettes belong to the reviewed 1254 square v5 reference only.
    The code deliberately refuses another image size rather than guessing.
    """
    reference = _rgba(reference_rgba)
    if (reference.shape[1], reference.shape[0]) != REFERENCE_SIZE:
        raise ValueError('Branding masks require the reviewed 1254x1254 v5 reference')

    # Gold/mint components are isolated from the ivory panel, then their closed
    # interiors are filled.  The polygon guard excludes clasps and dress edging.
    x0, y0, x1, y1 = CHEST_RECT
    chest_rgb = reference[y0:y1, x0:x1, :3].astype(np.int16)
    r, g, b = (chest_rgb[:, :, index] for index in range(3))
    colors = (((r - b > 17) & (g - b > 7) & (r > g - 5)) |
              ((g - r > 2) & (g - b > 4)))
    chest_guard = _polygon_mask((y1-y0, x1-x0), [
        [(645, 692), (660, 715), (674, 720), (680, 726), (698, 721),
         (694, 745), (683, 758), (659, 769), (641, 784), (619, 784),
         (619, 771), (637, 765), (618, 761), (603, 750), (597, 723),
         (617, 723), (628, 714)]
    ], (x0, y0), soften=0)
    mask = ((colors & (chest_guard > 0)).astype(np.uint8) * 255)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    filled = np.zeros_like(mask)
    for contour in contours:
        if cv2.contourArea(contour) > 7:
            cv2.drawContours(filled, [contour], -1, 255, cv2.FILLED)
    filled = cv2.GaussianBlur(filled, (3, 3), .5)

    # Thin separate polygons follow the silhouette, not the surrounding hair or
    # black bow.  In particular the long white hair behind the gems is excluded.
    x0, y0, x1, y1 = HAIR_RECT
    knot = [(891, 360), (905, 361), (917, 370), (924, 375), (934, 377),
            (940, 384), (943, 396), (941, 409), (935, 417), (935, 428),
            (927, 439), (914, 445), (902, 447), (891, 453), (877, 454),
            (866, 450), (857, 441), (854, 428), (857, 416), (852, 406),
            (850, 393), (855, 382), (866, 375), (877, 373), (881, 365)]
    chain = [(888, 447), (898, 447), (899, 479), (897, 508),
             (901, 533), (900, 574), (904, 593), (889, 598),
             (885, 578), (887, 551), (886, 522), (887, 487)]
    gem_one = [(892, 470), (910, 490), (893, 510), (873, 491)]
    gem_two = [(893, 526), (913, 549), (894, 570), (872, 550)]
    tassel = [(888, 585), (902, 585), (905, 603), (912, 642),
              (905, 647), (893, 648), (878, 644), (881, 615)]
    hair_mask = _polygon_mask((y1-y0, x1-x0),
                              [knot, chain, gem_one, gem_two, tassel], (x0, y0))
    # The knot crosses the pre-existing black/gold ribbon in the reference.
    # Exclude those warm/dark fragments (including visible holes between cords)
    # rather than carrying a piece of that old bow into every tracked pose.
    knot_rgb = reference[y0:455, x0:x1, :3].astype(np.int16)
    kr, kg, kb = (knot_rgb[:, :, index] for index in range(3))
    bow = (((kr-kg > 10) & (kg-kb > 10) & (kr-kb > 30)) |
           ((np.max(knot_rgb, axis=2) < 78) & (kb < kg+3)))
    hair_mask[:455-y0][bow] = 0
    return {'chest': _asset(reference, CHEST_RECT, filled, 'sprout-star'),
            'hair': _asset(reference, HAIR_RECT, hair_mask, 'ivory-knot-pendant')}


def _warp(asset, quad, shape):
    height, width = shape
    q = np.asarray(quad, np.float32)
    if q.shape != (4, 2) or not np.isfinite(q).all():
        raise ValueError('quad must contain four finite TL/TR/BR/BL points')
    if not cv2.isContourConvex(q.reshape(-1, 1, 2)):
        raise ValueError('quad must be a convex noncrossing polygon')
    area = abs(cv2.contourArea(q))
    if area < 4 or area > height * width * .35:
        raise ValueError('quad area is outside the safe range')
    if np.max(np.abs(q)) > max(height, width) * 3:
        raise ValueError('quad is too far outside the frame')
    texture = _rgba(asset['rgba'] if isinstance(asset, dict) else asset)
    th, tw = texture.shape[:2]
    transform = cv2.getPerspectiveTransform(
        np.float32([[0, 0], [tw-1, 0], [tw-1, th-1], [0, th-1]]), q)
    # Warp premultiplied colors, never RGB against black transparent borders.
    source = texture.astype(np.float32) / 255
    source[:, :, :3] *= source[:, :, 3:]
    warped = cv2.warpPerspective(source, transform, (width, height),
                                 flags=cv2.INTER_LINEAR,
                                 borderMode=cv2.BORDER_CONSTANT)
    coverage = cv2.warpPerspective(np.ones((th, tw), np.float32), transform,
                                   (width, height), flags=cv2.INTER_LINEAR)
    return warped, np.clip(coverage, 0, 1)


def _visibility(frame, occlusion):
    height, width = frame.shape[:2]
    visible = (frame[:, :, 3] > 0).astype(np.float32)
    if occlusion is not None:
        blocked = np.asarray(occlusion)
        if blocked.shape != (height, width):
            raise ValueError('occlusion must have frame height/width')
        if blocked.dtype == np.bool_:
            blocked = blocked.astype(np.float32)
        elif np.issubdtype(blocked.dtype, np.integer):
            blocked = blocked.astype(np.float32) / 255
        else:
            blocked = blocked.astype(np.float32)
        if not np.isfinite(blocked).all() or np.any((blocked < 0) | (blocked > 1)):
            raise ValueError('occlusion must be bool, uint8 0..255, or float 0..1')
        visible *= 1 - blocked
    return visible


def _over(frame, warped, visible):
    out = frame.copy()
    amount = warped[:, :, 3] * visible
    rgb = np.divide(warped[:, :, :3], warped[:, :, 3:],
                    out=np.zeros_like(warped[:, :, :3]),
                    where=warped[:, :, 3:] > 1e-6)
    changed = amount > 0
    blended = rgb * amount[:, :, None] + frame[:, :, :3] / 255 * (1-amount[:, :, None])
    out[changed, :3] = np.rint(np.clip(blended[changed], 0, 1) * 255).astype(np.uint8)
    # Keep every original alpha value, including compressed soft hair edges.
    return out


def _soften_overlay(warped, sigma):
    if not np.isfinite(sigma) or not 0 <= sigma <= 2:
        raise ValueError('overlay_blur_sigma must be in 0..2 source pixels')
    if sigma == 0:
        return warped
    # Both RGB and alpha are already premultiplied. Blurring them together
    # avoids importing black from transparent texels into the visible edge.
    return cv2.GaussianBlur(warped, (0, 0), sigma, borderType=cv2.BORDER_CONSTANT)


def apply_hair(frame_rgba, quad, hair_asset, occlusion=None, opacity=1.0,
               overlay_blur_sigma=0.0):
    """Apply the extracted pendant to a reviewed hair quad. Alpha stays exact."""
    frame = _rgba(frame_rgba)
    if not np.isfinite(opacity) or not 0 <= opacity <= 1:
        raise ValueError('opacity must be in 0..1')
    warped, coverage = _warp(hair_asset, quad, frame.shape[:2])
    warped = _soften_overlay(warped, overlay_blur_sigma)
    visible = _visibility(frame, occlusion) * opacity
    result = _over(frame, warped, visible)
    return result, {'overlay_pixels': int(np.count_nonzero(warped[:, :, 3] * visible > .01)),
                    'alpha_changed': 0, 'quad_coverage_pixels': int(np.count_nonzero(coverage > .5)),
                    'overlay_blur_sigma': float(overlay_blur_sigma)}


def _adaptive_gold(frame, safe):
    """Find locally dark gold ink instead of classifying a warm shirt as ink.

    This is only an explicitly selected profile for a manually reviewed ivory
    panel. Otsu separates ink from its local cloth illumination; a black-hat
    response also requires narrow dark strokes, excluding smooth warm shading.
    It is not a skin/garment detector and never expands its own repair domain.
    """
    empty = np.zeros(safe.shape, bool)
    if np.count_nonzero(safe) < 20:
        return empty, {'luminance_threshold': None, 'luminance_contrast': 0.0}
    luminance = cv2.cvtColor(frame[:, :, :3], cv2.COLOR_RGB2LAB)[:, :, 0]
    values = luminance[safe]
    low, high = np.percentile(values, [10, 90])
    contrast = float(high-low)
    stats = {'luminance_threshold': None, 'luminance_contrast': contrast}
    if contrast < 24:
        return empty, stats
    threshold, _ = cv2.threshold(values.reshape(-1, 1), 0, 255,
                                  cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)
    stats['luminance_threshold'] = float(threshold)
    # A proportional kernel follows the mapped chest size, not the total frame
    # resolution. It spans a logo stroke and small hole, but not the whole panel.
    size = int(np.clip(round(np.sqrt(np.count_nonzero(safe)) * .27), 7, 31)) | 1
    blackhat = cv2.morphologyEx(luminance, cv2.MORPH_BLACKHAT,
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (size, size)))
    local_darkness = max(7, contrast * .18)
    rgb = frame[:, :, :3].astype(np.int16)
    r, g, b = (rgb[:, :, index] for index in range(3))
    gold_or_brown = (r+3 >= g) & (g+3 >= b) & (r-b > 8)
    candidate = safe & gold_or_brown & (luminance <= threshold) & (blackhat > local_darkness)
    # Reject small compression flecks. Do not grow or fill the candidate here:
    # all padding is still applied later inside the reviewed quad/occlusions.
    count, labels, components, _ = cv2.connectedComponentsWithStats(candidate.astype(np.uint8), 8)
    minimum = max(3, np.count_nonzero(safe) * .006)
    for index in range(1, count):
        if components[index, cv2.CC_STAT_AREA] < minimum:
            candidate[labels == index] = False
    return candidate, stats


def _cloth_donor_guide(rgb, safe, repair, *, return_surface=False):
    """Estimate only the missing *donor boundary* from visible ivory fabric.

    Dark cuffs outside the reviewed cloth must not donate their color to a
    repaired logo. This guide temporarily replaces non-cloth donors during
    inpainting; it is never copied to the output outside actual repair pixels.
    Existing cloth between ink strokes remains the real source texture.
    """
    value = rgb.astype(np.float64)
    r, g, b = (value[:, :, index] for index in range(3))
    donors = safe & (repair == 0) & (np.max(value, axis=2) > 130) & \
        (np.abs(r-g) < 40) & (np.abs(g-b) < 35)
    count = int(np.count_nonzero(donors))
    stats = {'cloth_guide_donor_pixels': count, 'cloth_guide_fit_error': None}
    if count < max(24, np.count_nonzero(safe) * .03):
        return None, stats
    yy, xx = np.indices(safe.shape)
    scale = max(np.ptp(xx[safe]), np.ptp(yy[safe]), 1)
    x = (xx-np.mean(xx[safe])) / scale
    y = (yy-np.mean(yy[safe])) / scale
    basis = np.stack([np.ones_like(x), x, y, x*y, x*x, y*y], axis=2)
    design, target = basis[donors], value[donors]
    if np.linalg.matrix_rank(design) < 6 or np.linalg.cond(design) > 1000:
        return None, stats
    weights = np.ones(count)
    # Robust fitting rejects occasional unmasked dark pixels; it never labels
    # foreground pixels or expands the caller's ivory-panel repair domain.
    for _ in range(5):
        root = np.sqrt(weights)[:, None]
        coefficients = np.linalg.lstsq(design*root, target*root, rcond=None)[0]
        residual = np.sqrt(np.mean((design @ coefficients-target)**2, axis=1))
        median = np.median(residual)
        spread = 1.4826*np.median(np.abs(residual-median)) + 2
        deviation = residual / (median + 4*spread)
        weights = np.maximum(0, 1-deviation*deviation)**2
    error = float(np.median(residual))
    stats['cloth_guide_fit_error'] = error
    if not np.isfinite(coefficients).all() or error > 18:
        return None, stats
    field = np.rint(np.clip(basis @ coefficients, 0, 255)).astype(np.uint8)
    if return_surface:
        return field, stats
    guide = rgb.copy()
    guide[~safe] = field[~safe]
    return guide, stats


def _nearest_cloth_donors(rgb, safe, repair, excluded=None):
    """Exclude foreground donors without fitting or repainting the panel.

    Only the temporary inpainting input outside the reviewed cloth domain is
    substituted. The output still copies pixels solely under the ink mask.
    """
    value = rgb.astype(np.int16)
    r, g, b = value.transpose(2, 0, 1)
    donors = safe & (repair == 0) & (np.max(value, axis=2) > 150) & \
        (np.abs(r-g) < 28) & (np.abs(g-b) < 28)
    count = int(np.count_nonzero(donors))
    stats = {'nearest_cloth_donor_pixels': count}
    if count < max(24, np.count_nonzero(safe) * .03):
        return None, stats
    _, labels = cv2.distanceTransformWithLabels((~donors).astype(np.uint8),
        cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    samples = rgb[donors]
    guide = rgb.copy()
    selected = ~safe if excluded is None else (~safe & (excluded > 0))
    guide[selected] = samples[labels[selected]-1]
    return guide, stats


def replace_chest(frame_rgba, quad, chest_asset, occlusion=None,
                  require_old_mark=True, max_repair_fraction=.58, opacity=1.0,
                  repair_palette='warm-gold', repair_quad=None,
                  repair_method='auto', overlay_blur_sigma=0.0,
                  extra_repair_mask=None, donor_exclusion_mask=None):
    """Repair gold logo strokes in a safe ivory-panel quad and add new badge.

    Colors outside the quad and all alpha values are preserved.  The warm-stroke
    detector deliberately refuses an excessively colored or dark quad, rather
    than painting over hands, cape or laptop.  Caller-supplied occlusions prevent
    repairs and overlays wherever hair, hands or other props are in front.

    ``warm-gold`` keeps the original conservative saturated-gold detector.
    ``shadow-gold`` and ``brown-gold`` are explicit, reviewed-footage profiles
    for darker/less saturated ink; neither is an automatic fallback. They must
    only be used with an ivory-panel quad enclosing the COMPLETE old mark and
    explicit foreground occlusions. They do not infer skin or clothing edges.
    ``adaptive-gold`` additionally requires local luminance contrast and narrow
    dark strokes, for warm-lit cloth that would otherwise match ink by color.

    ``repair_quad`` explicitly decouples the reviewed old-mark cleaning domain
    from the new badge's ``quad``. It must enclose all old strokes plus a clean
    cloth margin without reaching cape, trim or unmasked foreground objects.
    Without it, the original quad remains the exact repair boundary. No repair
    domain is inferred or enlarged automatically.

    ``extra_repair_mask`` marks explicitly reviewed residual ink that a colour
    detector misses in a blurred frame. It is clipped to the SAME safe domain
    and foreground matte and shares the unchanged repair-fraction limit.

    ``repair_method`` is ``auto`` (the established per-palette default),
    ``telea``, ``navier-stokes`` or ``cloth-guided``. Explicit Telea is useful for reviewed
    close-to-cuff footage where NS may propagate the dark foreground edge into
    the repair. Both still require correct domains and foreground masks.
    ``cloth-guided`` uses visible ivory fabric to replace non-cloth inpainting
    donors, then NS repairs only the old strokes. It refuses insufficient or
    inconsistent fabric samples and still requires cape/cuff occlusion masks.
    ``cloth-nearest`` uses nearest visible cloth as temporary outside-domain
    donors with Telea, preventing a dark foreground prop from bleeding into
    adjacent ink repairs. It does not fit or repaint the rest of the panel.
    An explicit ``donor_exclusion_mask`` can limit that substitution to props,
    keeping nearby cape colors as real donors. It never expands edit coverage.
    ``cloth-panel`` explicitly reconstructs a reviewed plain panel from that
    fitted cloth surface, with a six-source-pixel transition at the boundary.
    Use only on specific frames where the whole panel is safe to reconstruct;
    it smooths source cloth texture inside the panel and is never a fallback.
    """
    frame = _rgba(frame_rgba)
    if not np.isfinite(opacity) or not 0 <= opacity <= 1:
        raise ValueError('opacity must be in 0..1')
    if not 0 < max_repair_fraction < 1:
        raise ValueError('max_repair_fraction must be in 0..1')
    if repair_palette not in ('warm-gold', 'shadow-gold', 'brown-gold', 'adaptive-gold'):
        raise ValueError('repair_palette must be warm-gold, shadow-gold, brown-gold, or adaptive-gold')
    if repair_method not in ('auto', 'telea', 'navier-stokes', 'cloth-guided', 'cloth-panel', 'cloth-nearest'):
        raise ValueError('Unknown repair_method')
    if repair_method == 'auto':
        repair_method = 'telea' if repair_palette == 'warm-gold' else 'navier-stokes'
    if donor_exclusion_mask is not None:
        donor_exclusion_mask = np.asarray(donor_exclusion_mask)
        if (repair_method != 'cloth-nearest' or donor_exclusion_mask.shape != frame.shape[:2] or
                donor_exclusion_mask.dtype not in (np.dtype(bool),np.dtype(np.uint8)) or
                (donor_exclusion_mask.dtype == np.uint8 and not np.isin(donor_exclusion_mask,[0,255]).all())):
            raise ValueError('donor_exclusion_mask requires cloth-nearest and a frame-sized binary mask')
    warped, coverage = _warp(chest_asset, quad, frame.shape[:2])
    warped = _soften_overlay(warped, overlay_blur_sigma)
    if repair_quad is not None:
        _, coverage = _warp(chest_asset, repair_quad, frame.shape[:2])
    visible = _visibility(frame, occlusion)
    safe = (coverage > .99) & (visible > .99) & (frame[:, :, 3] >= 180)
    area = max(1, int(np.count_nonzero(safe)))
    rgb = frame[:, :, :3]
    r, g, b = (rgb[:, :, index].astype(np.int16) for index in range(3))
    # The reviewed ivory dress is itself warm. A weak red/blue test would mark
    # the whole cloth panel as a logo; retain only the distinctly saturated gold.
    palette_stats = {}
    if repair_palette == 'adaptive-gold':
        warm, palette_stats = _adaptive_gold(frame, safe)
    elif repair_palette == 'warm-gold':
        warm = (r-g > 14) & (g-b > 14) & (r-b > 45) & (r > 80) & (b < 225)
    elif repair_palette == 'shadow-gold':
        # Reviewed working/drag ink includes RGB148/129/106: distinctly gold,
        # but below the default 45-point red/blue separation. Avoid guessing a
        # foreground mask from these colors: hands can share the same palette.
        warm = (r-g > 11) & (g-b > 12) & (r-b > 29) & (r > 80) & (b < 200)
    else:
        # Some garden footage redraws the symbol in muted brown. A caller must
        # explicitly opt into this narrower-luminance, lower-chroma profile.
        warm = (r-g > 8) & (g-b > 5) & (r-b > 20) & (r > 70) & (b < 195)
    repair = (warm & safe).astype(np.uint8) * 255
    manual_stats = {}
    if extra_repair_mask is not None:
        supplied = np.asarray(extra_repair_mask)
        if supplied.shape != safe.shape or supplied.dtype not in (np.dtype(bool), np.dtype(np.uint8)):
            raise ValueError('extra_repair_mask must be a frame-sized bool or uint8 mask')
        if supplied.dtype == np.uint8 and not np.isin(supplied, [0, 255]).all():
            raise ValueError('extra_repair_mask must contain only binary 0/255 values')
        selected = (supplied > 0) & safe
        manual_stats = {'manual_repair_pixels': int(np.count_nonzero(selected & (repair == 0))),
                        'requested_manual_repair_pixels': int(np.count_nonzero(supplied))}
        repair[selected] = 255
    repair_count = int(np.count_nonzero(repair))
    fraction = repair_count / area
    stats = {'repair_pixels': repair_count, 'repair_fraction': fraction,
             'repair_palette': repair_palette,
             'repair_quad_explicit': repair_quad is not None,
             'repair_method': repair_method,
             'overlay_blur_sigma': float(overlay_blur_sigma),
             'alpha_changed': 0, 'overlay_pixels': 0, 'skipped': None}
    stats.update(palette_stats)
    stats.update(manual_stats)
    if np.count_nonzero(safe) < 5:
        stats['skipped'] = 'hidden-quad'
        return frame.copy(), stats
    if fraction > max_repair_fraction:
        stats['skipped'] = 'unsafe-colored-quad'
        return frame.copy(), stats
    if require_old_mark and repair_count < max(3, area * .008):
        stats['skipped'] = 'no-visible-old-mark'
        return frame.copy(), stats
    result = frame.copy()
    if repair_count:
        # Duller AI-redrawn strokes have soft antialiased fringes. Include two
        # pixels around reviewed shadow/brown strokes, bounded by the same
        # quad and foreground mask. Default saturated-gold behavior is intact.
        iterations = 1 if repair_palette == 'warm-gold' else 2
        repair = cv2.dilate(repair, np.ones((3, 3), np.uint8), iterations=iterations)
        repair[~safe] = 0
        donor_rgb = result[:, :, :3]
        if repair_method == 'cloth-nearest':
            donor_rgb, guide_stats = _nearest_cloth_donors(donor_rgb, safe, repair, donor_exclusion_mask)
            stats.update(guide_stats)
            if donor_rgb is None:
                stats['skipped'] = 'insufficient-cloth-donors'
                return frame.copy(), stats
        if repair_method in ('cloth-guided', 'cloth-panel'):
            donor_rgb, guide_stats = _cloth_donor_guide(donor_rgb, safe, repair,
                return_surface=repair_method == 'cloth-panel')
            stats.update(guide_stats)
            if donor_rgb is None:
                stats['skipped'] = 'insufficient-cloth-guide'
                return frame.copy(), stats
        if repair_method == 'cloth-panel':
            amount = np.minimum(1, cv2.distanceTransform(safe.astype(np.uint8), cv2.DIST_L2, 3) / 6)
            amount[repair > 0] = 1
            selected = amount > 0
            blended = result[:, :, :3] * (1-amount[:, :, None]) + donor_rgb * amount[:, :, None]
            result[selected, :3] = np.rint(blended[selected]).astype(np.uint8)
            stats['surface_reconstruction_pixels'] = int(np.count_nonzero(selected))
        ys, xs = np.nonzero(repair)
        if len(xs) and repair_method != 'cloth-panel':
            x0, x1 = max(0, int(xs.min())-10), min(frame.shape[1], int(xs.max())+11)
            y0, y1 = max(0, int(ys.min())-10), min(frame.shape[0], int(ys.max())+11)
            roi = result[y0:y1, x0:x1, :3]
            donors = donor_rgb[y0:y1, x0:x1]
            mask = repair[y0:y1, x0:x1]
            method = cv2.INPAINT_TELEA if repair_method in ('telea', 'cloth-nearest') else cv2.INPAINT_NS
            repaired = cv2.inpaint(donors, mask, 3, method)
            selected = mask > 0
            roi[selected] = repaired[selected]
    # Opacity controls appearance only, never partially reintroduces a removed
    # old logo. Hidden poses must be disabled by quad/occlusion, not a dissolve.
    result = _over(result, warped, visible * opacity)
    stats['overlay_pixels'] = int(np.count_nonzero(warped[:, :, 3] * visible * opacity > .01))
    return result, stats
