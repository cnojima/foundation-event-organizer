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
  callbacks: {
    authorized({ auth }) {
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
