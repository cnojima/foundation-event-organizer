import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Discord from "next-auth/providers/discord";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/db";
import { users, accounts, sessions, verificationTokens, guilds } from "@/db/schema";
import { eq } from "drizzle-orm";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    Discord({
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
    }),
  ],
  events: {
    // When a user signs in via Discord OAuth, mirror their Discord user
    // ID (the snowflake stored as `account.providerAccountId`) onto the
    // users row. That column is the canonical source of truth for bot
    // DM targeting — Google-signup users can also set it manually on
    // /me without needing to OAuth. Idempotent + cheap to run on every
    // Discord sign-in.
    async signIn({ user, account }) {
      if (
        account?.provider === "discord" &&
        account.providerAccountId &&
        user?.id
      ) {
        await db
          .update(users)
          .set({ discordUserId: account.providerAccountId })
          .where(eq(users.id, user.id));
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
      const PUBLIC_PATHS = new Set(["/"]);
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
