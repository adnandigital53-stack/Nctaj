import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const { endpoint } = body as { endpoint?: unknown };
  if (typeof endpoint !== 'string') {
    return new Response('Malformed request', { status: 400 });
  }

  await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(endpoint).run();
  return new Response(null, { status: 204 });
};
