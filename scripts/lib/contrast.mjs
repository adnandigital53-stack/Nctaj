/**
 * Shared WCAG AA contrast-sampling logic, used by check-contrast.mjs (the
 * public site) and check-admin-a11y.mjs (the admin panel) — extracted
 * here once both needed the exact same math, rather than kept in sync by
 * hand in two files.
 */
const srgb = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = ([r, g, b]) => 0.2126 * srgb(r / 255) + 0.7152 * srgb(g / 255) + 0.0722 * srgb(b / 255);
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const parse = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);

/** Runs in-page: samples every leaf text node's foreground/composited background. */
function collectSamples() {
  // Collect background layers up the tree and composite them, so a
  // translucent chip is compared against what it actually renders as.
  const bgOf = (el) => {
    const layers = [];
    let node = el;
    while (node) {
      const m = (getComputedStyle(node).backgroundColor.match(/[\d.]+/g) || []).map(Number);
      if (m.length >= 3) {
        const a = m.length === 4 ? m[3] : 1;
        if (a > 0) {
          layers.push([m[0], m[1], m[2], a]);
          if (a === 1) break;
        }
      }
      node = node.parentElement;
    }
    let base = [14, 14, 16];
    for (let i = layers.length - 1; i >= 0; i--) {
      const [r, g, b, a] = layers[i];
      base = [r * a + base[0] * (1 - a), g * a + base[1] * (1 - a), b * a + base[2] * (1 - a)];
    }
    return `rgb(${base.map(Math.round).join(', ')})`;
  };

  const out = [];
  document.querySelectorAll('a, button, p, h1, h2, h3, span, li, label, code, td, th').forEach((el) => {
    const text = el.textContent?.trim();
    if (!text || el.children.length > 0) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || el.offsetParent === null) return;
    const px = parseFloat(cs.fontSize);
    const bold = parseInt(cs.fontWeight, 10) >= 700;
    out.push({
      text: text.slice(0, 40),
      fg: cs.color,
      bg: bgOf(el),
      // WCAG "large text": >=24px, or >=18.66px bold.
      large: px >= 24 || (bold && px >= 18.66),
      sel: el.className || el.tagName.toLowerCase(),
    });
  });
  return out;
}

/** Navigates `page` to BASE+path, samples it, and returns AA failure strings for that page. */
export async function checkPageContrast(page, base, path) {
  await page.goto(base + path, { waitUntil: 'load' });
  const samples = await page.evaluate(collectSamples);

  const failures = [];
  for (const s of samples) {
    const r = ratio(parse(s.fg), parse(s.bg));
    const need = s.large ? 3 : 4.5;
    if (r < need) {
      failures.push(`${path}  "${s.text}"  [${s.sel}]  ${r.toFixed(2)}:1 < ${need}:1  (${s.fg} on ${s.bg})`);
    }
  }
  return failures;
}
