"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { useTranslations } from "next-intl";

export function DeleteAccountButton() {
  const t = useTranslations("myAccount");
  const tErrors = useTranslations("errors");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (!confirm(t("deleteConfirm"))) return;
    setError(null);
    setBusy(true);
    const res = await fetch("/api/me", { method: "DELETE" });
    if (res.ok) {
      // Clear the session cookie and redirect to the sign-in landing.
      await signOut({ callbackUrl: "/" });
      return;
    }
    const data = await res.json().catch(() => ({}));
    setError(data?.error ?? tErrors("failed"));
    setBusy(false);
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
      >
        {busy ? t("deleting") : t("deleteButton")}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
