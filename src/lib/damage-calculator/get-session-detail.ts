import { db } from "@/db";
import { damageFleets, damageReadings, damageSessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { PHASES, type Phase } from "@/lib/damage-calculator/phases";

export type EntityAgg = {
  entityName: string;
  entityRole: "flagship" | "champion";
  phases: Partial<
    Record<Phase, { readingId: string; damageDealt: number; healingDone: number; damageReceived: number }>
  >;
  totalDamageDealt: number;
  dps: number | null;
};

export type FleetAgg = {
  fleet: { id: string; name: string; elementType: string | null };
  entities: EntityAgg[];
  dmgTotal: number;
};

export type SessionDetail = {
  session: typeof damageSessions.$inferSelect;
  phases: typeof PHASES;
  fleets: FleetAgg[];
};

// Shared by the session-detail API route and the server-rendered detail page
// so the pivot logic (fleet -> entity -> phase, DPS/DMG TOTAL semantics
// verified against the source spreadsheet) lives in exactly one place.
export async function getSessionDetail(sessionId: string): Promise<SessionDetail | null> {
  const damageSession = await db.query.damageSessions.findFirst({
    where: eq(damageSessions.id, sessionId),
  });
  if (!damageSession) return null;

  const rows = await db
    .select({
      id: damageReadings.id,
      phase: damageReadings.phase,
      entityName: damageReadings.entityName,
      entityRole: damageReadings.entityRole,
      damageDealt: damageReadings.damageDealt,
      healingDone: damageReadings.healingDone,
      damageReceived: damageReadings.damageReceived,
      fleetId: damageFleets.id,
      fleetName: damageFleets.name,
      fleetElementType: damageFleets.elementType,
    })
    .from(damageReadings)
    .innerJoin(damageFleets, eq(damageReadings.fleetId, damageFleets.id))
    .where(eq(damageReadings.sessionId, sessionId));

  const fleetMap = new Map<
    string,
    { fleet: FleetAgg["fleet"]; entities: Omit<EntityAgg, "dps">[]; dmgTotal: number }
  >();

  for (const row of rows) {
    let fleetAgg = fleetMap.get(row.fleetId);
    if (!fleetAgg) {
      fleetAgg = {
        fleet: { id: row.fleetId, name: row.fleetName, elementType: row.fleetElementType },
        entities: [],
        dmgTotal: 0,
      };
      fleetMap.set(row.fleetId, fleetAgg);
    }
    let entityAgg = fleetAgg.entities.find(
      (e) => e.entityName === row.entityName && e.entityRole === row.entityRole
    );
    if (!entityAgg) {
      entityAgg = {
        entityName: row.entityName,
        entityRole: row.entityRole as "flagship" | "champion",
        phases: {},
        totalDamageDealt: 0,
      };
      fleetAgg.entities.push(entityAgg);
    }
    entityAgg.phases[row.phase as Phase] = {
      readingId: row.id,
      damageDealt: row.damageDealt,
      healingDone: row.healingDone,
      damageReceived: row.damageReceived,
    };
    entityAgg.totalDamageDealt += row.damageDealt;
    fleetAgg.dmgTotal += row.damageDealt;
  }

  const totalTimeSeconds = damageSession.totalTimeSeconds;
  const fleets: FleetAgg[] = [...fleetMap.values()].map((f) => ({
    ...f,
    entities: f.entities
      .map((e) => ({
        ...e,
        dps: totalTimeSeconds ? e.totalDamageDealt / totalTimeSeconds : null,
      }))
      .sort((a, b) => (a.entityRole === b.entityRole ? 0 : a.entityRole === "flagship" ? -1 : 1)),
  }));

  return { session: damageSession, phases: PHASES, fleets };
}
