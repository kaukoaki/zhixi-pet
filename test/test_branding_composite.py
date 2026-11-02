"""Pixel protection checks for offline, manually tracked costume replacement."""
from pathlib import Path
import importlib.util
import unittest
from unittest.mock import patch

import cv2
import numpy as np

spec = importlib.util.spec_from_file_location(
    'branding_composite', Path(__file__).resolve().parents[1] / 'scripts/branding-composite.py')
composite = importlib.util.module_from_spec(spec)
spec.loader.exec_module(composite)


class BrandingCompositeTest(unittest.TestCase):
    def test_prop_donor_exclusions_keep_other_costume_colors_available(self):
        frame=np.full((110,120,4),[240,234,226,255],np.uint8)
        foreground=np.zeros((110,120),np.uint8);foreground[:,:52]=255
        frame[:,:52,:3]=[35,43,62]
        foreground[44:48,62:67]=255;frame[44:48,62:67,:3]=[60,45,40]
        frame[52:67,52:56,:3]=[170,125,60]
        excluded=np.zeros_like(foreground);excluded[:,:52]=255
        captured=[];inpaint=cv2.inpaint
        def inspect(rgb,mask,radius,method):
            captured.append(rgb.copy());return inpaint(rgb,mask,radius,method)
        with patch.object(cv2,'inpaint',side_effect=inspect):
            out,stats=composite.replace_chest(frame,[[40,35],[90,35],[90,90],[40,90]],
                np.zeros((24,24,4),np.uint8),occlusion=foreground,
                repair_method='cloth-nearest',donor_exclusion_mask=excluded)
        self.assertIsNone(stats['skipped'])
        # Repair ROI begins at x=42,y=41. The excluded wallet changes only in
        # the temporary donor input; the separate cape stays a real donor.
        np.testing.assert_array_equal(captured[0][45-41,64-42],[60,45,40])
        self.assertGreater(int(captured[0][58-41,50-42,0]),225)
        np.testing.assert_array_equal(out[foreground>0],frame[foreground>0])
        np.testing.assert_array_equal(out[:,:,3],frame[:,:,3])
        with self.assertRaisesRegex(ValueError,'binary mask'):
            composite.replace_chest(frame,self.quad,self.asset,repair_method='cloth-nearest',
                donor_exclusion_mask=np.ones((110,120),np.uint8))

    def test_nearest_cloth_prevents_prop_bleed_and_preserves_source_pixels(self):
        frame=np.full((110,120,4),[240,234,226,255],np.uint8)
        frame[:10,:,3]=100
        foreground=np.zeros((110,120),np.uint8);foreground[:,:52]=255
        frame[foreground>0,:3]=[35,43,62]
        frame[52:67,52:56,:3]=[170,125,60]
        empty=np.zeros((24,24,4),np.uint8)
        quad=[[40,35],[90,35],[90,90],[40,90]]
        plain,_=composite.replace_chest(frame,quad,empty,occlusion=foreground,
            repair_method='telea')
        out,stats=composite.replace_chest(frame,quad,empty,occlusion=foreground,
            repair_method='cloth-nearest')
        self.assertIsNone(stats['skipped'])
        self.assertGreater(int(out[59,53,0]),225)
        self.assertGreater(int(out[59,53,0]),int(plain[59,53,0])+30)
        np.testing.assert_array_equal(out[foreground>0],frame[foreground>0])
        np.testing.assert_array_equal(out[:,:,3],frame[:,:,3])
        outside=np.ones((110,120),bool);outside[35:91,40:91]=False
        np.testing.assert_array_equal(out[outside],frame[outside])

    def test_nearest_cloth_refuses_footage_without_visible_ivory_donors(self):
        frame=np.full((100,120,4),[140,140,140,255],np.uint8)
        frame[40:45,50:60,:3]=[170,125,60]
        out,stats=composite.replace_chest(frame,self.quad,np.zeros((24,24,4),np.uint8),
            repair_method='cloth-nearest')
        self.assertEqual(stats['skipped'],'insufficient-cloth-donors')
        np.testing.assert_array_equal(out,frame)

    def test_explicit_residual_ink_respects_domain_foreground_and_alpha(self):
        frame=np.full((100,120,4),[244,240,234,255],np.uint8)
        frame[:12,:,3]=120
        # Low-chroma blurred ink is deliberately outside the default palette.
        cv2.line(frame,(48,40),(65,40),(165,157,150,255),2)
        mask=np.zeros((100,120),np.uint8);mask[38:43,45:69]=255
        mask[:20,:]=255  # An explicit request cannot grow the safe domain.
        foreground=np.zeros_like(mask);foreground[:,60:]=255
        empty=np.zeros((24,24,4),np.uint8)
        out,stats=composite.replace_chest(frame,self.quad,empty,occlusion=foreground,
            extra_repair_mask=mask)
        self.assertIsNone(stats['skipped'])
        self.assertGreater(stats['manual_repair_pixels'],0)
        self.assertGreater(int(out[40,53,0]),220)
        np.testing.assert_array_equal(out[:,60:],frame[:,60:])
        np.testing.assert_array_equal(out[:30],frame[:30])
        np.testing.assert_array_equal(out[:,:,3],frame[:,:,3])

    def test_explicit_ink_cannot_bypass_fraction_limit_and_requires_binary_mask(self):
        mask=np.zeros((100,120),np.uint8);mask[30:69,40:77]=255
        out,stats=composite.replace_chest(self.frame,self.quad,self.asset,extra_repair_mask=mask)
        self.assertEqual(stats['skipped'],'unsafe-colored-quad')
        np.testing.assert_array_equal(out,self.frame)
        for bad in [np.ones((2,2),np.uint8),np.ones((100,120),np.uint8),np.zeros((100,120),float)]:
            with self.assertRaises(ValueError):
                composite.replace_chest(self.frame,self.quad,self.asset,extra_repair_mask=bad)

    def test_reviewed_cloth_panel_restores_smooth_lighting_and_preserves_cuff(self):
        yy,xx=np.indices((100,120))
        value=235+xx*.04+yy*.06
        frame=np.empty((100,120,4),np.uint8)
        frame[:,:,:3]=np.rint(value[:,:,None]+np.array([4,0,-6])).astype(np.uint8)
        frame[:,:,3]=255
        expected=frame.copy()
        cv2.circle(frame,(57,48),9,(148,129,106,255),2)
        foreground=np.zeros(frame.shape[:2],np.uint8)
        foreground[:, :44]=255;frame[foreground>0,:3]=60
        empty=np.zeros((24,24,4),np.uint8)
        quad=[[40,30],[76,30],[76,68],[40,68]]
        result,stats=composite.replace_chest(frame,quad,empty,occlusion=foreground,
            repair_palette='shadow-gold',repair_method='cloth-panel')
        self.assertIsNone(stats['skipped'])
        self.assertLessEqual(np.abs(result[48,48,:3].astype(int)-expected[48,48,:3]).max(),2)
        np.testing.assert_array_equal(result[foreground>0],frame[foreground>0])
        np.testing.assert_array_equal(result[:,:,3],frame[:,:,3])
        outside=np.ones(frame.shape[:2],bool);outside[30:69,40:77]=False
        np.testing.assert_array_equal(result[outside],frame[outside])

    def test_source_pixel_softening_has_no_black_halo_and_preserves_foreground(self):
        frame = np.full((100,120,4), [240,240,240,255], np.uint8)
        frame[:8,:,3] = 0
        foreground = np.zeros(frame.shape[:2], np.uint8)
        foreground[:,55:60] = 255
        asset = np.zeros((24,24,4),np.uint8)
        asset[5:19,5:19] = [200,100,50,255]
        quad = [[40,30],[76,30],[76,68],[40,68]]
        result, stats = composite.apply_hair(frame,quad,asset,occlusion=foreground,
                                             overlay_blur_sigma=.6)
        np.testing.assert_array_equal(result[:,:,3],frame[:,:,3])
        np.testing.assert_array_equal(result[foreground>0],frame[foreground>0])
        changed = np.any(result[:,:,:3] != frame[:,:,:3],axis=2)
        self.assertTrue(changed.any())
        self.assertGreaterEqual(int(result[changed,0].min()),199)
        self.assertEqual(stats['overlay_blur_sigma'],.6)

    def test_overlay_softening_is_explicit_and_bounded(self):
        self.setUp()
        normal,_=composite.apply_hair(self.frame,self.quad,self.asset)
        explicit,_=composite.apply_hair(self.frame,self.quad,self.asset,overlay_blur_sigma=0)
        np.testing.assert_array_equal(normal,explicit)
        for sigma in [-1,2.1,float('nan')]:
            with self.assertRaises(ValueError):
                composite.apply_hair(self.frame,self.quad,self.asset,overlay_blur_sigma=sigma)

    def setUp(self):
        self.frame = np.full((100, 120, 4), [244, 240, 234, 255], np.uint8)
        self.frame[:8, :, 3] = 0
        self.frame[8:12, :, 3] = 120
        cv2.circle(self.frame, (57, 48), 9, (170, 125, 60, 255), 2)
        self.quad = [[40, 30], [76, 30], [76, 68], [40, 68]]
        self.asset = np.zeros((24, 24, 4), np.uint8)
        cv2.circle(self.asset, (12, 12), 5, (110, 185, 150, 255), -1)

    def test_chest_removes_old_strokes_without_changing_alpha_or_outside_quad(self):
        changed, stats = composite.replace_chest(self.frame, self.quad, self.asset)
        self.assertIsNone(stats['skipped'])
        self.assertGreater(stats['repair_pixels'], 0)
        np.testing.assert_array_equal(changed[:, :, 3], self.frame[:, :, 3])
        outside = np.ones(self.frame.shape[:2], bool)
        outside[30:69, 40:77] = False
        np.testing.assert_array_equal(changed[outside], self.frame[outside])
        self.assertGreater(int(changed[48, 48, 0]), 220)  # Old dark gold ring erased.
        self.assertGreater(int(changed[49, 58, 1]), int(changed[49, 58, 0]))

    def test_occluded_pixels_are_unchanged_for_repair_and_overlay(self):
        occlusion = np.zeros((100, 120), np.uint8)
        occlusion[:, :58] = 255
        changed, _ = composite.replace_chest(self.frame, self.quad, self.asset, occlusion)
        np.testing.assert_array_equal(changed[:, :58], self.frame[:, :58])
        hair, _ = composite.apply_hair(self.frame, self.quad, self.asset, occlusion)
        np.testing.assert_array_equal(hair[:, :58], self.frame[:, :58])

    def test_missing_old_mark_or_colored_quad_does_not_paint_on_an_occluder(self):
        plain = self.frame.copy()
        plain[30:69, 40:77] = [240, 239, 237, 255]
        changed, stats = composite.replace_chest(plain, self.quad, self.asset)
        self.assertEqual(stats['skipped'], 'no-visible-old-mark')
        np.testing.assert_array_equal(changed, plain)
        colored = self.frame.copy()
        colored[30:69, 40:77] = [170, 125, 60, 255]
        changed, stats = composite.replace_chest(colored, self.quad, self.asset)
        self.assertEqual(stats['skipped'], 'unsafe-colored-quad')
        np.testing.assert_array_equal(changed, colored)

    def test_reviewed_shadow_palette_repairs_dull_ink_that_default_refuses(self):
        shadow = np.full_like(self.frame, [244, 240, 234, 255])
        cv2.circle(shadow, (57, 48), 9, (148, 129, 106, 255), 2)
        unchanged, default_stats = composite.replace_chest(shadow, self.quad, self.asset)
        self.assertEqual(default_stats['skipped'], 'no-visible-old-mark')
        np.testing.assert_array_equal(unchanged, shadow)
        changed, stats = composite.replace_chest(shadow, self.quad, self.asset,
                                                 repair_palette='shadow-gold')
        self.assertIsNone(stats['skipped'])
        self.assertEqual(stats['repair_palette'], 'shadow-gold')
        self.assertGreater(int(changed[48, 48, 0]), 220)
        np.testing.assert_array_equal(changed[:, :, 3], shadow[:, :, 3])

    def test_muted_brown_requires_explicit_profile_and_still_respects_masks(self):
        muted = np.full_like(self.frame, [244, 240, 234, 255])
        cv2.circle(muted, (57, 48), 9, (138, 122, 113, 255), 2)
        unchanged, stats = composite.replace_chest(muted, self.quad, self.asset,
                                                   repair_palette='shadow-gold')
        self.assertEqual(stats['skipped'], 'no-visible-old-mark')
        np.testing.assert_array_equal(unchanged, muted)
        occlusion = np.zeros(muted.shape[:2], np.uint8)
        occlusion[:, :58] = 255
        changed, stats = composite.replace_chest(muted, self.quad, self.asset,
            occlusion=occlusion, repair_palette='brown-gold')
        self.assertIsNone(stats['skipped'])
        np.testing.assert_array_equal(changed[:, :58], muted[:, :58])
        outside = np.ones(self.frame.shape[:2], bool)
        outside[30:69, 40:77] = False
        np.testing.assert_array_equal(changed[outside], muted[outside])

    def test_expanded_profiles_still_refuse_plain_cloth_and_excessively_colored_quad(self):
        for palette in ['shadow-gold', 'brown-gold']:
            with self.subTest(palette=palette):
                cloth = np.full_like(self.frame, [225, 220, 215, 255])
                changed, stats = composite.replace_chest(cloth, self.quad, self.asset,
                                                         repair_palette=palette)
                self.assertEqual(stats['skipped'], 'no-visible-old-mark')
                np.testing.assert_array_equal(changed, cloth)
                colored = self.frame.copy()
                colored[30:69, 40:77] = [148, 129, 106, 255]
                changed, stats = composite.replace_chest(colored, self.quad, self.asset,
                                                         repair_palette=palette)
                self.assertEqual(stats['skipped'], 'unsafe-colored-quad')
                np.testing.assert_array_equal(changed, colored)

    def test_unknown_palette_is_rejected_instead_of_silently_falling_back(self):
        with self.assertRaisesRegex(ValueError, 'repair_palette'):
            composite.replace_chest(self.frame, self.quad, self.asset,
                                    repair_palette='guess')

    def test_adaptive_profile_distinguishes_dark_ink_from_warm_lit_cloth(self):
        warm_cloth = np.full_like(self.frame, [220, 202, 188, 255])
        # Both cloth and this dull ink match the shadow color profile. Local
        # luminance/topology must select the ring rather than the whole shirt.
        cv2.circle(warm_cloth, (57, 48), 9, (156, 138, 122, 255), 2)
        unchanged, stats = composite.replace_chest(warm_cloth, self.quad, self.asset,
                                                 repair_palette='shadow-gold')
        self.assertEqual(stats['skipped'], 'unsafe-colored-quad')
        np.testing.assert_array_equal(unchanged, warm_cloth)
        changed, stats = composite.replace_chest(warm_cloth, self.quad, self.asset,
                                                 repair_palette='adaptive-gold')
        self.assertIsNone(stats['skipped'])
        self.assertLess(stats['repair_fraction'], .58)
        self.assertGreater(stats['luminance_contrast'], 24)
        self.assertGreater(int(changed[48, 48, 0]), 205)
        np.testing.assert_array_equal(changed[:, :, 3], warm_cloth[:, :, 3])

    def test_adaptive_profile_refuses_plain_cloth_and_smooth_light_gradient(self):
        gradient = np.full_like(self.frame, [225, 207, 192, 255])
        for y in range(gradient.shape[0]):
            gradient[y, :, :3] -= np.uint8(y * .25)
        for frame in [np.full_like(self.frame, [220, 202, 188, 255]), gradient]:
            changed, stats = composite.replace_chest(frame, self.quad, self.asset,
                                                     repair_palette='adaptive-gold')
            self.assertEqual(stats['skipped'], 'no-visible-old-mark')
            np.testing.assert_array_equal(changed, frame)

    def test_adaptive_profile_keeps_occluded_dark_strokes_and_outside_pixels(self):
        occlusion = np.zeros(self.frame.shape[:2], np.uint8)
        occlusion[:, :58] = 255
        changed, stats = composite.replace_chest(self.frame, self.quad, self.asset,
            occlusion=occlusion, repair_palette='adaptive-gold')
        self.assertIsNone(stats['skipped'])
        np.testing.assert_array_equal(changed[:, :58], self.frame[:, :58])
        outside = np.ones(self.frame.shape[:2], bool)
        outside[30:69, 40:77] = False
        np.testing.assert_array_equal(changed[outside], self.frame[outside])

    def test_explicit_repair_domain_erases_old_mark_beyond_smaller_badge_quad(self):
        frame = np.full_like(self.frame, [244, 240, 234, 255])
        cv2.circle(frame, (57, 48), 16, (170, 125, 60, 255), 2)
        badge_quad = [[45, 37], [69, 37], [69, 61], [45, 61]]
        repair_quad = [[35, 25], [80, 25], [80, 72], [35, 72]]
        changed, stats = composite.replace_chest(frame, badge_quad, self.asset,
                                                 repair_quad=repair_quad)
        self.assertIsNone(stats['skipped'])
        self.assertTrue(stats['repair_quad_explicit'])
        # Top of the old ring is outside the badge quad, inside reviewed repair.
        self.assertLess(int(frame[32, 57, 0]), 200)
        self.assertGreater(int(changed[32, 57, 0]), 220)
        outside = np.ones(frame.shape[:2], bool)
        outside[25:73, 35:81] = False
        np.testing.assert_array_equal(changed[outside], frame[outside])
        np.testing.assert_array_equal(changed[:, :, 3], frame[:, :, 3])
        # A separate repair domain must not enlarge the new badge itself.
        self.assertGreater(int(changed[49, 58, 1]), int(changed[49, 58, 0]))
        self.assertLessEqual(int(changed[32, 57, 1]), int(changed[32, 57, 0]))
        self.assertLess(abs(int(changed[32, 57, 0])-int(changed[32, 57, 2])), 20)

    def test_explicit_repair_domain_still_preserves_foreground_occlusions(self):
        repair_quad = [[34, 23], [82, 23], [82, 74], [34, 74]]
        occlusion = np.zeros(self.frame.shape[:2], np.uint8)
        occlusion[:, :58] = 255
        changed, _ = composite.replace_chest(self.frame, self.quad, self.asset,
            repair_quad=repair_quad, occlusion=occlusion, repair_palette='adaptive-gold')
        np.testing.assert_array_equal(changed[:, :58], self.frame[:, :58])
        with self.assertRaises(ValueError):
            composite.replace_chest(self.frame, self.quad, self.asset,
                repair_quad=[[34, 23], [82, 74], [82, 23], [34, 74]])

    def test_explicit_inpainting_methods_preserve_pixel_boundaries(self):
        for method in ['telea', 'navier-stokes']:
            with self.subTest(method=method):
                occlusion = np.zeros(self.frame.shape[:2], np.uint8)
                occlusion[:, :44] = 255
                changed, stats = composite.replace_chest(self.frame, self.quad, self.asset,
                    occlusion=occlusion, repair_palette='shadow-gold', repair_method=method)
                self.assertIsNone(stats['skipped'])
                self.assertEqual(stats['repair_method'], method)
                self.assertGreater(int(changed[48, 48, 0]), 220)
                np.testing.assert_array_equal(changed[:, :44], self.frame[:, :44])
                np.testing.assert_array_equal(changed[:, :, 3], self.frame[:, :, 3])
                outside = np.ones(self.frame.shape[:2], bool)
                outside[30:69, 40:77] = False
                np.testing.assert_array_equal(changed[outside], self.frame[outside])
        with self.assertRaisesRegex(ValueError, 'repair_method'):
            composite.replace_chest(self.frame, self.quad, self.asset, repair_method='guess')

    def test_cloth_guide_prevents_adjacent_dark_cuff_from_tinting_the_repaired_shirt(self):
        frame = np.full_like(self.frame, [244, 240, 234, 255])
        frame[:, :43, :3] = [40, 30, 20]
        cv2.circle(frame, (57, 48), 12, (148, 129, 106, 255), 2)
        occlusion = np.zeros(frame.shape[:2], np.uint8)
        occlusion[:, :43] = 255
        changed, stats = composite.replace_chest(frame, self.quad, self.asset,
            occlusion=occlusion, repair_palette='shadow-gold', repair_method='cloth-guided')
        self.assertIsNone(stats['skipped'])
        self.assertGreater(stats['cloth_guide_donor_pixels'], 24)
        self.assertGreater(int(changed[48, 45, 0]), 220)
        np.testing.assert_array_equal(changed[:, :43], frame[:, :43])
        np.testing.assert_array_equal(changed[:, :, 3], frame[:, :, 3])
        outside = np.ones(frame.shape[:2], bool)
        outside[30:69, 40:77] = False
        np.testing.assert_array_equal(changed[outside], frame[outside])

    def test_cloth_guide_refuses_when_there_is_not_enough_visible_fabric(self):
        frame = np.full_like(self.frame, [244, 240, 234, 255])
        frame[43:48, 54:57, :3] = [148, 129, 106]
        changed, stats = composite.replace_chest(frame,
            [[53, 42], [58, 42], [58, 49], [53, 49]], self.asset,
            repair_palette='shadow-gold', repair_method='cloth-guided')
        self.assertEqual(stats['skipped'], 'insufficient-cloth-guide')
        np.testing.assert_array_equal(changed, frame)

    def test_premultiplied_warp_does_not_add_dark_transparent_edges(self):
        image = np.full((100, 120, 4), 255, np.uint8)
        texture = np.zeros((12, 12, 4), np.uint8)
        texture[2:10, 2:10] = [255, 255, 255, 255]
        changed, _ = composite.apply_hair(image,
            [[39.3, 29.8], [75.8, 29.8], [75.8, 68.7], [39.3, 68.7]], texture)
        np.testing.assert_array_equal(changed, image)

    def test_invalid_crossing_quad_and_reference_size_are_rejected(self):
        with self.assertRaises(ValueError):
            composite.apply_hair(self.frame, [[0, 0], [20, 20], [0, 20], [20, 0]], self.asset)
        with self.assertRaises(ValueError):
            composite.extract_assets(np.zeros((100, 100, 4), np.uint8))


if __name__ == '__main__':
    unittest.main()
