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

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('Content-Security-Policy', CSP);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  if (pathname.startsWith('/admin') && !PUBLIC_PATHS.includes(pathname)) {
    const ok = await isValidSession(env, context.cookies);
    if (!ok) return withSecurityHeaders(context.redirect('/admin/login'));
    context.locals.isAdmin = true;
  }

  return withSecurityHeaders(await next());
});
