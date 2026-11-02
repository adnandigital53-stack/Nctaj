/**
 * Web Push: VAPID-signed, RFC 8291-encrypted notifications, sent from a
 * Cloudflare Worker using only the standard Web Crypto API (SubtleCrypto) —
 * no Node-specific crypto, since this runs at the edge, not in Node. Cross-
 * validated against the widely-used `http_ece`/`web-push` npm packages'
 * own implementation of the same spec (see scripts/verify-web-push.mjs),
 * not just written from the RFC and trusted.
 */

const textEncoder = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

async function hmacSha256(keyBytes: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, data));
}

/** HKDF (RFC 5869) using SHA-256, as specified by RFC 8188/8291. */
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const prk = await hmacSha256(salt, ikm); // HKDF-Extract
  let output = new Uint8Array(0);
  let t = new Uint8Array(0);
  let counter = 1;
  while (output.length < length) {
    t = await hmacSha256(prk, concatBytes(t, info, new Uint8Array([counter])));
    output = concatBytes(output, t);
    counter++;
  }
  return output.slice(0, length);
}

export interface PushSubscriptionKeys {
  endpoint: string;
  p256dh: string; // base64url, 65-byte uncompressed P-256 point
  auth: string; // base64url, 16-byte auth secret
}

/**
 * RFC 8291 §3.3–3.4: encrypts `payload` for the subscriber identified by
 * `p256dh`/`auth`, returning the complete "aes128gcm" content-coded body
 * (RFC 8188 §2) ready to POST as-is.
 */
export async function encryptWebPushPayload(payload: Uint8Array, p256dhB64url: string, authB64url: string): Promise<Uint8Array> {
  const uaPublicRaw = b64urlDecode(p256dhB64url);
  if (uaPublicRaw.length !== 65) throw new Error('p256dh must decode to a 65-byte uncompressed EC point');
  const authSecret = b64urlDecode(authB64url);

  const uaPublicKey = await crypto.subtle.importKey('raw', uaPublicRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ephemeral = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', ephemeral.publicKey));

  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaPublicKey }, ephemeral.privateKey, 256),
  );

  // "WebPush: info" || 0x00 || receiver (UA) public || sender (app server) public
  const ikmInfo = concatBytes(textEncoder.encode('WebPush: info\0'), uaPublicRaw, asPublicRaw);
  const ikm = await hkdf(authSecret, sharedSecret, ikmInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, textEncoder.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, textEncoder.encode('Content-Encoding: nonce\0'), 12);

  // Single-record message: plaintext + delimiter (0x02 = last/only record),
  // no additional padding — every push payload here is well under the 4KB
  // single-record limit.
  const plaintextWithDelimiter = concatBytes(payload, new Uint8Array([2]));
  const cekKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, cekKey, plaintextWithDelimiter),
  );

  // RFC 8188 §2.1 header: salt(16) || record size(4, BE) || keyid length(1) || keyid
  const rs = 4096;
  const header = new Uint8Array(16 + 4 + 1 + asPublicRaw.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, rs, false);
  header[20] = asPublicRaw.length;
  header.set(asPublicRaw, 21);

  return concatBytes(header, ciphertext);
}

/** RFC 8292: a VAPID JWT + "vapid" auth scheme value for the Authorization header. */
export async function buildVapidAuthHeader(
  endpoint: string,
  vapidPublicKeyB64url: string,
  vapidPrivateKeyJwk: JsonWebKey,
  subject: string,
): Promise<string> {
  const audience = new URL(endpoint).origin;
  const now = Math.floor(Date.now() / 1000);
  const encode = (obj: unknown) => b64url(textEncoder.encode(JSON.stringify(obj)));
  const signingInput = `${encode({ typ: 'JWT', alg: 'ES256' })}.${encode({ aud: audience, exp: now + 12 * 3600, sub: subject })}`;

  const privateKey = await crypto.subtle.importKey('jwk', vapidPrivateKeyJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  // SubtleCrypto's ECDSA signature is the raw (r || s) format JWS/ES256
  // expects directly — unlike Node's crypto.sign(), which defaults to DER
  // and would need re-encoding.
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, textEncoder.encode(signingInput)));

  return `vapid t=${signingInput}.${b64url(signature)}, k=${vapidPublicKeyB64url}`;
}

export interface VapidKeys {
  publicKey: string; // base64url, shared with the client as applicationServerKey
  privateKeyJwk: JsonWebKey; // secret
  subject: string; // "mailto:you@example.com" or an https: URL, per RFC 8292
}

/**
 * Sends one push message. Callers should delete the subscription on a 404
 * or 410 response (the push service is telling us it's gone) and treat
 * other non-2xx statuses as transient.
 */
export async function sendWebPush(subscription: PushSubscriptionKeys, vapid: VapidKeys, payload: unknown): Promise<Response> {
  const body = await encryptWebPushPayload(textEncoder.encode(JSON.stringify(payload)), subscription.p256dh, subscription.auth);
  const authHeader = await buildVapidAuthHeader(subscription.endpoint, vapid.publicKey, vapid.privateKeyJwk, vapid.subject);

  return fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
    },
    body,
  });
}
