import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { requireSuperAdminApi } from "@/lib/rbac";
import { db } from "@/db";
import { damageFleets, damageReadings, damageSessions } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { generateId } from "@/lib/ids";
import { PHASES, type Phase } from "@/lib/damage-calculator/phases";
import {
  ALLOWED_MEDIA_TYPES,
  extractBattleReading,
  type AllowedMediaType,
} from "@/lib/damage-calculator/ocr";

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

  const rawPhase = formData.get("phase");
  if (typeof rawPhase !== "string" || !PHASES.includes(rawPhase as Phase)) {
    return NextResponse.json(
      { error: `Missing or invalid phase. Must be one of: ${PHASES.join(", ")}` },
      { status: 400 }
    );
  }
  const phase = rawPhase as Phase;

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
    const extracted = await extractBattleReading({
      base64,
      mediaType: mediaType as AllowedMediaType,
    });

    // Fleets persist across sessions (same player, same flagship name every
    // raid) — match case-insensitively, create on first sighting.
    const fleetName = extracted.flagship.name.trim();
    let fleet = await db.query.damageFleets.findFirst({
      where: sql`lower(${damageFleets.name}) = lower(${fleetName})`,
    });
    if (!fleet) {
      const elementType =
        extracted.flagship.elementTypeGuess === "unknown"
          ? null
          : extracted.flagship.elementTypeGuess;
      const newFleet = {
        id: generateId(),
        name: fleetName,
        elementType,
        createdAt: new Date().toISOString(),
      };
      await db.insert(damageFleets).values(newFleet);
      fleet = newFleet;
    }

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
