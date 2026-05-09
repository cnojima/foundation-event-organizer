# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Shadowfront Signup — a website for signing up to two squads (20 players + 10 backups each, 3 leadership slots per squad). Players stack-rank their squad preference and can request leadership roles. Admins manage events, track attendance, and rate players.

## Commands

- `npm run dev` — start dev server (Next.js)
- `npm run build` — production build
- `npm run lint` — ESLint
- `npx tsc --noEmit` — type check
- `npm run db:push` — push schema changes to SQLite
- `npm run db:generate` — generate Drizzle migrations
- `npm run db:studio` — open Drizzle Studio (DB browser)

## Architecture

Next.js 16 App Router with SQLite (better-sqlite3 + Drizzle ORM). Auth via Auth.js (NextAuth v5) with Google and Discord OAuth providers.

- `src/db/schema.ts` — single source of truth for all tables (users, accounts, sessions, events, signups)
- `src/db/index.ts` — Drizzle client singleton; DB file lives at `data/app.db`
- `src/auth.ts` — Auth.js config with OAuth providers and Drizzle adapter
- `src/lib/admin.ts` — admin check helper (reads `is_admin` column on users table)
- `src/lib/ids.ts` — ID generation (crypto random hex)

### Routes

- `/` — public event listing
- `/event/[id]` — event detail + signup form (requires auth)
- `/admin` — admin dashboard (create events, view all events)
- `/admin/event/[id]` — admin event detail (view signups, track attendance, rate players)
- `/api/auth/[...nextauth]` — Auth.js handlers
- `/api/signups` — POST/PUT for player signups
- `/api/admin/events` — POST to create events
- `/api/admin/signups` — PATCH to update attendance/rating/assignment

### Key Design Decisions

- Admin routes are protected by middleware (`src/middleware.ts`) that requires auth, plus an `isAdmin()` check at the page/API level.
- Signup preferences use integer columns (`squad1_preference`, `squad2_preference`) with values 1 or 2 to represent stack rank order.
- Dates are stored as ISO strings in SQLite text columns.
- The `data/` directory is gitignored — the SQLite DB is local only.

## Setup

1. Copy `.env.local.example` to `.env.local` and fill in OAuth credentials
2. Run `npx auth secret` to generate AUTH_SECRET
3. Run `npm run db:push` to initialize the database
4. To make a user admin, update their `is_admin` field in the DB directly (via `npm run db:studio`)
