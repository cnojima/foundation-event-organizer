"use client";

import { signIn, signOut } from "next-auth/react";
import { useTranslations } from "next-intl";

export function SignInButton() {
  const t = useTranslations("topBar");
  return (
    <button
      onClick={() => signIn()}
      className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
    >
      {t("signIn")}
    </button>
  );
}

export function SignOutButton() {
  const t = useTranslations("topBar");
  return (
    <button
      onClick={() => signOut()}
      className="rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
    >
      {t("signOut")}
    </button>
  );
}
