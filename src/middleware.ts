import { env } from 'cloudflare:workers';
import { defineMiddleware } from 'astro:middleware';
import { isValidSession } from './lib/auth';

// Every /admin/* page requires a valid session cookie except the login
// page itself. Checked once here rather than per-page, so a new admin
// route can't accidentally ship unprotected.
const PUBLIC_PATHS = ['/admin/login'];

// 'unsafe-inline' on script/style is unavoidable without a nonce pipeline —
// every page here uses <script is:inline> and inline style attributes
// throughout, and there's no per-request nonce threaded through them. Still
// worth setting: frame-ancestors blocks clickjacking outright, and
// default-src/connect-src/object-src close off arbitrary exfiltration
// targets even if a script got injected some other way. blob: in img-src is
// required for the admin photo-compression preview (new Image() with a
// URL.createObjectURL(file) source is still subject to img-src).
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://www.google-analytics.com https://www.googletagmanager.com",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function decorateResponse(response: Response, pathname: string, method: string): Response {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('Content-Security-Policy', CSP);
  // Cloudflare Workers only ever serve over HTTPS, so this costs nothing —
  // it just tells the browser to stop trying plain HTTP on repeat visits.
  // No `preload` directive: that's a promise to submit the domain to the
  // browser preload list, a deliberate step for whoever owns the domain to
  // take, not something to imply from here.
  headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  // Every target="_blank" link on this site already carries rel="noopener",
  // so severing window.opener via COOP changes nothing observable — it just
  // closes the same door from the platform side too (isolates this site's
  // browsing context group from cross-origin popups/openers, the standard
  // mitigation for XS-Leaks-style timing attacks).
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');

  // Every page on the site — public or admin — is a live D1 read on every
  // request; explicit no-store rather than omitting the header, so neither
  // an intermediate cache nor a browser's back-forward-cache holds onto a
  // response a visitor should never see twice. A visitor opening the site
  // always gets what's actually in the database right now, not whatever
  // was true up to a couple of minutes ago. Skipped only for /uploads,
  // which already sets its own long-lived immutable cache (those files are
  // genuinely immutable — a new photo gets a new key, never overwrites an
  // old one), and anything a route already set its own cache-control for.
  const shouldNoStore =
    !pathname.startsWith('/uploads') &&
    !headers.has('cache-control');
  if (shouldNoStore) {
    headers.set('cache-control', 'no-store, private');
  }

  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  const method = context.request.method;

  if (pathname.startsWith('/admin') && !PUBLIC_PATHS.includes(pathname)) {
    const ok = await isValidSession(env, context.cookies);
    if (!ok) return decorateResponse(context.redirect('/admin/login'), pathname, method);
    context.locals.isAdmin = true;
  }

  return decorateResponse(await next(), pathname, method);
});
