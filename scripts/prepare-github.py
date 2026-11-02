"""Prepare a separate lean Git repository and release ZIPs; never stage the working repository."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parent.parent
BINARY = {'.webm', '.mp4', '.png', '.jpg', '.jpeg', '.wav', '.zip'}
TEXT = {'.md', '.txt', '.json', '.cjs', '.js', '.py', '.ps1', '.cmd', '.html', '.css', '.toml', '.yml', '.yaml'}


def sha(file):
    h = hashlib.sha256()
    with file.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def run(args, cwd):
    result = subprocess.run(args, cwd=cwd, capture_output=True, encoding='utf-8')
    if result.returncode:
        raise RuntimeError(result.stdout + result.stderr)
    return result.stdout.strip()


def safe_files(folder):
    for file in sorted(folder.rglob('*')):
        if file.is_symlink() or (getattr(file.lstat(), 'st_file_attributes', 0) & 0x400):
            raise ValueError('Linked source path: ' + file.relative_to(ROOT).as_posix())
        if file.is_file() and '__pycache__' not in file.parts and file.suffix not in {'.pyc', '.log'}:
            yield file


def public_source():
    top = ['.gitignore', '.gitattributes', 'package.json', 'package-lock.json', 'README.md', 'README.en.md',
           'CONTRIBUTING.md', 'SECURITY.md', 'LICENSE', 'LICENSE-ASSETS.md', 'NOTICE.md',
           'THIRD_PARTY_NOTICES.md', 'requirements-video.txt', 'install.cmd', 'INSTALL-WINDOWS.md',
           '\u542f\u52a8\u77e5\u6816.cmd']
    files = [ROOT / file for file in top]
    for folder in ['.agents', 'codex-plugin', 'main', 'renderer', 'assets', 'scripts', 'test', 'docs/animation']:
        files.extend(file for file in safe_files(ROOT / folder) if file.name != 'clear-reviewed-cache.ps1')
    files.extend(file for file in (ROOT / 'docs').glob('*.md') if file.name != 'CLEANUP.md')
    files.extend(ROOT / file for file in ['docs/images/character-reference.png', 'docs/branding/README.md', 'docs/branding/release-summary.json'])
    files.extend(file for file in safe_files(ROOT / 'actions')
                 if file.suffix in {'.md', '.txt', '.json'} and not file.name.endswith('.qa.json'))
    return sorted(set(files))


def scan_text(files):
    patterns = [re.compile(pattern) for pattern in [
        r'\bsk-[A-Za-z0-9_-]{30,}\b', r'\bgh[pousr]_[A-Za-z0-9]{30,}\b',
        r'\bgithub_pat_[A-Za-z0-9_]{30,}\b', r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
        r'[A-Za-z]:[\\/](?:Users|Project|video)[\\/]']]
    for file in files:
        if file.suffix in TEXT:
            text = file.read_text(encoding='utf-8-sig')
            if any(pattern.search(text) for pattern in patterns):
                raise ValueError('Review private content in: ' + file.relative_to(ROOT).as_posix())


def current_media():
    """An allowlist, never a recursive video-folder export."""
    branding = json.loads((ROOT / 'actions/branding-installation.json').read_text(encoding='utf-8'))
    garden = json.loads((ROOT / 'actions/production/14-garden/runtime.json').read_text(encoding='utf-8'))
    expected = {clip['media']: clip['mediaSha256'] for clip in branding['clips']}
    for clip in garden['clips']:
        if expected.get(clip['media']) != clip['mediaSha256']:
            raise ValueError('Garden clip differs from reviewed installation')
        expected[clip['poster']] = clip['posterSha256']
    for relative, digest in expected.items():
        file = (ROOT / relative).resolve()
        if (not file.is_relative_to(ROOT) or '/source/' in relative or '/processed/' not in relative
                or file.suffix not in {'.webm', '.png'} or sha(file) != digest):
            raise ValueError('Invalid current media: ' + relative)
    return sorted(ROOT / name for name in expected)


def public_document_links(repository, media_paths):
    """Keep historical provenance text without publishing dead local links."""
    pattern = re.compile(r'!?\[([^\]]*)\]\(([^)]+)\)')
    for file in repository.rglob('*.md'):
        text = file.read_text(encoding='utf-8-sig')
        def replace(match):
            target = match[2].strip('<>').split('#')[0]
            if not target or re.match(r'^(?:https?:|mailto:)', target):
                return match[0]
            destination = (file.parent / target).resolve()
            if not destination.is_relative_to(repository.resolve()):
                raise ValueError('Document link escaped export')
            relative = destination.relative_to(repository.resolve()).as_posix()
            if destination.exists() or relative in media_paths:
                return match[0]
            if not relative.startswith('actions/production/'):
                raise ValueError('Missing public documentation target: ' + relative)
            return match[1] + '（仅本地制作归档：`' + target + '`）'
        updated = pattern.sub(replace, text)
        if updated != text:
            file.write_text(updated, encoding='utf-8')


def public_catalog(repository, media_paths):
    file = repository / 'actions/catalog.json'
    catalog = json.loads(file.read_text(encoding='utf-8'))
    catalog['assets'] = [entry for entry in catalog['assets'] if entry['media'] in media_paths]
    catalog['distributionScope'] = 'current-installed-only; original and historical video files remain local'
    file.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def make_zip(target, entries, extra=None):
    with zipfile.ZipFile(target, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for file, name in entries:
            archive.write(file, name, compress_type=zipfile.ZIP_STORED if file.suffix in BINARY else zipfile.ZIP_DEFLATED)
        for name, content in (extra or {}).items():
            archive.writestr(name, content)
    # Read every member to check its CRC, including streamed large files.
    with zipfile.ZipFile(target) as archive:
        bad = archive.testzip()
        if bad:
            raise ValueError('ZIP integrity failed: ' + bad)
    digest = sha(target)
    target.with_suffix(target.suffix + '.sha256').write_text(f'{digest}  {target.name}\n', encoding='utf-8')
    return {'file': target.name, 'bytes': target.stat().st_size, 'sha256': digest}


def prepare(output):
    version = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
    output = output.absolute()
    releases = ROOT / 'releases'
    if not output.is_relative_to(releases) or output == releases or output.exists() or output.resolve() != output:
        raise ValueError('Choose a fresh directory inside releases')
    runtime = ROOT / 'dist/QiqiCodexPet-win32-x64'
    if not (runtime / 'QiqiCodexPet.exe').is_file():
        raise ValueError('Run npm run package first')
    # Snapshot the existing Git index checksum without changing that index.
    index = ROOT / '.git/index'
    original_index_sha = sha(index) if index.exists() else None
    source = public_source()
    media = current_media()
    print(f'Preflight: {len(source)} source files; {len(media)} production assets', flush=True)
    scan_text(sorted(set(source + media)))
    asset_name = f'Zhixi-{version}-current-media.zip'
    manifest = {'schemaVersion': 1, 'version': version, 'archive': asset_name, 'scope': 'current-installed-only',
                'layout': 'Extract inside the source repository root; paths begin with actions/production/.',
                'files': [{'path': file.relative_to(ROOT).as_posix(), 'bytes': file.stat().st_size, 'sha256': sha(file)} for file in media]}
    manifest_raw = (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    output.mkdir(parents=True)
    repository = output / 'repository'
    repository.mkdir()
    for file in source:
        destination = repository / file.relative_to(ROOT)
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(file, destination)
    (repository / 'media-assets.json').write_bytes(manifest_raw)
    public_catalog(repository, {item['path'] for item in manifest['files']})
    public_document_links(repository, {item['path'] for item in manifest['files']})
    with (repository / '.gitignore').open('a', encoding='utf-8') as stream:
        stream.write('\n# Production binaries and large QA snapshots ship in the assets ZIP.\n'
                     '/actions/production/**\n!/actions/production/**/\n'
                     '!/actions/production/**/*.md\n!/actions/production/**/*.txt\n'
                     '!/actions/production/**/*.json\n/actions/production/**/*.qa.json\n'
                     '*.mp4\n*.webm\n*.mov\n*.mkv\n*.avi\n*.m4v\n')
    run(['git', 'init', '--quiet', '-b', 'main'], repository)
    run(['git', '-c', 'core.autocrlf=false', 'add', '.'], repository)
    audit = json.loads(run(['node', 'scripts/audit-release.cjs'], repository))
    print('Source audit passed: ' + json.dumps(audit), flush=True)
    # git archive and the audit share the fresh export index, never the old one.
    tree = run(['git', 'write-tree'], repository)
    source_zip = output / f'Zhixi-{version}-source.zip'
    run(['git', 'archive', '--format=zip', '--prefix=Zhixi-source/', '-o', str(source_zip), tree], repository)
    with zipfile.ZipFile(source_zip) as archive:
        if archive.testzip():
            raise ValueError('Source ZIP integrity failed')
        names = set(archive.namelist())
        for item in manifest['files']:
            name = 'Zhixi-source/' + item['path']
            if name in names and hashlib.sha256(archive.read(name)).hexdigest() != item['sha256']:
                raise ValueError('Git altered production text bytes: ' + item['path'])
    digest = sha(source_zip)
    source_zip.with_suffix('.zip.sha256').write_text(f'{digest}  {source_zip.name}\n', encoding='utf-8')
    packages = [{'file': source_zip.name, 'bytes': source_zip.stat().st_size, 'sha256': digest}]
    print('Writing production assets ZIP...', flush=True)
    packages.append(make_zip(output / asset_name, [(file, file.relative_to(ROOT).as_posix()) for file in media], {'media-assets.json': manifest_raw}))
    print('Writing Windows installation ZIP...', flush=True)
    prefix = f'Zhixi-{version}-win32-x64/'
    entries = [(file, prefix + 'app/' + file.relative_to(runtime).as_posix()) for file in safe_files(runtime)]
    for folder in ['codex-plugin', '.agents']:
        entries.extend((file, prefix + file.relative_to(ROOT).as_posix()) for file in safe_files(ROOT / folder))
    notices = ['install.cmd', 'INSTALL-WINDOWS.md', 'scripts/install-desktop.ps1', 'scripts/install-codex-plugin.ps1',
               'LICENSE', 'LICENSE-ASSETS.md', 'NOTICE.md', 'THIRD_PARTY_NOTICES.md', 'docs/RIGHTS.md']
    entries.extend((ROOT / name, prefix + name) for name in notices)
    readme = ('知栖 Zhixi ' + version + ' / Windows x64\r\n\r\n'
              '解压后双击 install.cmd，安装桌面程序与 Codex 本地插件。\r\n'
              '完整安装、插件验证和常见问题见同目录 INSTALL-WINDOWS.md。\r\n'
              '当前37段动作使用小芽抱星胸章与白结、双紫晶、流苏发饰。\r\n'
              '个人数据在 %APPDATA%\\QiqiCodexPet，安装升级保留设置和自选素材。\r\n'
              '仅运行桌宠无需源码包、素材制作包、Node.js 或 Python。\r\n'
              '代码 MIT；可授权原创素材 CC BY 4.0，第三方权利除外。\r\n'
              'AI 辅助素材；本项目非 OpenAI 官方产品。参见 docs/RIGHTS.md。\r\n')
    packages.append(make_zip(output / f'Zhixi-{version}-win32-x64.zip', entries, {prefix + 'README.txt': readme.encode('utf-8')}))
    if any(item['bytes'] >= 2 * 1024**3 for item in packages):
        raise ValueError('A release asset exceeds the 2 GiB limit')
    if original_index_sha != (sha(index) if index.exists() else None):
        raise ValueError('The original Git index changed during preparation; inspect before proceeding')
    result = {'version': version, 'sourceAudit': audit, 'indexTree': tree,
              'originalGitIndexUnchanged': True, 'productionFiles': len(media),
              'productionBytes': sum(item['bytes'] for item in manifest['files']), 'packages': packages}
    (output / 'package-report.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    prepare(ROOT / args.output)
