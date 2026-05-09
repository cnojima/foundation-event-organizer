"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function InviteRow({
  guildId,
  inviteId,
  code,
  url,
  expiresAt,
  maxUses,
  usesCount,
  revokedAt,
  usable,
}: {
  guildId: string;
  inviteId: string;
  code: string;
  url: string;
  expiresAt: string | null;
  maxUses: number | null;
  usesCount: number;
  revokedAt: string | null;
  usable: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function revoke() {
    if (!confirm("Revoke this invite link?")) return;
    setBusy(true);
    const res = await fetch(`/api/guilds/${guildId}/invites/${inviteId}`, {
      method: "DELETE",
    });
    if (res.ok) router.refresh();
    setBusy(false);
  }

  return (
    <div
      className={`flex items-center justify-between gap-4 rounded-lg border bg-white px-4 py-3 ${
        usable ? "border-gray-200" : "border-gray-100 opacity-60"
      }`}
    >
      <div className="min-w-0 flex-1">
        <code className="block truncate font-mono text-sm text-gray-900">
          {url}
        </code>
        <p className="mt-1 text-xs text-gray-500">
          Code <span className="font-mono">{code}</span> · Used {usesCount}
          {maxUses != null && ` / ${maxUses}`}
          {expiresAt && ` · Expires ${new Date(expiresAt).toLocaleString()}`}
          {revokedAt && " · Revoked"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2 text-xs">
        <button
          type="button"
          onClick={copy}
          className="rounded border border-gray-300 bg-white px-2 py-1 font-semibold text-gray-700 hover:bg-gray-50"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
        {usable && (
          <button
            type="button"
            onClick={revoke}
            disabled={busy}
            className="rounded border border-red-300 bg-red-50 px-2 py-1 font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            Revoke
          </button>
        )}
      </div>
    </div>
  );
}
