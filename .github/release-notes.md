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

Then click the ring in your menu bar or tray, click **Connect**, and send any message in Claude Code. You also need [Node.js](https://nodejs.org) (LTS) installed for Connect to work.

`SHA256SUMS.txt` lists the checksums of every file, if you want to verify your download.
