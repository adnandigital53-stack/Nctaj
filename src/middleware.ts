import { env } from 'cloudflare:workers';
import { defineMiddleware } from 'astro:middleware';
import { isValidSession } from './lib/auth';

// Every /admin/* page requires a valid session cookie except the login
// page itself. Checked once here rather than per-page, so a new admin
// route can't accidentally ship unprotected.
const PUBLIC_PATHS = ['/admin/login'];

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  if (!pathname.startsWith('/admin') || PUBLIC_PATHS.includes(pathname)) return next();

  const ok = await isValidSession(env, context.cookies);

  if (!ok) return context.redirect('/admin/login');

  context.locals.isAdmin = true;
  return next();
});
