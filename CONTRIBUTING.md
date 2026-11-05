# Contributing to fivehour

Thanks for helping out! This guide covers how to set up the project, how branches and commits are named, and what a good pull request looks like.

If you're unsure about anything, open an issue and ask. Small questions are welcome.

## Ways to help

- **Report a bug.** Use the [bug report](https://github.com/Luchitha7/fivehour/issues/new?template=bug_report.md) template. Say which OS you're on and which data source the popup shows.
- **Suggest a feature.** Open a [feature request](https://github.com/Luchitha7/fivehour/issues/new?template=feature_request.md) first, before writing code. fivehour aims to stay small and simple, so it's worth agreeing on the idea before you spend time on it.
- **Fix something.** Issues labelled `good first issue` or `help wanted` are a good place to start. Comment on the issue so others know you're on it.
- **Test on your OS.** Windows and Linux testing is always useful.

Found a security problem? Don't open a public issue. See [SECURITY.md](SECURITY.md).

## Setup

You need Node.js 18 or newer and git.

```bash
git clone https://github.com/Luchitha7/fivehour.git
cd fivehour
npm install
npm start
```

| Command | What it does |
| --- | --- |
| `npm start` | Runs the app from source |
| `npm test` | Runs the tests (Node's built-in runner, no Electron needed) |
| `npm run dist` | Builds installers for your OS into `dist/` |

There's a map of the source files in the [README](README.md#development).

## Branching

fivehour uses **trunk-based development**:

- `main` is the only long-lived branch. It must always build, pass the tests, and be ready to release.
- Do all work on a **short-lived branch** off the latest `main`, and merge it back with a pull request. Aim for days, not weeks.
- Don't push directly to `main`. Every change goes through a PR, including the maintainer's.
- Releases are **tags** on `main` (`v0.2.0`), not branches. There are no `develop` or `release/*` branches.

If `main` moves on while you work, rebase onto it rather than merging it in:

```bash
git fetch origin
git rebase origin/main
```

### Branch names

Use `type/short-description`, in lowercase with hyphens. You can add the issue number after the type.

| Type | Use it for | Example |
| --- | --- | --- |
| `feat/` | A new feature or user-visible improvement | `feat/weekly-limit-alert` |
| `fix/` | A bug fix | `fix/42-tray-icon-blank-on-windows` |
| `docs/` | Docs only | `docs/linux-autostart` |
| `refactor/` | Code changes that don't change behavior | `refactor/split-usage-sources` |
| `test/` | Adding or fixing tests only | `test/endpoint-backoff` |
| `ci/` | GitHub Actions and build config | `ci/cache-electron-download` |
| `chore/` | Dependencies, tooling, housekeeping | `chore/bump-electron-46` |

Keep it short: `fix/429-backoff` is better than `fix/handle-the-case-where-anthropic-returns-too-many-requests`.

## Commits

Write commit messages like the ones already in the history:

```
Back off live data on HTTP 429 and keep the last reading

Poll every 5 minutes, wait at least 10 minutes (or Retry-After) after a
429, and save the last good reading to ~/.fivehour/live.json so it
survives restarts.
```

- **Subject:** imperative mood ("Add", "Fix", "Show", not "Added" or "Adds"), starts with a capital letter, no full stop at the end, 72 characters or fewer.
- **Body (optional):** a blank line after the subject, then explain *why* and anything non-obvious. Wrap at about 72 characters.
- **One logical change per commit.** Splitting a PR into a few commits that each make sense on their own is welcome.
- Reference issues in the body or the PR, not the subject: `Fixes #42`.

## Pull requests

1. **Fork** the repo (or branch, if you have write access) and create a branch named as above.
2. **Make the change.** Keep the PR focused on one thing. Unrelated cleanups go in their own PR.
3. **Run `npm test`** and try the app with `npm start`.
4. **Add a line to `CHANGELOG.md`** under `## Unreleased` if users will notice the change.
5. **Open the PR** against `main` and fill in the template.

### PR titles

The PR title becomes the commit on `main` when it's squash-merged, so write it like a commit subject: `Add weekly limit notification`, `Fix blank tray icon on Windows`.

### What a good PR includes

- What changed and why, in a few sentences.
- `Fixes #123` if it closes an issue.
- **Screenshots for any UI change**, before and after. If it touches the popup, show both light and dark mode.
- Which OS you tested on. If you couldn't test macOS, Windows or Linux and the change affects it, say so. That's fine, someone else can check.

### Review and merging

- CI (tests on macOS, Windows and Linux) must pass before merging.
- At least one maintainer approval is needed.
- PRs are **squash-merged**, so the branch's commits become one commit on `main`. The branch is deleted afterwards.
- Reply to review comments by pushing new commits. Don't force-push during review unless asked, so reviewers can see what changed.
- Drafts are welcome for early feedback. Mark the PR "Ready for review" when it's done.

## Code guidelines

- **No new runtime dependencies** unless there's a strong reason. The app currently has none, and that keeps it small and safe.
- **Keep decision logic pure** and test it. Files like `alerts.js`, `usage.js` and `update.js` take data in and return data out, without timers or I/O, so they're easy to test.
- **New logic comes with a test** in `test/`. Bug fixes should add a test that fails without the fix.
- **Treat input as untrusted.** Anything from the UI, from files on disk or from the network is validated (see `config.js`) before it reaches the file system or a child process. The renderer can only change settings that are on the allow-list.
- **Keep the Electron hardening.** Don't turn off `sandbox` or `contextIsolation`, enable `nodeIntegration`, loosen the CSP, or allow navigation or new windows.
- **Never log or send tokens.** The Claude Code login token is only ever sent to `api.anthropic.com`.
- **Cross-platform.** Use `path.join`, not hard-coded `/`. Check `process.platform` for OS-specific behavior, and keep Windows and Linux working when you change something for the Mac (and the other way round).
- **Style.** CommonJS, 2-space indent, single quotes, semicolons. `.editorconfig` sets the basics. Match the surrounding code.
- **Plain language** in the UI and docs. Short sentences, no jargon a non-developer wouldn't know.

## Versioning and releases

fivehour follows [semantic versioning](https://semver.org/):

- **Patch** (`0.1.1`): bug fixes and small polish.
- **Minor** (`0.2.0`): new features, backwards compatible.
- **Major** (`1.0.0`): breaking changes, such as settings that no longer carry over.

Maintainers release from `main`:

1. Move the `## Unreleased` notes in `CHANGELOG.md` under a new version heading with the date.
2. Bump `version` in `package.json`.
3. Commit as `Release 0.2.0`, then tag and push:

   ```bash
   git tag -a v0.2.0 -m "fivehour 0.2.0"
   git push origin main v0.2.0
   ```

GitHub Actions checks that the tag matches `package.json`, builds the installers, and publishes the release.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
