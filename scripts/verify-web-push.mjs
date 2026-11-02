/**
 * Cross-validates src/lib/web-push.ts against an independent, widely-used
 * implementation of the same specs (RFC 8291 payload encryption, RFC 8292
 * VAPID) — the `http_ece`/`web-push` npm packages' own crypto — rather than
 * trusting that code written from the RFC text is correct just because it
 * runs without throwing. Real push infrastructure (FCM, Mozilla autopush)
 * is unreachable from this environment's network policy, so this is the
 * strongest verification available short of a live device test.
 *
 * Needs the http_ece package's source on disk (not a project dependency —
 * it's never used at runtime, only here, so it isn't installed via npm
 * install; point HTTP_ECE_PATH at wherever you've fetched it, e.g. via
 * `npm pack http_ece` and extracting the tarball).
 *
 *   node --experimental-strip-types scripts/verify-web-push.mjs
 */
import { createECDH, randomBytes, createVerify, createHash } from 'node:crypto';
import { encryptWebPushPayload, buildVapidAuthHeader } from '../src/lib/web-push.ts';

const HTTP_ECE_PATH = process.env.HTTP_ECE_PATH
  || '/tmp/claude-0/-home-user-Nctaj/7cae63fd-8a29-5cc3-aaaf-d665eff6bb74/scratchpad/webpush-check/package/ece.js';
const { encrypt: eceEncrypt } = await import(HTTP_ECE_PATH);

const results = [];
const check = (name, pass, detail = '') => results.push({ name, pass, detail });

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const b64urlToBuf = (s) => Buffer.from(s, 'base64url');

// ---- a fake "subscriber" (what a real browser's PushSubscription gives you) ----
const ua = createECDH('prime256v1');
const uaPublicRaw = ua.generateKeys(); // 65-byte uncompressed point
const authSecret = randomBytes(16);
const p256dh = b64url(uaPublicRaw);
const auth = b64url(authSecret);

// ---- a hand-written decrypt, mirroring web-push.ts's own key derivation,
// used only here to verify — never shipped. ----
async function hmacSha256(keyBytes, data) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, data));
}
function concatBytes(...parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) { out.set(p, offset); offset += p.length; }
  return out;
}
async function hkdf(salt, ikm, info, length) {
  const prk = await hmacSha256(salt, ikm);
  let output = new Uint8Array(0), t = new Uint8Array(0), counter = 1;
  while (output.length < length) {
    t = await hmacSha256(prk, concatBytes(t, info, new Uint8Array([counter])));
    output = concatBytes(output, t);
    counter++;
  }
  return output.slice(0, length);
}
async function testDecrypt(body, uaPrivateEcdh, authSecretBuf) {
  const salt = body.slice(0, 16);
  const idlen = body[20];
  const asPublicRaw = body.slice(21, 21 + idlen);
  const ciphertext = body.slice(21 + idlen);

  const asPublicKey = await crypto.subtle.importKey('raw', asPublicRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const uaPrivateJwk = ecdhNodeKeyToJwk(uaPrivateEcdh);
  const uaPrivateKey = await crypto.subtle.importKey('jwk', uaPrivateJwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asPublicKey }, uaPrivateKey, 256));

  const uaPublicRawLocal = new Uint8Array(uaPrivateEcdh.getPublicKey());
  const ikmInfo = concatBytes(new TextEncoder().encode('WebPush: info\0'), uaPublicRawLocal, new Uint8Array(asPublicRaw));
  const ikm = await hkdf(new Uint8Array(authSecretBuf), sharedSecret, ikmInfo, 32);

  const cek = await hkdf(new Uint8Array(salt), ikm, new TextEncoder().encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(new Uint8Array(salt), ikm, new TextEncoder().encode('Content-Encoding: nonce\0'), 12);

  const cekKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['decrypt']);
  const plaintextWithDelimiter = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, cekKey, new Uint8Array(ciphertext)));
  // strip the trailing 0x02 delimiter (single-record message)
  if (plaintextWithDelimiter[plaintextWithDelimiter.length - 1] !== 2) throw new Error('bad delimiter byte');
  return Buffer.from(plaintextWithDelimiter.slice(0, -1)).toString('utf8');
}
function ecdhNodeKeyToJwk(ecdh) {
  const pub = ecdh.getPublicKey();
  const x = pub.slice(1, 33), y = pub.slice(33, 65);
  const d = ecdh.getPrivateKey();
  const dPadded = Buffer.concat([Buffer.alloc(32 - d.length), d]); // left-pad to 32 bytes
  return { kty: 'EC', crv: 'P-256', x: b64url(x), y: b64url(y), d: b64url(dPadded), ext: true, key_ops: ['deriveBits'] };
}

// ==== Test 1: http_ece (trusted reference) encrypts -> our decrypt recovers plaintext ====
const plaintext1 = 'When I grow up, I want to be a watermelon';
const localCurve = createECDH('prime256v1');
localCurve.generateKeys();
const salt1 = randomBytes(16).toString('base64url');
const eceBody = eceEncrypt(Buffer.from(plaintext1), {
  version: 'aes128gcm',
  dh: p256dh,
  privateKey: localCurve,
  salt: salt1,
  authSecret: auth,
});
try {
  const recovered1 = await testDecrypt(eceBody, ua, authSecret);
  check('our decrypt recovers http_ece-encrypted plaintext', recovered1 === plaintext1, `got: ${recovered1}`);
} catch (e) {
  check('our decrypt recovers http_ece-encrypted plaintext', false, e.stack);
}

// ==== Test 2: our shipped encryptWebPushPayload -> our decrypt round-trips ====
const plaintext2 = JSON.stringify({ title: 'NC Taj', body: 'New biryani special today!', url: '/menu' });
try {
  const ourBody = await encryptWebPushPayload(new TextEncoder().encode(plaintext2), p256dh, auth);
  const recovered2 = await testDecrypt(Buffer.from(ourBody), ua, authSecret);
  check('our own encrypt -> our decrypt round-trips', recovered2 === plaintext2, `got: ${recovered2}`);
} catch (e) {
  check('our own encrypt -> our decrypt round-trips', false, e.stack);
}

// ==== Test 3: VAPID JWT is well-formed and its signature verifies against the public key ====
try {
  const vapidKeyPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const vapidPublicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', vapidKeyPair.publicKey));
  const vapidPrivateJwk = await crypto.subtle.exportKey('jwk', vapidKeyPair.privateKey);
  const vapidPublicB64 = b64url(vapidPublicRaw);

  const authHeader = await buildVapidAuthHeader('https://fcm.googleapis.com/fake/endpoint', vapidPublicB64, vapidPrivateJwk, 'mailto:test@example.com');
  const match = authHeader.match(/^vapid t=([^,]+), k=(.+)$/);
  check('Authorization header has the expected "vapid t=..., k=..." shape', !!match, authHeader);

  const jwt = match[1];
  const [headerB64, claimsB64, sigB64] = jwt.split('.');
  const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());
  const claims = JSON.parse(Buffer.from(claimsB64, 'base64url').toString());
  check('JWT header is {typ: JWT, alg: ES256}', header.typ === 'JWT' && header.alg === 'ES256', JSON.stringify(header));
  check('JWT aud matches the endpoint origin', claims.aud === 'https://fcm.googleapis.com', JSON.stringify(claims));
  check('JWT exp is ~12h in the future', Math.abs(claims.exp - Math.floor(Date.now() / 1000) - 12 * 3600) < 5, String(claims.exp));

  const signature = b64urlToBuf(sigB64);
  const signingInput = `${headerB64}.${claimsB64}`;
  const verifyKey = await crypto.subtle.importKey('raw', vapidPublicRaw, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const sigValid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, verifyKey, signature, new TextEncoder().encode(signingInput));
  check('JWT signature verifies against the VAPID public key', sigValid);
  check('raw ECDSA signature is exactly 64 bytes (r||s, no DER wrapping)', signature.length === 64, `got ${signature.length}`);
} catch (e) {
  check('VAPID JWT construction', false, e.stack);
}

let failed = 0;
for (const r of results) {
  console.log(`${r.pass ? '✓' : '✗'} ${r.name}${r.pass || !r.detail ? '' : '\n  ' + r.detail}`);
  if (!r.pass) failed++;
}
console.log(failed ? `\n${failed} FAILED` : `\nall ${results.length} web push crypto checks passed`);
process.exit(failed ? 1 : 0);
