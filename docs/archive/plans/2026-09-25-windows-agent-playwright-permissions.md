# Plan: Document supported Windows Playwright access for agents

## Goal

Help agents diagnose and recover from Windows permission errors when Playwright
needs to access its configured browser, without changing the browser, launch
settings, installation, or filesystem ACLs.

## Verified findings

- In the default execution context, `whoami` reports
  `desktop-791n6ft\codexsandboxoffline`, while `USERPROFILE` and `LOCALAPPDATA`
  point into Leigh's profile. Calling `fs.statSync(chromium.executablePath())`
  from that context returns `EPERM` for the configured Chromium executable.
- The same read with `sandbox_permissions: require_escalated` runs as
  `desktop-791n6ft\leigh` and can access the existing `chromium-1243` browser,
  headless shell, and `ffmpeg-1011` assets.
- The supported scoped retry
  `npm run test:browser -- e2e/navigation --workers=1 --trace=off`, invoked
  with `require_escalated` and `prefix_rule: [npm, run, test:browser]`, passed
  all `6/6` tests in `8.8` seconds.
- No browser installation or ACL changes were needed. A previous installer
  report with exit code `1` followed an agent interruption; it was not an
  independent installer failure.

## Documentation scope

- Update `AGENTS.md` and `docs/E2E_TEST_PLAN.md` to explain that Windows
  `USERPROFILE` values do not prove the process identity or browser access.
  Diagnose the actual identity and preserve the original permission error.
- Document the supported path: retry the same documented npm browser wrapper
  using scoped elevated permissions, with a narrow reusable command prefix
  where supported. Reassess access before reporting the runner blocked.
- Preserve the configured Chromium browser, Playwright configuration, and npm
  wrapper. Do not recommend browser installation, ACL changes, alternate
  browsers, or launch overrides for this permission failure.
- Keep the existing local test commands and the setup guidance accurate. No
  application code or test specs are in scope.

## Outcome and validation

- Confirmed the cache has protected ACLs allowing only Leigh, Administrators,
  and SYSTEM. The browser was installed; sandbox access was the failure.
- The navigation npm wrapper passed 6/6 using approved command-level execution
  outside the sandbox. No full suite was run.
- Updated AGENTS.md and the E2E guide with the proven execution path and
  error-preserving diagnosis, replacing the premature stop instruction.
- Automatic approval review rejected the proposed persistent browser-wrapper
  allow rule because prefix matching did not constrain working directory or
  trailing arguments. No rule was written or retried through another route.
- No global configuration, ACL, browser, dependency, or application changes
  were made. Future runs use supported command-level approval.
- User requested a quick documentation edit and stop in QMODE. Further policy
  experiments and fresh-agent verification were stopped; this plan records the
  completed diagnosis, successful navigation run, and documentation remedy.
