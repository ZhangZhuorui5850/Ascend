# ZGCA Workbench Upgrade Design

Date: 2026-07-07
Status: approved direction, pending implementation plan

## Goal

Upgrade the ZGCA learning workbench into a daily-first, multi-device learning cockpit. The system must preserve in-progress writing, sync edits across phone/tablet/desktop, upload dragged or pasted files immediately, provide a redesigned app login, adapt cleanly across screen sizes, and improve the learning loop through expert-reviewed product design.

## Current Evidence

- The current day page aggregates plan, diary, summary, assets, study sessions, reviews, and mistakes in `src/app/day/[date]/page.tsx`.
- `src/components/DayWorkspace.tsx` saves daily writing only when the user clicks the save button.
- `src/components/CapturePanel.tsx` queues files and sends them only after the user clicks send.
- `src/lib/db.ts` initializes tables directly with inline DDL and only one ad hoc migration for `assets.status`.
- `src/lib/repository.ts` performs whole-record writes for `daily_entries`, which risks overwriting changes from another device.
- `src/app/api/assets/[id]/file/route.ts` downloads by reading the entire file into memory and serves uploaded files inline.
- The auth gate exists as `middleware.ts`; Next 16 documentation says middleware has been renamed to `proxy.ts`.
- The layout is desktop-oriented: sidebar, main pane, and capture panel. Existing breakpoints collapse content but do not yet create a mobile-first daily workflow.

## Expert Review Summary

Learning science review:
- The daily hub model is right: daily capture, calendar feedback, mistakes, reviews, and syllabus knowledge points all support learning habits.
- The missing piece is a stronger mastery loop: review attempts and mistake reattempts should update confidence, mastery, next review, and status.

UX and responsive review:
- The desktop shell is promising, but mobile currently buries capture after the main content.
- The day page should lead with what the learner does next, not only metrics.
- Capture must be route-aware so files are not accidentally assigned to the wrong date.

Database and sync review:
- Multi-device sync needs versions, devices, drafts, conflicts, and a monotonic change log.
- Writes should be field-level and idempotent where possible.
- Uploads should use stable blob identity and avoid same-day same-name overwrites.

Engineering and security review:
- Move from `middleware.ts` to Next 16 `proxy.ts`.
- Add route-level session checks; do not rely only on the global proxy.
- Add CSRF/origin checks for cookie-authenticated mutations.
- Harden upload limits, path confinement, content disposition, and streaming downloads.

## Product Approach

The work is split into three implementation phases so each stage can be verified and reviewed.

Phase 1: trusted foundation
- App login replaces Basic Auth browser prompts.
- Database migrations, sessions, devices, drafts, changes, conflicts, and safer assets land first.
- Daily text autosaves to the server and syncs across devices.
- Dragged or pasted files upload immediately and are downloadable after upload succeeds.

Phase 2: daily learning cockpit
- `/day/[date]` becomes the main workspace for daily use.
- Desktop keeps the three-column workbench.
- Tablet uses compact navigation with a docked or slide-over capture panel.
- Phone uses bottom navigation and a capture bottom sheet or floating capture action.
- The day page prioritizes current plan, quick capture, due reviews, mistake reattempts, daily writing, and assets.

Phase 3: learning-effectiveness loop
- Review attempts and mistake reattempts update mastery, confidence, status, and next review.
- Activity events and knowledge state snapshots support future analytics.
- The final briefing reports module-by-module changes and verification evidence.

## Data Model

Add a migration system:
- `schema_migrations(version, applied_at, checksum)`
- Move schema changes out of one large inline initializer and into deterministic migrations.

Add auth/session entities:
- `users(id, email, password_hash, display_name, created_at, updated_at)`
- `sessions(id, user_id, token_hash, expires_at, created_at, last_seen_at, user_agent, ip_hint)`

Add sync entities:
- `devices(id, name, last_seen_at, last_pulled_seq)`
- `entity_changes(seq, op_id, entity_type, entity_id, op, base_version, patch_json, snapshot_json, device_id, created_at)`
- `drafts(id, scope_type, scope_id, field, content, base_version, version, status, device_id, updated_at)`
- `conflicts(id, entity_type, entity_id, base_version, local_json, incoming_json, status, resolved_at)`

Add asset storage entities:
- `blobs(id, sha256, size, mime_type, storage_key, ref_count, created_at)`
- `upload_sessions(id, blob_id, status, received_bytes, expires_at)`

Add learning analytics entities:
- `activity_events(id, occurred_at, event_type, day, subject_code, knowledge_point_id, source_type, source_id, value_num, metadata_json)`
- `knowledge_state_snapshots(id, knowledge_point_id, day, mastery, reviews, next_review, source_event_id)`

Add stable sync columns to mutable records over time:
- `uuid`
- `version`
- `created_at`
- `updated_at`
- `deleted_at`
- `created_by_device`
- `updated_by_device`
- `last_op_id`

Add or maintain indexes:
- `assets(day, created_at DESC)`
- `study_sessions(day, created_at DESC)`
- `review_events(day, created_at DESC)`
- `mistakes(day, created_at DESC)`
- `knowledge_points(subject_code, id)`
- `knowledge_points(next_review, status, tier)`
- `asset_links(subject_code)`
- `asset_links(knowledge_point_id)`
- `entity_changes(seq)`
- `entity_changes(entity_type, entity_id)`
- `drafts(scope_type, scope_id, field)`
- `activity_events(day, event_type)`
- `activity_events(knowledge_point_id, occurred_at)`

SQLite pragmas:
- Enable WAL.
- Enable foreign keys.
- Add a busy timeout.
- Use synchronous NORMAL for local durability/performance balance.

## Sync Design

The Next.js app and SQLite database are the authority. Devices never sync the raw SQLite file.

Daily text fields:
- Each editable field writes to `drafts` with debounce.
- The client sends `base_version`, `device_id`, and an idempotency `op_id`.
- The server applies field-level changes in a transaction and appends `entity_changes`.
- Other devices poll `GET /api/sync/pull?sinceSeq=...` every 1-2 seconds while active.
- The UI shows save states: unsaved, saving, saved, offline, conflict, and updated from another device.

Conflict policy:
- Append-only items such as study sessions, uploads, reviews, mistakes, and activity events rarely conflict.
- Daily text conflicts are field-level.
- Initial behavior: last writer wins only when the base version matches; stale writes create `conflicts` and prompt the user to choose local, remote, or merge.

Polling vs SSE:
- Phase 1 uses polling because it is simpler and easier to verify behind Docker or Tailscale.
- SSE can be added later after change tracking is stable.

## Upload and Download Design

Upload behavior:
- Dragging, pasting, or choosing a file starts upload immediately.
- The client shows queued, uploading, uploaded, failed, retrying, and canceled states.
- Uploads use bounded concurrency.
- Every upload receives a stable asset ID after metadata is recorded.
- The day page and capture panel refresh from the sync/change feed after upload completion.

Storage behavior:
- Files get a content hash and unique storage key.
- Duplicate names do not overwrite prior uploads.
- The file route resolves paths under the upload root and rejects escape attempts.

Download behavior:
- Large files stream instead of loading fully into memory.
- Responses include safe content type, `X-Content-Type-Options: nosniff`, and content disposition.
- Inline display is allowed only for safe previews such as images and PDFs; active formats such as HTML and SVG download as attachments.

## Auth Design

Login UI:
- Use the selected "focused workbench" direction: restrained, private, desktop-tool aesthetic.
- The login page is an application page, not a browser Basic Auth prompt.
- It should work comfortably on phones and tablets.

Server behavior:
- `proxy.ts` redirects unauthenticated page requests to `/login`.
- Route handlers also call a shared session guard.
- Mutating routes verify origin/CSRF expectations for cookie-authenticated requests.
- Cookies are HttpOnly, SameSite, path `/`, and Secure in production.

Migration from current Basic Auth:
- Existing untracked Basic Auth files are treated as temporary work.
- The implementation should replace them with the app session model rather than build further on Basic Auth.

## Daily Page and Responsive Design

Desktop:
- Keep a workbench layout: sidebar, main daily workspace, persistent capture panel.
- The capture panel should follow the current day route by default.

Tablet:
- Use compact navigation.
- Capture becomes a docked inspector or slide-over, not a full column that crowds the page.

Phone:
- Use bottom navigation focused on Today, Calendar, Capture, Knowledge, and Mistakes.
- Capture is opened from a floating action or bottom-sheet entry point.
- Daily metrics become compact chips.
- Forms and composers stack with large enough touch targets.

Day page order:
1. Date, sync status, and quick date navigation.
2. Current plan and first action.
3. Quick capture and immediate upload access.
4. Due reviews and mistake reattempts.
5. Daily writing: plan, diary, summary, blockers, tomorrow.
6. Asset stream and timelines.

Motion:
- Use short, purposeful transitions for capture open/close, upload state changes, route/day changes, and saved/synced feedback.
- Respect `prefers-reduced-motion`.
- Avoid decorative motion that makes study work feel slower.

## Verification Plan

Baseline gates:
- `npm install` or `npm ci` succeeds.
- `npm run lint` succeeds.
- `npm test` succeeds.
- `npm run build` succeeds.

Auth gates:
- Unauthenticated page and API requests redirect or fail closed.
- Authenticated login/logout works.
- Expired or tampered cookies fail closed.
- Mutating requests reject bad origin or CSRF conditions.

Sync gates:
- Writing on one browser/device appears on another within the polling window.
- Page close/reopen restores unsent writing from the server.
- Stale writes produce conflict state instead of silent overwrite.
- Network failure shows offline/saving error state and recovers.

Upload gates:
- Drag, paste, file picker, multi-file, retry, cancel, and duplicate filenames are covered.
- Uploaded files are immediately visible on the day page.
- Downloads cannot escape the upload root.
- Large files stream safely.

Responsive gates:
- Verify desktop, tablet, and phone layouts at representative widths: 390px, 768px, 1180px, and wide desktop.
- Check day page, capture panel, calendar, views, asset list/gallery, and login page.
- Capture remains reachable on phone and tablet.

Learning gates:
- Review and mistake actions update next review and mastery state.
- The final briefing explains learning-design improvements, remaining trade-offs, and next iteration options.

## Git and Iteration Plan

- Keep temporary `.superpowers/` files ignored.
- Commit the design spec before implementation.
- Use a feature branch or isolated worktree for implementation.
- Implement in small commits by phase:
  1. baseline and Next 16 auth/proxy cleanup
  2. migrations and session foundation
  3. safe asset upload/download
  4. autosync drafts and polling
  5. responsive day cockpit and motion
  6. learning-loop upgrades
  7. final briefing and verification
- At the end of each phase, run the relevant verification gates and record findings in the final briefing.

## Open Decisions for Implementation

- Whether to introduce SSE after polling has been verified.
- Whether OCR and full-text search belong in this milestone or a follow-up.
- Whether passkeys should be included now or left as a later auth upgrade.
- Whether conflict resolution should initially be modal, inline field-level, or a small review drawer.
