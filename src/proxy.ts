export { auth as proxy } from "@/auth";

export const config = {
  matcher: [
    // Match everything except: Auth.js routes, public ICS feeds, Next assets, favicon.
    "/((?!api/auth|api/events|_next/static|_next/image|favicon\\.ico).*)",
  ],
};
