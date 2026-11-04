# Zhixi · Codex Desktop Companion

[简体中文](README.md) | **English**

<p align="center">
  <img src="assets/character/qiqi-chibi-v5-knot-sprout.png" width="280" alt="Zhixi desktop companion">
</p>

Zhixi is a Windows video desktop companion with Codex usage information, a task window, a focus timer, a journal, a small garden and decorations. A local Codex plugin lets you open it from chat.

**Version 0.1.18 · Windows 10/11 x64 · 37 built-in motion clips.**

## Install

1. Download **`Zhixi-0.1.18-win32-x64.zip`** from the [release page](https://github.com/kaukoaki/zhixi-pet/releases/tag/v0.1.18).
2. Extract the entire ZIP and run `install.cmd`.
3. Open **Zhixi** from the Start menu, or ask Codex to open the Zhixi desktop companion in a new chat.

The Windows package includes the videos, runtime and plugin. You do not need Node.js, Python or the separate media ZIP to use it. Codex integration requires a working local Codex CLI. For setup, updates and removal, see the [English installation guide](INSTALL-WINDOWS.en.md).

## Use

| Action | Result |
| --- | --- |
| Click the character | Show actual usage information for the local Codex account |
| Double-click | Open the task window |
| Drag | Move the companion |
| Right-click | Open the focus timer, journal, actions and settings |
| Open the journal | Write notes, collect cards, grow plants and choose decorations |

Tasks start when you explicitly run them and may use real Codex quota or modify the selected directory. Read the [user guide](docs/USER-GUIDE.md) and [privacy information](docs/PRIVACY.md).

## Downloads

| Archive | Purpose |
| --- | --- |
| `Zhixi-0.1.18-win32-x64.zip` | Install and use the companion |
| `Zhixi-0.1.18-source.zip` | Read or modify the source |
| `Zhixi-0.1.18-current-media.zip` | Restore 37 current videos and 11 garden images for source builds |

Each ZIP has a `.sha256` checksum file. Git source contains no videos. Prompts, original footage, historical assets and development records remain local and are excluded from public packages.

## Run from source

Install Node.js 22.12+ and Python 3.10+. Download the source and matching media ZIP, then run from the source root:

```powershell
python scripts/media-assets.py restore "D:\Downloads\Zhixi-0.1.18-current-media.zip"
python scripts/media-assets.py check
npm ci
npm run audit:assets
npm start
```

Replace the archive path with your own. See [contributing](CONTRIBUTING.md) for validation and packaging commands.

## Documentation and licensing

- [Installation](INSTALL-WINDOWS.en.md) · [User guide](docs/USER-GUIDE.md) · [Privacy](docs/PRIVACY.md)
- [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Current media](actions/README.md)
- [MIT license](LICENSE) · [Asset license](LICENSE-ASSETS.md) · [Project notice](NOTICE.md) · [Third-party notices](THIRD_PARTY_NOTICES.md) · [Asset provenance](docs/RIGHTS.md)

Zhixi is an independent project, not an official OpenAI product. Artwork and motion clips use AI assistance. Project licensing does not grant third-party rights.
