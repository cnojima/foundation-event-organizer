"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SessionDetail, FleetAgg } from "@/lib/damage-calculator/get-session-detail";
import type { Phase } from "@/lib/damage-calculator/phases";

const ELEMENT_TYPES = ["beam", "kinetic", "ion"] as const;

export function SessionDetailView({ detail }: { detail: SessionDetail }) {
  const router = useRouter();
  const { session, phases, fleets } = detail;
  const [label, setLabel] = useState(session.label);
  const [eventName, setEventName] = useState(session.eventName);
  const [totalTimeInput, setTotalTimeInput] = useState(
    session.totalTimeSeconds != null ? String(session.totalTimeSeconds) : ""
  );

  async function patchSession(body: Record<string, unknown>) {
    await fetch(`/api/damage-calculator/sessions/${session.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    router.refresh();
  }

  async function patchReading(readingId: string, damageDealt: number) {
    await fetch(`/api/damage-calculator/readings/${readingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ damageDealt }),
    });
    router.refresh();
  }

  async function patchFleet(fleetId: string, elementType: string | null) {
    await fetch(`/api/damage-calculator/fleets/${fleetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ elementType }),
    });
    router.refresh();
  }

  async function reupload(phase: Phase, file: File) {
    const fd = new FormData();
    fd.append("image", file);
    fd.append("phase", phase);
    const res = await fetch(`/api/damage-calculator/sessions/${session.id}/readings`, {
      method: "POST",
      body: fd,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data?.error ?? "Re-upload failed.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">Label</span>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onBlur={() => label.trim() && label !== session.label && patchSession({ label })}
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-violet-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">Event</span>
            <input
              type="text"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              onBlur={() =>
                eventName.trim() && eventName !== session.eventName && patchSession({ eventName })
              }
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-violet-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">
              Total time (seconds)
            </span>
            <input
              type="number"
              min={0}
              step="0.1"
              value={totalTimeInput}
              onChange={(e) => setTotalTimeInput(e.target.value)}
              onBlur={() => {
                const n = totalTimeInput.trim() === "" ? null : Number(totalTimeInput);
                if (n === session.totalTimeSeconds) return;
                if (n !== null && (!Number.isFinite(n) || n < 0)) return;
                patchSession({ totalTimeSeconds: n });
              }}
              placeholder="e.g. 1110"
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-violet-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            />
          </label>
        </div>
        {!session.totalTimeSeconds && (
          <p className="mt-2 text-xs font-medium text-amber-600 dark:text-amber-400">
            Set total time to compute DPS — the battle data carries no timestamps.
          </p>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <table className="w-full min-w-[900px] border-collapse text-xs">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500 dark:border-gray-800 dark:text-gray-400">
              <th className="px-3 py-2 font-semibold">Champion</th>
              <th className="px-2 py-2 font-semibold">Type</th>
              {phases.map((p) => (
                <th key={p} className="px-2 py-2 text-right font-mono font-semibold">
                  {p}
                </th>
              ))}
              <th className="px-2 py-2 text-right font-semibold">DPS</th>
              <th className="px-3 py-2 text-right font-semibold">DMG TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {fleets.map((fleetAgg, fi) => (
              <FleetGroup
                key={fleetAgg.fleet.id}
                fleetAgg={fleetAgg}
                phases={phases}
                tint={fi % 2 === 0}
                onPatchReading={patchReading}
                onPatchFleet={patchFleet}
                onReupload={reupload}
              />
            ))}
            {fleets.length === 0 && (
              <tr>
                <td colSpan={phases.length + 4} className="p-6 text-center text-gray-500 dark:text-gray-400">
                  No readings yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FleetGroup({
  fleetAgg,
  phases,
  tint,
  onPatchReading,
  onPatchFleet,
  onReupload,
}: {
  fleetAgg: FleetAgg;
  phases: readonly Phase[];
  tint: boolean;
  onPatchReading: (readingId: string, damageDealt: number) => void;
  onPatchFleet: (fleetId: string, elementType: string | null) => void;
  onReupload: (phase: Phase, file: File) => void;
}) {
  const bg = tint
    ? "bg-violet-50/50 dark:bg-violet-950/10"
    : "bg-amber-50/40 dark:bg-amber-950/10";

  return (
    <>
      {fleetAgg.entities.map((entity) => {
        const isFlagship = entity.entityRole === "flagship";
        return (
          <tr
            key={entity.entityName}
            className={`border-b border-gray-100 dark:border-gray-800/60 ${isFlagship ? `${bg} font-semibold` : ""}`}
          >
            <td className="px-3 py-1.5 text-gray-900 dark:text-gray-100">
              {isFlagship ? entity.entityName : `  ${entity.entityName}`}
            </td>
            <td className="px-2 py-1.5">
              {isFlagship ? (
                <ElementTypeSelect
                  value={fleetAgg.fleet.elementType}
                  onChange={(v) => onPatchFleet(fleetAgg.fleet.id, v)}
                />
              ) : null}
            </td>
            {phases.map((phase) => {
              const reading = entity.phases[phase];
              return (
                <td key={phase} className="px-2 py-1.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {reading ? (
                      <EditableNumber
                        value={reading.damageDealt}
                        onSave={(n) => onPatchReading(reading.readingId, n)}
                      />
                    ) : (
                      <span className="text-gray-300 dark:text-gray-700">—</span>
                    )}
                    {isFlagship && (
                      <ReuploadButton phase={phase} onPick={(file) => onReupload(phase, file)} />
                    )}
                  </div>
                </td>
              );
            })}
            <td className="px-2 py-1.5 text-right tabular-nums text-gray-900 dark:text-gray-100">
              {entity.dps != null ? Math.round(entity.dps).toLocaleString() : "—"}
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums text-gray-900 dark:text-gray-100">
              {isFlagship ? fleetAgg.dmgTotal.toLocaleString() : ""}
            </td>
          </tr>
        );
      })}
    </>
  );
}

function EditableNumber({ value, onSave }: { value: number; onSave: (n: number) => void }) {
  const [text, setText] = useState(String(value));

  return (
    <input
      type="text"
      inputMode="numeric"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const cleaned = text.replace(/,/g, "").trim();
        const n = Number(cleaned);
        if (!Number.isFinite(n) || n < 0) {
          setText(String(value));
          return;
        }
        if (n !== value) onSave(n);
        setText(String(n));
      }}
      className="w-24 rounded border-0 bg-transparent px-1 py-0.5 text-right font-mono tabular-nums focus:outline-none focus:ring-1 focus:ring-violet-400 dark:text-gray-100"
    />
  );
}

function ElementTypeSelect({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
      className="rounded border-0 bg-transparent text-xs capitalize focus:outline-none focus:ring-1 focus:ring-violet-400 dark:text-gray-100"
    >
      <option value="">—</option>
      {ELEMENT_TYPES.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );
}

function ReuploadButton({ phase, onPick }: { phase: Phase; onPick: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <>
      <button
        type="button"
        title={`Re-upload screenshot for ${phase}`}
        onClick={() => inputRef.current?.click()}
        className="shrink-0 rounded text-gray-300 hover:text-violet-600 dark:text-gray-700 dark:hover:text-violet-400"
      >
        ↻
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick(file);
          e.target.value = "";
        }}
      />
    </>
  );
}
