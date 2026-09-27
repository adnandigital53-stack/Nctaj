import type { APIRoute } from 'astro';
import site from '../data/site.json';

// Static route list, not read from D1 — this doesn't need a live request,
// unlike every other page in this app (which stay dynamic for the D1-backed
// menu/preview-banner). Nothing here changes without a code change.
export const prerender = true;

const routes = ['', '/menu', '/order', '/about', '/contact'];

export const GET: APIRoute = () => {
  const base = (site.siteUrl ?? '').replace(/\/$/, '');
  const urls = routes
    .map(
      (path) => `  <url>
    <loc>${base}${path}</loc>
  </url>`,
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

  return new Response(xml, {
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  });
};
