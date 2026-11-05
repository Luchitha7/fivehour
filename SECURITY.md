# Security Policy

## Reporting a vulnerability

Please **don't open a public issue** for security problems. Use GitHub's
[private vulnerability reporting](https://github.com/Luchitha7/fivehour/security/advisories/new) instead.
I'll reply as soon as I can and credit you in the fix if you'd like.

## What fivehour touches

| Thing | Access | Why |
| --- | --- | --- |
| `~/.claude/settings.json` | read/write, only when you click **Connect** or **Disconnect** | add or remove the status line entry (backed up first, written atomically) |
| `~/.claude/projects/**/*.jsonl` | read | count tokens in the current window |
| Claude Code login (macOS Keychain or `~/.claude/.credentials.json`) | read, **only if live polling is turned on** | call `api.anthropic.com/api/oauth/usage` |
| `~/.fivehour/` | read/write | app settings and the latest usage numbers |
| `claude` CLI | run, **only if window anchoring is on** | send one tiny message to start a window |
| `api.github.com` | read, once a day, **unless turned off** | check for a newer fivehour release (no personal data sent) |

The token is only ever sent to `api.anthropic.com` over HTTPS and is never written to disk or logs.

## Hardening

- Renderer windows use `contextIsolation`, `sandbox`, no Node integration, and a strict CSP with no inline scripts.
- Navigation, new windows, webviews and permission requests are blocked.
- The update notice only opens `https://github.com/Luchitha7/fivehour/releases/…` URLs, checked in the main process. It never downloads or runs anything.
- Settings from the UI pass an allow-list with type and range checks. Values that reach a process call (model name, times) are restricted to safe characters.

## Known advisories

`npm audit` reports a moderate `minimatch` ReDoS advisory (GHSA-g3hv-75wg-m249) inside `electron-builder`.
That's a build-time tool only. It isn't part of the app you run.
