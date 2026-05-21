import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Logo } from "@/components/logo";
import { CredentialsSignUpForm } from "@/components/credentials-signup-form";

export const metadata = {
  title: "Create account",
};

// Username + password signup page. OAuth signups still go through /signin
// (the Google/Discord buttons create rows on first sign-in via the
// adapter). This page is for users who want a username/password account.
//
// Signed-in visitors get bounced to the callbackUrl (or `/`) — same
// convention as /signin.
export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await auth();
  const params = await searchParams;
  const callbackUrl = params.callbackUrl ?? "/";
  if (session?.user) redirect(callbackUrl);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
      <div className="mb-8 flex items-center justify-between gap-4">
        <Logo variant="wordmark" />
        <LocaleSwitcher signedIn={false} />
      </div>

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
            Get started
          </p>
          <h1 className="mt-3 bg-gradient-to-br from-violet-700 to-indigo-500 bg-clip-text text-5xl font-bold tracking-tight text-transparent sm:text-7xl dark:from-violet-300 dark:to-indigo-300">
            CREATE ACCOUNT
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-gray-600 sm:text-lg dark:text-gray-400">
            Pick a username and a strong password. Email is optional — only
            used for password reset.
          </p>

          <div className="mx-auto mt-8 max-w-sm">
            <CredentialsSignUpForm callbackUrl={callbackUrl} />
          </div>
        </div>
      </section>
    </div>
  );
}
