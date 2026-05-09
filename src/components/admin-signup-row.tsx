"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Signup {
  id: string;
  attended: boolean | null;
  rating: number | null;
  requestLeadership: boolean | null;
  assignedRole: string | null;
  adminNotes: string | null;
}

const ROLE_OPTIONS = [
  { value: "", label: "Unassigned" },
  { value: "player", label: "Player" },
  { value: "backup", label: "Backup" },
  { value: "leader", label: "Leader" },
  { value: "waitlist", label: "Waitlist" },
];

export function AdminSignupRow({
  signup,
  userName,
  userImage,
}: {
  signup: Signup;
  userName: string;
  userImage?: string;
}) {
  const router = useRouter();
  const [attended, setAttended] = useState(signup.attended ?? false);
  const [rating, setRating] = useState(signup.rating ?? 0);
  const [role, setRole] = useState(signup.assignedRole ?? "");
  const [saving, setSaving] = useState(false);

  async function save(
    updates: Partial<{ attended: boolean; rating: number; assignedRole: string | null }>,
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

  return (
    <div className="border rounded p-3 flex items-center gap-3">
      {userImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={userImage} alt="" className="w-8 h-8 rounded-full" />
      )}
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{userName}</span>
          {signup.requestLeadership && (
            <span className="text-xs bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded">
              Leader
            </span>
          )}
        </div>
      </div>
      <select
        value={role}
        onChange={(e) => {
          const next = e.target.value;
          setRole(next);
          save({ assignedRole: next === "" ? null : next }, true);
        }}
        disabled={saving}
        className="text-sm border rounded px-2 py-1 bg-white"
      >
        {ROLE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
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
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => {
              setRating(star);
              save({ rating: star });
            }}
            className={`text-lg ${star <= rating ? "text-yellow-500" : "text-gray-300"}`}
            disabled={saving}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  );
}
