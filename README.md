# fivehour

[![CI](https://github.com/Luchitha7/fivehour/actions/workflows/ci.yml/badge.svg)](https://github.com/Luchitha7/fivehour/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Platforms](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey)

**A menu bar / system tray timer for your Claude 5-hour usage limit.**

Shows how much of your current 5-hour window you've used, when it resets, and pings you before you run out or before the window ends.

> Unofficial community project. Not affiliated with or endorsed by Anthropic.

## Features

- **% used** of the current 5-hour window, as a ring icon in the menu bar or system tray
- a **countdown to reset**, plus the clock time it resets at
- your **weekly limit**
- **notifications** you control:
  - when you've used a set share of the limit (default **75%**; choose 50 to 95% or off)
  - a set time before the window resets (default **1 hour**; choose 15 min to 2 hours or off)
  - when a fresh window is available
- **window anchoring** (optional): start your 5-hour windows on *your* schedule

## Why

The 5-hour window starts with your **first message**, not on a fixed clock. Say you send one quick message at 11:00 and then nothing for hours. When you start a big task at 15:30, you only have 30 minutes left in a window you barely used. Then the next window runs out halfway through the task.

fivehour makes the window visible, so you can plan big tasks around it.

## Quick start

You need [Node.js](https://nodejs.org) 18+ and [Claude Code](https://docs.claude.com/en/docs/claude-code).

```bash
git clone https://github.com/Luchitha7/fivehour.git
cd fivehour
npm install
npm start
```

1. Click the ring icon in your menu bar (macOS) or system tray (Windows/Linux).
2. Click **Connect**.
3. Send any message in Claude Code. Your real usage appears.

Build an installer (`.dmg`, `.exe` or AppImage) for the OS you're on:

```bash
npm run dist
```

### Can't see the icon?

- **Windows:** new tray icons start hidden. Click the **^** arrow next to the clock, then drag the fivehour ring onto the taskbar so it always shows. (Or go to *Settings → Personalization → Taskbar → Other system tray icons* and turn fivehour on.)
- **macOS:** if your menu bar is full, the notch can hide the icon. Close a few menu bar apps, or turn on **Settings → Floating widget** in fivehour.

## Windows notes

fivehour works on Windows 10 and 11. A few things that are different from macOS:

| | |
| --- | --- |
| **Node.js is required** | The status line script runs with Node.js. If you installed Claude Code with its native Windows installer, you may not have Node yet. Install the **LTS** version from [nodejs.org](https://nodejs.org), then restart fivehour. If Node is missing, **Connect** tells you instead of failing silently. |
| **Where files live** | `~/.claude` means `%USERPROFILE%\.claude` (for example `C:\Users\you\.claude`). fivehour's own data is in `%USERPROFILE%\.fivehour`. |
| **Run the commands in** | PowerShell or Windows Terminal. The Quick start commands work as written. |
| **Building the `.exe`** | `npm run dist` builds the installer for the OS you're on, so run it on a Windows PC to get the `.exe` (it ends up in `dist\`). |
| **Window anchoring** | Needs the `claude` command to work in a new terminal. If it doesn't, anchoring shows "`claude` command wasn't found". |
| **Notifications** | Appear in the Windows notification center. If you don't see any, check that *Focus assist / Do not disturb* is off. |

## What "Connect" does

Claude Code already knows your 5-hour % and reset time, because Anthropic sends them back with every reply. Claude Code can pass them to a **status line**: a small script it runs after each reply.

**Connect** adds one entry to `~/.claude/settings.json` that runs fivehour's script. The script saves your usage to `~/.fivehour/usage.json`, and the tray app reads it.

- Your settings file is backed up to `settings.json.fivehour.bak` first, and written atomically.
- If you already had a status line, fivehour keeps running it and shows its output.
- **Disconnect** puts everything back the way it was.

## Where the numbers come from

| Source | What | Accuracy | Default |
| --- | --- | --- | --- |
| **Claude Code status line** | Claude Code's `rate_limits.five_hour` / `seven_day` (% used and reset time) | Exact, account-wide (includes claude.ai usage) | On after **Connect** |
| **Local logs** | Tokens in the current window, read from `~/.claude/projects/**/*.jsonl` (same idea as [`ccusage blocks`](https://github.com/ccusage/ccusage)) | Estimate, Claude Code only | On |
| **Live polling** | The endpoint behind Claude Code's `/usage`, using your existing Claude Code login | Exact, but **undocumented** and may break | Off |

The status line updates when Claude Code gets a reply. If you only use claude.ai for a while, the % can lag until your next Claude Code message, unless live polling is on.

## Privacy and security

- Everything stays on your machine. The only network call is the **opt-in** live polling, which talks only to `api.anthropic.com` over HTTPS using the login Claude Code already stored. fivehour never stores or logs that token.
- The UI runs in sandboxed, context-isolated windows with a strict Content Security Policy, and can't navigate or open new windows.
- Settings coming from the UI are validated against an allow-list before they're saved.

See [SECURITY.md](SECURITY.md) to report a vulnerability.

## Window anchoring

Turn it on in Settings and enter times like `08:00, 13:00`. At each time, **if no window is running**, fivehour sends one tiny `claude -p` message (Haiku), so a new window starts right then. With `08:00`, your windows run 8-13, 13-18 and 18-23. Needs the `claude` CLI on your PATH.

## Development

```bash
npm test        # unit tests, no Electron needed
npm start       # run the app
```

```
src/main.js                 tray, popup, timers, notifications
src/config.js               settings with validation
src/usage.js                merges sources into one snapshot
src/alerts.js               notification rules
src/anchor.js               window anchoring
src/env.js                  find node / claude from a GUI app
src/icon.js                 ring tray icon -> PNG, no native deps
src/install.js              connect/disconnect the Claude Code status line
src/hook/statusline.js      status line script (copied to ~/.fivehour/)
src/sources/local-logs.js   5h block estimate from local logs
src/sources/endpoint.js     opt-in live polling
src/ui/                     popup and widget
```

App data lives in `~/.fivehour/`. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Roadmap

- Custom % and minutes, not just presets
- History: how much of each window you actually used
- Per-project breakdown from local logs
- Signed installers, Homebrew and winget

## License

[MIT](LICENSE)
