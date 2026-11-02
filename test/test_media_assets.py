import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

SPEC = importlib.util.spec_from_file_location('media_assets', Path(__file__).resolve().parent.parent / 'scripts/media-assets.py')
media = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(media)


class MediaAssetsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.files = {'actions/production/motion/source/clip.mp4': b'original',
                      'actions/production/motion/processed/clip.webm': b'new character'}
        self.manifest = {'schemaVersion': 1, 'version': 'test', 'files': [
            {'path': name, 'bytes': len(value), 'sha256': hashlib.sha256(value).hexdigest()}
            for name, value in self.files.items()]}
        self.write_manifest()

    def write_manifest(self):
        (self.root / 'media-assets.json').write_text(json.dumps(self.manifest), encoding='utf-8')

    def archive(self, files=None, extra=None):
        archive = self.root / 'assets.zip'
        with zipfile.ZipFile(archive, 'w') as bundle:
            bundle.write(self.root / 'media-assets.json', 'media-assets.json')
            for name, value in (files or self.files).items():
                bundle.writestr(name, value)
            for name, value in (extra or {}).items():
                bundle.writestr(name, value)
        return archive

    def test_restore_and_repeat_preserve_matching_files(self):
        archive = self.archive()
        self.assertEqual(media.restore(self.root, archive)['restored'], 2)
        before = {name: (self.root / name).stat().st_mtime_ns for name in self.files}
        result = media.restore(self.root, archive)
        self.assertEqual(result['restored'], 0)
        self.assertEqual(result['verified'], 2)
        self.assertEqual(before, {name: (self.root / name).stat().st_mtime_ns for name in self.files})

    def test_conflict_stops_before_any_writes(self):
        existing = self.root / list(self.files)[-1]
        existing.parent.mkdir(parents=True)
        existing.write_bytes(b'my custom animation')
        with self.assertRaisesRegex(ValueError, 'Existing file differs'):
            media.restore(self.root, self.archive())
        self.assertEqual(existing.read_bytes(), b'my custom animation')
        self.assertFalse((self.root / list(self.files)[0]).exists())

    def test_corruption_stops_before_any_writes(self):
        values = dict(self.files)
        values[list(values)[-1]] = b'bad character'
        with self.assertRaisesRegex(ValueError, 'checksum mismatch'):
            media.restore(self.root, self.archive(values))
        self.assertFalse((self.root / 'actions').exists())

    def test_extra_traversal_member_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'unexpected'):
            media.restore(self.root, self.archive(extra={'../outside': b'x'}))
        self.assertFalse((self.root / 'actions').exists())

    def test_unsafe_and_case_colliding_manifests_are_rejected(self):
        for name in ['actions/production/../../../outside', 'actions/production/a/../b',
                     'actions/production//file', 'actions/production/C:/file', 'actions/production/a\\b']:
            with self.subTest(name=name):
                self.manifest['files'][0]['path'] = name
                self.write_manifest()
                with self.assertRaisesRegex(ValueError, 'Unsafe'):
                    media.load_manifest(self.root)
        self.manifest['files'][0]['path'] = self.manifest['files'][1]['path'].upper().replace('ACTIONS/PRODUCTION/', 'actions/production/')
        self.write_manifest()
        with self.assertRaisesRegex(ValueError, 'Unsafe'):
            media.load_manifest(self.root)

    def test_changed_file_fails_verification(self):
        media.restore(self.root, self.archive())
        (self.root / list(self.files)[0]).write_bytes(b'modified')
        with self.assertRaisesRegex(ValueError, '1 changed'):
            media.check(self.root)


if __name__ == '__main__':
    unittest.main()
