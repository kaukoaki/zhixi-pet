"""Regression checks for non-destructive offline costume previews."""
import importlib.util
import hashlib
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location('branding_preview', ROOT / 'scripts/preview-video-branding.py')
preview = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(preview)


class PreviewSafetyTests(unittest.TestCase):
    def test_donor_exclusions_require_exact_frame_entries_and_chest_target(self):
        self.assertIsNone(preview.manual_donor_polygons({},3))
        config={'chest_donor_exclusion_keyframes':[{'frame':3,'polygons':[]}]}
        self.assertEqual(preview.manual_donor_polygons(config,3),[])
        with self.assertRaisesRegex(ValueError,'exactly one entry'):
            preview.manual_donor_polygons(config,2)
        config['chest_donor_exclusion_keyframes'].append({'frame':3,'polygons':[]})
        with self.assertRaisesRegex(ValueError,'exactly one entry'):
            preview.manual_donor_polygons(config,3)
        with self.assertRaisesRegex(ValueError,'only apply to the chest'):
            preview.local_patch(np.full((100,100,4),255,np.uint8),
                [[30,30],[60,30],[60,60],[30,60]],{},donor_exclusion_polygons=[])

    def test_reviewed_blended_pose_patch_is_source_pinned_and_preserves_alpha(self):
        with tempfile.TemporaryDirectory() as location:
            root=Path(location);file=root/'patch.png'
            pixels=np.full((12,14,3),[100,180,150],np.uint8);Image.fromarray(pixels).save(file)
            original=np.full((100,100,4),240,np.uint8);original[:,:,3]=np.arange(100,dtype=np.uint8)[:,None]
            item={'frame':2,'box':[30,40,14,12],'image':'patch.png',
                'sha256':preview.sha(file),'sourceFrameSha256':hashlib.sha256(original.tobytes()).hexdigest()}
            config={'frames':4,'width':100,'height':100,'reviewed_chest_patches':[item]}
            loaded=preview.load_reviewed_chest_patches(config,root)
            config['reviewed_chest_patches'].append(dict(item))
            with self.assertRaisesRegex(ValueError,'unique valid frames'):
                preview.load_reviewed_chest_patches(config,root)
            config['reviewed_chest_patches'].pop()
            edited=original.copy();stats=preview.apply_reviewed_chest_patch(edited,original,loaded[2])
            self.assertEqual(stats['overlay_pixels'],12*14)
            np.testing.assert_array_equal(edited[:,:,3],original[:,:,3])
            outside=np.ones((100,100),bool);outside[40:52,30:44]=False
            np.testing.assert_array_equal(edited[outside],original[outside])
            changed=original.copy();changed[0,0,0]^=1
            with self.assertRaisesRegex(ValueError,'source frame changed'):
                preview.apply_reviewed_chest_patch(edited,changed,loaded[2])
            Image.fromarray(pixels+1).save(file)
            with self.assertRaisesRegex(ValueError,'image changed'):
                preview.load_reviewed_chest_patches(config,root)

    def test_reviewed_chest_patch_rejects_duplicate_frames_and_unbounded_regions(self):
        item={'frame':1,'box':[0,0,20,20],'image':'unused.png','sha256':'a'*64,'sourceFrameSha256':'b'*64}
        config={'frames':3,'width':100,'height':100,'reviewed_chest_patches':[item]}
        with self.assertRaisesRegex(ValueError,'bounded frame region'):
            preview.load_reviewed_chest_patches(config)
        item['box']=[-1,0,2,2]
        with self.assertRaisesRegex(ValueError,'bounded frame region'):
            preview.load_reviewed_chest_patches(config)
        item['frame']=True
        with self.assertRaisesRegex(ValueError,'unique valid frames'):
            preview.load_reviewed_chest_patches(config)

    def test_explicit_ink_uses_full_frame_rounding_and_only_exact_reviewed_frames(self):
        polygon = [[44.5,35],[49,35],[49,49],[44.5,49]]
        config = {'chest_cleanup_keyframes':[{'frame':4,'polygons':[polygon]}]}
        self.assertEqual(preview.manual_cleanup_polygons(config,3),[])
        self.assertEqual(preview.manual_cleanup_polygons(config,4),[polygon])
        self.assertEqual(preview.manual_cleanup_polygons(config,5),[])
        frame = np.full((100,100,4),255,np.uint8)
        quad = [[35,35],[65,35],[65,65],[35,65]]
        def capture(roi,q,asset,**kwargs):
            return roi,kwargs
        with patch.object(preview.composite,'replace_chest',side_effect=capture):
            result=preview.local_patch(frame,quad,{},chest=True,cleanup_polygons=[polygon])
        # ROI starts at 17. Round in world space before subtracting that origin.
        self.assertEqual(result['extra_repair_mask'][35-17,44-17],255)
        self.assertEqual(result['extra_repair_mask'][35-17,43-17],0)
        with self.assertRaisesRegex(ValueError,'only applies to the chest'):
            preview.local_patch(frame,quad,{},cleanup_polygons=[polygon])
        config['chest_cleanup_keyframes'].append({'frame':4,'polygons':[]})
        with self.assertRaisesRegex(ValueError,'Duplicate'):
            preview.manual_cleanup_polygons(config,4)

    def test_half_pixel_foreground_is_protected_independent_of_roi_origin(self):
        original=np.full((100,100,4),255,np.uint8)
        frame=original.copy()
        quad=[[35,35],[65,35],[65,65],[35,65]]
        foreground=[[[44.5,0],[99,0],[99,99],[44.5,99]]]
        asset=np.full((10,10,4),[90,180,120,255],np.uint8)
        preview.local_patch(frame,quad,asset,occlusion_polygons=foreground)
        # The full-frame foreground starts at round-to-even(44.5) == 44.
        # ROI origin 17 must not move this protection to x=45.
        np.testing.assert_array_equal(frame[:,44:],original[:,44:])
        self.assertTrue(np.any(frame[35:65,35:44,:3]!=original[35:65,35:44,:3]))

    def test_local_backend_exclusions_are_validated_before_writing_output(self):
        for excluded in [[-1],[10],[True],[2,2],{'2':True}]:
            with self.subTest(excluded=excluded), tempfile.TemporaryDirectory() as location:
                output=Path(location)/'should-not-exist'
                config={'source':'actions/production/example.webm','frames':10,
                    'chest':{},'chest_repair':{},'chest_local_inpaint':{'exclude_frames':excluded}}
                with patch.object(preview,'sha',return_value='actual-digest'):
                    with self.assertRaisesRegex(ValueError,'exclusions'):
                        preview.run(config,output)
                self.assertFalse(output.exists())

    def test_pose_softness_overrides_are_independent_for_chest_and_hair(self):
        config={'chest_composite':{'repair_method':'telea'},
                'hair_composite_overrides':[{'start':17,'end':17,'options':{'overlay_blur_sigma':.6}}]}
        self.assertEqual(preview.composite_options(config,17),{'repair_method':'telea'})
        self.assertEqual(preview.composite_options(config,17,'hair'),{'overlay_blur_sigma':.6})
        self.assertEqual(preview.composite_options(config,18,'hair'),{})

    def test_local_inpainting_uses_foreground_union_for_cleanup_and_overlay(self):
        original = np.full((100, 100, 4), [240, 230, 220, 255], np.uint8)
        original[0:5, :, 3] = 0
        frame = original.copy()
        quad = [[35,35],[65,35],[65,65],[35,65]]
        asset = np.full((10,10,4), [90,180,120,255], np.uint8)
        polygons = [[[35,35],[50,35],[50,65],[35,65]],
                    [[45,35],[55,35],[55,65],[45,65]]]
        class FakeInpainter:
            def inpaint(self, value, domain, occlusion=None):
                self.mask = occlusion.copy()
                result = value.copy()
                result[40:60,40:60,:3] = 250
                result[occlusion > 0] = value[occlusion > 0]
                return result, {'skipped':None, 'repair_method':'local-lama'}
        worker = FakeInpainter()
        stats = preview.local_inpaint_patch(frame, quad, asset, worker, quad,
                                            occlusion_polygons=polygons)
        self.assertEqual(worker.mask[45,47], 255)  # Overlap remains foreground.
        np.testing.assert_array_equal(frame[worker.mask>0], original[worker.mask>0])
        np.testing.assert_array_equal(frame[:,:,3], original[:,:,3])
        self.assertGreater(stats['overlay_pixels'], 0)

    def test_rejected_local_cleanup_does_not_cover_unrepaired_logo(self):
        original = np.full((100,100,4), 255, np.uint8)
        frame = original.copy()
        class RejectedInpainter:
            def inpaint(self, value, domain, occlusion=None):
                return value.copy(), {'skipped':'hidden-quad'}
        quad = [[35,35],[65,35],[65,65],[35,65]]
        stats = preview.local_inpaint_patch(frame, quad, {}, RejectedInpainter(), quad)
        np.testing.assert_array_equal(frame, original)
        self.assertEqual(stats['overlay_pixels'], 0)
        with self.assertRaisesRegex(ValueError, 'only opacity'):
            preview.local_inpaint_patch(frame, quad, {}, RejectedInpainter(), quad,
                                        options={'repair_palette':'adaptive-gold'})

    def test_reviewed_profile_overrides_apply_only_to_their_pose_frames(self):
        config={'chest_composite':{'foreground_profile':'dark-cape','repair_method':'cloth-guided'},
            'chest_composite_overrides':[{'start':25,'end':26,'options':{'foreground_profile':None,'repair_method':'telea'}}]}
        self.assertEqual(preview.composite_options(config,24)['foreground_profile'],'dark-cape')
        self.assertIsNone(preview.composite_options(config,25)['foreground_profile'])
        self.assertEqual(preview.composite_options(config,26)['repair_method'],'telea')
        self.assertEqual(preview.composite_options(config,27)['repair_method'],'cloth-guided')
        self.assertEqual(config['chest_composite']['repair_method'],'cloth-guided')

    def test_opt_in_cape_guard_protects_connected_cape_but_keeps_isolated_old_ink(self):
        frame=np.full((100,100,4),255,np.uint8)
        frame[10:45,15:40,:3]=65
        frame[49:56,49:56,:3]=80
        mask=preview.dark_cape_guard(frame,[[35,35],[65,35],[65,65],[35,65]])
        self.assertEqual(mask[37,37],255)
        self.assertEqual(mask[52,52],0)

    def test_cape_guard_does_not_reclassify_warm_ivory_as_foreground(self):
        frame=np.full((100,100,4),[240,213,195,255],np.uint8)
        self.assertFalse(preview.dark_cape_guard(frame,[[35,35],[65,35],[65,65],[35,65]]).any())

    def test_explicit_cuff_matte_breaks_a_false_connection_to_old_ink(self):
        frame=np.full((100,100,4),255,np.uint8)
        frame[49:56,10:56,:3]=75
        domain=[[35,35],[65,35],[65,65],[35,65]]
        self.assertEqual(preview.dark_cape_guard(frame,domain)[52,52],255)
        cuff=np.zeros((100,100),np.uint8);cuff[45:60,33:46]=255
        self.assertEqual(preview.dark_cape_guard(frame,domain,occlusion=cuff)[52,52],0)

    def test_repair_domain_follows_real_parent_motion_between_manual_keys(self):
        tracker = preview.AnchoredTrack({'mode':'relative', 'relative_to':'chest',
            'keyframes':[{'frame':0,'box':[0,0,100,100]}, {'frame':10,'box':[0,0,100,100]}]})
        # Parent motion is deliberately nonlinear; screen-space keyframe
        # interpolation would leave the cleanup behind the actual shirt.
        parent = {'visible':True, 'confidence':.9,
                  'quad':[[110,20],[150,20],[150,70],[110,70]]}
        result = tracker.update(None, 5, parent=parent)
        np.testing.assert_allclose(result['quad'], parent['quad'])
        self.assertEqual(result['confidence'], .9)

    def test_relative_domain_fails_closed_when_parent_is_hidden(self):
        tracker = preview.AnchoredTrack({'mode':'relative','keyframes':[{'frame':0,'box':[0,0,100,100]}]})
        self.assertFalse(tracker.update(None, 0, parent={'visible':False})['visible'])

    def test_foreground_guard_uses_the_same_live_garment_plane(self):
        config={'chest_occlusion_space':'chest', 'chest_occlusion_keyframes':[
            {'frame':0,'polygons':[[[0,0],[50,0],[50,100]]]},
            {'frame':10,'polygons':[[[0,0],[50,0],[50,100]]]}]}
        parent=[[110,20],[150,20],[150,70],[110,70]]
        actual=preview.manual_polygons(config,5,parent_quad=parent)
        np.testing.assert_allclose(actual,[[[110,20],[130,20],[130,70]]])
        with self.assertRaisesRegex(ValueError,'parent plane'):
            preview.manual_polygons(config,5)

    def test_manual_foreground_interpolates_only_with_matching_topology(self):
        config = {'chest_occlusion_keyframes': [
            {'frame': 0, 'polygons': [[[0, 0], [10, 0], [10, 10]]]},
            {'frame': 10, 'polygons': [[[4, 2], [14, 2], [14, 12]]]},
            {'frame': 20, 'polygons': []},
        ]}
        np.testing.assert_allclose(preview.manual_polygons(config, 5),
                                   [[[2, 1], [12, 1], [12, 11]]])
        self.assertEqual(preview.manual_polygons(config, -1), [])
        self.assertEqual(preview.manual_polygons(config, 15), [])
        self.assertEqual(preview.manual_polygons(config, 20), [])
        self.assertEqual(preview.manual_polygons(config, 21), [])

    def test_no_skin_color_mask_is_inferred_from_ivory_cloth(self):
        # The old generic skin classifier protected warm ivory/gold pixels,
        # leaving old-logo arcs and holes through the new badge.
        frame = np.full((100, 100, 4), [240, 213, 195, 255], dtype=np.uint8)
        quad = [[35, 35], [60, 35], [60, 60], [35, 60]]
        with patch.object(preview.composite, 'replace_chest', side_effect=lambda roi, q, a, **kw: (roi, kw)):
            stats = preview.local_patch(frame, quad, {}, chest=True)
        self.assertIsNone(stats['occlusion'])

    def test_only_explicit_spatial_mask_is_forwarded(self):
        frame = np.full((100, 100, 4), 255, dtype=np.uint8)
        quad = [[35, 35], [60, 35], [60, 60], [35, 60]]
        polygon = [[35, 35], [45, 35], [45, 45], [35, 45]]
        with patch.object(preview.composite, 'replace_chest', side_effect=lambda roi, q, a, **kw: (roi, kw)):
            stats = preview.local_patch(frame, quad, {}, chest=True, occlusion_polygons=[polygon])
        self.assertEqual(stats['occlusion'].dtype, np.uint8)
        self.assertGreater(np.count_nonzero(stats['occlusion']), 0)
        self.assertGreater(np.count_nonzero(stats['occlusion'] == 0), 0)

    def test_fists_can_occlude_pendant_without_reusing_chest_mask(self):
        frame = np.full((100, 100, 4), 255, dtype=np.uint8)
        quad = [[35, 35], [60, 35], [60, 60], [35, 60]]
        polygon = [[35, 35], [45, 35], [45, 45], [35, 45]]
        config = {'hair_occlusions': [{'start': 0, 'end': 10, 'polygons': [polygon]}]}
        self.assertEqual(preview.manual_polygons(config, 5), [])
        mask = preview.manual_polygons(config, 5, 'hair')
        with patch.object(preview.composite, 'apply_hair', side_effect=lambda roi, q, a, **kw: (roi, kw)):
            stats = preview.local_patch(frame, quad, {}, occlusion_polygons=mask)
        self.assertGreater(np.count_nonzero(stats['occlusion']), 0)

    def test_repair_and_badge_domains_share_the_same_local_origin(self):
        frame = np.full((120, 120, 4), 255, dtype=np.uint8)
        quad = np.asarray([[50, 50], [65, 50], [65, 65], [50, 65]])
        repair = quad + [-14, -20]
        with patch.object(preview.composite, 'replace_chest', side_effect=lambda roi, q, a, **kw: (roi, {'q':q, **kw})):
            stats = preview.local_patch(frame, quad, {}, chest=True, repair_quad=repair)
        np.testing.assert_allclose(stats['q']-stats['repair_quad'], np.tile([14,20], (4,1)))
        self.assertGreaterEqual(np.min(stats['repair_quad']), 0)

    def test_config_digest_tracks_content_not_dictionary_order(self):
        self.assertEqual(preview.config_sha({'a': 1, 'b': 2}), preview.config_sha({'b': 2, 'a': 1}))
        self.assertNotEqual(preview.config_sha({'a': 1}), preview.config_sha({'a': 2}))

    def test_preview_refuses_nonproduction_inputs_before_creating_files(self):
        with tempfile.TemporaryDirectory() as location:
            output = Path(location) / 'should-not-exist'
            with self.assertRaisesRegex(ValueError, 'production WebM'):
                preview.run({'source': 'assets/character/qiqi-chibi-v5-knot-sprout.png'}, output)
            self.assertFalse(output.exists())

    def test_anchor_source_digest_must_match_before_output_is_created(self):
        with tempfile.TemporaryDirectory() as location:
            output = Path(location) / 'should-not-exist'
            with patch.object(preview, 'sha', return_value='actual-digest'):
                with self.assertRaisesRegex(ValueError, 'differs from the reviewed'):
                    preview.run({'source': 'actions/production/example.webm', 'sourceSha256':'reviewed-digest'}, output)
            self.assertFalse(output.exists())


if __name__ == '__main__':
    unittest.main()
