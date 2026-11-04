# Install Zhixi on Windows

[简体中文](INSTALL-WINDOWS.md) | **English**

Zhixi v0.1.18 supports Windows 10 and 11 on x64. The Windows package includes the desktop pet, its animations, and the local Codex plugin.

## 1. Check the Codex CLI

Open PowerShell and run the following commands.

```powershell
codex --version
codex plugin --help
```

Continue when both commands show their output. If PowerShell cannot find Codex or its plugin commands, follow the official CLI guide to install or update Codex, then reopen PowerShell. [Codex CLI guide](https://learn.chatgpt.com/docs/codex/cli)

For usage limits and tasks, sign in with `codex login` and follow the prompts. You can also set up the desktop pet first and add the plugin later. [Desktop application only](#install-the-desktop-application-only)

## 2. Download and extract the Windows package

Download the Windows ZIP, approximately 985 MiB. It contains everything needed to run the desktop pet. [Download Zhixi v0.1.18 for Windows x64](https://github.com/kaukoaki/zhixi-pet/releases/download/v0.1.18/Zhixi-0.1.18-win32-x64.zip)

Right-click the ZIP in File Explorer and select **Extract All**. Open the extracted folder containing `install.cmd`, `app/`, `scripts/`, `codex-plugin/`, and `.agents/`.

Keep the extracted folder in a permanent location. Codex uses this directory as the local plugin source when refreshing the marketplace.

## 3. Run the installer

Double-click **`install.cmd`** inside the extracted folder. File Explorer may display it as **install** with the type **Windows Command Script**.

The installer copies and verifies the desktop application, creates the **Zhixi** Start menu shortcut, and registers the local Codex plugin. Copying the application can take a moment. Once installed, open Zhixi from the Start menu.

To see the full installer output, type `powershell` into the File Explorer address bar while viewing the extracted folder, press Enter, then run the following command.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\install-codex-plugin.ps1"
```

This sets the execution policy for that PowerShell process.

## 4. Verify and open the plugin

```powershell
codex plugin list --marketplace zhixi-local --json
```

Find the `zhixi-pet@zhixi-local` entry in the installed list. Its `installed` and `enabled` fields should both be `true`.

Open a new Codex chat and invoke `$zhixi-pet`, or ask Codex to open Zhixi.

```text
Open the Zhixi desktop pet.
```

The corresponding Chinese prompt is `打开知栖桌宠`. If the plugin is missing from an existing chat, restart Codex and open a new chat. [Codex CLI plugin reference](https://learn.chatgpt.com/docs/cli/reference#codex-plugin)

## Install the desktop application only

To set up the desktop pet without the Codex CLI, open PowerShell in the extracted folder and run the desktop installer.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\install-desktop.ps1"
```

The desktop pet, animations, and Pomodoro timer are available on their own. When the Codex CLI is ready, install the plugin alongside the existing desktop application.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\install-codex-plugin.ps1" -SkipDesktop
```

## Troubleshooting

| What you see | What to do |
| --- | --- |
| The extracted folder has no installer | Check that you downloaded `Zhixi-0.1.18-win32-x64.zip` from the release assets and extracted the whole archive. |
| The installer closes or displays an error | Run the PowerShell command in step 3 from the extracted folder to see the output. |
| PowerShell cannot find Codex or the plugin command | Install or update the CLI, reopen PowerShell, and repeat step 1. |
| The desktop pet opens, but Codex cannot call it | Check that the plugin is enabled, then restart Codex and try a new chat. |
| Usage limits are unavailable | Check your login with `codex login status`. Available usage information depends on the account and sign-in method. |
| The updater asks you to close Zhixi | Right-click the desktop pet and choose Exit (`退出`), then run the installer again. |

## Verify the ZIP checksum

Download the matching `.sha256` file from the release. Open PowerShell in your downloads folder and run the following commands. [Release assets](https://github.com/kaukoaki/zhixi-pet/releases/tag/v0.1.18)

```powershell
Get-FileHash -LiteralPath ".\Zhixi-0.1.18-win32-x64.zip" -Algorithm SHA256
Get-Content -LiteralPath ".\Zhixi-0.1.18-win32-x64.zip.sha256"
```

Compare the two 64-character hash values. Letter case can differ.

## Update or remove Zhixi

To update, fully extract the new Windows ZIP and run `install.cmd` from the extracted folder. The installer backs up the old application under `%LOCALAPPDATA%\Zhixi\backups` and retains settings, custom videos, coins, garden progress, and journal entries under `%APPDATA%\QiqiCodexPet`.

To remove the Codex plugin, run the following command.

```powershell
codex plugin remove zhixi-pet@zhixi-local
```

If you have finished using this plugin source, remove its marketplace registration.

```powershell
codex plugin marketplace remove zhixi-local
```

To remove the desktop application separately, exit Zhixi and remove its application folder at `%LOCALAPPDATA%\Zhixi\app` and its **Zhixi** Start menu shortcut. Keep `%APPDATA%\QiqiCodexPet` to preserve your journal, garden, and custom videos.
