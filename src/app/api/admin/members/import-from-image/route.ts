import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { requireGuildAdminApi } from "@/lib/rbac";

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
  const guard = requireGuildAdminApi(session);
  if (!guard.ok) return guard.response;

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

    const names = parsed.names
      .filter((n): n is string => typeof n === "string")
      .map((n) => n.trim())
      .filter((n) => n.length > 0 && n.length <= 40);

    return NextResponse.json({ names });
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
