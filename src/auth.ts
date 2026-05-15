import NextAuth from "next-auth";
import type { Adapter, AdapterUser } from "next-auth/adapters";
import Google from "next-auth/providers/google";
import Discord from "next-auth/providers/discord";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/db";
import { users, accounts, sessions, verificationTokens, guilds } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logAudit } from "@/lib/audit";

const baseAdapter = DrizzleAdapter(db, {
  usersTable: users,
  accountsTable: accounts,
  sessionsTable: sessions,
  verificationTokensTable: verificationTokens,
});

// Wrapped adapter: when a Discord sign-in has no matching `accounts` row,
// fall back to matching the OAuth snowflake against a stub user's
// `users.discord_user_id`. If we find one, Auth.js will then linkAccount
// onto that stub row instead of creating a fresh user — that's the
// auto-claim. Google stubs still flow through the default email-based
// linking path in DrizzleAdapter.getUserByEmail.
const adapter: Adapter = {
  ...baseAdapter,
  async getUserByAccount(providerAccountId) {
    const existing = await baseAdapter.getUserByAccount!(providerAccountId);
    if (existing) return existing;
    if (providerAccountId.provider !== "discord") return null;
    const stub = await db.query.users.findFirst({
      where: eq(users.discordUserId, providerAccountId.providerAccountId),
    });
    if (!stub) return null;
    return {
      id: stub.id,
      name: stub.name,
      email: stub.email ?? "",
      emailVerified: stub.emailVerified ?? null,
      image: stub.image,
    } as AdapterUser;
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  adapter,
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
        if (!row.email && user.email) updates.email = user.email;
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
    // Public-path allowlist. Auth.js's default behavior on `false` is to
    // bounce signed-out users to /api/auth/signin BEFORE the page
    // component runs — which means a signed-out landing page never gets a
    // chance to render unless we whitelist its route here. Add new
    // public surfaces to this list when they're built.
    authorized({ auth, request }) {
      const pathname = request.nextUrl.pathname;
      const PUBLIC_PATHS = new Set(["/", "/tos", "/privacy", "/signin"]);
      if (PUBLIC_PATHS.has(pathname)) return true;
      return !!auth;
    },
    async session({ session, user }) {
      if (session.user) {
        const u = user as typeof users.$inferSelect;
        session.user.id = u.id;
        session.user.inGameName = u.inGameName ?? null;
        session.user.guildId = u.guildId ?? null;
        session.user.guildRole = u.guildRole ?? null;
        session.user.isSuperAdmin = u.isSuperAdmin === true;
        if (u.guildId) {
          const guild = await db.query.guilds.findFirst({
            where: eq(guilds.id, u.guildId),
            columns: { slug: true },
          });
          session.user.guildSlug = guild?.slug ?? null;
        } else {
          session.user.guildSlug = null;
        }
      }
      return session;
    },
  },
});
