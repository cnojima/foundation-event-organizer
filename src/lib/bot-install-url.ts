// Discord OAuth install URL for the Event Organizer bot. The client_id is
// this deployment's Discord application ID — fixed per deployment, embedded
// here so the install CTA works without a per-guild env lookup.
//
// permissions=133120 covers:
//   - Send Messages
//   - Mention Everyone (required for @everyone event reminders to actually
//     ping)
//
// Scopes:
//   - bot: lets the bot join the server and read/post in channels
//   - applications.commands: lets the bot register slash commands
//     (/upcoming, /signup, /settings, /locale) — required even though the
//     install dialog doesn't surface this scope prominently.
//
// Reused from:
//   - components/discord-settings-form.tsx (Guild Settings CTA)
//   - app/admin/help/page.tsx (admin help docs)
//   - app/admin/setup/page.tsx (new-guild onboarding checklist)
export const BOT_INSTALL_URL =
  "https://discord.com/oauth2/authorize?client_id=1502013027858387054&scope=bot+applications.commands&permissions=133120";
