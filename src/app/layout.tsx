import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
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
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Title template wraps child-page titles as "Page — Rally Up". Child
  // pages set just the page-specific part (e.g. title: "Members"); the
  // homepage uses `default` directly.
  title: {
    default: "Rally Up",
    template: "%s — Rally Up",
  },
  description: "Squad signup and management for Foundation Galactic Frontier",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  const locale = await getLocale();
  const messages = await getMessages();
  const needsInGameName = !!session?.user && !session.user.inGameName;

  let guildName: string | null = null;
  let guildTag: string | null = null;
  if (session?.user?.guildId) {
    const guild = await db.query.guilds.findFirst({
      where: eq(guilds.id, session.user.guildId),
      columns: { name: true, tag: true },
    });
    guildName = guild?.name ?? null;
    guildTag = guild?.tag ?? null;
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
      lang={locale}
      // next-themes mutates <html class> before hydration; the server-rendered
      // markup never carries the resolved class, so we silence the warning.
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
        <ThemeProvider>
          {/* Ambient brand backdrop — same radial-glow + hex-grid motif as
              the splash/signin hero, dialed way down so it reads as
              atmosphere on every signed-in page. Signed-out routes (splash,
              signin) skip this since they ship their own self-contained
              hero treatment that we don't want to double-stack. */}
          {session?.user && (
            <>
              <div
                aria-hidden="true"
                className="pointer-events-none fixed inset-0"
                style={{
                  background:
                    "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(167, 139, 250, 0.12), transparent 65%)",
                }}
              />
              <div
                aria-hidden="true"
                className="pointer-events-none fixed inset-0 opacity-[0.04] dark:opacity-[0.06]"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(60deg, currentColor 0 1px, transparent 1px 28px), repeating-linear-gradient(-60deg, currentColor 0 1px, transparent 1px 28px)",
                  color: "rgb(124 58 237)",
                }}
              />
            </>
          )}
          <NextIntlClientProvider locale={locale} messages={messages}>
            <div className="relative flex min-h-screen">
              {/* Signed-out visitors only see public pages (splash, help,
                  tos, privacy) — the sidebar's nav targets all require auth,
                  so it's noise on those routes. Suppress it (and the mobile
                  nav drawer) when there's no session so the marketing flow
                  gets a clean full-width canvas. */}
              {session?.user && <Sidebar {...sidebarProps} />}
              <div className="flex min-w-0 flex-1 flex-col">
                <AlphaBanner />
                <TopBar
                  leftSlot={session?.user ? <MobileNav {...sidebarProps} /> : null}
                  guildTag={guildTag}
                />
                <main className="flex-1 px-4 py-6 sm:px-6">{children}</main>
                <Footer user={feedbackUser} />
              </div>
            </div>
            {needsInGameName && <InGameNameDialog />}
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
