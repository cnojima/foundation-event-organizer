import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { Footer } from "@/components/layout/footer";
import { AlphaBanner } from "@/components/layout/alpha-banner";
import { MobileNav } from "@/components/layout/mobile-nav";
import { auth } from "@/auth";
import { db } from "@/db";
import { guilds } from "@/db/schema";
import { eq } from "drizzle-orm";
import { InGameNameDialog } from "@/components/in-game-name-dialog";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Shadowfront Signup",
  description: "Squad signup and management",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  const needsInGameName = !!session?.user && !session.user.inGameName;

  let guildName: string | null = null;
  if (session?.user?.guildId) {
    const guild = await db.query.guilds.findFirst({
      where: eq(guilds.id, session.user.guildId),
      columns: { name: true },
    });
    guildName = guild?.name ?? null;
  }

  const sidebarProps = {
    signedIn: !!session?.user?.id,
    guildRole: session?.user?.guildRole ?? null,
    isSuperAdmin: session?.user?.isSuperAdmin === true,
    guildName,
  };

  const feedbackUser = {
    inGameName: session?.user?.inGameName ?? null,
    guildName,
    guildSlug: session?.user?.guildSlug ?? null,
  };

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-white text-gray-900">
        <div className="flex min-h-screen">
          <Sidebar {...sidebarProps} />
          <div className="flex min-w-0 flex-1 flex-col">
            <AlphaBanner />
            <TopBar leftSlot={<MobileNav {...sidebarProps} />} />
            <main className="flex-1 px-4 py-6 sm:px-6">{children}</main>
            <Footer user={feedbackUser} />
          </div>
        </div>
        {needsInGameName && <InGameNameDialog />}
      </body>
    </html>
  );
}
