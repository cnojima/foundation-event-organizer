export function EventDescription({ text, className }: { text: string; className?: string }) {
  return (
    <div
      className={`prose prose-sm dark:prose-invert max-w-none ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: text }}
    />
  );
}
