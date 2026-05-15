"use client";

import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";

// Provider buttons for the custom /signin page. Each kicks off the OAuth
// redirect via Auth.js's client-side signIn() helper, preserving the
// `callbackUrl` so users land back where they came from.
//
// Brand colors are pinned to each provider's official hex so the buttons
// read as "trustworthy login" instead of generic CTAs — Google's white-
// chrome with hairline border, Discord's blurple.
export function SignInProviderButtons({ callbackUrl }: { callbackUrl: string }) {
  const t = useTranslations("signin");

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => signIn("google", { callbackUrl })}
        className="flex items-center justify-center gap-3 rounded-md border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-100 dark:hover:bg-white"
      >
        <GoogleGlyph />
        {t("google")}
      </button>
      <button
        type="button"
        onClick={() => signIn("discord", { callbackUrl })}
        className="flex items-center justify-center gap-3 rounded-md bg-[#5865F2] px-5 py-3 text-sm font-semibold text-white shadow-[0_8px_24px_-8px_rgba(88,101,242,0.6)] transition-colors hover:bg-[#4752c4]"
      >
        <DiscordGlyph />
        {t("discord")}
      </button>
    </div>
  );
}

// Multi-color "G" Google logo, inline SVG so no external load.
function GoogleGlyph() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true" className="size-5">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.707A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}

// Discord "Clyde" mascot mark, inline SVG.
function DiscordGlyph() {
  return (
    <svg viewBox="0 0 71 55" aria-hidden="true" className="size-5">
      <path
        fill="currentColor"
        d="M60.105 4.898A58.55 58.55 0 0 0 45.653.415a.22.22 0 0 0-.233.11c-.624 1.111-1.317 2.56-1.803 3.699-5.473-.82-10.918-.82-16.278 0-.486-1.164-1.205-2.588-1.832-3.7a.228.228 0 0 0-.233-.109 58.386 58.386 0 0 0-14.451 4.483.207.207 0 0 0-.095.082C1.578 18.73-.944 32.144.293 45.39a.244.244 0 0 0 .093.167c6.073 4.46 11.955 7.167 17.729 8.962a.23.23 0 0 0 .249-.082 42.08 42.08 0 0 0 3.627-5.9.225.225 0 0 0-.123-.312 38.772 38.772 0 0 1-5.539-2.64.228.228 0 0 1-.022-.378c.372-.279.744-.569 1.1-.862a.22.22 0 0 1 .229-.031c11.62 5.305 24.198 5.305 35.681 0a.22.22 0 0 1 .232.028c.356.293.728.586 1.103.865a.228.228 0 0 1-.02.378 36.387 36.387 0 0 1-5.541 2.637.227.227 0 0 0-.121.315 47.249 47.249 0 0 0 3.624 5.897.225.225 0 0 0 .249.084c5.801-1.794 11.684-4.502 17.757-8.961a.228.228 0 0 0 .092-.164c1.48-15.315-2.48-28.618-10.498-40.412a.18.18 0 0 0-.093-.084zm-36.38 32.426c-3.497 0-6.38-3.211-6.38-7.156 0-3.944 2.827-7.156 6.38-7.156 3.581 0 6.435 3.24 6.379 7.156 0 3.945-2.826 7.156-6.38 7.156zm23.593 0c-3.498 0-6.38-3.211-6.38-7.156 0-3.944 2.826-7.156 6.38-7.156 3.58 0 6.435 3.24 6.378 7.156 0 3.945-2.798 7.156-6.378 7.156z"
      />
    </svg>
  );
}
