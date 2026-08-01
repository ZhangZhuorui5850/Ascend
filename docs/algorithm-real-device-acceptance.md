# Algorithm training real-device acceptance

Use an isolated Ascend staging instance connected to the isolated Judge Gateway.
The tested application must be an exact Git commit and must be reachable over
HTTPS from the physical devices.

## Required devices

- iPhone Safari installed as a standalone PWA, target viewport around 390×844;
- a physical tablet in portrait and landscape, target width around 768 px;
- a desktop browser at 1440×900 or larger.

## One complete flow on every device

1. Sign in to a dedicated test workspace.
2. Open Extensions and confirm the pilot status is visible.
3. Open Algorithm Training and confirm exactly 30 managed problems.
4. Open a managed problem and verify no horizontal page overflow.
5. Edit code, reload/relaunch, and verify the encrypted draft restores.
6. Run a public sample and submit a formal solution.
7. Interrupt/reload during polling and verify the same remote submission resumes.
8. Save reflection evidence and verify it survives reload.

Phone additionally requires standalone mode, safe-area handling, no keyboard
occlusion, and full app relaunch recovery. Tablet requires portrait and
landscape. Desktop requires keyboard navigation through tabs, editor, actions and
reflection.

Take at least two screenshots per device. Do not include passwords, tokens,
email addresses, source code that should remain private, hidden tests or personal
notifications.

## Evidence validation

Copy `docs/templates/algorithm-real-device-evidence.example.json` beside the
screenshots, replace the metadata and false values with observed results, and
calculate each screenshot SHA-256.

```bash
ASCEND_DEVICE_EVIDENCE_CONFIRM=real-devices-observed \
  npm run audit:algorithm-devices -- /absolute/path/to/evidence.json
```

The validator rejects loopback/non-HTTPS URLs, stale timestamps, incomplete
devices or checks, missing/tampered screenshots and sensitive-data field names.
Its success proves that the required observations were recorded; it does not
independently prove that the tester's observations were truthful.
