import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';

export const prerender = false;

// Streams a photo straight out of R2. Every key is either a seed photo
// uploaded once at migration time or an admin upload stamped with its own
// timestamp, so a given key's bytes never change — safe to cache forever.
export const GET: APIRoute = async ({ params }) => {
  const key = params.key;
  if (!key) return new Response('Not found', { status: 404 });

  const object = await env.MENU_IMAGES.get(key);
  if (!object) return new Response('Not found', { status: 404 });

  return new Response(object.body, {
    headers: {
      'content-type': object.httpMetadata?.contentType ?? 'image/jpeg',
      'cache-control': 'public, max-age=31536000, immutable',
      etag: object.httpEtag,
    },
  });
};
