"""Candidate copies must retain media identity and never publish partial packs."""
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
from PIL import Image

SPEC=importlib.util.spec_from_file_location('delivery',Path(__file__).resolve().parents[1]/'scripts/prepare-branding-candidates.py')
delivery=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(delivery)


class DeliveryTest(unittest.TestCase):
    def fixture(self,root,**changes):
        (root/'.cache').mkdir()
        ref=root/'assets/character/qiqi-chibi-v5-knot-sprout.png'
        ref.parent.mkdir(parents=True)
        ref.write_bytes(b'reviewed artwork')
        for name in ['source.webm','output.webm']:
            (root/name).write_bytes(name.encode())
        report={'id':'garden-plant','source':'source.webm','output':'output.webm',
            'reference':ref.relative_to(root).as_posix(),'frames':2,'fps':24,'width':2,'height':2,
            'sourceAlphaPreservedBeforeEncoding':True,'encodedAlpha':{'verifiedFrames':2,'maxError':1}}
        for key in ('source','output','reference'):
            report[key+'Sha256']=delivery.preview.sha(root/report[key])
        report.update(changes)
        report_file=root/'report.json'
        report_file.write_text(json.dumps(report))
        manifest=root/'input.json'
        manifest.write_text(json.dumps({'reports':[{'path':'report.json','sha256':delivery.preview.sha(report_file)}]}))
        return manifest

    def run_prepare(self,root,manifest,metadata=None):
        first=np.full((2,2,4),[100,180,220,128],np.uint8)
        last=np.full((2,2,4),[130,190,230,201],np.uint8)
        metadata=metadata or {'source_size':(2,2),'size':(2,2),'fps':24,'duration':2/24}
        with patch.object(delivery,'ROOT',root),patch.object(delivery.preview,'relative',side_effect=lambda p:p.resolve().relative_to(root).as_posix()),patch.object(delivery,'probe_media',return_value=metadata),patch.object(delivery.preview,'frames',return_value=iter([first,last])):
            return delivery.prepare(manifest,root/'.cache/candidate')

    def test_exact_copied_media_and_rgba_end_poster(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory).resolve();m=self.fixture(root)
            result=self.run_prepare(root,m);clip=result['clips'][0]
            self.assertEqual(clip['mediaSha256'],delivery.preview.sha(root/'output.webm'))
            self.assertEqual(clip['runtimePoster'],clip['posters']['last'])
            image=Image.open(root/'.cache/candidate'/clip['runtimePoster']['path'])
            self.assertEqual(image.mode,'RGBA')
            self.assertEqual(image.getpixel((0,0)),(130,190,230,201))

    def test_missing_alpha_timing_and_dimensions_fail_before_writing(self):
        for changes in [{'sourceAlphaPreservedBeforeEncoding':False},{'fps':0},{'frames':2.0},{'width':True}]:
            with self.subTest(changes=changes),tempfile.TemporaryDirectory() as directory:
                root=Path(directory).resolve();m=self.fixture(root,**changes)
                with self.assertRaises(ValueError):self.run_prepare(root,m)
                self.assertFalse((root/'.cache/candidate').exists())

    def test_changed_media_cannot_publish_a_manifest(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory).resolve();m=self.fixture(root);copy=shutil.copy2
            def changed_copy(src,dst):
                result=copy(src,dst)
                if Path(dst).suffix=='.webm':Path(dst).write_bytes(b'different media')
                return result
            with patch.object(delivery.shutil,'copy2',side_effect=changed_copy):
                with self.assertRaisesRegex(ValueError,'during copying'):self.run_prepare(root,m)
            self.assertFalse((root/'.cache/candidate/manifest.json').exists())

    def test_empty_list_and_output_outside_cache_are_refused(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory).resolve();m=self.fixture(root);m.write_text('{"reports":[]}')
            with self.assertRaisesRegex(ValueError,'No candidate'):self.run_prepare(root,m)
            with patch.object(delivery,'ROOT',root):
                with self.assertRaisesRegex(ValueError,'inside project .cache'):delivery.prepare(m,root/'production')
            self.assertFalse((root/'production').exists())

    def test_same_area_but_different_video_geometry_cannot_be_reshaped_into_posters(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory).resolve();m=self.fixture(root,width=16,height=32)
            actual={'source_size':(32,16),'size':(32,16),'fps':24,'duration':2/24}
            with self.assertRaisesRegex(ValueError,'Actual candidate dimensions'):
                self.run_prepare(root,m,actual)
            self.assertFalse((root/'.cache/candidate').exists())


if __name__=='__main__':unittest.main()
