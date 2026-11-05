## Download

| Your computer | File |
| --- | --- |
| **Mac with Apple Silicon** (M1, M2, M3, M4…) | `fivehour-…-mac-arm64.dmg` |
| **Mac with Intel** | `fivehour-…-mac-x64.dmg` |
| **Windows** (most PCs) | `fivehour-…-windows-x64-setup.exe` |
| **Windows on ARM** (e.g. Surface Pro X, Snapdragon laptops) | `fivehour-…-windows-arm64-setup.exe` |
| **Linux** | `fivehour-…-linux-x86_64.AppImage` |

Not sure which Mac you have? Apple menu → **About This Mac**. "Chip: Apple M…" means Apple Silicon.

## First launch

fivehour isn't signed with a paid Apple or Microsoft certificate yet, so your computer will warn you the first time. That's expected.

- **Mac:** open the `.dmg` and drag fivehour to **Applications**. Open it once; when macOS blocks it, go to **System Settings → Privacy & Security**, scroll down, and click **Open Anyway**.
- **Windows:** if SmartScreen says "Windows protected your PC", click **More info → Run anyway**.
- **Linux:** make the AppImage executable (`chmod +x fivehour-*.AppImage`) and run it.

Then click the ring in your menu bar or tray:

- **Claude desktop app or claude.ai:** click **Turn on live data**. It reads your usage with the login of terminal Claude Code. If fivehour says no login was found or it has expired:
  1. [Install Claude Code](https://code.claude.com/docs/en/setup) if you don't have it (check with `claude --version` in a terminal).
  2. Run `claude auth login` and sign in with your Claude account.
  3. Click **Try again** in fivehour.
- **Claude Code in a terminal:** click **Connect** and send any message. Connect needs [Node.js](https://nodejs.org) (LTS).

`SHA256SUMS.txt` lists the checksums of every file, if you want to verify your download.
