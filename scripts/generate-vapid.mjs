// Prints a fresh VAPID keypair for Web Push. Run once:  node scripts/generate-vapid.mjs
// - "public" goes in wrangler.jsonc  vars.VAPID_PUBLIC_KEY  (safe to commit)
// - "private jwk" goes in .dev.vars and `npx wrangler secret put VAPID_PRIVATE_KEY_JWK` (never commit)
// Changing the pair invalidates existing subscriptions, so do this before launch.
const k = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
console.log('public:     ', Buffer.from(await crypto.subtle.exportKey('raw', k.publicKey)).toString('base64url'));
console.log('private jwk:', JSON.stringify(await crypto.subtle.exportKey('jwk', k.privateKey)));
