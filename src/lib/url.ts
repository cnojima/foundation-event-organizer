// Pulls the public-facing app origin from an incoming request — used to
// build links in outgoing Discord notifications. Reads `x-forwarded-*`
// headers when present (Fly + Vercel terminate TLS upstream), otherwise
// falls back to `req.url`. Returns a string with no trailing slash.
export function appBaseUrlFromRequest(req: Request): string {
  const headers = req.headers;
  const proto = headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  const host =
    headers.get("x-forwarded-host") ??
    headers.get("host") ??
    new URL(req.url).host;
  return `${proto}://${host}`;
}
