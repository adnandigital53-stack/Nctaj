// Single-admin auth: one password (a Worker secret), one signed cookie.
// No session table — the cookie carries its own expiry and an HMAC over
// {expiry} keyed by the admin password, so a valid cookie can only have
// been minted by someone who knew the password at the time. Verifying is
// pure computation, no D1 round-trip on every request.
//
// Cookies go through Astro's own `cookies` API (both in pages and in
// middleware) rather than hand-built Set-Cookie header strings — a manually
// appended header on `Astro.response.headers` doesn't survive a
// `return Astro.redirect(...)`, since that builds its own Response.

import type { AstroCookies } from 'astro';

const COOKIE_NAME = 'nc_admin';
const SESSION_HOURS = 12;

async function hmac(key: string, message: string): Promise<string> {
  const keyBytes = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', keyBytes, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time-ish compare; short-circuits are fine here since both sides are hashes/HMACs, not the raw secret. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPassword(env: Env, submitted: string): Promise<boolean> {
  if (!env.ADMIN_PASSWORD) return false; // fail closed if the secret was never set
  return timingSafeEqual(submitted, env.ADMIN_PASSWORD);
}

export async function setSessionCookie(cookies: AstroCookies, env: Env): Promise<void> {
  const expires = Date.now() + SESSION_HOURS * 60 * 60 * 1000;
  const sig = await hmac(env.ADMIN_PASSWORD ?? '', String(expires));
  cookies.set(COOKIE_NAME, `${expires}.${sig}`, {
    path: '/admin',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: SESSION_HOURS * 3600,
  });
}

export function clearSessionCookie(cookies: AstroCookies): void {
  cookies.delete(COOKIE_NAME, { path: '/admin' });
}

export async function isValidSession(env: Env, cookies: AstroCookies): Promise<boolean> {
  if (!env.ADMIN_PASSWORD) return false;
  const raw = cookies.get(COOKIE_NAME)?.value;
  if (!raw) return false;
  const [expiresStr, sig] = raw.split('.');
  const expires = Number(expiresStr);
  if (!expires || Date.now() > expires) return false;
  const expected = await hmac(env.ADMIN_PASSWORD, String(expires));
  return timingSafeEqual(sig ?? '', expected);
}
