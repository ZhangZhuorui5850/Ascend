# Modern Learning OS Frontend Implementation Plan

> Status: approved direction; execute autonomously and present only the final review.

## Goal

Turn the existing card-heavy desktop dashboard into a calm, modern, action-first learning OS across desktop, tablet, and mobile, while preserving the verified multi-user/Admin security model.

## Task 1: Semantic Design System and Stable CSS Architecture

**Files:** `src/app/globals.css`, create `src/styles/tokens.css`, `src/styles/primitives.css`, `src/styles/calendar.css`, and component CSS modules as needed.

- Define light/dark semantic colors, 8px spacing, typography, radii, elevation, motion and focus tokens.
- Support `light`, `dark`, and `system` without a flash of incorrect theme.
- Keep builds network-independent with a high-quality system font stack.
- Add reduced-motion and high-contrast-safe focus behavior.
- Split the oversized global stylesheet progressively without breaking domain layouts.

## Task 2: Modern Application Shell

**Files:** `src/components/AppShell.tsx`, `src/components/Sidebar.tsx`, create `TopBar`, `CommandPalette`, `ThemeSwitcher`, and shell module styles.

- Collapsible desktop sidebar with icon-only mode.
- Contextual top bar with breadcrumbs, global command trigger, theme and account actions.
- Mobile bottom navigation with a More sheet and a clear capture action.
- Capture becomes an on-demand drawer at all breakpoints.
- Admin navigation stays completely separate from ordinary learning navigation.
- Add `Cmd/Ctrl+K` navigation and quick-action palette.

## Task 3: Feedback and Interaction Primitives

**Files:** create shared Toast provider, EmptyState, StatusBadge, Dialog, Skeleton and route loading/error boundaries.

- Standardize success/error feedback and pending states.
- Replace browser confirm in high-value flows with accessible confirmation dialogs where practical.
- Add route-level loading and error recovery without destroying the shell.
- Preserve input on validation failures and expose errors with `aria-live`.

## Task 4: Action-First Home and Today Workspace

**Files:** `src/app/page.tsx`, `src/app/day/[date]/page.tsx`, `HomeClock`, `DayTasks`, `ReviewQueue`, `QuickLog`, `DayJournal`, `DayNotes` and scoped styles.

- Home hero answers “what should I do next?” and demotes decorative time/stat cards.
- Group due reviews, mistakes, tasks and the primary next action above the fold.
- Show subjects by risk/progress rather than a dense equal-weight list.
- Today workspace uses a primary task column plus contextual queue/activity rail.
- Mobile uses compact sections and progressive disclosure to reduce scroll length.

## Task 5: Knowledge, Files, Analytics and Calendar

**Files:** subject pages/workbench, `FileExplorer`, analytics, mistakes, calendar and scoped styles.

- Knowledge uses a readable tree/detail model and mobile drill-down.
- Files gain a cleaner toolbar, selection/details behavior and touch-safe rows.
- Analytics establishes clear KPI hierarchy and avoids undifferentiated card grids.
- Calendar gets quieter chrome and stronger day/status readability.

## Task 6: Admin, Login, Invitation and Account Polish

**Files:** Admin pages/components, login/invite/password pages, Sidebar/Admin styles.

- Admin uses a real table/list hierarchy, clear status badges and guarded destructive actions.
- Always show target identity when managing a user.
- Login/invite/password flows share a polished, trustworthy auth shell.
- Add a read-only user workspace summary entry point for Admin.

## Task 7: Visual and Accessibility Gate

- Run unit tests, lint and production build.
- Extend responsive audit to home, today, files, Admin and auth at 1440/1024/390 widths.
- Run smoke and multi-user audit on an isolated production instance.
- Capture final screenshots for desktop and mobile review.
- Verify keyboard navigation, visible focus, no horizontal overflow, reduced motion, and light/dark rendering.
- Commit each coherent slice and leave the user's pre-existing `docker-compose.yml` edit untouched.

