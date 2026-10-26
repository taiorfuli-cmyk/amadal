import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import imageCompression from 'browser-image-compression';
import { storage } from '../firebase';
import { ProductImage } from '../types';

/**
 * Strict Image Upload Validation Constants:
 * Only JPEG, PNG, and WebP are allowed.
 * File size must not exceed 5MB.
 */
export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
];

export const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * High-definition SVG fallback placeholder for broken or missing images
 */
export const DEFAULT_IMAGE_PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 600' width='600' height='600'%3E%3Crect width='600' height='600' fill='%23f3f4f6'/%3E%3Cg fill='%239ca3af'%3E%3Ccircle cx='300' cy='240' r='50' fill='%23d1d5db'/%3E%3Cpath d='M160 440l100-120 70 80 80-100 90 140H160z' fill='%23d1d5db'/%3E%3Ctext x='300' y='490' font-family='sans-serif' font-size='18' font-weight='800' letter-spacing='3' text-anchor='middle' fill='%239ca3af'%3EAMADAL%3C/text%3E%3C/g%3E%3C/svg%3E";

/**
 * Helper to handle image rendering errors gracefully with the default placeholder
 */
export function handleImageError(event: React.SyntheticEvent<HTMLImageElement, Event>) {
  const target = event.currentTarget;
  if (target.src !== DEFAULT_IMAGE_PLACEHOLDER) {
    target.src = DEFAULT_IMAGE_PLACEHOLDER;
  }
}

export interface UploadedImageResult {
  url: string;
  path: string;
  name: string;
}

export interface CompressionOptions {
  maxSizeMB?: number;
  maxWidthOrHeight?: number;
  initialQuality?: number;
  onProgress?: (progress: number) => void;
}

/**
 * Translate storage and network error codes to clear Arabic error messages.
 */
export function translateStorageErrorToArabic(error: any): string {
  const code = error?.code || '';
  const message = error?.message || (typeof error === 'string' ? error : '');

  if (code === 'storage/unauthorized' || message.includes('unauthorized') || message.includes('permission')) {
    return 'لا تملك صلاحيات كافية لرفع الصور إلى التخزين السحابي. يرجى التأكد من تسجيل الدخول بحساب مسؤول.';
  }
  if (code === 'storage/canceled' || message.includes('canceled')) {
    return 'تم إلغاء عملية رفع الصورة.';
  }
  if (
    code === 'storage/retry-limit-exceeded' ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('watchdog')
  ) {
    return 'استغرقت عملية الرفع وقتاً أطول من المتوقع بسبب بطء اتصال الإنترنت. يرجى التحقق من الشبكة وإعادة المحاولة.';
  }
  if (code === 'storage/quota-exceeded' || message.includes('quota')) {
    return 'تم تجاوز الحد الأقصى لمساحة التخزين المتاحة في التخزين السحابي Firebase Storage.';
  }
  if (code === 'storage/invalid-checksum' || message.includes('checksum')) {
    return 'حدث خطأ أثناء نقل حزم الصورة. يرجى إعادة الرفع.';
  }
  if (code === 'storage/cannot-slice-blob' || message.includes('cannot-slice-blob')) {
    return 'تعذر قراءة بيانات الصورة من المتصفح. يرجى اختيار الصورة مجدداً.';
  }
  if (message.includes('network') || message.includes('Failed to fetch')) {
    return 'فشل الاتصال بالإنترنت أثناء الرفع إلى السحابة. يرجى التحقق من الشبكة وإعادة المحاولة.';
  }
  if (message.includes('compression')) {
    return 'تعذر ضغط ملف الصورة. تأكد من أن الملف صورة صالحة وغير تالفة.';
  }
  return message || 'حدث خطأ غير متوقع أثناء معالجة ورفع الصورة. يرجى المحاولة مجدداً.';
}

/**
 * Strict Client-Side Image Validation:
 * - Must be an instance of File
 * - Must not be empty
 * - Allowed types: JPEG, PNG, WebP only
 * - Maximum file size: 5MB
 */
export function validateImageFile(file: File): { valid: boolean; error?: string } {
  if (!file || !(file instanceof File)) {
    return {
      valid: false,
      error: 'لم يتم اختيار ملف صالح.',
    };
  }

  if (file.size <= 0) {
    return {
      valid: false,
      error: 'ملف الصورة فارغ أو تالف.',
    };
  }

  // 1. Strict Size Limit (5MB)
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    const sizeInMB = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `حجم الصورة (${sizeInMB} ميغابايت) يتجاوز الحد الأقصى المسموح به وهو 5 ميغابايت. يرجى اختيار صورة أصغر.`,
    };
  }

  // 2. Strict Format Validation (JPEG, PNG, WebP)
  const rawMime = (file.type || '').toLowerCase();
  const lastDot = file.name.lastIndexOf('.');
  const ext = lastDot !== -1 ? file.name.slice(lastDot).toLowerCase() : '';

  const isMimeValid = ALLOWED_IMAGE_TYPES.includes(rawMime);
  const isExtValid = ALLOWED_EXTENSIONS.includes(ext);

  if (!isMimeValid && !isExtValid) {
    return {
      valid: false,
      error: `صيغة الملف "${file.name}" غير مدعومة. الصيغ المسموحة هي JPEG، PNG، WebP فقط.`,
    };
  }

  return { valid: true };
}

/**
 * Compress image to under 1MB and automatically convert format to WebP.
 * Handles high-resolution smartphone shots (iPhone/Android 12-50MP).
 */
export async function compressAndConvertToWebP(
  file: File,
  options?: CompressionOptions
): Promise<File> {
  // If file is already WebP and strictly under 1MB, avoid redundant processing
  if (file && file.type === 'image/webp' && file.size < 1024 * 1024) {
    options?.onProgress?.(100);
    return file;
  }

  const maxSizeMB = options?.maxSizeMB ?? 0.95; // Strictly under 1MB
  const maxWidthOrHeight = options?.maxWidthOrHeight ?? 1920;
  const initialQuality = options?.initialQuality ?? 0.85;

  try {
    const compressionConfig = {
      maxSizeMB,
      maxWidthOrHeight,
      useWebWorker: false, // Worker can hang on mobile WebViews
      fileType: 'image/webp',
      initialQuality,
      onProgress: options?.onProgress,
    };

    let compressedBlob: File;
    try {
      compressedBlob = await imageCompression(file, compressionConfig);
    } catch (err) {
      console.warn('[Image Compression] Main thread attempt failed, trying with web worker:', err);
      compressedBlob = await imageCompression(file, {
        ...compressionConfig,
        useWebWorker: true,
      });
    }

    const lastDot = file.name.lastIndexOf('.');
    const baseName = lastDot !== -1 ? file.name.substring(0, lastDot) : file.name;
    const cleanBaseName = baseName.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40) || 'image';
    const webpFileName = `${cleanBaseName}.webp`;

    return new File([compressedBlob], webpFileName, {
      type: 'image/webp',
      lastModified: Date.now(),
    });
  } catch (err) {
    console.warn('[Image Compression Warning]: Could not compress file, proceeding with original:', err);
    return file;
  }
}

/**
 * Check if a URL belongs to Firebase Storage
 */
export function isFirebaseStorageUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  return (
    url.includes('firebasestorage.googleapis.com') ||
    url.includes('storage.googleapis.com') ||
    url.includes('.firebasestorage.app')
  );
}

/**
 * Extract storage reference path from a Firebase Storage download URL
 */
export function extractStoragePath(urlOrPath: string): string {
  if (!urlOrPath) return '';
  if (!urlOrPath.startsWith('http://') && !urlOrPath.startsWith('https://')) {
    return urlOrPath;
  }
  try {
    const urlObj = new URL(urlOrPath);
    if (urlObj.hostname.includes('firebasestorage.googleapis.com')) {
      const match = urlObj.pathname.match(/\/o\/(.+)$/);
      if (match && match[1]) {
        return decodeURIComponent(match[1]);
      }
    }
  } catch {
    // Ignore and fallback
  }
  return urlOrPath;
}

export interface UploadOptions {
  folder: 'homepage' | 'store-settings' | 'products' | 'categories' | string;
  subfolder?: string;
  file: File;
  onProgress?: (progress: number) => void;
}

/**
 * Fast, Resilient Cloud Media Storage Upload:
 * 1. Validates file (JPEG, PNG, WebP only, <= 5MB).
 * 2. Compresses to WebP (< 1MB) for super-fast loading on mobile and desktop.
 * 3. Uploads directly to backend storage endpoint (/api/storage/upload) with live progress tracking (0-100%).
 * 4. Extracts public URL (/api/media/xxx.webp).
 * 5. Returns clean { url, path, name } object.
 */
export async function uploadImageFile({
  folder,
  subfolder,
  file,
  onProgress,
}: UploadOptions): Promise<UploadedImageResult> {
  // 1. Strict Validation
  const validation = validateImageFile(file);
  if (!validation.valid) {
    throw new Error(validation.error || 'ملف الصورة غير صالح.');
  }

  // 2. Pre-upload Compression & Auto-conversion to .webp (< 1MB)
  onProgress?.(10);
  let processedFile = file;
  try {
    processedFile = await compressAndConvertToWebP(file, {
      maxSizeMB: 0.95,
      maxWidthOrHeight: 1920,
      initialQuality: 0.85,
      onProgress: (compPercent) => {
        // Map compression progress to 10% - 40% range
        onProgress?.(10 + Math.round((compPercent / 100) * 30));
      },
    });
  } catch (compErr) {
    console.warn('[Storage] Compression note, proceeding with validated original file:', compErr);
    processedFile = file;
  }

  onProgress?.(45);

  // 3. Convert compressed file to Base64 data string
  const base64Data: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('تعذر قراءة بيانات ملف الصورة.'));
    reader.readAsDataURL(processedFile);
  });

  onProgress?.(65);

  // 4. Upload to high-performance server media API (/api/storage/upload)
  try {
    const response = await fetch('/api/storage/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileBase64: base64Data,
        fileName: processedFile.name,
        folder: folder || 'products',
        subfolder: subfolder || '',
      }),
    });

    onProgress?.(90);

    const result = await response.json();
    if (!response.ok || !result.success || !result.url) {
      throw new Error(result.error || 'فشل رفع وحفظ الصورة في التخزين.');
    }

    onProgress?.(100);

    return {
      url: result.url,
      path: result.path || result.url,
      name: result.name || processedFile.name,
    };
  } catch (apiErr: any) {
    console.error('[Upload Image API Error]:', apiErr);
    throw new Error(translateStorageErrorToArabic(apiErr));
  }
}

/**
 * Upload an image file under categories/{categoryId}/{uniqueFileName}
 */
export async function uploadCategoryImage(
  categoryId: string,
  file: File,
  onProgress?: (progress: number) => void
): Promise<UploadedImageResult> {
  if (!categoryId || typeof categoryId !== 'string' || !categoryId.trim()) {
    throw new Error('معرف الصنف (categoryId) غير محدد أو غير صالح.');
  }

  return uploadImageFile({
    folder: 'categories',
    subfolder: categoryId.trim(),
    file,
    onProgress,
  });
}

/**
 * Upload an image file under products/{productId}/{uniqueFileName}
 */
export async function uploadProductImage(
  productId: string,
  file: File,
  onProgress?: (progress: number) => void
): Promise<UploadedImageResult> {
  if (!productId || typeof productId !== 'string' || !productId.trim()) {
    throw new Error('معرف المنتج (productId) غير محدد أو غير صالح.');
  }
  return uploadImageFile({
    folder: 'products',
    subfolder: productId.trim(),
    file,
    onProgress,
  });
}

/**
 * Delete a file directly from Firebase Storage given its public download URL or storage path
 */
export async function deleteStorageFile(urlOrPath: string): Promise<boolean> {
  if (!urlOrPath) return false;

  // External URLs (e.g. Unsplash, data URLs) do not exist in Firebase Storage
  if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
    if (!isFirebaseStorageUrl(urlOrPath)) {
      return true;
    }
  } else if (urlOrPath.startsWith('data:')) {
    return true;
  }

  try {
    const cleanPath = extractStoragePath(urlOrPath);
    const fileRef = ref(storage, cleanPath || urlOrPath);
    await deleteObject(fileRef);
    return true;
  } catch (err: any) {
    // If the object does not exist anymore, consider it deleted
    if (err?.code === 'storage/object-not-found') {
      return true;
    }
    console.warn('Could not delete file from Firebase Storage:', err);
    return false;
  }
}

/**
 * Delete all Firebase Storage images associated with a product
 */
export async function deleteProductImages(images: (string | ProductImage)[]): Promise<void> {
  if (!Array.isArray(images) || images.length === 0) return;
  const deletePromises = images.map((img) => {
    if (typeof img === 'string') {
      return deleteStorageFile(img);
    }
    if (img && typeof img === 'object') {
      return deleteStorageFile(img.path || img.url);
    }
    return Promise.resolve(true);
  });
  await Promise.allSettled(deletePromises);
}

/**
 * Normalizes single image item to standard ProductImage object
 */
export function normalizeProductImage(
  item: string | ProductImage,
  index: number,
  isFirstMain: boolean = false
): ProductImage {
  if (typeof item === 'string') {
    return {
      id: `img_${index}_${index}`,
      url: item,
      path: isFirebaseStorageUrl(item) ? extractStoragePath(item) : '',
      isMain: isFirstMain && index === 0,
      order: index,
      name: item.split('/').pop()?.split('?')[0] || `صورة ${index + 1}`,
    };
  }
  return {
    id: item.id || `img_${index}_${index}`,
    url: item.url || '',
    path: item.path || (isFirebaseStorageUrl(item.url) ? extractStoragePath(item.url) : ''),
    isMain: item.isMain ?? (index === 0),
    order: typeof item.order === 'number' ? item.order : index,
    name: item.name || item.url?.split('/').pop()?.split('?')[0] || `صورة ${index + 1}`,
  };
}

/**
 * Normalizes product images array into a sorted ProductImage array with a designated main image
 */
export function normalizeProductImages(
  images?: (string | ProductImage)[]
): ProductImage[] {
  if (!images || !Array.isArray(images) || images.length === 0) return [];
  const normalized = images.map((img, idx) => normalizeProductImage(img, idx, true));
  normalized.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const hasMain = normalized.some((img) => img.isMain);
  if (!hasMain && normalized.length > 0) {
    normalized[0].isMain = true;
  }
  return normalized;
}

/**
 * Extract the main image URL for a product, handling both direct strings and ProductImage objects
 */
export function getMainImageUrl(images?: (string | ProductImage)[]): string | undefined {
  if (!images || !Array.isArray(images) || images.length === 0) return undefined;
  for (const img of images) {
    if (typeof img === 'object' && img !== null && img.isMain && img.url) {
      return img.url;
    }
  }
  const first = images[0];
  if (typeof first === 'string') return first;
  return first?.url;
}

/**
 * Extract all image URLs in order
 */
export function getAllImageUrls(images?: (string | ProductImage)[]): string[] {
  if (!images || !Array.isArray(images) || images.length === 0) return [];
  return normalizeProductImages(images).map((img) => img.url).filter(Boolean);
}
