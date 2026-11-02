# Zhixi · Desktop Companion for Codex

[简体中文](README.md) | **English**

A little company for the work in front of you.

<p align="center">
  <img src="assets/character/qiqi-chibi-v5-knot-sprout.png" width="300" alt="Zhixi wearing a sprout-and-star chest emblem and a white-knot hair charm with two lavender gems and a tassel">
</p>

Zhixi (知栖) is a Windows video desktop pet with a companion Codex plugin. She can stay beside your work, show your actual Codex usage limits, open a task window, run a Pomodoro timer, and keep a local journal and small garden.

**Current version: 0.1.18 · Windows 10/11 x64 · 37 current animation clips.**

This README is in English. The application menus and most detailed guides are currently in Simplified Chinese.

## Download and install

For normal use, download **[Zhixi-0.1.18-win32-x64.zip](https://github.com/kaukoaki/zhixi-pet/releases/download/v0.1.18/Zhixi-0.1.18-win32-x64.zip)**, approximately 985 MiB. You can also find it on the **[release page](https://github.com/kaukoaki/zhixi-pet/releases/tag/v0.1.18)**.

### 1. Check Codex

To install both the desktop application and the Codex plugin, these commands must work in a terminal:

```powershell
codex --version
codex plugin --help
```

If the command is unavailable, follow the [official Codex CLI installation guide](https://learn.chatgpt.com/docs/codex/cli), then reopen your terminal. Usage limits and task execution also require a signed-in Codex session. If needed, run `codex login` and complete the sign-in prompts.

The Windows package does not require Node.js, Python, or the separate animation media ZIP.

### 2. Extract the Windows package

Right-click the downloaded ZIP and choose **Extract All**. Open the extracted `Zhixi-0.1.18-win32-x64` folder. It should contain:

```text
install.cmd
INSTALL-WINDOWS.md
app/
scripts/
codex-plugin/
.agents/
```

Keep the entire folder together and run the installer from the extracted folder. Use a location you plan to keep: the local plugin marketplace points to this directory for later refreshes.

GitHub's automatically generated `Source code (zip)` is a source archive, not a ready-to-install Windows package.

### 3. Install and verify

Double-click **`install.cmd`**. It installs the desktop application, creates a Start menu shortcut named **Zhixi**, and installs the Codex plugin.

To check the plugin afterward:

```powershell
codex plugin list --marketplace zhixi-local --json
```

Find the `zhixi-pet@zhixi-local` entry in the installed list and check that `installed` and `enabled` are both `true`.

Start a **new Codex chat** and invoke `$zhixi-pet`, or ask:

```text
Open the Zhixi desktop pet.
```

The Chinese equivalent is `打开知栖桌宠`. If an existing chat does not see the plugin, restart Codex and open a new chat.

For installation details and troubleshooting, see [INSTALL-WINDOWS.md](INSTALL-WINDOWS.md) (Chinese).

### Install only the desktop application

If you do not have the Codex CLI yet, open PowerShell in the extracted folder and run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\install-desktop.ps1"
```

This installs the desktop pet without the Codex plugin. Usage limits, Codex tasks, and chat commands require the CLI and plugin.

After setting up the CLI, install the plugin without reinstalling the desktop application:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\install-codex-plugin.ps1" -SkipDesktop
```

## Features

| Feature | How to use it |
| --- | --- |
| Transparent video desktop pet | Drag to move; adjust size and always-on-top behavior; separate lift, hold, and release animations |
| Codex usage limits | Single-click the character to view information available for your signed-in account |
| Task window | Double-click the character to open the composer and task controls |
| Pomodoro timer | Right-click → 番茄钟; start, pause, resume, or take a break |
| Companion journal | Right-click → 知栖陪伴手账; record focus sessions and moods, and collect cards |
| Garden and decorations | Water plants, harvest crops, use the coin shop, and select scenes or character effects |
| Animation playback | Right-click → 动作; browse everyday, wallet, Pomodoro, and garden actions |

The current character wears a small golden star embraced by green sprout leaves on her chest. Her braid-side charm has a white cord knot, exactly two pale lavender diamond gems, fine links, and a light cream tassel. The 37 current clips cover everyday interactions, wallet reactions, drag phases, Pomodoro scenes, and garden performances.

## Use Zhixi from Codex

Invoke `$zhixi-pet` in a new chat, or use requests such as:

```text
Open the Zhixi desktop pet.
Open Zhixi's Pomodoro timer.
Show my remaining Codex usage with Zhixi.
Open Zhixi's task window.
Open Zhixi's companion journal.
Close the Zhixi desktop pet.
```

The plugin opens the local desktop application. Opening the task window does not execute a task, and opening the timer does not start a focus session. Tasks run when you click the execution control; they use your actual Codex allowance and may modify the selected workspace according to your execution permissions.

Zhixi is an independent desktop application and local plugin. It is not an official OpenAI product.

## Which download do I need?

| File | Intended use | Contents |
| --- | --- | --- |
| `Zhixi-0.1.18-win32-x64.zip` | Use the desktop pet and plugin | Windows application, all 37 current clips, plugin, and installation scripts |
| `Zhixi-0.1.18-source.zip` or Git checkout | Read or modify the code | Application code, plugin, current character reference, prompts, and lightweight indexes; no videos |
| `Zhixi-0.1.18-current-media.zip` | Develop, package, or create animations | Only the 37 current videos and 11 garden end-frame posters |

Each release ZIP has a matching `.sha256` checksum file. The source repository is approximately 15 MiB; current media is distributed separately through Releases.

Original footage, historical video versions, and per-frame production QA remain in the local production workspace. They are not included in the public repository or release assets. Future animations should use the current V5 reference and [character and motion prompt kit](docs/animation/README.md).

## Develop from source

You need Node.js 22.12+ and npm. Clone or extract the source, then download the matching `Zhixi-0.1.18-current-media.zip`.

Extract the media ZIP into the repository root so its files appear under `actions/production/...`. For checksum verification and safe restoration, use Python 3.10+:

```powershell
python scripts/media-assets.py restore "D:\Downloads\Zhixi-0.1.18-current-media.zip"
python scripts/media-assets.py check
npm ci
npm run audit:assets
npm test
npm run check
npm start
```

Replace the example ZIP path with its actual location. The restore tool verifies the archive and refuses to overwrite existing files whose contents differ. Restored videos remain ignored by Git.

Use `npm start` for development and `npm run package` to build the Windows application under `dist/QiqiCodexPet-win32-x64/`. The current media package is sufficient for public development and packaging; original footage is not required.

More source setup details are in [docs/INSTALLATION.md](docs/INSTALLATION.md) (Chinese).

## Local data and updates

The desktop application is installed at `%LOCALAPPDATA%\Zhixi\app`. Its Start menu shortcut is **Zhixi**.

Personal settings, animation bindings, journal entries, and garden data are stored under `%APPDATA%\QiqiCodexPet`.

To update, download the new Windows package, extract it into your retained installation-source directory, and run `install.cmd` again. The installer backs up the previous application and preserves personal data and custom videos. Keep the extracted source directory available for local marketplace refreshes.

To remove the Codex plugin:

```powershell
codex plugin remove zhixi-pet@zhixi-local
```

If you no longer use its marketplace, also run `codex plugin marketplace remove zhixi-local`. Removing the plugin does not remove the desktop application or personal data.

See [installation and removal](INSTALL-WINDOWS.md) and [data and privacy](docs/PRIVACY.md) for details (Chinese).

## Documentation and animation resources

Most of the following guides are in Chinese:

- [Windows installation](INSTALL-WINDOWS.md) · [Source setup](docs/INSTALLATION.md)
- [GitHub upload walkthrough](docs/GITHUB-UPLOAD.md) · [Packaging and distribution](docs/RELEASING.md)
- [Current character reference and animation prompts](docs/animation/README.md) · [Appearance verification summary](docs/branding/README.md)
- [Action library](actions/README.md) · [Asset layout](actions/ASSET-LAYOUT.md) · [Video production](docs/VIDEO-GUIDE.md)
- [Pomodoro](docs/POMODORO.md) · [Journal](docs/JOURNAL.md) · [Garden](docs/GARDEN.md) · [Decorations](docs/SHOP.md)
- [Changelog](docs/CHANGELOG.md) · [Contributing](CONTRIBUTING.md) · [Security reporting](SECURITY.md)

## License and provenance

Code is licensed under [MIT](LICENSE). Original non-code assets that contributors have the right to license are provided under [CC BY 4.0](LICENSE-ASSETS.md). Third-party names, trademarks, and other rights are excluded.

Character artwork and animation use AI assistance alongside human direction, selection, editing, repair, and transparency processing. See the [project notice](NOTICE.md), [third-party notices](THIRD_PARTY_NOTICES.md), and [provenance notes](docs/RIGHTS.md) for the applicable scope and records.
