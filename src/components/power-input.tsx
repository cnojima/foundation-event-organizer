"use client";

// Renders a raw digit string (no commas) as a comma-grouped number while
// typing, e.g. "95000000" -> "95,000,000". `value`/`onChange` deal only in
// raw digits — commas are display-only — so callers can keep using
// Number(value) for validation/submission exactly as before.
export function PowerInput({
  id,
  value,
  onChange,
  placeholder,
  required,
  className = "w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800",
}: {
  id: string;
  value: string;
  onChange: (digits: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
}) {
  const display = value === "" ? "" : Number(value).toLocaleString();

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      required={required}
      placeholder={placeholder}
      value={display}
      onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
      className={className}
    />
  );
}
