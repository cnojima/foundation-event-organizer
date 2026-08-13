# PRD: Migration Tracker

## Summary

A public page where players declare intent to migrate from their current server to a destination server, and everyone can see how much room is left in each power tier before the destination's migration caps are hit. Each destination server has one or more elected/assigned **Immigration Officers** who review applications player-by-player — accepting, denying, or waitlisting — in roughly the order they applied. Today this whole process is tracked by hand in a Google Sheet; this section gives it a real submission flow, an officer review queue, a live "room left" view, and basic spam control, all without requiring applicants to have an account.

MVP scope is a single destination server: Guild **#1130**.

## Goals

- Anyone can view current migration intent and remaining capacity per player power tier, without signing in.
- Anyone can submit a migration application without an account (true crowd-sourcing, matching how the Sheet works today).
- An applicant can edit or withdraw their own application later without needing to log in.
- Each destination server has Immigration Officers — signed-in users assigned by a guild admin — who review applications in a queue sorted oldest-first per tier, and decide Accepted / Denied / Waitlisted on a player-by-player basis.
- When a tier's cap is already reserved, additional applicants are automatically placed on a separate per-tier waitlist rather than piling up against a maxed-out cap.
- Guild admins can moderate entries (remove spam/duplicates/bad data), assign/revoke Immigration Officers, and manage tier thresholds and destination allocations.
- "Room left" per tier reflects **applied + accepted** applicants against the cap — an application reserves a spot the moment it's submitted, and an officer's Accept just confirms it (Deny frees the spot back up).

## Non-goals (MVP)

- Multiple destination servers in the UI. The data model should not hard-block this, but MVP only ships one destination (#1130) and one set of allocations.
- Verifying a submitter's self-reported power number against any authoritative source.
- Requiring an account to *apply*. Applying stays accountless; reviewing (Immigration Officer) and moderating (guild admin) both require a signed-in app user.
- Historical/analytics views (e.g. migration trends over time). Just current state.
- Automated duplicate detection beyond what a human moderator can eyeball in the admin view.
- Automatic waitlist *promotion*. Assignment *to* the waitlist on a full tier is automatic (see Terminology), but pulling someone back off the waitlist when a slot frees is a manual officer action (see Open Questions if this needs revisiting).

## Terminology

Two separate classification systems are in play — don't conflate them:

**Player power tier** — describes an individual migrating player ("Trader"). Self-reported as a raw power number; the app derives the tier from thresholds. Two label sets are used for the same 4 tiers (flavor name in player-facing UI, generic name in the allocation table):

| Flavor name | Generic name | Threshold |
|---|---|---|
| Revivalist | Ultra-High-Power Trader | Above 110M |
| Contributor | High-Power Trader | 90M–110M |
| Pioneer | Mid-Power Trader | 43M–90M |
| Follower | Low-Power Trader | Below 43M |

Thresholds are admin-editable (power creep will likely shift these over time).

**Server classification** — describes a *destination* server's own power bracket, independent of any individual player. Determines the default inbound slot caps per player tier:

| Server classification | Ultra-High-Power | High-Power | Mid-Power | Low-Power |
|---|---|---|---|---|
| High-power server | 1 | 3 | 30 | 40 |
| Mid-power server | 2 | 5 | 40 | 60 |
| Low-power server | 3 | 8 | 60 | 80 |

These are default caps for a server of that classification; an admin can override individual numbers for a specific destination server if it deviates from the standard table.

**#1130's own classification (High/Mid/Low-power server) is not yet officially known.** Default it to **Mid-power server** for MVP (caps: 2 / 5 / 40 / 60) so the tracker shows real numbers from day one. An admin can reclassify it — which re-seeds `migration_allocations` from the new default row in `classification_default_allocations` — once official word comes down.

**Immigration Officer** — a signed-in app user assigned by a guild admin to review applications for a specific destination server. Distinct from the guild-admin role: an officer can act on the application queue (Accept/Deny/Waitlist) but doesn't automatically get the rest of guild-admin's powers (spam moderation, threshold/allocation edits, assigning other officers) unless they separately hold that role. Guild admins can always act as an officer too.

**Applicant status** — the lifecycle of one migration application:

| Status | Meaning | Counts against cap? |
|---|---|---|
| `applied` | Set automatically the moment a player submits themselves — this is the "player adds themselves to the list" state, no officer action yet. Reserves a spot immediately, as long as the tier isn't already full. | Yes |
| `waitlisted` | Set **automatically** at submission time if the tier's `applied + accepted` count is already at cap — the applicant never occupies a reserved spot. An officer can also manually move someone here (e.g. to bump a spot for a higher-priority applicant), which frees the spot they were holding. Sits in a separate per-tier, oldest-first waitlist. | No |
| `accepted` | Officer confirmed the application. Functionally the same reservation as `applied` for capacity purposes — Accept doesn't change the room math, it just signals a formal decision. | Yes |
| `denied` | Officer rejected the application, freeing any spot it was holding. Terminal (see Open Questions on reversibility). | No |
| `withdrawn` | Applicant self-withdrew via their edit link, freeing any spot it was holding. Terminal. | No |
| `removed_by_admin` | Guild admin removed the row for data-hygiene reasons (spam, duplicate, garbage input) — distinct from `denied`, which is a legitimate immigration decision made by an officer. Frees any spot it was holding. | No |

Other terms:

| Term | Meaning |
|---|---|
| **Source server** | The server a player is currently on. Free text at submission (not a managed list for MVP). |
| **Destination server** | The server a player intends to migrate to. Fixed to #1130 for MVP. |
| **Migration application** (a.k.a. migration intent) | One submitted line item: a player's application to migrate, with a self-reported power number, a source server, and a status. |

## User-facing flows

### 1. Public tracker page — `/migration-tracker`

- No auth required.
- Shows, per player power tier: the destination's slot cap, number of reserved spots (`applied + accepted`), and room remaining (`cap - (applied + accepted)`). Also shows the `waitlisted` count per tier, so people can gauge how competitive a tier is once it's full. Remaining can go negative only in the override case where an admin later lowers a cap below an already-reserved count — display as-is rather than clamping.
- No individual applicant list on the public page — only the aggregate counts above. Showing names/order publicly would expose someone as trying to leave their current server before anything's decided, and could invite lobbying or gaming based on visible queue position. The full per-applicant list (name, source server, power tier, status, submitted date, queue order) is officer/admin-only (see §4–5).
- A visible "Apply to migrate" CTA linking to the submission form.

### 2. Submission form — `/migration-tracker/submit`

Fields:
- Player name (text, required)
- Source server (text, required)
- Destination server — fixed/hidden as #1130 for MVP
- Power (number, required) — the app derives the player's tier from current thresholds; the tier name is shown back to the submitter as confirmation ("You're classified as: Pioneer") rather than picked from a dropdown
- Contact / Discord handle (optional, free text) — helps officers reach an applicant with questions, and helps other players self-dedupe

On successful submit, the app checks the destination tier's current `applied + accepted` count against its cap:
- **Room available** → application is created with status `applied`, immediately reserving a spot and ordered into that tier's officer review queue by submission time (oldest first).
- **Cap already reserved** → application is created with status `waitlisted` instead, automatically — no officer action needed to land someone on the waitlist when they apply into a full tier.

Either way, the submitter is shown (and ideally can copy) a private edit link: `/migration-tracker/edit/<token>`. This is the only way to reach that link again — no email/login to recover it, so the page should say so clearly ("save this link, you won't see it again").

### 3. Edit/withdraw — `/migration-tracker/edit/[token]`

- No auth; possession of the token is the authorization.
- Lets the applicant update their fields (source server, power, contact) or withdraw the application. Updating power re-derives the tier.
- Withdrawn applications stop appearing in the officer queue and drop off the public list, but are retained (soft-deleted) rather than hard-deleted.
- Open question: should editing be locked (or at least flagged for re-review) once an officer has already made a decision, since changing power after acceptance could silently move someone into a different tier's cap? See Open Questions.

### 4. Officer review queue — `/admin/migration-tracker/queue`

- Gated to Immigration Officers (for their assigned destination) and guild admins.
- One queue per power tier, sorted oldest-first (`applied` applications, since those already hold a reserved spot pending confirmation). Sorting is a convenience/fairness aid, not enforced — an officer can act on any applicant in any order.
- Per applicant, the officer can set status to `accepted` (confirm — no change to room math), `denied` (frees their reserved spot), or `waitlisted` (manually bumps them off their reserved spot, e.g. to make room for a higher-priority applicant), optionally with a short note (visible to other officers/admins, not to the public).
- A separate waitlist view per tier lets an officer manually promote a `waitlisted` applicant to `applied`/`accepted` once room exists — nothing promotes automatically. Room freed by a denial, withdrawal, or removal just shows up as increased room-remaining until an officer acts on it.

### 5. Admin — `/admin/migration-tracker`

- Guild-admin gated (reuse existing RBAC from `src/lib/rbac.ts`).
- **Applications tab**: everything the officer queue shows, plus the ability to remove/hide an entry (spam, duplicate, bad data) — status `removed_by_admin`.
- **Officers tab**: assign/revoke Immigration Officers for the destination (search existing app users by name/Discord).
- **Settings tab**: destination's classification (High/Mid/Low-power server), per-tier slot cap overrides, and power tier thresholds.

## Data model (sketch)

Given the moderation view, officer review queue, and per-submitter edit-token requirement, this needs real backing storage — a Sheet alone can't hand out per-row secret edit links, gate a review queue, or track officer decisions. Recommend building native tables now rather than an abstraction over the Sheet; flag if you'd rather keep the Sheet as source of truth and treat the app as a read-only mirror instead (that would drop the self-serve apply/edit and officer-review flows from this PRD).

Sketch, not final:

```ts
// destinations get their own row so multi-destination isn't precluded later,
// even though MVP only ever has one.
migration_destinations {
  id: text (pk)
  name: text                 // "Server #1130"
  classification: text enum('high', 'mid', 'low')  // defaults to 'mid' for #1130 until admin sets the real value
  created_at: text
}

// admin-editable; power creep means these thresholds move over time
power_tier_thresholds {
  tier: text enum('ultra_high', 'high', 'mid', 'low') (pk)
  flavor_name: text           // "Revivalist" / "Contributor" / "Pioneer" / "Follower"
  min_power: integer nullable // null for the bottom tier ("below 43M")
}

// the standard table of default caps by server classification x player tier;
// admin-editable, seeded from the values above
classification_default_allocations {
  classification: text enum('high', 'mid', 'low')
  tier: text enum('ultra_high', 'high', 'mid', 'low')
  max_slots: integer
  // pk: (classification, tier)
}

// per-destination caps; pre-filled from classification_default_allocations
// when a destination's classification is set, but independently overridable
migration_allocations {
  destination_id: text (fk -> migration_destinations.id)
  tier: text enum('ultra_high', 'high', 'mid', 'low')
  max_slots: integer
  // pk: (destination_id, tier)
}

// who can review applications for a destination; guild admins assign these
migration_officers {
  destination_id: text (fk -> migration_destinations.id)
  user_id: text (fk -> users.id)     // must be a signed-in app user
  assigned_by_user_id: text (fk -> users.id)
  created_at: text
  // pk: (destination_id, user_id)
}

migration_applications {
  id: text (pk)
  destination_id: text (fk -> migration_destinations.id)
  player_name: text
  source_server: text
  power: integer               // raw self-reported number
  tier: text enum('ultra_high', 'high', 'mid', 'low')  // derived from power at submit/edit time, using thresholds in effect then
  contact: text nullable
  status: text enum('applied', 'waitlisted', 'accepted', 'denied', 'withdrawn', 'removed_by_admin')
  reviewed_by_user_id: text nullable (fk -> users.id)  // officer/admin who last set accepted/denied/waitlisted
  reviewed_at: text nullable
  review_note: text nullable   // internal, not shown to the public
  edit_token: text (unique)    // random, shown once, used as bearer for the edit route
  created_at: text             // also the FIFO ordering key within a tier's queue
  updated_at: text
}
```

Remaining room per tier = `migration_allocations.max_slots - count(applications where destination_id = X and tier = Y and status in ('applied', 'accepted'))`. At submission time, if this would go below zero, the new application is created as `waitlisted` instead of `applied`.

## Open questions

1. **Sheet vs. native storage** — see note above under Data model. This PRD assumes native storage to support edit tokens, the officer queue, and moderation; confirm that's acceptable versus keeping the Sheet authoritative.
2. **#1130's classification** — defaulting to Mid-power server for MVP (see Terminology); confirm this default is reasonable until official classification is announced, and that guild admins should be able to change it from `/admin/migration-tracker`.
3. **Duplicate handling** — no automated dedupe planned for MVP (officer/moderator eyeballs it). Is that enough, or do we want a lightweight warning at submission ("a similar name already exists") before it hits the queue?
4. **Threshold change behavior** — when an admin edits power thresholds, should existing applications' stored `tier` be re-derived from their stored `power` (retroactively reclassifying), or left as-is until the applicant next edits? Recommend re-deriving in bulk on threshold change, so counts stay consistent — but note this could shuffle someone with a reserved (`applied`/`accepted`) spot into a different tier's cap, possibly pushing it over; needs a rule (e.g. reserved applications are frozen and excluded from retroactive re-derivation).
5. **Editing after review** — should an applicant be able to change their power number (and thus tier) after an officer has already set a decision? Leaning toward: once `accepted` or `denied`, lock `power`/tier edits (source server/contact can still be edited), and any further change requires contacting an officer. Confirm.
6. **Reversing a decision / re-promoting into a full tier** — can an officer move a `denied` or `waitlisted` application back to `applied`/`accepted` later, e.g. if they made a mistake or a slot frees up? Assume yes (officers can always change status, and can knowingly exceed cap — flagged but not blocked), but confirm there's no "final and locked" requirement.
7. **Negative remaining room** — confirm the display behavior when a tier's accepted count exceeds its cap (an admin-caused edge case, since caps can be lowered after the fact) — show negative number vs. "Over capacity" badge vs. something else.
8. **Rate limiting / abuse** — no login means no per-applicant throttle on submission. Is IP-based rate limiting on the submit endpoint worth adding for MVP, or is admin moderation sufficient?
9. **Officer notifications** — out of scope for MVP (see below), but worth flagging: officers currently have to remember to check the queue. Is a Discord ping/notification when new applications arrive needed soon after MVP?

## Out of scope for this PRD (future consideration)

- Multiple destination servers with a chooser on the submission form.
- Migrating the moderation/allocation/officer-assignment UI into `/super-admin` if this ever needs to span guilds rather than live under one guild's admin.
- Any notification (Discord bot ping) when capacity for a tier is nearly full, or when new applications arrive for an officer to review.
- Automatic waitlist promotion when a slot frees up.
