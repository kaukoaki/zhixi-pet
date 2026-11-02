"""Synthetic motion and fail-closed checks for offline branding tracking."""
from pathlib import Path
import importlib.util
import unittest
import cv2
import numpy as np

SPEC = importlib.util.spec_from_file_location('branding_tracking', Path(__file__).resolve().parents[1] / 'scripts/branding-tracking.py')
tracking = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(tracking)


class TrackingTest(unittest.TestCase):
    def setUp(self):
        self.frame = np.full((180, 200, 3), 235, np.uint8)
        random = np.random.default_rng(812)
        self.frame[45:110, 65:130] = random.integers(40, 210, (65, 65, 3), dtype=np.uint8)
        self.quad = tracking.box_quad((65, 45, 65, 65))

    def test_translation_and_small_rotation_follow_the_same_plane(self):
        tracker = tracking.PlanarTracker(self.frame, self.quad)
        for step in range(1, 9):
            matrix = cv2.getRotationMatrix2D((97.5, 77.5), step * .7, 1 + step * .003)
            matrix[:, 2] += (step * 1.1, step * .6)
            frame = cv2.warpAffine(self.frame, matrix, (200, 180), borderValue=(235, 235, 235))
            result = tracker.update(frame)
            expected = cv2.transform(self.quad[None], matrix)[0]
            self.assertTrue(result['visible'], result)
            self.assertLess(np.abs(np.asarray(result['quad']) - expected).max(), 1.3)

    def test_opaque_occlusion_hides_patch_and_requires_reanchor(self):
        tracker = tracking.PlanarTracker(self.frame, self.quad)
        obscured = self.frame.copy()
        obscured[30:130, 50:150] = (100, 60, 90)
        result = tracker.update(obscured)
        self.assertFalse(result['visible'])
        self.assertFalse(tracker.update(self.frame)['visible'])

    def test_manual_hidden_span_never_extrapolates_an_overlay(self):
        frames = [self.frame] * 8
        anchors = [{'frame': 0, 'quad': self.quad}, {'frame': 2, 'visible': False},
                   {'frame': 6, 'quad': self.quad}]
        results = list(tracking.track_frames(frames, anchors))
        self.assertTrue(results[0]['visible'])
        self.assertTrue(results[1]['visible'])
        self.assertTrue(all(not value['visible'] for value in results[2:6]))
        self.assertTrue(results[6]['visible'])

    def test_keyframe_interpolation_does_not_cross_hidden_turns(self):
        shifted = self.quad + (10, 20)
        anchors = [{'frame': 0, 'quad': self.quad}, {'frame': 10, 'quad': shifted},
                   {'frame': 11, 'visible': False}, {'frame': 20, 'quad': shifted}]
        midpoint = tracking.interpolate_keyframes(anchors, 5)
        self.assertTrue(midpoint['visible'])
        np.testing.assert_allclose(midpoint['quad'], self.quad + (5, 10))
        self.assertFalse(tracking.interpolate_keyframes(anchors, 15)['visible'])
        self.assertFalse(tracking.interpolate_keyframes(anchors, 21)['visible'])

    def test_uniform_patch_fails_without_texture_and_invalid_quad_rejected(self):
        plain = np.full_like(self.frame, 230)
        tracker = tracking.PlanarTracker(plain, self.quad)
        self.assertFalse(tracker.update(plain)['visible'])
        with self.assertRaises(ValueError):
            tracking.PlanarTracker(self.frame, [[0, 0]] * 4)

    def test_hanging_charm_translation_preserves_shape_without_shear(self):
        tracker = tracking.PlanarTracker(self.frame, self.quad, motion_model='translation')
        shifted = cv2.warpAffine(self.frame, np.float32([[1, 0, 7], [0, 1, -4]]), (200, 180),
                                borderValue=(235, 235, 235))
        result = tracker.update(shifted)
        self.assertTrue(result['visible'])
        np.testing.assert_allclose(result['quad'], self.quad + (7, -4), atol=.2)

    def test_template_locator_recovers_jump_and_rejects_opaque_cover(self):
        locator = tracking.TemplateLocator([{'image': self.frame, 'quad': self.quad}],
                                           search_region=(30, 15, 165, 150))
        matrix = np.float32([[1, 0, 32], [0, 1, 18]])
        shifted = cv2.warpAffine(self.frame, matrix, (200, 180), borderValue=(235, 235, 235))
        result = locator.locate(shifted)
        self.assertTrue(result['visible'], result)
        np.testing.assert_allclose(result['quad'], self.quad + (32, 18), atol=.6)
        self.assertFalse(locator.locate(np.full_like(self.frame, 110))['visible'])

    def test_feature_appearance_explicitly_anchors_a_separate_stable_plane(self):
        frame = self.frame.copy()
        patch = tracking.box_quad((78, 127, 38, 30))
        feature = tracking.box_quad((66, 45, 62, 60))
        frame[127:157, 78:116] = np.random.default_rng(9).integers(30, 220, (30, 38, 3), dtype=np.uint8)
        changed = frame.copy()
        changed[122:162, 73:121] = (190, 175, 170)
        patch_tracker = tracking.PlanarTracker(frame, patch, feature_quad=feature)
        feature_tracker = tracking.PlanarTracker(frame, patch, feature_quad=feature,
                                                appearance_region='features')
        self.assertFalse(patch_tracker.update(changed)['visible'])
        result = feature_tracker.update(changed)
        self.assertTrue(result['visible'], result)
        np.testing.assert_allclose(result['quad'], patch, atol=.1)

    def test_feature_appearance_still_rejects_an_obscured_anchor(self):
        tracker = tracking.PlanarTracker(self.frame, self.quad,
                                        appearance_region='features')
        covered = self.frame.copy()
        covered[30:130, 50:150] = (100, 60, 90)
        self.assertFalse(tracker.update(covered)['visible'])
        self.assertFalse(tracker.update(self.frame)['visible'])
        with self.assertRaises(ValueError):
            tracking.PlanarTracker(self.frame, self.quad, appearance_region='anywhere')


if __name__ == '__main__':
    unittest.main()
