"""Regression checks for intentional detached comic effects, using synthetic art."""
from pathlib import Path
import argparse
import importlib.util
import unittest

import cv2
import numpy as np

spec = importlib.util.spec_from_file_location('video_matte', Path(__file__).resolve().parents[1] / 'scripts/prepare-white-video.py')
video_matte = importlib.util.module_from_spec(spec)
spec.loader.exec_module(video_matte)


class ComicEffectMatteTest(unittest.TestCase):
    def setUp(self):
        self.rgb = np.full((120, 160, 3), 255, dtype=np.uint8)
        # Character, a closed pale bubble with a purple outline and character,
        # its detached dot tail, plus an unrelated watermark outside the region.
        cv2.rectangle(self.rgb, (30, 25), (75, 100), (70, 50, 95), -1)
        cv2.rectangle(self.rgb, (100, 25), (140, 50), (245, 240, 250), -1)
        cv2.rectangle(self.rgb, (100, 25), (140, 50), (165, 120, 180), 2)
        cv2.putText(self.rgb, 'Z', (111, 44), cv2.FONT_HERSHEY_SIMPLEX, .5, (165, 120, 180), 1)
        cv2.circle(self.rgb, (107, 59), 3, (165, 120, 180), -1)
        cv2.rectangle(self.rgb, (5, 5), (18, 10), (160, 160, 160), -1)

    def test_default_preserves_character_and_removes_detached_elements(self):
        alpha = video_matte.matte(self.rgb, 210)[:, :, 3]
        self.assertEqual(alpha[60, 50], 255)
        self.assertEqual(int(alpha[20:65, 95:146].max()), 0)
        self.assertEqual(int(alpha[5:11, 5:19].max()), 0)

    def test_region_keeps_bubble_fill_symbol_and_tail_without_background_or_watermark(self):
        rgba = video_matte.matte(self.rgb, 210, keep_regions=[(95, 20, 51, 45)])
        self.assertEqual(rgba[35, 120, 3], 255)  # Enclosed pale bubble fill.
        self.assertEqual(rgba[59, 107, 3], 255)  # Detached dot tail.
        self.assertEqual(rgba[44, 111, 3], 255)  # Symbol.
        self.assertEqual(rgba[22, 97, 3], 0)    # Empty area inside the ROI.
        self.assertEqual(int(rgba[5:11, 5:19, 3].max()), 0)
        self.assertEqual(rgba[60, 50, 3], 255)

    def test_region_does_not_keep_a_component_that_crosses_its_boundary(self):
        alpha = video_matte.matte(self.rgb, 210, keep_regions=[(110, 20, 35, 45)])[:, :, 3]
        self.assertEqual(alpha[35, 120], 0)

    def test_tiny_outline_gap_does_not_erase_pale_bubble_fill_when_sealing_is_enabled(self):
        # A compression-sized opening connects the pale interior to the white
        # background. Repair only the approved effect, keeping outside empty.
        self.rgb[24:27, 120] = 255
        plain = video_matte.matte(self.rgb, 210, keep_regions=[(95, 20, 51, 45)])
        repaired = video_matte.matte(self.rgb, 210, keep_regions=[(95, 20, 51, 45)], seal_effect_gaps=3)
        self.assertEqual(plain[35, 130, 3], 0)
        self.assertEqual(repaired[35, 130, 3], 255)
        self.assertEqual(repaired[22, 97, 3], 0)
        self.assertEqual(int(repaired[5:11, 5:19, 3].max()), 0)

    def test_regions_validate_bounds_and_command_line_format(self):
        with self.assertRaises(ValueError):
            video_matte.matte(self.rgb, 210, keep_regions=[(150, 20, 20, 30)])
        for invalid in ['1,2,3', '-1,2,3,4', '1,2,0,4', '1,two,3,4']:
            with self.subTest(invalid=invalid), self.assertRaises(argparse.ArgumentTypeError):
                video_matte.region_argument(invalid)
        self.assertEqual(video_matte.region_argument('95,20,51,45'), (95, 20, 51, 45))

    def test_text_cleanup_is_bounded_and_keeps_colored_furniture(self):
        image = np.full((80,120,3), 225, dtype=np.uint8)
        cv2.rectangle(image, (65,30), (72,79), (150,105,65), -1)
        cv2.putText(image, 'AI', (70,68), cv2.FONT_HERSHEY_SIMPLEX, .6, (25,25,25), 2)
        original = image.copy()
        result = video_matte.clean_dark_text(image, [(60,40,60,35)])
        self.assertTrue(np.array_equal(image, original))
        self.assertTrue(np.array_equal(result[:35], original[:35]))
        self.assertTrue(np.array_equal(result[45:60,65:69], original[45:60,65:69]))
        self.assertFalse(((result[40:75,75:] < 50).all(2)).any())
        with self.assertRaises(ValueError):
            video_matte.clean_dark_text(image, [(100,60,30,30)])

    def test_fixed_mask_protects_moving_dark_art_outside_inspected_glyphs(self):
        image = np.full((80,120,3), 225, dtype=np.uint8)
        cv2.rectangle(image, (70,40), (110,70), (25,25,25), -1)
        cv2.rectangle(image, (20,50), (25,60), (25,25,25), -1)
        mask = np.zeros((80,120), dtype=np.uint8)
        mask[48:63,18:28] = 255
        original = image.copy(); original_mask = mask.copy()
        result = video_matte.clean_dark_text(image, text_mask=mask)
        self.assertTrue(np.array_equal(result[40:71,70:111], original[40:71,70:111]))
        self.assertGreater(int(result[55,22].min()), 200)
        self.assertTrue(np.array_equal(image, original))
        self.assertTrue(np.array_equal(mask, original_mask))
        with self.assertRaises(ValueError):
            video_matte.clean_dark_text(image, text_mask=np.zeros((20,20), dtype=np.uint8))


if __name__ == '__main__':
    unittest.main()
