import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { requireSuperAdminApi } from "@/lib/rbac";
import { db } from "@/db";
import { damageFleets, damageReadings, damageSessions } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { generateId } from "@/lib/ids";
import { PHASES, type Phase } from "@/lib/damage-calculator/phases";
import { resolveFlatPhase } from "@/lib/damage-calculator/resolve-phase";
import {
  ALLOWED_MEDIA_TYPES,
  extractBattleReading,
  type AllowedMediaType,
} from "@/lib/damage-calculator/ocr";
import {
  extractBattleReadingLocal,
  type LocalReading,
} from "@/lib/damage-calculator/local-ocr/extract";
import { TesseractUnavailableError } from "@/lib/damage-calculator/local-ocr/tesseract";

// Same cap as the member-import OCR route — a phone screenshot is a few MB;
// anything bigger is almost certainly the wrong file.
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;
  const session = await auth();
  const guard = requireSuperAdminApi(session);
  if (!guard.ok) return guard.response;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Damage calculator OCR is not configured on this server (missing ANTHROPIC_API_KEY)." },
      { status: 503 }
    );
  }

  const damageSession = await db.query.damageSessions.findFirst({
    where: eq(damageSessions.id, sessionId),
  });
  if (!damageSession) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data with an image file." },
      { status: 400 }
    );
  }

  // Phase is optional: folder-based uploads already know it client-side and
  // pass it explicitly, while flat uploads (no phase subfolders) omit it and
  // rely on OCR-detected stageDigit + resolveFlatPhase below instead.
  const rawPhase = formData.get("phase");
  if (rawPhase !== null && (typeof rawPhase !== "string" || !PHASES.includes(rawPhase as Phase))) {
    return NextResponse.json(
      { error: `Invalid phase. Must be one of: ${PHASES.join(", ")}` },
      { status: 400 }
    );
  }
  const explicitPhase = rawPhase as Phase | null;

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
      { error: `Unsupported image type: ${mediaType || "(unknown)"}. Use PNG, JPEG, or WebP.` },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");

  try {
    // Local OCR (Tesseract, deterministic pixel-region parsing) handles the
    // common case for free. Claude vision is only called when: local
    // extraction fails its own confidence gate (bad read, cross-check
    // mismatch, unrecognized layout), the `tesseract` binary isn't
    // available on this machine, or this is the first-ever screenshot of a
    // new fleet (elemental-type icon guessing is genuinely icon-semantics
    // work local OCR can't do). Worst case — local OCR unavailable or wrong
    // every time — this behaves exactly like the fully-Claude pipeline it
    // replaces.
    let local: { confident: boolean; reading: LocalReading | null } = { confident: false, reading: null };
    try {
      local = await extractBattleReadingLocal(buffer);
    } catch (err) {
      if (!(err instanceof TesseractUnavailableError)) throw err;
      console.warn("[damage-calculator readings] tesseract unavailable, using Claude fallback:", err);
    }

    let needsClaudeFallback = !local.confident || !local.reading;
    if (local.confident && local.reading) {
      const localFleetName = local.reading.flagship.name.trim();
      const existingFleet = await db.query.damageFleets.findFirst({
        where: sql`lower(${damageFleets.name}) = lower(${localFleetName})`,
      });
      // A brand-new fleet needs Claude for the one-time elemental-type
      // guess (see the `if (!fleet)` branch below) — icon semantics aren't
      // something local OCR attempts.
      if (!existingFleet) needsClaudeFallback = true;
    }

    const extractionMethod: "local" | "claude_fallback" = needsClaudeFallback ? "claude_fallback" : "local";
    const extracted = needsClaudeFallback
      ? await extractBattleReading({ base64, mediaType: mediaType as AllowedMediaType })
      : local.reading!;
    // LocalReading's flagship has no elementTypeGuess (local OCR can't guess
    // icon semantics) — only the Claude path (`ExtractedReading`) does.
    const elementTypeGuess =
      (extracted.flagship as { elementTypeGuess?: "beam" | "kinetic" | "ion" | "unknown" }).elementTypeGuess ??
      "unknown";

    // Fleets persist across sessions (same player, same flagship name every
    // raid) — match case-insensitively, create on first sighting.
    const fleetName = extracted.flagship.name.trim();
    let fleet = await db.query.damageFleets.findFirst({
      where: sql`lower(${damageFleets.name}) = lower(${fleetName})`,
    });
    if (!fleet) {
      const elementType = elementTypeGuess === "unknown" ? null : elementTypeGuess;
      const newFleet = {
        id: generateId(),
        name: fleetName,
        elementType,
        createdAt: new Date().toISOString(),
      };
      await db.insert(damageFleets).values(newFleet);
      fleet = newFleet;
    }

    const phase =
      explicitPhase ??
      (await resolveFlatPhase({
        sessionId,
        digit: extracted.stageDigit,
        fleetId: fleet.id,
      }));

    // Re-uploading a screenshot for the same phase+fleet replaces the prior
    // reading rows rather than accumulating duplicates.
    await db
      .delete(damageReadings)
      .where(
        and(
          eq(damageReadings.sessionId, sessionId),
          eq(damageReadings.phase, phase),
          eq(damageReadings.fleetId, fleet.id)
        )
      );

    const createdAt = new Date().toISOString();
    const rowsToInsert = [
      {
        id: generateId(),
        sessionId,
        phase,
        fleetId: fleet.id,
        entityName: extracted.flagship.name.trim(),
        entityRole: "flagship" as const,
        damageDealt: extracted.flagship.damageDealt,
        healingDone: extracted.flagship.healingDone,
        damageReceived: extracted.flagship.damageReceived,
        sourceFileName: file.name || null,
        extractionMethod,
        createdAt,
      },
      ...extracted.champions.map((c) => ({
        id: generateId(),
        sessionId,
        phase,
        fleetId: fleet!.id,
        entityName: c.name.trim(),
        entityRole: "champion" as const,
        damageDealt: c.damageDealt,
        healingDone: c.healingDone,
        damageReceived: c.damageReceived,
        sourceFileName: file.name || null,
        extractionMethod,
        createdAt,
      })),
    ];
    await db.insert(damageReadings).values(rowsToInsert);

    // Non-blocking cross-check: the enemy's total damage received should
    // equal the sum of every blue entity's damage dealt in this screenshot.
    const blueDealtTotal = rowsToInsert.reduce((sum, r) => sum + r.damageDealt, 0);
    const crossCheckWarning =
      blueDealtTotal !== extracted.enemy.damageReceived
        ? `Enemy damage-received (${extracted.enemy.damageReceived.toLocaleString()}) doesn't match the sum of blue damage-dealt (${blueDealtTotal.toLocaleString()}) — double-check this screenshot.`
        : null;

    return NextResponse.json({
      fleet,
      phase,
      readings: rowsToInsert,
      crossCheckWarning,
    });
  } catch (err) {
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
      console.error(`[damage-calculator readings] Claude API error ${err.status}:`, err);
      return NextResponse.json({ error: `Vision API error (${err.status}).` }, { status: 502 });
    }
    console.error("[damage-calculator readings] unexpected error:", err);
    return NextResponse.json(
      { error: "Unexpected error extracting battle stats from image." },
      { status: 500 }
    );
  }
}
