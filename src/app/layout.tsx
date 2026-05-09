import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { Footer } from "@/components/layout/footer";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/admin";
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
  const userIsAdmin = session?.user?.id ? await isAdmin(session.user.id) : false;
  const needsInGameName = !!session?.user && !session.user.inGameName;

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-white text-gray-900">
        <div className="flex min-h-screen">
          <Sidebar isAdmin={userIsAdmin} />
          <div className="flex min-w-0 flex-1 flex-col">
            <TopBar />
            <main className="flex-1 px-6 py-6">{children}</main>
            <Footer />
          </div>
        </div>
        {needsInGameName && (
          <InGameNameDialog suggested={session?.user?.name ?? undefined} />
        )}
      </body>
    </html>
  );
}
