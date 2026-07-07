# ZGCA Workbench Phase 1 Briefing

Date: 2026-07-07
Status: implemented foundation, ready for the next learning-loop iteration

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
- Added careful draft retirement: explicit day commit only marks drafts committed when draft content matches the submitted canonical snapshot.

### Learning Loop

- Review scores now update knowledge point mastery, review count, status, last review date, and next review date.
- Strong reviews increase mastery and can promote a point to `已掌握`.
- Weak reviews keep the point in the near review queue.
- New mistakes lower linked knowledge point mastery and schedule next-day review.
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
- Legacy assets are backfilled into blob metadata and content-addressed storage.
- Downloads stream from disk through upload-root path confinement.
- SVG/HTML and other active content are forced to download as attachments; passive image formats and PDFs can render inline.

### Responsive Interaction

- Desktop keeps the three-column workbench: navigation, main daily workspace, persistent capture panel.
- Tablet keeps navigation and places capture as a docked lower panel to preserve reading width.
- Phone uses bottom navigation for Today, Calendar, Knowledge, Mistakes, and Capture.
- Phone capture opens as a bottom sheet with backdrop and close control.
- The day page now includes a `Now` focus band above metrics so mobile users see the next action before the detailed timeline.
- Motion is limited to useful state changes: capture sheet open/close, upload spinner, focus/drop affordances, and sync state changes. Reduced-motion preferences are respected.

## Expert Review Synthesis

### Learning Science Reviewer

What is strong:
- The day-first model supports habit formation and reduces context switching.
- Autosaved writing lowers friction, so reflection and metacognition are more likely to happen.
- Mistakes, reviews, assets, and study sessions are all tied back to dates, which makes weekly review easier.

Needs improvement:
- The next phase should make mastery changes visible in the day page immediately after review/mistake actions.
- The day page should surface "next review" and "reattempt this mistake" actions before passive timelines.
- Add lightweight end-of-day prompts that ask what changed, what remains weak, and what tomorrow's first action is.

### UX and Interaction Reviewer

What is strong:
- Desktop supports sustained study with persistent capture.
- Phone now has a reachable capture action rather than burying file intake below the main page.
- The `Now` band better matches daily use: open the page, see what matters, write.

Needs improvement:
- Add conflict history and audit views so resolved conflicts can be reviewed later.
- Add optimistic refresh or live insertion for newly uploaded assets on the day page.
- Add small touch-target QA screenshots at 390px, 768px, and 1180px as a future visual regression step.

### Database and Sync Reviewer

What is strong:
- The app now treats SQLite as the authority and avoids raw file sync.
- Mutations use devices, versions, op ids, and a change log rather than blind whole-record overwrites.
- Asset blobs are content-addressed and path-confined.

Needs improvement:
- Add a global conflicts queue for non-day scopes if more entity types begin producing conflicts.
- Add pruning or compaction policy for `entity_changes`.
- Add repository-level tests for duplicate upload end-to-end behavior.

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

- `npm run lint` passed.
- `npm test` passed: 15 test files, 37 tests.
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

## Remaining Iteration Backlog

1. Add visible review and mistake action cards on the day page, above passive timelines.
2. Add visual QA screenshots for mobile, tablet, desktop, and wide desktop.
3. Add repository-level duplicate-upload tests that verify one blob path and correct `ref_count`.
4. Add final analytics views for weekly learning review and weak-point prioritization.
5. Add conflict history and pruning views for long-running sync usage.

## Git Notes

Work was kept on branch `codex/zgca-workbench-upgrade` with small commits by concern. The existing unrelated `docker-compose.yml` change was preserved and not committed by this implementation.
