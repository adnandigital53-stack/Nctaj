import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';

export const prerender = false;

// Stores (or refreshes) a browser's push subscription. No auth needed — this
// is the public "notify me" checkbox in Footer.astro, not an admin action.
// Astro's own CSRF origin check already covers this POST like every other
// form on the site; input is validated by shape below rather than rate-
// limited, since the worst a bad actor gets from spamming this is junk rows
// in a table nothing reads except the admin's own "send" action, not
// anything that can be used to attack a third party or spend money.
export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const sub = body as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (
    typeof sub.endpoint !== 'string' ||
    !sub.endpoint.startsWith('https://') ||
    typeof sub.keys?.p256dh !== 'string' ||
    typeof sub.keys?.auth !== 'string'
  ) {
    return new Response('Malformed subscription', { status: 400 });
  }

  await env.DB
    .prepare('INSERT OR REPLACE INTO push_subscriptions (endpoint, p256dh, auth) VALUES (?, ?, ?)')
    .bind(sub.endpoint, sub.keys.p256dh, sub.keys.auth)
    .run();

  return new Response(null, { status: 204 });
};
