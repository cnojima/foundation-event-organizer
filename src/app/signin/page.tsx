import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Logo } from "@/components/logo";
import { SignInProviderButtons } from "@/components/signin-provider-buttons";

export const metadata = {
  title: "Sign in",
};

// Custom sign-in page (overrides Auth.js's built-in /api/auth/signin via
// pages.signIn in src/auth.ts). Same atmospheric hero treatment as the
// landing page so the brand carries through the auth flow.
//
// Auth.js appends ?callbackUrl=... when redirecting unauthenticated users
// here — we forward it to signIn() so the provider redirect lands the user
// back where they started. Signed-in visitors get bounced to that
// callbackUrl directly (or `/` if absent) — no point showing them the
// sign-in chrome again.
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const session = await auth();
  const params = await searchParams;
  const callbackUrl = params.callbackUrl ?? "/";
  if (session?.user) redirect(callbackUrl);

  const error = params.error;
  const t = await getTranslations("signin");

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
      {/* Top bar matches the landing page: wordmark left, locale right. */}
      <div className="mb-8 flex items-center justify-between gap-4">
        <Logo variant="wordmark" />
        <LocaleSwitcher signedIn={false} />
      </div>

      {/* Atmospheric hero — same radial-glow + hex-grid backdrop as the
          landing page, so the auth flow feels like the same surface. */}
      <section className="relative isolate overflow-hidden rounded-3xl px-4 py-12 text-center sm:py-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(ellipse 60% 50% at 50% 30%, rgba(167, 139, 250, 0.35), transparent 70%)",
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.06] dark:opacity-[0.08]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(60deg, currentColor 0 1px, transparent 1px 24px), repeating-linear-gradient(-60deg, currentColor 0 1px, transparent 1px 24px)",
            color: "rgb(124 58 237)",
          }}
        />

        <div className="relative">
          <Logo
            variant="icon"
            className="mx-auto mb-6 size-28 drop-shadow-[0_0_24px_rgba(167,139,250,0.45)]"
          />
          <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-violet-700 dark:text-violet-300">
            {t("kicker")}
          </p>
          <h1 className="mt-3 bg-gradient-to-br from-violet-700 to-indigo-500 bg-clip-text text-5xl font-bold tracking-tight text-transparent sm:text-7xl dark:from-violet-300 dark:to-indigo-300">
            RALLY UP
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-gray-600 sm:text-lg dark:text-gray-400">
            {t("subtitle")}
          </p>

          {error && (
            <div className="mx-auto mt-6 max-w-md rounded-md border border-red-200 bg-red-50/80 px-4 py-3 text-left text-sm text-red-800 backdrop-blur dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
              <p className="font-semibold">{t("errorHeading")}</p>
              <p className="mt-1 text-xs leading-relaxed">{t("errorBody")}</p>
            </div>
          )}

          <div className="mx-auto mt-8 max-w-sm">
            <SignInProviderButtons callbackUrl={callbackUrl} />
          </div>
        </div>
      </section>
    </div>
  );
}
