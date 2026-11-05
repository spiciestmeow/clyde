import { supabase } from './supabase';

/**
 * Resizes and compresses an image file on an HTML5 canvas.
 * Reduces a typical 2MB-5MB camera/web image down to ~20KB-40KB.
 */
export function compressImageFile(
  file: File,
  maxWidth = 450,
  maxHeight = 650,
  quality = 0.82,
  onProgress?: (progress: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 85));
    };
    reader.onload = (event) => {
      onProgress?.(88);
      const dataUrl = event.target?.result as string;
      if (!dataUrl) {
        reject(new Error('Image file is empty.'));
        return;
      }

      const img = new Image();
      img.onerror = () => reject(new Error('Failed to decode image.'));
      img.onload = () => {
        onProgress?.(92);
        let { width, height } = img;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        onProgress?.(97);

        // Try webp first for best compression, fallback to jpeg
        const webpUrl = canvas.toDataURL('image/webp', quality);
        if (webpUrl && webpUrl.startsWith('data:image/webp')) {
          resolve(webpUrl);
        } else {
          resolve(canvas.toDataURL('image/jpeg', quality));
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

/** Converts a File to a base64 string. */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file for upload.'));
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data URL prefix (e.g. "data:image/webp;base64,")
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Uploads a cover image to Cloudflare R2 via the /api/upload-cover server route.
 * Returns the public R2 URL on success.
 */
async function uploadToR2(
  file: File,
  filePath: string,
  onProgress?: (progress: number) => void,
): Promise<string> {
  onProgress?.(10);

  const fileBase64 = await fileToBase64(file);
  onProgress?.(50);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) {
      headers['Authorization'] = `Bearer ${data.session.access_token}`;
    }
  }

  const response = await fetch('/api/upload-cover', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      fileName: filePath,
      contentType: file.type || 'application/octet-stream',
      fileBase64,
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `R2 upload failed with status ${response.status}.`);
  }

  const { publicUrl } = await response.json() as { publicUrl: string };
  if (!publicUrl) throw new Error('R2 upload succeeded but no publicUrl was returned.');

  onProgress?.(98);
  return publicUrl;
}

/**
 * Uploads an image to Cloudflare R2 (via /api/upload-cover) if the endpoint is
 * reachable, otherwise compresses it to a lightweight data URL (~25KB).
 *
 * New uploads always go to R2. Existing Supabase URLs in the database are
 * unaffected until you run the SQL migration script.
 */
export async function uploadOrCompressCover(
  file: File,
  slugHint = 'cover',
  onProgress?: (progress: number) => void,
): Promise<string> {
  let lastProgress = 0;
  const reportProgress = (progress: number) => {
    const next = Math.max(lastProgress, Math.min(99, Math.round(progress)));
    lastProgress = next;
    onProgress?.(next);
  };

  try {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const cleanSlug = slugHint.replace(/[^a-z0-9_-]/gi, '-').toLowerCase() || 'cover';
    const filePath = `${cleanSlug}-${Date.now()}.${ext}`;
    const publicUrl = await uploadToR2(file, filePath, reportProgress);
    onProgress?.(100);
    return publicUrl;
  } catch (err) {
    console.warn('[imageUpload] R2 upload failed — falling back to canvas compression.', err);
  }

  // Fallback: compress client-side via canvas (no storage dependency)
  const compressed = await compressImageFile(file, 450, 650, 0.82, (progress) => reportProgress(progress));
  onProgress?.(100);
  return compressed;
}
