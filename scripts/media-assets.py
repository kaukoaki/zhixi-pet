"""Verify or restore the separate production assets, using only Python's stdlib."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import stat
import zipfile

ROOT = Path(__file__).resolve().parent.parent


def digest(stream):
    h = hashlib.sha256()
    for block in iter(lambda: stream.read(1024 * 1024), b''):
        h.update(block)
    return h.hexdigest()


def load_manifest(root):
    raw = (root / 'media-assets.json').read_bytes()
    manifest = json.loads(raw)
    if manifest.get('schemaVersion') != 1 or not isinstance(manifest.get('files'), list) or not manifest['files']:
        raise ValueError('Invalid media manifest')
    seen = set()
    for item in manifest['files']:
        name = item.get('path', '')
        parts = PurePosixPath(name).parts
        if (not name.startswith('actions/production/') or '\\' in name or ':' in name
                or any(ord(c) < 32 for c in name) or name != '/'.join(parts)
                or any(p in ('', '.', '..') for p in parts)
                or name.casefold() in seen or not re.fullmatch('[a-f0-9]{64}', item.get('sha256', ''))
                or type(item.get('bytes')) is not int or item['bytes'] < 0):
            raise ValueError('Unsafe or invalid media entry')
        seen.add(name.casefold())
    return raw, manifest


def destination(root, name):
    root = root.resolve()
    target = root.joinpath(*PurePosixPath(name).parts)
    for part in [target, *target.parents]:
        if part == root:
            break
        # Reject symlinks AND Windows junctions, including intermediate parents.
        if part.is_symlink() or (part.exists() and getattr(part.lstat(), 'st_file_attributes', 0) & 0x400):
            raise ValueError('Linked media path: ' + name)
    if not target.resolve().is_relative_to(root):
        raise ValueError('Media path escaped repository')
    return target


def check(root):
    _, manifest = load_manifest(root)
    missing, changed = [], []
    for item in manifest['files']:
        target = destination(root, item['path'])
        if not target.exists():
            missing.append(item['path'])
        elif not target.is_file() or target.stat().st_size != item['bytes']:
            changed.append(item['path'])
        else:
            with target.open('rb') as stream:
                if digest(stream) != item['sha256']:
                    changed.append(item['path'])
    if missing or changed:
        raise ValueError(f'Media verification failed: {len(missing)} missing, {len(changed)} changed. Restore the matching asset ZIP first.')
    return {'verified': len(manifest['files']), 'version': manifest['version']}


def restore(root, archive):
    raw, manifest = load_manifest(root)
    expected = {entry['path']: entry for entry in manifest['files']}
    with zipfile.ZipFile(archive) as bundle:
        names = bundle.namelist()
        if len(names) != len(set(n.casefold() for n in names)) or set(names) != set(expected) | {'media-assets.json'}:
            raise ValueError('Asset ZIP has unexpected, missing or duplicate entries')
        if bundle.read('media-assets.json') != raw:
            raise ValueError('Asset ZIP does not match this source version')
        missing = []
        # Complete the checksum/conflict preflight before writing any file.
        for name, item in expected.items():
            info = bundle.getinfo(name)
            if info.file_size != item['bytes'] or stat.S_ISLNK(info.external_attr >> 16):
                raise ValueError('Invalid ZIP entry: ' + name)
            with bundle.open(name) as stream:
                if digest(stream) != item['sha256']:
                    raise ValueError('Asset checksum mismatch: ' + name)
            target = destination(root, name)
            if target.exists():
                if not target.is_file() or target.stat().st_size != item['bytes']:
                    raise ValueError('Existing file differs; preserve it before restoring: ' + name)
                with target.open('rb') as stream:
                    if digest(stream) != item['sha256']:
                        raise ValueError('Existing file differs; preserve it before restoring: ' + name)
            else:
                missing.append(name)
        for name in missing:
            target = destination(root, name)
            target.parent.mkdir(parents=True, exist_ok=True)
            # Exclusive creation also protects a file added since preflight.
            with bundle.open(name) as source, target.open('xb') as output:
                for block in iter(lambda: source.read(1024 * 1024), b''):
                    output.write(block)
    return {'restored': len(missing), 'alreadyPresent': len(expected) - len(missing), **check(root)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['check', 'restore'])
    parser.add_argument('archive', nargs='?', type=Path)
    args = parser.parse_args()
    try:
        if args.command == 'restore' and not args.archive:
            parser.error('restore requires the path to the matching assets ZIP')
        print(json.dumps(restore(ROOT, args.archive) if args.command == 'restore' else check(ROOT)))
    except (ValueError, OSError, zipfile.BadZipFile) as error:
        parser.exit(1, str(error) + '\n')
