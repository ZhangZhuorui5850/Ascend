# ZGCA Workbench Phase 1 Briefing

Date: 2026-07-07
Status: implemented multi-device learning cockpit with scripted QA

## Executive Summary

Phase 1 upgraded the workbench from a local daily tracker into an authenticated, daily-first, multi-device learning cockpit. The most important workflows now have durable server-side behavior: daily writing autosaves as drafts, reopened pages restore active drafts, other devices poll and apply newer draft changes, dragged or pasted files upload immediately, and downloads use confined, streamed asset delivery.

The design center remains the day page. The learner can open today on desktop, tablet, or phone, see the current focus, write in the daily fields without losing unfinished work, capture files from the side panel or mobile bottom sheet, and still explicitly commit the day into canonical records when ready.

## Module Improvements

### Authentication and Access Control

- Replaced browser-style Basic Auth with an app login page and session cookies.
- Added server-side session validation for private pages and private API routes.
- Kept `proxy.ts` lightweight for routing while route handlers and page components enforce real authorization.
- Added same-origin checks to mutating routes, including draft sync, file upload, study sessions, mistakes, reviews, and day updates.

### Database and Sync Foundation

- Added deterministic SQLite migrations with checksum drift detection.
- Added `devices`, `drafts`, `entity_changes`, `conflicts`, `users`, `sessions`, `blobs`, and `upload_sessions`.
- Enabled WAL, foreign keys, busy timeout, and synchronous NORMAL for local durability and concurrency.
- Added draft versioning, idempotent `op_id` handling, stale base-version rejection, and monotonic change pull.
- Stale draft writes now create open `conflicts` records instead of disappearing as generic errors.
- Added a global conflict audit page with open/resolved history and a protected cleanup API for old resolved conflicts.
- Added careful draft retirement: explicit day commit only marks drafts committed when draft content matches the submitted canonical snapshot.

### Learning Loop

- Review scores now update knowledge point mastery, review count, status, last review date, and next review date.
- Strong reviews increase mastery and can promote a point to `已掌握`.
- Weak reviews keep the point in the near review queue.
- New mistakes lower linked knowledge point mastery and schedule next-day review.
- Due reviews and due mistakes now appear as action cards on the day page before passive timelines.
- Review action cards now show score-specific learning prompts; low scores are recorded with a note that asks for cause and a variant problem.
- Mistake reattempts can be scored directly from the day page; passing reattempts graduate the mistake and create a review outcome.
- Daily writing now includes reflection prompts, and new mistake capture includes a cause/repeated-pattern field.
- A new learning analytics page summarizes the recent week and ranks weak knowledge points by mastery, tier, due state, open mistakes, and exam relevance.
- These rules make daily review/mistake capture affect the knowledge map rather than only appending history.

### Daily Autosync

- Daily fields autosave to `/api/drafts` with debounce.
- Active drafts overlay canonical `daily_entries` on page load, including per-field versions so the first edit after reopen preserves stale-write protection.
- Clients poll `/api/sync/pull` and apply newer remote draft versions when local fields are not dirty or saving.
- In-flight autosave responses no longer clear newer local edits.
- UI shows field-level and global sync status, including explicit conflict state for stale write rejections.
- Open conflicts appear on the day page with local/remote comparison and controls to use local, use remote, or save a merged version.

### Upload and Download

- Drag, paste, or file picker starts upload immediately.
- Upload cards show uploading, uploaded, failed, retry, and download states.
- Files are stored under content-addressed blob paths to avoid same-name overwrites and renamed duplicate drift.
- Repository-level duplicate upload coverage now verifies identical content shares one blob path and increments `ref_count` across separate asset records.
- Legacy assets are backfilled into blob metadata and content-addressed storage.
- Downloads stream from disk through upload-root path confinement.
- SVG/HTML and other active content are forced to download as attachments; passive image formats and PDFs can render inline.

### Responsive Interaction

- Desktop keeps the three-column workbench: navigation, main daily workspace, persistent capture panel.
- Tablet keeps navigation and places capture as a docked lower panel to preserve reading width.
- Phone uses bottom navigation for Today, Calendar, Knowledge, Mistakes, and Capture.
- Phone capture opens as a bottom sheet with backdrop and close control.
- Closed phone/tablet capture sheets are hidden from pointer and keyboard interaction; opening Capture restores the backdrop, sheet, drag/drop area, and close affordance.
- The day page now includes a `Now` focus band above metrics so mobile users see the next action before the detailed timeline.
- Navigation now includes Analytics and Conflict audit pages on desktop, with mobile bottom navigation focused on Today, Calendar, Analytics, Mistakes, and Capture.
- Motion is limited to useful state changes: capture sheet open/close, upload spinner, focus/drop affordances, and sync state changes. Reduced-motion preferences are respected.
- Added `npm run responsive:audit`, a Playwright-powered smoke check for login, desktop, tablet, phone, mobile capture, and horizontal overflow.

## Expert Review Synthesis

### Learning Science Reviewer

What is strong:
- The day-first model supports habit formation and reduces context switching.
- Autosaved writing lowers friction, so reflection and metacognition are more likely to happen.
- Mistakes, reviews, assets, and study sessions are all tied back to dates, which makes weekly review easier.

Needs improvement:
- The next phase can make mastery deltas animate immediately after review/mistake actions.
- Add richer spaced-repetition explanations, such as why a point moved to a specific next-review date.

### UX and Interaction Reviewer

What is strong:
- Desktop supports sustained study with persistent capture.
- Phone now has a reachable capture action rather than burying file intake below the main page.
- The `Now` band better matches daily use: open the page, see what matters, write.

Needs improvement:
- Add optimistic refresh or live insertion for newly uploaded assets on the day page.
- Extend the responsive audit into screenshot diffing if this becomes a shared UI surface.

### Database and Sync Reviewer

What is strong:
- The app now treats SQLite as the authority and avoids raw file sync.
- Mutations use devices, versions, op ids, and a change log rather than blind whole-record overwrites.
- Asset blobs are content-addressed and path-confined.

Needs improvement:
- Add a global conflicts queue for non-day scopes if more entity types begin producing conflicts.
- Add pruning or compaction policy for `entity_changes`.
- Add upload tests for symlink escape attempts inside the upload root.

### Security Reviewer

What is strong:
- Private pages no longer trust cookie presence alone.
- Mutating cookie-authenticated routes check same-origin before reading bodies.
- Download headers include `nosniff` and safer content disposition.

Needs improvement:
- Add integration coverage for forged/expired cookies on private page HTML.
- Add upload tests for symlink escape attempts inside the upload root.
- Consider CSRF token double-submit if this is exposed beyond a private network.

## Verification Evidence

Latest verification run:

- Browser login and responsive QA passed on the local Next.js server:
  - `1440x900` desktop day page: sidebar, main workspace, and persistent capture panel visible with no horizontal overflow.
  - `1024x900` tablet day page: sidebar and main workspace visible, capture docked below, mobile nav hidden, no horizontal overflow.
  - `390x844` phone day page: sidebar hidden, bottom nav visible, capture closed by default, capture bottom sheet opens with backdrop and upload copy visible, no horizontal overflow.
  - `1440x900` and `390x844` login page: redesigned login shell and card fit without horizontal overflow.
- `npm run responsive:audit` passed against `http://localhost:3002`.
- `npm run lint` passed.
- `npm test` passed: 16 test files, 41 tests.
- `npm run build` passed with Next.js 16.2.10.

Important targeted tests added:

- Migration checksum drift and new schema creation.
- Session password hashing and route guards.
- Auth endpoint same-origin failures.
- Asset path confinement, SVG disposition, content-addressed storage, and legacy backfill.
- Draft sync idempotency, stale base rejection, and day commit draft preservation.
- Conflict recording and resolution for stale draft writes.
- Active draft content plus version hydration for reload-safe autosave.
- Learning loop mastery/status/next-review updates for review scores and mistakes.
- Mistake reattempt graduation and linked review outcome creation.
- Learning analytics week summary and weak-point priority scoring.
- Repository duplicate upload deduplication and blob `ref_count`.
- Conflict history listing and resolved-conflict pruning.

## Remaining Iteration Backlog

1. Add optimistic refresh or live insertion for newly uploaded assets on the day page after capture upload succeeds.
2. Add `entity_changes` compaction for very long-running sync histories.
3. Add upload tests for symlink escape attempts inside the upload root.
4. Add screenshot diffing to `responsive:audit` if visual regressions become frequent.
5. Add animated mastery deltas after review and mistake actions.

## Git Notes

Work was kept on branch `codex/zgca-workbench-upgrade` with small commits by concern. The existing unrelated `docker-compose.yml` change was preserved and not committed by this implementation.
