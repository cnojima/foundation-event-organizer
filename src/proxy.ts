export { auth as proxy } from "@/auth";

export const config = {
  matcher: [
    // Match everything except: Auth.js routes, public ICS feeds, /api/health
    // (its own optional HEALTH_TOKEN gate), public help page, Next assets,
    // favicon, and the locale-switcher flag icons (needed pre-auth on the
    // sign-in/sign-up/landing pages).
    "/((?!api/auth|api/events|api/health|help|_next/static|_next/image|favicon\\.ico|flags/).*)",
  ],
};
