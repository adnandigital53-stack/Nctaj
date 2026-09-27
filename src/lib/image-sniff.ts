// Server-side confirmation that an uploaded "photo" is actually one of the
// three raster formats we serve, checked by magic bytes rather than trusting
// the browser-supplied File.type — a renamed .html/.svg (SVG can carry
// executable script) or arbitrary binary would otherwise pass straight
// through client-side compression's fallback path (it uploads the original
// file as-is when canvas decoding fails) and land in R2 untouched.
const SIGNATURES: { type: string; bytes: number[] }[] = [
  { type: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { type: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { type: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] }, // "RIFF"; "WEBP" confirmed at offset 8 below
];

export function sniffImageType(bytes: Uint8Array): string | null {
  for (const sig of SIGNATURES) {
    if (!sig.bytes.every((b, i) => bytes[i] === b)) continue;
    if (sig.type === 'image/webp') {
      const webp = [0x57, 0x45, 0x42, 0x50];
      if (!webp.every((b, i) => bytes[8 + i] === b)) continue;
    }
    return sig.type;
  }
  return null;
}
