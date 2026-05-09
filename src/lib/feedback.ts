export const FEEDBACK_REPO_URL =
  "https://github.com/cnojima/foundation-event-organizer";
export const FEEDBACK_ISSUES_URL = `${FEEDBACK_REPO_URL}/issues`;

export type FeedbackKind = "bug" | "suggestion";

export type FeedbackUserContext = {
  inGameName: string | null;
  guildName: string | null;
  guildSlug: string | null;
};

const TEMPLATES: Record<
  FeedbackKind,
  { titlePrefix: string; labels: string[]; bodyPrompt: string }
> = {
  bug: {
    titlePrefix: "[Bug] ",
    labels: ["bug", "alpha-feedback"],
    bodyPrompt: [
      "**What happened?**",
      "<!-- A clear description of the bug -->",
      "",
      "**What did you expect?**",
      "",
      "**Steps to reproduce**",
      "1. ",
      "2. ",
      "3. ",
      "",
    ].join("\n"),
  },
  suggestion: {
    titlePrefix: "[Suggestion] ",
    labels: ["enhancement", "alpha-feedback"],
    bodyPrompt: [
      "**What would you like to see?**",
      "<!-- A clear description of the idea -->",
      "",
      "**Why does it matter?**",
      "<!-- What problem does this solve, or what does it improve? -->",
      "",
    ].join("\n"),
  },
};

// Builds a context block to append to the body — auto-filled with environment
// + user info so the report is actionable. Users can edit/remove before
// submitting (GitHub shows the issue form pre-populated).
function buildContextBlock({
  pagePath,
  viewport,
  userAgent,
  user,
}: {
  pagePath: string;
  viewport: string;
  userAgent: string;
  user: FeedbackUserContext;
}): string {
  const lines = [
    "---",
    "**Context** (auto-filled — feel free to edit before submitting):",
    `- Page: \`${pagePath}\``,
    `- Viewport: ${viewport}`,
    `- User agent: ${userAgent}`,
  ];
  if (user.inGameName) {
    lines.push(`- In-game name: ${user.inGameName}`);
  }
  if (user.guildName) {
    lines.push(
      `- Guild: ${user.guildName}${user.guildSlug ? ` (\`${user.guildSlug}\`)` : ""}`
    );
  }
  return lines.join("\n");
}

export function buildIssueUrl({
  kind,
  pagePath,
  viewport,
  userAgent,
  user,
}: {
  kind: FeedbackKind;
  pagePath: string;
  viewport: string;
  userAgent: string;
  user: FeedbackUserContext;
}): string {
  const tpl = TEMPLATES[kind];
  const body = `${tpl.bodyPrompt}\n${buildContextBlock({
    pagePath,
    viewport,
    userAgent,
    user,
  })}\n`;
  const params = new URLSearchParams({
    title: tpl.titlePrefix,
    body,
    labels: tpl.labels.join(","),
  });
  return `${FEEDBACK_REPO_URL}/issues/new?${params.toString()}`;
}
