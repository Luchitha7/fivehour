# Changelog

## Unreleased

- When live data stops working (for example an expired Claude Code login), the panel says so with a Try again button, instead of quietly showing an old reading

## 0.1.2 (2026-11-05)

- Clicking the widget opens the panel on the desktop you're on, instead of switching to another one (macOS)
- No leftover highlight on Settings after clicking it
- README explains how to run fivehour from source without installing

## 0.1.1 (2026-11-05)

- Explain an expired Claude Code login in plain words instead of "HTTP 401", and stop retrying it every few minutes
- Frosted-glass panel on macOS, with Mac-style switches and buttons
- Estimated "~% used" when no exact number is available, from local token counts
- Estimates get more accurate after fivehour sees one exact reading
- Live data backs off after "too many requests" (HTTP 429) instead of showing an error, and keeps the last good reading across restarts

## 0.1.0 (2026-11-05)

First version.

- Menu bar / tray ring with % used and a reset countdown
- Weekly limit
- Notifications at a chosen % used and a chosen time before reset
- Exact numbers from the Claude Code status line; estimate from local logs; opt-in live polling
- Optional window anchoring and floating widget
- Runs on macOS, Windows and Linux
- Connect checks that Node.js is installed and explains how to fix it if not
- Windows notes in the README
- Installers for macOS (Apple Silicon and Intel), Windows (x64 and ARM) and Linux, built and published by GitHub Actions
- Start at login switch in Settings; the panel opens on first launch
- Update notice: daily check of GitHub releases, notification and Download button (can be turned off)
- Panel offers live data for Claude desktop app and claude.ai users, and shows tokens when the exact % isn't known yet
