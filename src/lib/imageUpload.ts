import { supabase, supabaseAnonKey, supabaseUrl } from './supabase';

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

function uploadFileWithProgress(file: File, filePath: string, onProgress?: (progress: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const storageClient = supabase;
    const projectUrl = supabaseUrl;
    const anonKey = supabaseAnonKey;
    if (!storageClient || !projectUrl || !anonKey) {
      reject(new Error('Supabase storage is not configured.'));
      return;
    }

    void storageClient.auth.getSession().then(({ data, error }) => {
      if (error) {
        reject(error);
        return;
      }

      const xhr = new XMLHttpRequest();
      const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
      xhr.open('POST', `${projectUrl.replace(/\/$/, '')}/storage/v1/object/covers/${encodedPath}`);
      xhr.setRequestHeader('apikey', anonKey);
      xhr.setRequestHeader('Authorization', `Bearer ${data.session?.access_token || anonKey}`);
      xhr.setRequestHeader('cache-control', '31536000');
      xhr.setRequestHeader('x-upsert', 'true');
      xhr.setRequestHeader('content-type', file.type || 'application/octet-stream');
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress?.(Math.min(98, Math.round((event.loaded / event.total) * 98)));
      };
      xhr.onload = () => {
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error(`Cover upload failed with status ${xhr.status}.`));
          return;
        }
        const { data: publicData } = storageClient.storage.from('covers').getPublicUrl(filePath);
        if (!publicData?.publicUrl) {
          reject(new Error('Could not create a public URL for the uploaded cover.'));
          return;
        }
        resolve(publicData.publicUrl);
      };
      xhr.onerror = () => reject(new Error('Network error while uploading cover.'));
      xhr.onabort = () => reject(new Error('Cover upload was cancelled.'));
      xhr.send(file);
    }).catch(reject);
  });
}

/**
 * Uploads an image to Supabase Storage (bucket 'covers') if available,
 * otherwise compresses it to a lightweight data URL (~25KB).
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

  if (supabase) {
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const cleanSlug = slugHint.replace(/[^a-z0-9_-]/gi, '-').toLowerCase() || 'cover';
      const filePath = `${cleanSlug}-${Date.now()}.${ext}`;
      const publicUrl = await uploadFileWithProgress(file, filePath, reportProgress);
      onProgress?.(100);
      return publicUrl;
    } catch {
      // Storage bucket might not exist or RLS might not permit upload; fall through to compression
    }
  }

  // Fallback: compress client-side via canvas
  const compressed = await compressImageFile(file, 450, 650, 0.82, (progress) => reportProgress(progress));
  onProgress?.(100);
  return compressed;
}
