# Active issues and follow-ups

Last reviewed: 20 September 2026

This file contains current findings only. Closed or superseded documentation
findings belong in [`archive/`](archive/).

## Confirmed application defects

None found in the current audit. `npm test` and the UI smoke suite are green.

## Maintenance follow-ups

- [ ] Refresh `package-lock.json` so its root dependency metadata matches the
  dependency-free `package.json`. The running server uses Node's built-in HTTP
  module, so the stale lock metadata does not currently block the application.
- [ ] Add a real-browser visual check to complement `tools/smokeTest.mjs`, which
  intentionally runs against a stand-in browser environment. This is a QA
  coverage improvement, not a currently failing behavior.

Do not move these items to the archive until the underlying repository or QA
workflow has actually changed.
