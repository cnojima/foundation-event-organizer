"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { InfoTip } from "@/components/info-tip";

export function GuildLifecycleButton({
  guildId,
  isDeleted,
}: {
  guildId: string;
  isDeleted: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function softDelete() {
    if (
      !confirm(
        "Soft-delete this guild? Its events will be soft-deleted and members will be removed."
      )
    ) {
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/super-admin/guilds/${guildId}`, {
      method: "DELETE",
    });
    if (res.ok) router.refresh();
    setBusy(false);
  }

  async function undelete() {
    setBusy(true);
    const res = await fetch(`/api/super-admin/guilds/${guildId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "undelete" }),
    });
    if (res.ok) router.refresh();
    setBusy(false);
  }

  if (isDeleted) {
    return (
      <InfoTip content="Restore the guild record. Members aren't auto-rejoined; they'll need to join again. Events stay soft-deleted.">
        <button
          type="button"
          onClick={undelete}
          disabled={busy}
          className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
        >
          Undelete
        </button>
      </InfoTip>
    );
  }
  return (
    <InfoTip content="Soft-delete this guild. Its events are soft-deleted and members lose their guild affiliation. Reversible via Undelete.">
      <button
        type="button"
        onClick={softDelete}
        disabled={busy}
        className="rounded border border-red-300 bg-red-50 px-2 py-1 font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
      >
        Delete
      </button>
    </InfoTip>
  );
}
