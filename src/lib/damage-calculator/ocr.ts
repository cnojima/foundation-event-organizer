import Anthropic from "@anthropic-ai/sdk";

export const ALLOWED_MEDIA_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type AllowedMediaType = (typeof ALLOWED_MEDIA_TYPES)[number];

export type ExtractedEntity = {
  name: string;
  damageDealt: number;
  healingDone: number;
  damageReceived: number;
};

export type ExtractedReading = {
  flagship: ExtractedEntity & {
    elementTypeGuess: "beam" | "kinetic" | "ion" | "unknown";
  };
  champions: ExtractedEntity[];
  enemy: ExtractedEntity;
  // The small numeric badge on the corner of the enemy portrait (upper
  // right) — this is the raid's major stage number (1-4), confirmed present
  // on every "Calamity Befalls" card. Used to auto-detect phase for flat,
  // non-folder-organized screenshot uploads.
  stageDigit: 1 | 2 | 3 | 4;
};

const ENTITY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string" },
    damageDealt: { type: "integer" },
    healingDone: { type: "integer" },
    damageReceived: { type: "integer" },
  },
  required: ["name", "damageDealt", "healingDone", "damageReceived"],
} as const;

const READING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    flagship: {
      type: "object",
      additionalProperties: false,
      properties: {
        ...ENTITY_SCHEMA.properties,
        elementTypeGuess: {
          type: "string",
          enum: ["beam", "kinetic", "ion", "unknown"],
        },
      },
      required: [...ENTITY_SCHEMA.required, "elementTypeGuess"],
    },
    champions: {
      type: "array",
      description: "Up to 3 champion rows below the flagship, top to bottom.",
      items: ENTITY_SCHEMA,
    },
    enemy: ENTITY_SCHEMA,
    stageDigit: { type: "integer", enum: [1, 2, 3, 4] },
  },
  required: ["flagship", "champions", "enemy", "stageDigit"],
} as const;

const SYSTEM_PROMPT = `You extract battle statistics from a single mobile-game "damage stats card" screenshot for the raid event Calamity Befalls.

The card has two columns:
- BLUE fleet (left): a header bar, then a flagship row (avatar, level number, a "+N" enhancement badge), then up to 3 champion rows below it (avatar, name, level). Each row shows 3 stats left to right: a fist icon = damage dealt, an asterisk icon = healing done, a shield icon = damage received.
- RED enemy (right, e.g. "Calamity Befalls"): a single row with the SAME 3 stats but in MIRRORED order (shield/damage-received leftmost, fist/damage-dealt rightmost) since the layout faces the blue side.

Critical: large numbers visually wrap onto a second line directly below the main value (e.g. a number rendered as "70,330,36" with "7" on the line just below it is actually 70,330,367 — concatenate the wrapped digits into ONE number). Never report a truncated number, and never invent digits you can't see. If a stat shows 0 or is blank, report 0.

For the flagship only, also give your best guess at its elemental type (beam / kinetic / ion) from the small style icon badge near its avatar or level. If you can't confidently tell, use "unknown" — do not guess randomly.

The enemy portrait (top right, next to "Calamity Befalls") carries a small numeric badge in its bottom-right corner, showing a single digit 1-4 — this is the raid's major stage number. Report it as stageDigit.

Preserve exact name spelling, including accented characters. Return only the champions actually visible (there may be fewer than 3).`;

export async function extractBattleReading(params: {
  base64: string;
  mediaType: AllowedMediaType;
}): Promise<ExtractedReading> {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    output_config: {
      format: {
        type: "json_schema",
        schema: READING_SCHEMA,
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
              media_type: params.mediaType,
              data: params.base64,
            },
          },
          {
            type: "text",
            text: "Extract the battle stats from this screenshot.",
          },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Vision API returned no text content.");
  }

  return JSON.parse(textBlock.text) as ExtractedReading;
}
