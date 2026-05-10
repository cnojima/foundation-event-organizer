const PRODID = "-//Shadowfront//Signup//EN";
const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;

export type IcsEvent = {
  uid: string;
  start: Date;
  end?: Date;
  title: string;
  description?: string;
  location?: string;
  /** Recurrence rule body, e.g. "FREQ=WEEKLY;BYDAY=SA". Don't include "RRULE:". */
  rrule?: string;
};

export function buildICS(events: IcsEvent | IcsEvent[]): string {
  const list = Array.isArray(events) ? events : [events];
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const event of list) {
    const end = event.end ?? new Date(event.start.getTime() + DEFAULT_DURATION_MS);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.uid}`,
      `DTSTAMP:${formatUTC(new Date())}`,
      `DTSTART:${formatUTC(event.start)}`,
      `DTEND:${formatUTC(end)}`,
      `SUMMARY:${escapeText(event.title)}`
    );
    if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
    if (event.rrule) lines.push(`RRULE:${event.rrule}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

export function icsResponse(filename: string, body: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "event"
  );
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function formatUTC(d: Date): string {
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

// RFC 5545 line folding: lines > 75 octets are split with CRLF + leading space.
function foldLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let cursor = 0;
  let first = true;
  while (cursor < bytes.length) {
    const limit = first ? 75 : 74;
    const slice = bytes.subarray(cursor, cursor + limit).toString("utf8");
    parts.push(first ? slice : " " + slice);
    cursor += limit;
    first = false;
  }
  return parts.join("\r\n");
}
