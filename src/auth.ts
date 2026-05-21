import NextAuth from "next-auth";
import type { Adapter, AdapterUser } from "next-auth/adapters";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Discord from "next-auth/providers/discord";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, accounts, sessions, verificationTokens, guilds } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logAudit } from "@/lib/audit";
import {
  decryptEmail,
  encryptEmail,
  hashEmail,
  isEmailCryptoConfigured,
} from "@/lib/email-crypto";
import { verifyPassword } from "@/lib/password-policy";

// Canonical public hostname. Requests arriving on any other Host get
// 308-redirected here so OAuth callbacks, cookies, and absolute URLs all
// resolve consistently. Local development hostnames are exempt.
const CANONICAL_HOST = "rallyup.win";

function isLocalHost(host: string): boolean {
  const bare = host.split(":")[0];
  return (
    bare === "localhost" ||
    bare === "127.0.0.1" ||
    bare === "0.0.0.0" ||
    bare.endsWith(".local")
  );
}

const baseAdapter = DrizzleAdapter(db, {
  usersTable: users,
  accountsTable: accounts,
  sessionsTable: sessions,
  verificationTokensTable: verificationTokens,
});

// Email is stored in two derived columns — `email_hash` (HMAC for lookup)
// and `email_encrypted` (AES-GCM for the reset flow). Plaintext is still
// written to `users.email` during this transition migration so OAuth +
// adapter code can fall back if email-crypto isn't configured yet; a
// follow-up migration will drop that column once the hash flow is fully
// validated. These helpers centralize the "extract the plaintext email
// for an AdapterUser" logic.

function plaintextEmailOf(row: typeof users.$inferSelect): string {
  // Prefer the recoverable encrypted column. Fall back to the legacy
  // plaintext column (during transition) or empty string. Auth.js's
  // `AdapterUser.email` is typed string, not nullable — but we never use
  // the value for actual messaging, only for shape compatibility, so the
  // empty-string fallback is fine.
  if (row.emailEncrypted) {
    const decrypted = decryptEmail(row.emailEncrypted);
    if (decrypted) return decrypted;
  }
  return row.email ?? "";
}

function rowToAdapterUser(row: typeof users.$inferSelect): AdapterUser {
  return {
    id: row.id,
    name: row.name,
    email: plaintextEmailOf(row),
    emailVerified: row.emailVerified ?? null,
    image: row.image,
  } as AdapterUser;
}

// Wrapped adapter overrides:
//   - getUserByEmail / createUser / updateUser route email through the
//     hash + encrypted columns. Plaintext is also written during the
//     transition so the column drop later is a no-op.
//   - getUserByAccount adds the Discord stub-claim fallback (a stub user
//     pre-created by an admin with the player's snowflake, but no
//     account row yet).
const adapter: Adapter = {
  ...baseAdapter,
  async getUserByEmail(email) {
    if (!email) return null;
    // If email-crypto isn't configured yet (operator hasn't set the env
    // vars), fall back to the legacy plaintext column so OAuth keeps
    // working. The startup log will have already warned that the
    // PII-protection migration is incomplete.
    if (!isEmailCryptoConfigured()) {
      return baseAdapter.getUserByEmail!(email);
    }
    let hash: string;
    try {
      hash = hashEmail(email);
    } catch {
      return null;
    }
    const row = await db.query.users.findFirst({
      where: eq(users.emailHash, hash),
    });
    if (!row) return null;
    return rowToAdapterUser(row);
  },
  async createUser(user) {
    const insertable: typeof users.$inferInsert = {
      id: user.id,
      name: user.name ?? null,
      image: user.image ?? null,
      emailVerified: user.emailVerified ?? null,
    };
    if (user.email && isEmailCryptoConfigured()) {
      // Write all three columns during transition; future migration
      // will drop the plaintext one.
      insertable.email = user.email;
      insertable.emailHash = hashEmail(user.email);
      insertable.emailEncrypted = encryptEmail(user.email);
    } else if (user.email) {
      insertable.email = user.email;
    }
    const inserted = await db.insert(users).values(insertable).returning();
    return rowToAdapterUser(inserted[0]);
  },
  async updateUser(user) {
    const updates: Partial<typeof users.$inferInsert> = {};
    if (user.name !== undefined) updates.name = user.name;
    if (user.image !== undefined) updates.image = user.image;
    if (user.emailVerified !== undefined)
      updates.emailVerified = user.emailVerified;
    if (user.email !== undefined) {
      // Keep all three columns in sync during transition.
      updates.email = user.email;
      if (user.email && isEmailCryptoConfigured()) {
        updates.emailHash = hashEmail(user.email);
        updates.emailEncrypted = encryptEmail(user.email);
      } else if (!user.email) {
        updates.emailHash = null;
        updates.emailEncrypted = null;
      }
    }
    if (!user.id) {
      throw new Error("updateUser called without user id");
    }
    const updated = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, user.id))
      .returning();
    return rowToAdapterUser(updated[0]);
  },
  async getUserByAccount(providerAccountId) {
    const existing = await baseAdapter.getUserByAccount!(providerAccountId);
    if (existing) return existing;
    if (providerAccountId.provider !== "discord") return null;
    const stub = await db.query.users.findFirst({
      where: eq(users.discordUserId, providerAccountId.providerAccountId),
    });
    if (!stub) return null;
    return rowToAdapterUser(stub);
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  adapter,
  // Credentials provider always writes a JWT into authjs.session-token, never
  // a sessions-table row. Without this explicit override, the adapter causes
  // Auth.js to default to strategy:"database", which reads the token as a
  // random session ID, looks it up in the sessions table, finds nothing, and
  // returns null. JWT strategy makes all providers (OAuth included) use signed
  // tokens — the sessions table is unused for new logins.
  session: { strategy: "jwt" },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      // Auto-link an OAuth sign-in to an existing user row when the email
      // matches. Required for admin-created "stub" members to auto-claim
      // when the player signs in via Google. Safe here because Google
      // returns verified emails — an attacker can't forge ownership of an
      // address they don't actually control. The same trust property holds
      // for Discord below. Tradeoff documented in github issue #7.
      allowDangerousEmailAccountLinking: true,
    }),
    Discord({
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
    Credentials({
      // Username + password sign-in. Hybrid with OAuth: one user row can
      // have any combination of (passwordHash, Google account, Discord
      // account). Signup happens at /api/auth/signup; this provider only
      // authenticates already-created users.
      //
      // The `id` here is the provider name in the URL — keep it stable
      // since the credentials sign-in form posts to
      // /api/auth/callback/credentials.
      id: "credentials",
      name: "Username + password",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(rawCredentials) {
        const username =
          typeof rawCredentials?.username === "string"
            ? rawCredentials.username.trim().toLowerCase()
            : "";
        const password =
          typeof rawCredentials?.password === "string"
            ? rawCredentials.password
            : "";
        if (!username || !password) return null;

        const row = await db.query.users.findFirst({
          where: eq(users.username, username),
        });
        if (!row || !row.passwordHash) return null;
        const ok = await verifyPassword(password, row.passwordHash);
        if (!ok) return null;

        // Return the AdapterUser-shaped object Auth.js expects. The session
        // adapter takes over from here — issues a session cookie, fires
        // the signIn event, etc.
        return {
          id: row.id,
          name: row.name,
          email: plaintextEmailOf(row),
          image: row.image,
        };
      },
    }),
  ],
  // Custom signin page overrides Auth.js's built-in /api/auth/signin route
  // so the brand chrome (atmospheric hero, wordmark) carries through the
  // auth flow. Links to /api/auth/signin still resolve — Auth.js redirects
  // them here.
  pages: {
    signIn: "/signin",
  },
  events: {
    // Two concerns folded into one read:
    //   1. Mirror Discord OAuth's providerAccountId (the snowflake) onto
    //      users.discord_user_id — canonical source for bot DM targeting.
    //      Idempotent.
    //   2. Detect a stub-claim: when an admin pre-created this row, the
    //      OAuth fields (name/image/email) were never populated. On the
    //      first sign-in we backfill what's missing, clear the stub
    //      markers, and audit the merge.
    async signIn({ user, account }) {
      if (!user?.id) return;
      const row = await db.query.users.findFirst({
        where: eq(users.id, user.id),
      });
      if (!row) return;

      const updates: Partial<typeof users.$inferInsert> = {};
      if (
        account?.provider === "discord" &&
        account.providerAccountId &&
        row.discordUserId !== account.providerAccountId
      ) {
        updates.discordUserId = account.providerAccountId;
      }

      const isStubClaim = !!row.stubCreatedAt;
      if (isStubClaim) {
        updates.stubCreatedAt = null;
        updates.stubCreatedByUserId = null;
        if (!row.name && user.name) updates.name = user.name;
        if (!row.image && user.image) updates.image = user.image;
        // Email backfill on stub-claim: check the hash column (canonical)
        // rather than the plaintext column (transitional). Populate all
        // three so the row is consistent regardless of which path reads
        // it next.
        if (!row.emailHash && user.email) {
          updates.email = user.email;
          if (isEmailCryptoConfigured()) {
            updates.emailHash = hashEmail(user.email);
            updates.emailEncrypted = encryptEmail(user.email);
          }
        }
      }

      if (Object.keys(updates).length > 0) {
        await db.update(users).set(updates).where(eq(users.id, user.id));
      }

      if (isStubClaim) {
        const display =
          row.inGameName ?? user.name ?? user.email ?? user.id;
        void logAudit({
          guildId: row.guildId,
          actorUserId: user.id,
          actorDisplay: display,
          action: "member.stub_claim",
          entityType: "member",
          entityId: user.id,
          entityLabel: display,
          changes: {
            before: {
              stubCreatedByUserId: row.stubCreatedByUserId,
              stubCreatedAt: row.stubCreatedAt,
            },
            after: {
              provider: account?.provider ?? null,
              providerAccountId: account?.providerAccountId ?? null,
            },
          },
        });
      }
    },
  },
  callbacks: {
    // Runs from src/proxy.ts (the Next.js 16 proxy/middleware entrypoint).
    // Two concerns:
    //   1. Host canonicalization — redirect anything that isn't rallyup.win
    //      or a local-dev hostname to the canonical domain. Belt-and-
    //      suspenders for stray traffic on fly.dev or stale bookmarks.
    //   2. Public-path allowlist. Auth.js's default behavior on `false` is
    //      to bounce signed-out users to /api/auth/signin BEFORE the page
    //      component runs — so a signed-out landing page never gets a
    //      chance to render unless we whitelist its route here. Add new
    //      public surfaces to this list when they're built.
    authorized({ auth, request }) {
      const host = request.headers.get("host") ?? "";
      if (host !== CANONICAL_HOST && !isLocalHost(host)) {
        const url = request.nextUrl.clone();
        url.host = CANONICAL_HOST;
        url.protocol = "https:";
        url.port = "";
        // 308 preserves method + body so misrouted POSTs follow through
        // instead of silently dropping data.
        return NextResponse.redirect(url, 308);
      }
      const pathname = request.nextUrl.pathname;
      const PUBLIC_PATHS = new Set(["/", "/tos", "/privacy", "/signin", "/signup"]);
      if (PUBLIC_PATHS.has(pathname)) return true;
      return !!auth;
    },
    async session({ session, user, token }) {
      if (session.user) {
        try {
          // OAuth (database sessions): `user` is the full DB row at runtime —
          // DrizzleAdapter returns all columns even though the type says AdapterUser.
          // Credentials (JWT sessions): `user` is undefined; Auth.js v5 credentials
          // always encode a JWT rather than a DB session, so we look up by token.sub.
          let row: typeof users.$inferSelect | null | undefined;
          if (user) {
            row = user as typeof users.$inferSelect;
          } else if (token?.sub) {
            row = await db.query.users.findFirst({
              where: eq(users.id, token.sub),
            });
          }

          if (!row) {
            console.warn("[session] no DB row found", {
              strategy: user ? "database" : "jwt",
              sub: token?.sub,
            });
            return session;
          }

          session.user.id = row.id;
          session.user.inGameName = row.inGameName ?? null;
          session.user.guildId = row.guildId ?? null;
          session.user.guildRole = row.guildRole ?? null;
          session.user.isSuperAdmin = row.isSuperAdmin === true;
          if (row.guildId) {
            const guild = await db.query.guilds.findFirst({
              where: eq(guilds.id, row.guildId),
              columns: { slug: true },
            });
            session.user.guildSlug = guild?.slug ?? null;
          } else {
            session.user.guildSlug = null;
          }
        } catch (err) {
          // If this callback throws, Auth.js clears the session cookie — never
          // let it propagate. Log so we can diagnose, then fall through with
          // the basic session (user stays signed in, custom fields absent).
          console.error("[session] callback error — returning basic session", err);
        }
      }
      return session;
    },
  },
});
