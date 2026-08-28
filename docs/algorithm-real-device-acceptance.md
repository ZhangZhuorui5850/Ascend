# Algorithm training real-device acceptance

Use an isolated Ascend staging instance connected to the isolated Judge Gateway. Record the exact Git commit and expose the staging application through HTTPS to the physical devices.

## Required devices

- iPhone Safari installed as a standalone PWA, target viewport around 390×844;
- a physical tablet in portrait and landscape, target width around 768 px;
- a desktop browser at 1440×900 or larger.

## One complete flow on every device

1. Sign in to a dedicated test workspace.
2. Open Algorithm Training and confirm the Today and Library surfaces load with workspace-owned data.
3. Upload a CPP file, review the import preview, and confirm the problem appears in the library.
4. Add the problem to a training date and open its editor without horizontal page overflow.
5. Edit code, reload or relaunch, and confirm the encrypted draft restores.
6. Run a public sample and submit a formal solution through the isolated Gateway.
7. Interrupt polling, reload, and confirm the same remote submission resumes.
8. Save reflection evidence and confirm it survives reload.

Phone evidence also covers standalone mode, safe-area handling, keyboard visibility and full relaunch recovery. Tablet evidence covers portrait and landscape. Desktop evidence covers keyboard navigation through tabs, library controls, editor, actions and reflection.

Take at least two screenshots per device. Evidence contains staging UI and synthetic workspace data. Remove passwords, tokens, email addresses, private source code, hidden tests and personal notifications.

## Evidence validation

Copy `docs/templates/algorithm-real-device-evidence.example.json` beside the screenshots, replace the metadata and false values with observed results, and calculate each screenshot SHA-256.

```bash
ASCEND_DEVICE_EVIDENCE_CONFIRM=real-devices-observed \
  npm run audit:algorithm-devices -- /absolute/path/to/evidence.json
```

Schema version 2 records the current training board and CPP import flow. The validator checks HTTPS, commit identity, timestamp freshness, device coverage, required checks and screenshot hashes.
