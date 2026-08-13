# PRD: Migration Tracker — Multi-Server & Migration Windows

## Summary

Extends the Migration Tracker (see [docs/prd-migration-tracker.md](./prd-migration-tracker.md)) in two combined ways: it lets a super-admin turn on tracking for servers beyond #1130, and it reframes what a "destination" actually is. Migration for a server isn't an always-on thing — it's a **bracketed window**: an open date, a close date, and everything in between (applications, capacity, officer review) belongs to that one window alone. A server's migration can open, close, and open again later; each opening is a fresh, isolated event with its own applicant pool and caps, not a continuation of the last one.

This supersedes the routing/creation sketch from the first draft of this doc — the earlier version treated "one destination = one server, forever." That's wrong: a server can have several windows over its lifetime, and only ever one *current* one matters publicly.

## Goals

- A super-admin can open a new migration window for a server (server number, classification, open date, close date) — no deploy required.
- Each window is fully isolated: its own applicant pool, its own capacity caps, its own officer team. Nothing carries over automatically when a server's migration reopens later.
- The public site always shows "the current window" for a server — whichever one is open, or the next upcoming one — with no need to browse history (confirmed: no public archive of past windows for now).
- Once a window's close date passes, it goes fully read-only: no new applications, no self-edit/withdraw, no officer decisions. "No movement is possible" after close, so nothing in the tracker should imply otherwise.
- Existing per-window admin flows (review queue, officers, settings) need no structural change — they already operate on one row's id. This PRD is about how many of those rows can exist and how the public side finds the right one.

## Non-goals

- No public browsing of past or future windows for a server (confirmed — current-window-only). Admins can still reach a closed window's data directly via its stable admin URL for record-keeping; that's not "public browsing."
- No "copy settings/officers from the last window" convenience feature. Every window starts from a blank slate (classification and caps picked fresh, zero officers assigned) — consistent with "isolated event." Worth revisiting later if reopening a server every cycle turns out to be tedious.
- No feature to reopen or extend an already-closed window. If a server needs more migration time, that's a new window, not resurrecting the old one — keeps the "isolated event" and "no movement after close" guarantees simple and absolute.
- No change to application lifecycle, capacity math, or officer actions themselves — all of that is exactly as specified in the original PRD, just now scoped to "this window" instead of implicitly "this server forever."

## Terminology additions

| Term | Meaning |
|---|---|
| **Migration window** | One bracketed enrollment period for a server: a server number, a classification, an open date, and a close date. Everything else (applications, allocations, officers) belongs to exactly one window. Replaces the original PRD's implicit assumption that a "destination" was permanent. |
| **Upcoming** | `now < opensAt`. The window exists and is visible (so people know it's coming), but applications aren't accepted yet. |
| **Open** | `opensAt <= now <= closesAt`. Full functionality: applying, self-edit/withdraw, officer review. |
| **Closed** | `now > closesAt`. Read-only. No new applications, no edits, no officer decisions. |

Status is **derived from the two dates at read time**, not stored — one source of truth, no risk of a stale status field drifting from the actual dates.

A note on "open" vs. "migration is actually happening" — **confirmed as framing only**: a window can legitimately open *before* the game itself enables movement ("open enrollment" can just mean "we're gauging interest and tracking how close to the cap we'll get," not "players are moving right now"). Open and close are the only two bookends that matter for the data model — no third date. The public page's copy just shouldn't imply movement is live purely because the window is open.

## User-facing flows

### 1. Public per-server page — `/migration-tracker/{serverNumber}`

Resolves to whichever window matters right now, in priority order:
1. An **open** window for that server, if one exists — full tracker (capacity, apply CTA).
2. Else the nearest **upcoming** window, if one exists — shows it's coming (open date, classification) with applications disabled until then.
3. Else — no open or upcoming window for this server right now. Plain "not currently tracking migrations" message. (Per the no-history decision, a *closed* window does not keep showing here — once it closes, this URL stops referencing it.)

### 2. Public index — `/migration-tracker`

- Lists servers that currently have an open or upcoming window (not closed ones), links into `/migration-tracker/{serverNumber}`.
- Open and upcoming servers are **listed uniformly, not visually distinguished** — the app doesn't gate or trigger anything in-game, it's purely organizational, so there's no functional reason to call out "apply now" vs. "coming soon" with different treatment. (The per-server page itself, §1, still tells visitors which state they're in once they click through.)
- Empty state if nothing is active anywhere.

### 3. Public submit / edit — unchanged in shape

- `/migration-tracker/{serverNumber}/submit` — only reachable/functional while that server's resolved window (per §1) is **open**. Blocked with a clear message during upcoming or inactive states.
- `/migration-tracker/edit/{token}` — unchanged from the original PRD, no server number in the path (the token already resolves to one specific application on one specific window). Once that window closes, this page's existing "can't edit after a decision" read-only state extends naturally to "can't edit because the window closed" — same UI pattern, new reason.

### 4. Landing / sign-in banner

- The banner shows **any window whose close date hasn't elapsed** — open or upcoming, not just one hardcoded destination. This is the same rule as the public index (§2): both are driven by "not closed yet."
- **Confirmed scaling approach**: the banner stays fixed-height regardless of how many windows are active. With exactly one active window, show that server's specifics directly (today's behavior). With more than one, collapse to a single summary line ("N servers have open migration windows") linking into the `/migration-tracker` index — that's where visitors browse/find their specific server, not in the banner itself. No dropdown or search widget inside the banner.

### 5. Super-admin: open a new migration window

- Fields: server number, classification (no default — explicit pick, per the original multi-server discussion), open date, close date.
- Validation: `closesAt` must be after `opensAt`. **A server can't have two open-or-upcoming windows at once** — creation is blocked if one already exists, so `/migration-tracker/{serverNumber}`'s resolution in §1 is never ambiguous. (A closed window doesn't block a new one.)
- On submit: creates the window row and seeds its 4 tier caps from the classification standard table — same seeding logic the original PRD's reclassify already runs.
- Lives under `/super-admin/...`, same reasoning as before (super-admin-only, site-wide/cross-guild tool).
- **Open/close dates are editable after creation** — same actors who can already manage a window's other settings (a server-admin for that server, or super-admin). This is a correction tool for mistyped dates, not a way to indefinitely extend a window, but note the natural consequence: since status is derived from the dates (per Terminology), correcting a `closesAt` that already elapsed effectively reopens the window — including un-archiving its applications (see §6). That's treated as intended behavior ("I closed it two days early by mistake, fixing the date should undo that"), not a bug to guard against.

### 6. What happens to a window's applications when it closes

- Once `now > closesAt`, every application under that window — regardless of what status it ended in (accepted, denied, applied, waitlisted, withdrawn) — is **logically deleted**: excluded from any default/live/public query, but fully preserved and viewable by admins for audit purposes. Undecided (`applied`/`waitlisted`) applications are **not** auto-transitioned to a terminal status on close — they just stay whatever they were, archived as-is.
- This is derived, not a stored flag or a swept/cron job: "logically deleted" simply means "belongs to a window where `closesAt < now`." The admin view for a window intentionally bypasses that exclusion to show its full historical roster (including capacity numbers as they stood at close) — that view is the audit trail.
- Because this is derived from the window's dates rather than a physical delete, correcting `opensAt`/`closesAt` on an already-closed window (§5) naturally un-archives its applications along with reopening the window itself.

### 7. Admin review of a closed window

- The admin queue/officers/settings pages for a window remain reachable at their existing stable URL (`/admin/migration-tracker/{id}/...`) after it closes — for record-keeping and to see the final state (see §6).
- The *actions* are locked: accept/deny/waitlist/remove, officer assignment, and allocation/classification edits all reject with a "this window is closed" error once `now > closesAt`. Viewing is fine; changing anything except the open/close dates themselves isn't.

## Data model

No new tables needed — this is a set of changes to the existing `migration_destinations` table (see original PRD's schema sketch):

- Drop the `unique()` constraint on `serverNumber` — a server can now have many rows (windows) over time, not one forever.
- Add `opensAt: text (ISO datetime), notNull` and `closesAt: text (ISO datetime), notNull`.
- Everything else (`migrationAllocations`, `migrationOfficers`, `migrationApplications` all FK'ing to this row's id) needs **no structural change** — isolation falls out for free once each row represents one window instead of one eternal server slot.

**Naming**: **decided — keep the existing code names** (`migration_destinations`, `destinationId`, `canManageMigrationDestination`, etc.). "Window" is the product/doc term for what a destination row now represents; no rename across schema, RBAC guards, routes, and pages for no functional gain.

No open questions remain — ready to move to an implementation plan when you are.
