"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";

// Username + password account-creation form. On success, immediately signs
// the new user in via the Credentials provider (Auth.js) and redirects to
// the callbackUrl. Client-side validation mirrors what the server
// enforces (length, character classes) so users get fast feedback — but
// the server in src/app/api/auth/signup/route.ts is always authoritative.
//
// Distinct from src/components/signup-form.tsx, which is the in-app
// event-signup form (different domain entirely — that one is the
// player's RSVP to an event).

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$/;

function clientValidatePassword(pw: string): string | null {
  if (pw.length < 10) return "Password must be at least 10 characters.";
  if (!/[a-z]/.test(pw))
    return "Password must contain at least one lowercase letter.";
  if (!/[A-Z]/.test(pw))
    return "Password must contain at least one uppercase letter.";
  if (!/\d/.test(pw)) return "Password must contain at least one digit.";
  return null;
}

export function CredentialsSignUpForm({
  callbackUrl,
}: {
  callbackUrl: string;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    // Cheap client-side checks before round-tripping the password.
    const u = username.trim().toLowerCase();
    if (!USERNAME_PATTERN.test(u)) {
      setError(
        "Username must be 3–30 lowercase letters/digits/hyphen/underscore, and can't start or end with a separator."
      );
      return;
    }
    const pwErr = clientValidatePassword(password);
    if (pwErr) {
      setError(pwErr);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: u,
        password,
        email: email.trim() || undefined,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "Couldn't create account.");
      setSubmitting(false);
      return;
    }

    // Account exists — sign them in immediately so they land authenticated.
    const signInResult = await signIn("credentials", {
      username: u,
      password,
      redirect: false,
      callbackUrl,
    });
    if (signInResult?.ok && !signInResult.error) {
      window.location.href = signInResult.url ?? callbackUrl;
      return;
    }
    setSubmitting(false);
    setError(
      "Account created, but couldn't sign you in automatically. Try signing in from /signin."
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-md border border-gray-200 bg-white/80 p-4 text-left backdrop-blur dark:border-gray-800 dark:bg-gray-900/80"
    >
      <div>
        <label
          htmlFor="signup-username"
          className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          Username *
        </label>
        <input
          id="signup-username"
          type="text"
          autoComplete="username"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          maxLength={30}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
        />
        <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">
          3–30 lowercase letters, digits, hyphen, or underscore.
        </p>
      </div>
      <div>
        <label
          htmlFor="signup-password"
          className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          Password *
        </label>
        <input
          id="signup-password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={10}
          maxLength={200}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
        />
        <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">
          At least 10 characters with one lowercase, one uppercase, and one
          digit.
        </p>
      </div>
      <div>
        <label
          htmlFor="signup-password-confirm"
          className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          Confirm password *
        </label>
        <input
          id="signup-password-confirm"
          type="password"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          minLength={10}
          maxLength={200}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
        />
      </div>
      <div>
        <label
          htmlFor="signup-email"
          className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          Email <span className="text-gray-400">(optional)</span>
        </label>
        <input
          id="signup-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
        />
        <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">
          Used only for password reset. Stored encrypted at rest.
        </p>
      </div>
      {error && (
        <p
          className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
          role="alert"
        >
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
      >
        {submitting ? "Creating account…" : "Create account"}
      </button>
      <p className="text-center text-xs text-gray-500 dark:text-gray-400">
        Already have an account?{" "}
        <Link
          href={`/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`}
          className="font-semibold text-violet-700 hover:underline dark:text-violet-300"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
