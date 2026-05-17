import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { requireGuildAdminApi, resolveAdminGuildId } from "@/lib/rbac";
import { db } from "@/db";
import { guilds, users } from "@/db/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import { fetchGuildMembers } from "@/bot/discord-bot";
import { findBestMatch } from "@/lib/discord-match";

// Limit image uploads to 10MB — a phone screenshot is typically 2-5MB.
// Larger uploads are almost always a mistake (wrong file picked, full-res
// camera shot instead of screenshot), and protect us from accidentally
// burning vision tokens on a 50MB image.
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MEDIA_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
type AllowedMediaType = (typeof ALLOWED_MEDIA_TYPES)[number];

// Strict JSON schema that Claude's structured-output mode validates against.
// `additionalProperties: false` is required for structured outputs.
const NAMES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    names: {
      type: "array",
      description:
        "Player in-game names extracted from the screenshot, in the order they appear top-to-bottom. One entry per visible player.",
      items: { type: "string" },
    },
  },
  required: ["names"],
} as const;

const SYSTEM_PROMPT = `You extract player in-game names from a single mobile-game guild-roster screenshot.

The screenshot shows a vertical list of guild members. Each row contains an avatar, the player's in-game name (large text, usually centered), optionally a small rank label like "Diplomat" / "Warbringer" / "Viceroy" beneath the name, a power score with a sword icon, and an online/offline status.

Extract ONLY the in-game names. Preserve exact spelling and casing, including non-ASCII characters (Polish, Chinese, Japanese, etc.). Do NOT include rank labels, power scores, or status text. Do NOT invent names that aren't legible — skip a row rather than guess.

Return the names as a JSON array, ordered top-to-bottom as they appear.`;

export async function POST(req: Request) {
  const session = await auth();

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        error:
          "Image import is not configured on this server (missing ANTHROPIC_API_KEY).",
      },
      { status: 503 }
    );
  }

  // Multipart upload. Next.js App Router's FormData handles the parsing.
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data with an image file." },
      { status: 400 }
    );
  }

  // Optional `guildId` form field — super-admins acting on a foreign guild
  // pass the impersonation target here so duplicate-name matching runs
  // against the correct member list.
  const rawGuildId = formData.get("guildId");
  const requestedGuildId =
    typeof rawGuildId === "string" && rawGuildId !== "" ? rawGuildId : undefined;

  const guard = requireGuildAdminApi(session, requestedGuildId);
  if (!guard.ok) return guard.response;
  const targetGuildId = await resolveAdminGuildId(guard.value, requestedGuildId);
  if (!targetGuildId) {
    return NextResponse.json({ error: "Guild not found" }, { status: 404 });
  }

  const file = formData.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Missing image file (field name: image)." },
      { status: 400 }
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      {
        error: `Image is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max ${MAX_BYTES / 1024 / 1024} MB.`,
      },
      { status: 413 }
    );
  }

  const mediaType = file.type;
  if (!ALLOWED_MEDIA_TYPES.includes(mediaType as AllowedMediaType)) {
    return NextResponse.json(
      {
        error: `Unsupported image type: ${mediaType || "(unknown)"}. Use PNG, JPEG, or WebP.`,
      },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");

  const client = new Anthropic();
  try {
    // Sonnet 4.6 is the cost-effective default for short OCR-style vision
    // tasks; rosters with ~10 names per image don't need Opus-tier reasoning.
    // Bump to claude-opus-4-7 if stylized fonts produce too many misreads.
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      output_config: {
        format: {
          type: "json_schema",
          schema: NAMES_SCHEMA,
        },
      },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType as AllowedMediaType,
                data: base64,
              },
            },
            {
              type: "text",
              text: "Extract the in-game names from this guild roster screenshot.",
            },
          ],
        },
      ],
    });

    // Structured outputs constrain the response to the schema, but we still
    // pull the first text block and parse it — `messages.create` returns
    // content blocks regardless of format.
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json(
        { error: "Vision API returned no text content." },
        { status: 502 }
      );
    }

    let parsed: { names: unknown };
    try {
      parsed = JSON.parse(textBlock.text);
    } catch {
      return NextResponse.json(
        { error: "Vision API response was not valid JSON." },
        { status: 502 }
      );
    }

    if (!Array.isArray(parsed.names)) {
      return NextResponse.json(
        { error: "Vision API response missing names array." },
        { status: 502 }
      );
    }

    const rawNames = parsed.names
      .filter((n): n is string => typeof n === "string")
      .map((n) => n.trim())
      .filter((n) => n.length > 0 && n.length <= 40);

    // Cross-reference each extracted name against the guild's existing
    // members so the client can flag/uncheck duplicates. Match is
    // case-insensitive on `inGameName` after trimming — same normalization
    // the bot uses elsewhere. We only match against in-game names (not the
    // OAuth `name` field) because the screenshot shows game-side identities.
    const existingRows = await db
      .select({ inGameName: users.inGameName })
      .from(users)
      .where(
        and(eq(users.guildId, targetGuildId), isNotNull(users.inGameName))
      );
    const existingSet = new Set(
      existingRows
        .map((r) => r.inGameName?.trim().toLowerCase())
        .filter((n): n is string => !!n && n.length > 0)
    );

    // Discord-side matching: if this guild has a linked Discord server,
    // pull the member list and fuzzy-match each extracted name. The match
    // becomes `discordMatch` on each row, which the client uses to:
    //   - pre-fill `discord_user_id` when the admin imports the stub
    //   - default a "send onboarding DM after import" checkbox to ON
    // If the bot isn't running, the intent's disabled, or the guild
    // isn't Discord-linked yet, we skip silently and clients fall back
    // to name-only stubs.
    const guildRow = await db.query.guilds.findFirst({
      where: eq(guilds.id, targetGuildId),
      columns: { discordGuildId: true },
    });

    type DiscordMatchPayload = {
      userId: string;
      handle: string;
      avatarUrl: string | null;
      confidence: "exact" | "fuzzy";
      matchedOn: "username" | "globalName" | "nick";
    };
    const matchByName = new Map<string, DiscordMatchPayload>();
    let discordWarning: string | null = null;

    if (guildRow?.discordGuildId) {
      const result = await fetchGuildMembers(guildRow.discordGuildId);
      if (result.ok) {
        // Track which Discord user IDs are already assigned so we don't
        // surface the same Discord member twice across multiple in-game
        // rows. The first row to match "wins" — second match is dropped.
        const claimedUserIds = new Set<string>();
        for (const name of rawNames) {
          const hit = findBestMatch(name, result.members);
          if (!hit) continue;
          if (claimedUserIds.has(hit.member.userId)) continue;
          claimedUserIds.add(hit.member.userId);
          matchByName.set(name, {
            userId: hit.member.userId,
            handle:
              hit.member.nick ??
              hit.member.globalName ??
              hit.member.username,
            avatarUrl: hit.member.avatarUrl,
            confidence: hit.confidence,
            matchedOn: hit.matchedOn,
          });
        }
      } else {
        // Soft-fail: caller still gets names + duplicate flags; the
        // Discord-match column just stays empty. Surface the reason on
        // the response so the UI can hint the admin (e.g. "enable the
        // Server Members Intent in the Developer Portal").
        discordWarning =
          result.reason === "intent-disabled"
            ? "Discord matching is disabled — enable the bot's 'Server Members Intent' in the Discord Developer Portal to auto-match by username."
            : result.reason === "bot-not-in-server"
              ? "Discord matching skipped — bot isn't a member of the linked Discord server."
              : result.reason === "no-token"
                ? "Discord matching skipped — bot not configured on this server."
                : "Discord matching skipped — couldn't reach Discord.";
      }
    }

    const names = rawNames.map((value) => ({
      value,
      duplicate: existingSet.has(value.toLowerCase()),
      discordMatch: matchByName.get(value) ?? null,
    }));

    return NextResponse.json({ names, discordWarning });
  } catch (err) {
    // Use typed exception classes from the SDK — never string-match error
    // messages (per the Claude API skill guidance).
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: "Vision API rate-limited. Try again in a moment." },
        { status: 429 }
      );
    }
    if (err instanceof Anthropic.AuthenticationError) {
      return NextResponse.json(
        { error: "Invalid ANTHROPIC_API_KEY on the server." },
        { status: 500 }
      );
    }
    if (err instanceof Anthropic.BadRequestError) {
      return NextResponse.json(
        { error: `Vision API rejected the request: ${err.message}` },
        { status: 400 }
      );
    }
    if (err instanceof Anthropic.APIError) {
      console.error(`[import-from-image] Claude API error ${err.status}:`, err);
      return NextResponse.json(
        { error: `Vision API error (${err.status}).` },
        { status: 502 }
      );
    }
    console.error("[import-from-image] unexpected error:", err);
    return NextResponse.json(
      { error: "Unexpected error extracting names from image." },
      { status: 500 }
    );
  }
}
