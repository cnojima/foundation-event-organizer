import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      inGameName?: string | null;
      guildId?: string | null;
      guildSlug?: string | null;
      guildRole?: "admin" | "member" | null;
      isSuperAdmin?: boolean;
    };
  }
}
