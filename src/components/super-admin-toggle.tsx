"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { InfoTip } from "@/components/info-tip";

export function SuperAdminToggle({
  userId,
  isSuperAdmin,
}: {
  userId: string;
  isSuperAdmin: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setError(null);
    setBusy(true);
    const res = await fetch(`/api/super-admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isSuperAdmin: !isSuperAdmin }),
    });
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "Failed");
    }
    setBusy(false);
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <InfoTip
        content={
          isSuperAdmin
            ? "Remove site-wide super-admin privileges. The last super-admin can't demote themselves."
            : "Grant site-wide super-admin: manage any guild, promote/demote others, soft-delete guilds. Use sparingly."
        }
      >
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          className={`rounded border px-2 py-1 font-semibold disabled:opacity-50 ${
            isSuperAdmin
              ? "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
              : "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100"
          }`}
        >
          {isSuperAdmin ? "Demote" : "Promote to super"}
        </button>
      </InfoTip>
      {error && <span className="text-red-600">{error}</span>}
    </div>
  );
}
