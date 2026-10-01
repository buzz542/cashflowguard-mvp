/**
 * Get files under Vercel's request body limit (~4.5MB) before upload.
 * Photos are downscaled in the browser: Claude resizes images to about 1568px on the
 * long edge anyway, so anything bigger is wasted bandwidth and tokens.
 */

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MAX_IMAGE_EDGE = 1568;

/** Target size that fits within `max` on the long edge, keeping aspect ratio. Never upscales. */
export function fitWithin(width: number, height: number, max = MAX_IMAGE_EDGE): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= max) return { width, height };
  const k = max / long;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

const RESIZABLE = /^image\/(jpeg|png|webp|gif)$/i;

/**
 * Returns a file that's safe to upload, or throws with a message for the user.
 * Browser-only (uses createImageBitmap + canvas).
 */
export async function prepareUpload(file: File): Promise<File> {
  if (RESIZABLE.test(file.type)) {
    const bitmap = await createImageBitmap(file);
    const size = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#fff"; // transparent PNGs → white page, not black
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.drawImage(bitmap, 0, 0, size.width, size.height);
    bitmap.close();
    for (const quality of [0.85, 0.7, 0.5]) {
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
      if (blob && blob.size <= MAX_UPLOAD_BYTES) {
        return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
      }
    }
    throw new Error(`${file.name}: photo is too large even after shrinking. Try a closer shot of one page.`);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`${file.name}: file is over 4MB. Split it into smaller files, photograph the pages, or paste the text.`);
  }
  return file;
}
