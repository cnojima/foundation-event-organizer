"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";

// Username + password sign-in form for /signin. Hybrid with OAuth — the
// existing SignInProviderButtons render above this. Uses Auth.js's
// client-side signIn() helper with the "credentials" provider id from
// src/auth.ts.
export function SignInCredentialsForm({ callbackUrl }: { callbackUrl: string }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await signIn("credentials", {
      username,
      password,
      redirect: false,
      callbackUrl,
    });
    if (result?.ok && !result.error) {
      // Auth.js doesn't auto-redirect when redirect:false. Navigate
      // manually so the SPA picks up the new session cookie on the
      // target page.
      window.location.href = result.url ?? callbackUrl;
      return;
    }
    setSubmitting(false);
    // Auth.js's CredentialsSignin error is a generic string — surface a
    // friendly version. Don't leak whether the username or the password
    // was wrong.
    setError("Couldn't sign you in. Check your username and password.");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-md border border-gray-200 bg-white/80 p-4 text-left backdrop-blur dark:border-gray-800 dark:bg-gray-900/80"
    >
      <div>
        <label
          htmlFor="cred-username"
          className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          Username
        </label>
        <input
          id="cred-username"
          name="username"
          type="text"
          autoComplete="username"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
        />
      </div>
      <div>
        <label
          htmlFor="cred-password"
          className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          Password
        </label>
        <input
          id="cred-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
        />
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
        {submitting ? "Signing in…" : "Sign in"}
      </button>
      <p className="text-center text-xs text-gray-500 dark:text-gray-400">
        Don&apos;t have an account?{" "}
        <Link
          href={`/signup?callbackUrl=${encodeURIComponent(callbackUrl)}`}
          className="font-semibold text-violet-700 hover:underline dark:text-violet-300"
        >
          Create one
        </Link>
      </p>
    </form>
  );
}
