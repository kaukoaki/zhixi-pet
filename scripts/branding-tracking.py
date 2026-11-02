"""Conservative offline tracking for reviewed pet-video branding patches.

Frames are RGB/RGBA uint8 arrays; quads are TL, TR, BR, BL pixel coordinates.
This does not composite artwork or change source media. Callers must omit a
patch whenever ``visible`` is false, and author explicit keyframes/occlusion
spans for spins, hair, hands and other foreground crossings. Confidence is a
tracking gate, not proof that an occluder is absent.
"""
import math
import cv2
import numpy as np


def box_quad(box):
    x, y, width, height = map(float, box)
    if width <= 0 or height <= 0:
        raise ValueError('Box must have positive dimensions')
    return np.array([[x, y], [x + width, y], [x + width, y + height], [x, y + height]], np.float32)


def _quad(value):
    result = np.asarray(value, np.float32)
    if result.shape != (4, 2) or not np.isfinite(result).all():
        raise ValueError('Quad must contain four finite x,y pairs')
    if not cv2.isContourConvex(result) or abs(cv2.contourArea(result)) < 4:
        raise ValueError('Quad must be convex with nonzero area')
    return result


def _gray(frame):
    frame = np.asarray(frame)
    if frame.dtype != np.uint8 or frame.ndim not in (2, 3):
        raise ValueError('Frames must be uint8 gray, RGB or RGBA arrays')
    if frame.ndim == 2:
        return frame
    if frame.shape[2] not in (3, 4):
        raise ValueError('Frames must be RGB or RGBA')
    return cv2.cvtColor(frame[:, :, :3], cv2.COLOR_RGB2GRAY)


def _canonical(gray, quad, size=72):
    destination = np.float32([[0, 0], [size - 1, 0], [size - 1, size - 1], [0, size - 1]])
    transform = cv2.getPerspectiveTransform(quad, destination)
    return cv2.warpPerspective(gray, transform, (size, size), flags=cv2.INTER_LINEAR)


def _appearance(reference, sample):
    # Ignore the patch edge, where a garment seam may enter during rotation.
    first = reference[5:-5, 5:-5].astype(np.float32)
    second = sample[5:-5, 5:-5].astype(np.float32)
    first -= first.mean()
    second -= second.mean()
    denominator = float(np.linalg.norm(first) * np.linalg.norm(second))
    if denominator < 1e-3:
        return 0.0  # A uniform patch cannot independently confirm identity.
    return float(np.clip((first * second).sum() / denominator, -1, 1))


class PlanarTracker:
    """LK/RANSAC tracker which fails closed after uncertainty.

    ``quad`` can bound the patch itself. ``feature_quad`` optionally selects a
    larger nearby textured plane (e.g. black hair bow) which moves with it.
    ``appearance_region='features'`` explicitly verifies that anchor plane
    rather than the artwork area. This is useful when a logo changes shape,
    but does not determine whether foreground hands cover the output patch.
    Reinitialize at a reviewed keyframe after a turn/occlusion. A rejected frame
    is never automatically authorized for compositing.
    """
    def __init__(self, first_frame, quad, *, feature_quad=None, frame_index=0,
                 min_points=6, max_points=100, fb_threshold=1.25,
                 appearance_threshold=.52, min_inlier_ratio=.65,
                 max_lost_frames=3, max_step_scale=1.4,
                 max_total_scale=2.5, max_step_rotation=25,
                 motion_model='affine', appearance_region='patch'):
        self.quad = _quad(quad)
        self.feature_quad = _quad(feature_quad if feature_quad is not None else quad)
        self.gray = _gray(first_frame)
        self.shape = self.gray.shape
        if appearance_region not in ('patch', 'features'):
            raise ValueError('Appearance region must be patch or features')
        self.appearance_region = appearance_region
        appearance_quad = self.feature_quad if appearance_region == 'features' else self.quad
        self.reference = _canonical(self.gray, appearance_quad)
        self.initial_area = abs(cv2.contourArea(self.quad))
        self.min_points, self.max_points = int(min_points), int(max_points)
        self.fb_threshold = float(fb_threshold)
        self.appearance_threshold = float(appearance_threshold)
        self.min_inlier_ratio = float(min_inlier_ratio)
        self.max_lost_frames = int(max_lost_frames)
        self.max_step_scale = float(max_step_scale)
        self.max_total_scale = float(max_total_scale)
        self.max_step_rotation = float(max_step_rotation)
        if motion_model not in ('affine', 'similarity', 'translation'):
            raise ValueError('Unknown tracking motion model')
        self.motion_model = motion_model
        if self.min_points < 3 or self.max_points < self.min_points:
            raise ValueError('Tracking requires at least three points')
        self.points = self._features(self.gray, first_frame)
        self.frame_index = int(frame_index)
        self.lost = 0
        self.closed = False
        self.last = self._result(True, 1.0, 'manual-anchor')

    def _features(self, gray, frame=None):
        mask = np.zeros(gray.shape, np.uint8)
        cv2.fillConvexPoly(mask, np.round(self.feature_quad).astype(np.int32), 255)
        # A small margin captures seams and the edge of low-detail pale fabric.
        margin = max(3, min(13, round(math.sqrt(abs(cv2.contourArea(self.feature_quad))) * .13)))
        mask = cv2.dilate(mask, np.ones((margin * 2 + 1, margin * 2 + 1), np.uint8))
        if frame is not None and np.asarray(frame).ndim == 3 and frame.shape[2] == 4:
            mask[frame[:, :, 3] < 128] = 0
        return cv2.goodFeaturesToTrack(gray, self.max_points, .015, 3,
                                      mask=mask, blockSize=3, useHarrisDetector=False)

    def _result(self, visible, confidence, reason, **details):
        return {'frame': self.frame_index, 'quad': self.quad.tolist(),
                'visible': bool(visible), 'confidence': float(confidence),
                'reason': reason, **details}

    def _reject(self, gray, reason, confidence=0.0):
        self.lost += 1
        if self.lost > self.max_lost_frames:
            self.closed = True
        self.gray = gray
        self.points = None
        self.last = self._result(False, confidence, reason)
        return self.last

    def update(self, frame, frame_index=None):
        self.frame_index = self.frame_index + 1 if frame_index is None else int(frame_index)
        gray = _gray(frame)
        if gray.shape != self.shape:
            raise ValueError('Frame dimensions changed')
        if self.closed:
            return self._result(False, 0, 'reanchor-required')
        if self.points is None or len(self.points) < self.min_points:
            # New points at a stale location cannot safely recover an identity.
            self.closed = True
            return self._reject(gray, 'insufficient-features')
        next_points, status, _ = cv2.calcOpticalFlowPyrLK(
            self.gray, gray, self.points, None, winSize=(21, 21), maxLevel=3,
            criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 25, .01))
        if next_points is None:
            return self._reject(gray, 'flow-failed')
        back, reverse_status, _ = cv2.calcOpticalFlowPyrLK(
            gray, self.gray, next_points, None, winSize=(21, 21), maxLevel=3,
            criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 25, .01))
        if back is None:
            return self._reject(gray, 'reverse-flow-failed')
        errors = np.linalg.norm(self.points.reshape(-1, 2) - back.reshape(-1, 2), axis=1)
        valid = status.ravel().astype(bool) & reverse_status.ravel().astype(bool) & (errors <= self.fb_threshold)
        old = self.points.reshape(-1, 2)[valid]
        new = next_points.reshape(-1, 2)[valid]
        if len(old) < self.min_points:
            return self._reject(gray, 'flow-inconsistent')
        if self.motion_model == 'translation':
            displacement = np.median(new - old, axis=0)
            residuals = np.linalg.norm(new - old - displacement, axis=1)
            inliers = (residuals < 1.75).astype(np.uint8)[:, None]
            if inliers.sum() >= self.min_points:
                displacement = np.median((new - old)[inliers[:, 0].astype(bool)], axis=0)
            affine = np.array([[1., 0., displacement[0]], [0., 1., displacement[1]]], np.float64)
        else:
            estimator = cv2.estimateAffinePartial2D if self.motion_model == 'similarity' else cv2.estimateAffine2D
            affine, inliers = estimator(old, new, method=cv2.RANSAC,
                                        ransacReprojThreshold=1.75, maxIters=1500,
                                        confidence=.99, refineIters=10)
        if affine is None or inliers is None:
            return self._reject(gray, 'no-affine-consensus')
        inlier_ratio = float(inliers.mean())
        singular = np.linalg.svd(affine[:, :2], compute_uv=False)
        rotation = abs(math.degrees(math.atan2(affine[1, 0], affine[0, 0])))
        proposed = cv2.transform(self.quad[None, :, :], affine)[0].astype(np.float32)
        area_ratio = abs(cv2.contourArea(proposed)) / self.initial_area
        height, width = gray.shape
        inside = ((proposed[:, 0] >= 0) & (proposed[:, 0] < width) &
                  (proposed[:, 1] >= 0) & (proposed[:, 1] < height)).all()
        geometry_ok = (np.linalg.det(affine[:, :2]) > 0 and inside and
                       singular.min() >= 1 / self.max_step_scale and
                       singular.max() <= self.max_step_scale and
                       1 / self.max_total_scale ** 2 <= area_ratio <= self.max_total_scale ** 2 and
                       rotation <= self.max_step_rotation and cv2.isContourConvex(proposed))
        if inlier_ratio < self.min_inlier_ratio or not geometry_ok:
            return self._reject(gray, 'geometry-rejected', inlier_ratio)
        proposed_features = cv2.transform(self.feature_quad[None, :, :], affine)[0].astype(np.float32)
        appearance_quad = proposed_features if self.appearance_region == 'features' else proposed
        appearance = _appearance(self.reference, _canonical(gray, appearance_quad))
        if appearance < self.appearance_threshold:
            return self._reject(gray, 'appearance-rejected', max(0, appearance))
        self.quad = proposed
        self.feature_quad = proposed_features
        self.gray = gray
        self.points = self._features(gray, frame)
        self.lost = 0
        confidence = min(inlier_ratio, max(0., appearance))
        self.last = self._result(True, confidence, 'tracked', inliers=int(inliers.sum()), appearance=appearance)
        return self.last


def _keyframes(values):
    result = {}
    for item in values:
        index = int(item['frame'])
        if index < 0 or index in result:
            raise ValueError('Keyframes must have unique nonnegative frame numbers')
        value = dict(item)
        value['visible'] = bool(item.get('visible', True))
        if value['visible']:
            value['quad'] = _quad(item.get('quad', box_quad(item['box']) if 'box' in item else None))
        result[index] = value
    return result


def track_frames(frames, keyframes, **tracker_options):
    """Yield one result per frame; explicit hidden spans persist until reanchor.

    A keyframe is ``{frame: 0, quad: [[x,y],...], visible: True}`` or
    ``{frame: 25, visible: False}``. ``box: [x,y,w,h]`` is also accepted.
    An optional ``feature_quad`` on a keyframe anchors a nearby textured plane.
    Before the first visible anchor and during unreviewed turns, patches hide.
    """
    anchors = _keyframes(keyframes)
    tracker, hidden = None, True
    for index, frame in enumerate(frames):
        anchor = anchors.get(index)
        if anchor is not None:
            hidden = not anchor['visible']
            if not hidden:
                tracker = PlanarTracker(frame, anchor['quad'],
                                        feature_quad=anchor.get('feature_quad'),
                                        frame_index=index, **tracker_options)
                yield tracker.last
                continue
        if hidden or tracker is None:
            yield {'frame': index, 'quad': None, 'visible': False,
                   'confidence': 0., 'reason': 'manual-hidden' if anchor or tracker else 'before-anchor'}
        else:
            yield tracker.update(frame, index)


def interpolate_keyframes(keyframes, frame_index, *, max_gap=90):
    """Conservative manual-only interpolation, with no extrapolation.

    Only two explicitly visible surrounding quads interpolate. Hidden anchors
    terminate a visible interval. For actual foreground crossings callers still
    need per-frame occlusion mattes, independent of these coordinates.
    """
    anchors = _keyframes(keyframes)
    if frame_index in anchors:
        value = anchors[frame_index]
        return {'frame': frame_index, 'quad': value.get('quad').tolist() if value['visible'] else None,
                'visible': value['visible'], 'confidence': 1., 'reason': 'manual-keyframe'}
    before = [index for index in anchors if index < frame_index]
    after = [index for index in anchors if index > frame_index]
    if not before or not after:
        return {'frame': frame_index, 'quad': None, 'visible': False, 'confidence': 0., 'reason': 'outside-keyframes'}
    left, right = max(before), min(after)
    if not anchors[left]['visible'] or not anchors[right]['visible'] or right - left > max_gap:
        return {'frame': frame_index, 'quad': None, 'visible': False, 'confidence': 0., 'reason': 'unreviewed-span'}
    weight = (frame_index - left) / (right - left)
    quad = anchors[left]['quad'] * (1 - weight) + anchors[right]['quad'] * weight
    return {'frame': frame_index, 'quad': quad.tolist(), 'visible': True,
            'confidence': 1., 'reason': 'manual-interpolation'}


class TemplateLocator:
    """Independent multi-reference SIFT reacquisition for reviewed local planes.

    References are ``{image: rgb_or_rgba, quad: output_quad,
    feature_quad: textured_anchor_quad, id: optional_label}``. The output quad
    may extend below a bow; appearance is checked on the actual feature plane.
    Each frame is matched independently, avoiding accumulated optical-flow
    drift. Explicit visibility cuts and foreground mattes are still mandatory.
    """
    def __init__(self, references, *, search_region=None, ratio_threshold=.74,
                 min_matches=6, min_inlier_ratio=.65,
                 appearance_threshold=.55, min_scale=.65, max_scale=1.55,
                 max_rotation=35, motion_model='similarity'):
        if motion_model not in ('similarity', 'affine'):
            raise ValueError('Locator supports similarity or affine geometry')
        self.search_region = search_region
        self.ratio_threshold = float(ratio_threshold)
        self.min_matches = int(min_matches)
        self.min_inlier_ratio = float(min_inlier_ratio)
        self.appearance_threshold = float(appearance_threshold)
        self.min_scale, self.max_scale = float(min_scale), float(max_scale)
        self.max_rotation = float(max_rotation)
        self.motion_model = motion_model
        self.sift = cv2.SIFT_create(nfeatures=400, contrastThreshold=.012, edgeThreshold=12)
        self.matcher = cv2.BFMatcher(cv2.NORM_L2)
        self.references = []
        for index, value in enumerate(references):
            image = np.asarray(value['image'])
            gray = _gray(image)
            quad = _quad(value['quad'])
            feature = _quad(value.get('feature_quad', quad))
            mask = np.zeros(gray.shape, np.uint8)
            cv2.fillConvexPoly(mask, np.round(feature).astype(np.int32), 255)
            if image.ndim == 3 and image.shape[2] == 4:
                mask[image[:, :, 3] < 128] = 0
            points, descriptors = self.sift.detectAndCompute(gray, mask)
            if descriptors is None or len(points) < self.min_matches:
                continue
            self.references.append({'quad': quad, 'feature': feature,
                                    'points': np.float32([point.pt for point in points]),
                                    'descriptors': descriptors, 'canonical': _canonical(gray, feature),
                                    'id': value.get('id', index)})
        if not self.references:
            raise ValueError('No reference contains enough distinctive SIFT features')

    def locate(self, frame, *, frame_index=None, search_region=None,
               expected_quad=None, max_expected_distance=80):
        gray = _gray(frame)
        height, width = gray.shape
        region = search_region if search_region is not None else self.search_region
        if region is None:
            x = y = 0
            rw, rh = width, height
        else:
            x, y, rw, rh = map(int, region)
            x, y = max(0, x), max(0, y)
            rw, rh = min(rw, width - x), min(rh, height - y)
            if rw <= 0 or rh <= 0:
                raise ValueError('Search region is outside frame')
        points, descriptors = self.sift.detectAndCompute(gray[y:y + rh, x:x + rw], None)
        failed = {'frame': frame_index, 'quad': None, 'visible': False,
                  'confidence': 0., 'reason': 'no-template-consensus'}
        if descriptors is None or len(points) < self.min_matches:
            return failed
        destination = np.float32([point.pt for point in points]) + (x, y)
        best = None
        for reference in self.references:
            pairs = self.matcher.knnMatch(reference['descriptors'], descriptors, k=2)
            good = [pair[0] for pair in pairs if len(pair) == 2 and
                    pair[0].distance < self.ratio_threshold * pair[1].distance]
            # Avoid several source keypoints all voting for one destination.
            selected = {}
            for match in good:
                if match.trainIdx not in selected or match.distance < selected[match.trainIdx].distance:
                    selected[match.trainIdx] = match
            good = list(selected.values())
            if len(good) < self.min_matches:
                continue
            old = np.float32([reference['points'][match.queryIdx] for match in good])
            new = np.float32([destination[match.trainIdx] for match in good])
            estimator = cv2.estimateAffinePartial2D if self.motion_model == 'similarity' else cv2.estimateAffine2D
            matrix, inliers = estimator(old, new, method=cv2.RANSAC,
                                        ransacReprojThreshold=2., maxIters=2000,
                                        confidence=.995, refineIters=15)
            if matrix is None or inliers is None or inliers.sum() < self.min_matches:
                continue
            consensus = float(inliers.mean())
            scale = np.linalg.svd(matrix[:, :2], compute_uv=False)
            angle = abs(math.degrees(math.atan2(matrix[1, 0], matrix[0, 0])))
            if (consensus < self.min_inlier_ratio or np.linalg.det(matrix[:, :2]) <= 0 or
                    scale.min() < self.min_scale or scale.max() > self.max_scale or
                    angle > self.max_rotation):
                continue
            quad = cv2.transform(reference['quad'][None], matrix)[0].astype(np.float32)
            feature = cv2.transform(reference['feature'][None], matrix)[0].astype(np.float32)
            if not ((quad[:, 0] >= 0) & (quad[:, 0] < width) &
                    (quad[:, 1] >= 0) & (quad[:, 1] < height)).all():
                continue
            if expected_quad is not None and np.linalg.norm(quad.mean(axis=0) - _quad(expected_quad).mean(axis=0)) > max_expected_distance:
                continue
            appearance = _appearance(reference['canonical'], _canonical(gray, feature))
            if appearance < self.appearance_threshold:
                continue
            confidence = min(consensus, appearance)
            candidate = {'frame': frame_index, 'quad': quad.tolist(), 'visible': True,
                         'confidence': float(confidence), 'reason': 'template-located',
                         'reference': reference['id'], 'inliers': int(inliers.sum()),
                         'appearance': appearance}
            if best is None or candidate['confidence'] > best['confidence']:
                best = candidate
        return best or failed
