"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { InfoTip } from "@/components/info-tip";

interface Signup {
  id: string;
  attended: boolean | null;
  rating: number | null;
  requestLeadership: boolean | null;
  assignedRole: string | null;
  assignedSquad: number | null;
  squad1Preference: number | null;
  squad2Preference: number | null;
  adminNotes: string | null;
}

const ROLE_OPTIONS = [
  { value: "", label: "Unassigned" },
  { value: "player", label: "Player" },
  { value: "backup", label: "Backup" },
  { value: "leader", label: "Leader" },
  { value: "waitlist", label: "Waitlist" },
];

// What's the player's first-choice squad? Returns 1, 2, or null if neither
// preference column was set to first.
function firstChoiceSquad(s: Pick<Signup, "squad1Preference" | "squad2Preference">):
  | 1
  | 2
  | null {
  if (s.squad1Preference === 1) return 1;
  if (s.squad2Preference === 1) return 2;
  return null;
}

// Where is this player effectively placed? Admin's explicit assignment wins;
// fall back to first-choice preference. Used by the Move button to know
// which squad they're "in" right now.
function effectiveSquad(s: Signup): 1 | 2 | null {
  if (s.assignedSquad === 1 || s.assignedSquad === 2) {
    return s.assignedSquad as 1 | 2;
  }
  return firstChoiceSquad(s);
}

export function AdminSignupRow({
  signup,
  userName,
  userImage,
  squad1Name,
  squad2Name,
}: {
  signup: Signup;
  userName: string;
  userImage?: string;
  squad1Name: string;
  squad2Name: string;
}) {
  const router = useRouter();
  const [attended, setAttended] = useState(signup.attended ?? false);
  const [rating, setRating] = useState(signup.rating ?? 0);
  const [role, setRole] = useState(signup.assignedRole ?? "");
  const [saving, setSaving] = useState(false);

  const currentSquad = effectiveSquad(signup);
  const firstChoice = firstChoiceSquad(signup);
  // True when admin's explicit assignment differs from the player's first
  // choice — surfaces the override visually.
  const movedFromPreference =
    signup.assignedSquad !== null &&
    firstChoice !== null &&
    signup.assignedSquad !== firstChoice;

  async function save(
    updates: Partial<{
      attended: boolean;
      rating: number;
      assignedRole: string | null;
      assignedSquad: number | null;
    }>,
    refresh = false
  ) {
    setSaving(true);
    await fetch("/api/admin/signups", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: signup.id, ...updates }),
    });
    setSaving(false);
    if (refresh) router.refresh();
  }

  function handleMove() {
    if (!currentSquad) return;
    const target = currentSquad === 1 ? 2 : 1;
    save({ assignedSquad: target }, true);
  }

  const otherSquadName = currentSquad === 1 ? squad2Name : squad1Name;
  const isBackup = role === "backup";

  function handleToggleBackup() {
    const next = isBackup ? "player" : "backup";
    setRole(next);
    save({ assignedRole: next }, true);
  }

  return (
    // Always stacked: at lg+ the squad columns sit side-by-side and each
    // column is too narrow to fit name + 2 buttons + role select + Attended
    // + 5 stars on one line. Trying to keep one row makes the badges and
    // avatar collide. Two-row layout is consistent at every breakpoint.
    <div className="flex flex-col gap-2 rounded border p-3 dark:border-gray-800">
      <div className="flex min-w-0 items-center gap-3">
        {userImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={userImage} alt="" className="size-8 shrink-0 rounded-full" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{userName}</span>
            {signup.requestLeadership && (
              <InfoTip content="This player asked to be considered for a leader role.">
                <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-xs text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-200">
                  Leader
                </span>
              </InfoTip>
            )}
            {movedFromPreference && firstChoice && (
              <InfoTip
                content={`Player's first choice was ${firstChoice === 1 ? squad1Name : squad2Name}, but an admin moved them.`}
              >
                <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
                  Moved
                </span>
              </InfoTip>
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {currentSquad && (
          <InfoTip content={`Move this player to ${otherSquadName}.`}>
            <button
              type="button"
              onClick={handleMove}
              disabled={saving}
              className="rounded border border-violet-300 bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-50 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-300 dark:hover:bg-violet-900/50"
            >
              → {otherSquadName}
            </button>
          </InfoTip>
        )}
        <InfoTip
          content={
            isBackup
              ? "Move this player back onto the main roster."
              : "Move this player to the backup roster."
          }
        >
          <button
            type="button"
            onClick={handleToggleBackup}
            disabled={saving}
            className="rounded border border-sky-300 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-50 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-300 dark:hover:bg-sky-900/50"
          >
            {isBackup ? "→ Roster" : "→ Backup"}
          </button>
        </InfoTip>
        <InfoTip content="Assign this player a role. Unassigned = on the roster but not yet placed. Waitlist = no slot available.">
          <select
            value={role}
            onChange={(e) => {
              const next = e.target.value;
              setRole(next);
              save({ assignedRole: next === "" ? null : next }, true);
            }}
            disabled={saving}
            className="rounded border bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          >
            {ROLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </InfoTip>
        <InfoTip content="Mark whether this player showed up for the match.">
          <label className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={attended}
              onChange={(e) => {
                setAttended(e.target.checked);
                save({ attended: e.target.checked });
              }}
            />
            Attended
          </label>
        </InfoTip>
        <InfoTip content="Optional 1-5 rating used for future roster decisions. Click again on a star to change.">
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => {
                  setRating(star);
                  save({ rating: star });
                }}
                className={`text-lg ${star <= rating ? "text-yellow-500" : "text-gray-300 dark:text-gray-600"}`}
                disabled={saving}
              >
                ★
              </button>
            ))}
          </div>
        </InfoTip>
      </div>
    </div>
  );
}
