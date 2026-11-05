# Contributing

Thanks for helping out!

## Setup

```bash
git clone https://github.com/Luchitha7/fivehour.git
cd fivehour
npm install
npm start
```

## Before opening a PR

- `npm test` passes. The tests use Node's built-in runner, so you don't need Electron for them.
- New logic comes with a test. Keep decision logic (like `alerts.js` and `usage.js`) pure so it's easy to test.
- No new runtime dependencies unless there's a strong reason. The app currently has none.
- Anything from the UI or from files is untrusted. Validate it in `config.js` before it reaches the file system or a process.
- Test on the OS you changed behavior for. Mention it in the PR if you couldn't test macOS, Windows or Linux.

## Commit messages

Short imperative subject, e.g. `Add reset reminder notification`.
