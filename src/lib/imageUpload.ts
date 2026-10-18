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
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (!dataUrl) {
        reject(new Error('Image file is empty.'));
        return;
      }

      const img = new Image();
      img.onerror = () => reject(new Error('Failed to decode image.'));
      img.onload = () => {
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

/**
 * Uploads an image to Supabase Storage (bucket 'covers') if available,
 * otherwise compresses it to a lightweight data URL (~25KB).
 */
export async function uploadOrCompressCover(file: File, slugHint = 'cover'): Promise<string> {
  if (supabase) {
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const cleanSlug = slugHint.replace(/[^a-z0-9_-]/gi, '-').toLowerCase() || 'cover';
      const filePath = `${cleanSlug}-${Date.now()}.${ext}`;

      const { data, error } = await supabase.storage.from('covers').upload(filePath, file, {
        cacheControl: '31536000',
        upsert: true,
      });

      if (!error && data?.path) {
        const { data: publicData } = supabase.storage.from('covers').getPublicUrl(data.path);
        if (publicData?.publicUrl) {
          return publicData.publicUrl;
        }
      }
    } catch {
      // Storage bucket might not exist or RLS might not permit upload; fall through to compression
    }
  }

  // Fallback: compress client-side via canvas
  return compressImageFile(file);
}
