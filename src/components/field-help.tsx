// Inline help text rendered under a form label/control.
export function FieldHelp({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs text-gray-500">{children}</p>;
}
