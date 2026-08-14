// Client-side CSV/TSV paste-and-preview support for bulk-loading migration
// applications (see /admin/migration-tracker/[destinationId]/import). Pure,
// framework-agnostic parsing/validation — no DB access — so it's safe to
// import from both the "use client" preview component and, if ever needed,
// a server route. Field-level constraints mirror the public submission
// route (POST /api/migration-tracker/applications) so an imported row and a
// self-submitted one are held to the same bar.

export type ImportField =
  | "playerName"
  | "sourceServer"
  | "power"
  | "desiredGuild"
  | "gameUid"
  | "contact";

export const REQUIRED_IMPORT_FIELDS: ImportField[] = ["playerName", "sourceServer", "power"];

// Normalized (lowercased, non-alphanumeric stripped) header text -> field.
// First matching column wins if a header repeats.
const HEADER_ALIASES: Record<ImportField, string[]> = {
  playerName: ["playername", "player", "name", "ign", "ingamename", "username"],
  sourceServer: [
    "sourceserver",
    "source",
    "fromserver",
    "originserver",
    "origin",
    "from",
    "currentserver",
  ],
  power: ["power", "powerlevel", "pwr", "might"],
  desiredGuild: ["desiredguild", "guild", "targetguild", "requestedguild", "guildpreference"],
  gameUid: ["gameuid", "uid", "gameid", "playerid", "playeruid"],
  contact: ["contact", "contactinfo", "discord", "discordid", "discordusername", "notes"],
};

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Whole-text state-machine parse (not per-line split) so a quoted field can
// safely contain the delimiter, a newline, or an escaped `""`. Delimiter is
// auto-detected from the first non-blank line: pasted spreadsheet data is
// tab-delimited, hand-typed/CSV-exported data is comma-delimited.
export function parseDelimitedText(text: string): string[][] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const firstLine = normalized.split("\n").find((l) => l.trim() !== "") ?? "";
  const delimiter = firstLine.includes("\t") ? "\t" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (inQuotes) {
      if (ch === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === "") {
      inQuotes = true;
      continue;
    }
    if (ch === delimiter) {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

export function mapHeaders(headers: string[]): {
  mapping: Partial<Record<ImportField, number>>;
  missingRequired: ImportField[];
} {
  const aliasToField = new Map<string, ImportField>();
  for (const field of Object.keys(HEADER_ALIASES) as ImportField[]) {
    for (const alias of HEADER_ALIASES[field]) {
      aliasToField.set(alias, field);
    }
  }

  const mapping: Partial<Record<ImportField, number>> = {};
  headers.forEach((header, index) => {
    const field = aliasToField.get(normalizeHeader(header));
    if (field && mapping[field] === undefined) {
      mapping[field] = index;
    }
  });

  const missingRequired = REQUIRED_IMPORT_FIELDS.filter((f) => mapping[f] === undefined);
  return { mapping, missingRequired };
}

export type ImportRowInput = {
  playerName: string;
  sourceServer: string;
  power: number | null;
  desiredGuild: string | null;
  gameUid: string | null;
  contact: string | null;
};

// Mirrors the validation in POST /api/migration-tracker/applications.
export function validateImportRow(
  input: ImportRowInput
): { ok: true } | { ok: false; error: string } {
  if (!input.playerName || input.playerName.length > 60) {
    return { ok: false, error: "Player name is required (max 60 characters)" };
  }
  if (!input.sourceServer || input.sourceServer.length > 60) {
    return { ok: false, error: "Source server is required (max 60 characters)" };
  }
  if (
    input.power === null ||
    !Number.isFinite(input.power) ||
    input.power < 0 ||
    !Number.isInteger(input.power)
  ) {
    return { ok: false, error: "Power must be a whole number" };
  }
  if (input.desiredGuild && input.desiredGuild.length > 60) {
    return { ok: false, error: "Desired guild is too long (max 60 characters)" };
  }
  if (input.gameUid && input.gameUid.length > 60) {
    return { ok: false, error: "Game UID is too long (max 60 characters)" };
  }
  if (input.contact && input.contact.length > 120) {
    return { ok: false, error: "Contact is too long (max 120 characters)" };
  }
  return { ok: true };
}

export type ImportRowPreview = {
  rowNumber: number; // 1-based among data rows, excluding the header
  playerName: string;
  sourceServer: string;
  power: number | null;
  desiredGuild: string | null;
  gameUid: string | null;
  contact: string | null;
  error: string | null;
};

export type ImportPreview =
  | { ok: false; reason: "empty" }
  | { ok: false; reason: "missing_columns"; missingRequired: ImportField[]; headers: string[] }
  | {
      ok: true;
      headers: string[];
      mapping: Partial<Record<ImportField, number>>;
      rows: ImportRowPreview[];
    };

// Numbers pasted from a spreadsheet often carry thousands separators
// ("45,000,000"); strip them before parsing rather than rejecting the row.
function parsePower(raw: string): number | null {
  if (raw.trim() === "") return null;
  const stripped = raw.replace(/[,\s]/g, "");
  const value = Number(stripped);
  return Number.isFinite(value) ? value : null;
}

export function parseImportText(text: string): ImportPreview {
  if (text.trim() === "") return { ok: false, reason: "empty" };

  const table = parseDelimitedText(text);
  if (table.length === 0) return { ok: false, reason: "empty" };

  const [headerRow, ...dataRows] = table;
  const headers = headerRow.map((h) => h.trim());
  const { mapping, missingRequired } = mapHeaders(headers);
  if (missingRequired.length > 0) {
    return { ok: false, reason: "missing_columns", missingRequired, headers };
  }

  const rows: ImportRowPreview[] = dataRows
    .filter((cells) => cells.some((cell) => cell.trim() !== ""))
    .map((cells, idx) => {
      const playerName = (cells[mapping.playerName!] ?? "").trim();
      const sourceServer = (cells[mapping.sourceServer!] ?? "").trim();
      const power = parsePower(cells[mapping.power!] ?? "");
      const desiredGuild =
        mapping.desiredGuild !== undefined ? (cells[mapping.desiredGuild] ?? "").trim() : "";
      const gameUid = mapping.gameUid !== undefined ? (cells[mapping.gameUid] ?? "").trim() : "";
      const contact = mapping.contact !== undefined ? (cells[mapping.contact] ?? "").trim() : "";

      const validation = validateImportRow({
        playerName,
        sourceServer,
        power,
        desiredGuild: desiredGuild || null,
        gameUid: gameUid || null,
        contact: contact || null,
      });

      return {
        rowNumber: idx + 1,
        playerName,
        sourceServer,
        power,
        desiredGuild: desiredGuild || null,
        gameUid: gameUid || null,
        contact: contact || null,
        error: validation.ok ? null : validation.error,
      };
    });

  return { ok: true, headers, mapping, rows };
}
