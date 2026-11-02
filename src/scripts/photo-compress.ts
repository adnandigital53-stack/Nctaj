// Shared by both admin item forms (new.astro and [id].astro) — was copy-pasted
// identically in both until now. Resizes to at most 1280px on the long edge
// and re-encodes as JPEG q0.82 before the form submits, since a phone photo
// can be 4-8MB raw and none of that needs to survive into R2.
async function compress(file: File): Promise<File> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = URL.createObjectURL(file);
  });
  const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.82));
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
}

const input = document.getElementById('photo') as HTMLInputElement | null;
const status = document.getElementById('photo-status');
const form = document.getElementById('item-form') as HTMLFormElement | null;

let compressed: File | null = null;

input?.addEventListener('change', async () => {
  const file = input.files?.[0];
  if (!file) { compressed = null; if (status) status.textContent = ''; return; }
  if (status) status.textContent = 'Compressing…';
  try {
    compressed = await compress(file);
    if (status) status.textContent = `${(file.size / 1024).toFixed(0)}KB → ${(compressed.size / 1024).toFixed(0)}KB`;
  } catch {
    compressed = null;
    if (status) status.textContent = 'Could not read that image — uploading it as-is.';
  }
});

form?.addEventListener('submit', (e) => {
  if (!compressed) return; // no photo chosen, or compression failed — submit the original
  e.preventDefault();
  const dt = new DataTransfer();
  dt.items.add(compressed);
  input!.files = dt.files;
  form.submit();
});
