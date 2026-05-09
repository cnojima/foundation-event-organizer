"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { InfoTip } from "@/components/info-tip";

export function MemberRowActions({
  guildId,
  userId,
  role,
  isLastAdmin,
}: {
  guildId: string;
  userId: string;
  role: "admin" | "member" | null;
  isLastAdmin: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setRole(newRole: "admin" | "member") {
    setError(null);
    setBusy(true);
    const res = await fetch(`/api/guilds/${guildId}/members/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "Failed");
    }
    setBusy(false);
  }

  async function kick() {
    if (!confirm("Remove this member from the guild?")) return;
    setError(null);
    setBusy(true);
    const res = await fetch(`/api/guilds/${guildId}/members/${userId}`, {
      method: "DELETE",
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
      {role === "member" && (
        <InfoTip content="Promote this member to guild admin. Admins can create events, manage signups, invite members, and edit guild settings.">
          <button
            type="button"
            onClick={() => setRole("admin")}
            disabled={busy}
            className="rounded border border-violet-300 bg-violet-50 px-2 py-1 font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-50"
          >
            Promote
          </button>
        </InfoTip>
      )}
      {role === "admin" && (
        <InfoTip
          content={
            isLastAdmin
              ? "Can't demote the last admin — promote someone else first."
              : "Demote this admin back to a regular member."
          }
        >
          <button
            type="button"
            onClick={() => setRole("member")}
            disabled={busy || isLastAdmin}
            className="rounded border border-gray-300 bg-white px-2 py-1 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Demote
          </button>
        </InfoTip>
      )}
      <InfoTip
        content={
          isLastAdmin
            ? "Can't kick the last admin — promote someone else first."
            : "Remove this member from the guild. Their past signups are soft-deleted (kept for attendance history)."
        }
      >
        <button
          type="button"
          onClick={kick}
          disabled={busy || isLastAdmin}
          className="rounded border border-red-300 bg-red-50 px-2 py-1 font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
        >
          Kick
        </button>
      </InfoTip>
      {error && <span className="text-red-600">{error}</span>}
    </div>
  );
}
