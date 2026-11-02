"""Separate current runtime assets from local-only production material.

Run once with `python scripts/organize-assets.py`, then use `--check` to
verify the archived bytes and the production allowlist. Never deletes media.
"""
import argparse
import importlib.util
import json
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PRIVATE = 'local-assets'


def release_tools():
    spec = importlib.util.spec_from_file_location('prepare_github', ROOT / 'scripts/prepare-github.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def write_json(file, value):
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def category(file):
    parts = file.parts
    if 'prompt' in file.name.lower() or 'prompts' in parts:
        return 'prompts'
    if 'source' in parts:
        return 'sources'
    if file.suffix in {'.webm', '.mp4', '.mov', '.mkv'}:
        return 'history'
    if 'processed' in parts:
        return 'reviews'
    if 'reference' in parts or 'shared' in parts:
        return 'references'
    return 'notes'


def check(root=ROOT):
    tools = release_tools()
    manifest = json.loads((root / PRIVATE / 'relocations.json').read_text(encoding='utf-8'))
    for item in manifest['files']:
        file = (root / item['path']).resolve()
        if not file.is_relative_to((root / PRIVATE).resolve()):
            raise ValueError('Archive escaped local-assets')
        if file.stat().st_size != item['bytes'] or tools.sha(file) != item['sha256']:
            raise ValueError('Archived file changed: ' + item['path'])
    expected = {file.relative_to(ROOT).as_posix() for file in tools.current_media()}
    expected.add('actions/production/14-garden/runtime.json')
    actual = {file.relative_to(root).as_posix() for file in (root / 'actions/production').rglob('*') if file.is_file()}
    if actual != expected:
        raise ValueError('Production folder differs from current media allowlist: ' + str(sorted(actual ^ expected)))
    return {'archivedFilesVerified': len(manifest['files']), 'productionFiles': len(expected) - 1,
            'productionContainsOnlyCurrentMedia': True}


def organize():
    tools = release_tools()
    private = ROOT / PRIVATE
    if private.exists():
        raise ValueError('local-assets already exists; use --check rather than migrating twice')
    keep = {file.relative_to(ROOT).as_posix() for file in tools.current_media()}
    keep.add('actions/production/14-garden/runtime.json')
    moves = []
    for file in sorted((ROOT / 'actions/production').rglob('*')):
        if file.is_file() and file.relative_to(ROOT).as_posix() not in keep:
            relative = file.relative_to(ROOT / 'actions/production')
            moves.append((file, private / category(relative) / relative))
    # Prompt templates, animation instructions and branding drafts are also local.
    for folder in ['docs/animation', 'docs/branding']:
        for file in sorted((ROOT / folder).rglob('*')):
            if file.is_file() and file.relative_to(ROOT).as_posix() not in {
                    'docs/branding/README.md', 'docs/branding/release-summary.json'}:
                moves.append((file, private / 'workshop' / file.relative_to(ROOT)))
    # Complete path and content checks before moving anything.
    records = []
    for source, target in moves:
        if (not source.resolve().is_relative_to(ROOT.resolve()) or source.is_symlink()
                or not target.resolve().is_relative_to(private.resolve()) or target.exists()):
            raise ValueError('Unsafe migration path')
        records.append({'original': source.relative_to(ROOT).as_posix(),
                        'path': target.relative_to(ROOT).as_posix(),
                        'bytes': source.stat().st_size, 'sha256': tools.sha(source)})
    mapping = {item['original']: item['path'] for item in records}
    def rebase(value):
        if isinstance(value, str):
            return mapping.get(value, value)
        if isinstance(value, list):
            return [rebase(item) for item in value]
        if isinstance(value, dict):
            return {key: rebase(item) for key, item in value.items()}
        return value
    private.mkdir()
    # Preserve originals, including the Git index, before removing private entries.
    index = ROOT / '.git/index'
    if index.is_file():
        shutil.copy2(index, private / 'git-index-before-organization')
    for name in ['catalog.json', 'branding-installation.json', 'README.md', 'ASSET-LAYOUT.md']:
        source = ROOT / 'actions' / name
        if not source.is_file():
            continue
        target = private / 'metadata/original' / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
    catalog = json.loads((ROOT / 'actions/catalog.json').read_text(encoding='utf-8'))
    branding = json.loads((ROOT / 'actions/branding-installation.json').read_text(encoding='utf-8'))
    for source, target in moves:
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(source), str(target))
    write_json(private / 'relocations.json', {'schemaVersion': 1, 'files': records})
    write_json(private / 'metadata/catalog.json', rebase(catalog))
    write_json(private / 'metadata/branding-installation.json', rebase(branding))
    # The public index contains runtime information only, without provenance paths.
    catalog['assets'] = [{key: value for key, value in item.items()
                          if key not in {'source', 'sourceSha256', 'metadata', 'qa'}}
                         for item in catalog['assets'] if item['media'] in keep]
    catalog['convention'] = 'production/ contains current runtime media only; production material is kept locally in ignored local-assets/.'
    catalog.pop('plannedPacks', None)
    catalog['distributionScope'] = 'current-installed-only'
    write_json(ROOT / 'actions/catalog.json', catalog)
    branding = {key: branding[key] for key in ['schemaVersion', 'release', 'date', 'status', 'scope', 'reference', 'actionOverrides', 'clips']}
    branding['clips'] = [{key: value for key, value in clip.items()
                          if key in {'id', 'media', 'mediaSha256', 'frames', 'fps', 'width', 'height'}}
                         for clip in branding['clips']]
    write_json(ROOT / 'actions/branding-installation.json', branding)
    finish()


def finish():
    """Finish index/manifest updates after an interrupted, recorded migration."""
    tools = release_tools()
    records = json.loads((ROOT / PRIVATE / 'relocations.json').read_text(encoding='utf-8'))['files']
    # Verify the completed moves before changing the Git index.
    check()
    media = tools.current_media()
    write_json(ROOT / 'media-assets.json', {'schemaVersion': 1, 'version': json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version'],
               'scope': 'current-installed-only', 'files': [
                   {'path': file.relative_to(ROOT).as_posix(), 'bytes': file.stat().st_size, 'sha256': tools.sha(file)} for file in media]})
    # Remove only migrated paths from the existing index. Working copies are kept.
    paths = '\0'.join(item['original'] for item in records) + '\0'
    subprocess.run(['git', 'update-index', '--force-remove', '-z', '--stdin'], cwd=ROOT,
                   input=paths, text=True, check=True)
    # Remove empty directories after checking each resolved path stays in scope.
    for folder in ['actions/production', 'docs/animation', 'docs/branding']:
        base = (ROOT / folder).resolve()
        for directory in sorted(base.rglob('*'), key=lambda p: len(p.parts), reverse=True):
            if directory.is_dir() and directory.resolve().is_relative_to(base) and not any(directory.iterdir()):
                directory.rmdir()
    print(json.dumps(check(), ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--resume', action='store_true', help='Finish manifest/index updates after recorded moves')
    args = parser.parse_args()
    if args.resume:
        finish()
    elif args.check:
        print(json.dumps(check(), ensure_ascii=False))
    else:
        organize()
