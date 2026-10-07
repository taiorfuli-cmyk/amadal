import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import imageCompression from 'browser-image-compression';
import { storage } from '../firebase';
import { ProductImage } from '../types';
import firebaseConfig from '../../firebase-applet-config.json';

export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/x-adobe-dng',
];
export const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.dng'];

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
    return 'لا تملك صلاحيات كافية لرفع الصور إلى التخزين السحابي. يرجى تسجيل الدخول كمسؤول.';
  }
  if (code === 'storage/canceled' || message.includes('canceled')) {
    return 'تم إلغاء عملية الرفع.';
  }
  if (
    code === 'storage/retry-limit-exceeded' ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('watchdog')
  ) {
    return 'استغرقت عملية الرفع وقتاً أطول من المتوقع بسبب ضعف اتصال الإنترنت. تم إيقاف العملية للحفاظ على استقرار التطبيق، يرجى إعادة المحاولة.';
  }
  if (code === 'storage/quota-exceeded' || message.includes('quota')) {
    return 'تم تجاوز الحد الأقصى لمساحة التخزين المتاحة في Firebase Storage.';
  }
  if (code === 'storage/invalid-checksum' || message.includes('checksum')) {
    return 'حدث خطأ أثناء نقل بيانات الصورة (تلف الحزمة أثناء الإرسال). يرجى إعادة الرفع.';
  }
  if (code === 'storage/cannot-slice-blob' || message.includes('cannot-slice-blob')) {
    return 'تعذر على المتصفح قراءة ملف الصورة من ذاكرة الهاتف. يرجى اختيار الصورة مجدداً من المعرض.';
  }
  if (message.includes('network') || message.includes('Failed to fetch')) {
    return 'فشل الاتصال بالإنترنت أثناء الرفع. يرجى التحقق من الشبكة وإعادة المحاولة.';
  }
  if (message.includes('compression')) {
    return 'تعذر ضغط ملف الصورة. تأكد من أن الملف صورة صالحة وغير تالفة.';
  }
  return message || 'حدث خطأ غير متوقع أثناء معالجة ورفع الصورة. يرجى المحاولة مجدداً.';
}

/**
 * Compress image to under 1MB and automatically convert format to WebP.
 * Handles high-resolution mobile camera shots (iPhone/Android 12-50MP).
 */
export async function compressAndConvertToWebP(
  file: File,
  options?: CompressionOptions
): Promise<File> {
  const maxSizeMB = options?.maxSizeMB ?? 0.95; // Strictly under 1MB
  const maxWidthOrHeight = options?.maxWidthOrHeight ?? 1920;
  const initialQuality = options?.initialQuality ?? 0.85;

  try {
    const compressionConfig = {
      maxSizeMB,
      maxWidthOrHeight,
      useWebWorker: true,
      fileType: 'image/webp',
      initialQuality,
      onProgress: options?.onProgress,
    };

    let compressedBlob: File;
    try {
      compressedBlob = await imageCompression(file, compressionConfig);
    } catch (workerErr) {
      console.warn('[Image Compression] Worker failed, retrying on main thread:', workerErr);
      compressedBlob = await imageCompression(file, {
        ...compressionConfig,
        useWebWorker: false,
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
      error: 'الملف المختار فارغ أو تالف.',
    };
  }

  const rawMime = (file.type || '').toLowerCase();
  const isMimeValid = ALLOWED_IMAGE_TYPES.includes(rawMime) || rawMime.startsWith('image/');
  
  const lastDot = file.name.lastIndexOf('.');
  const ext = lastDot !== -1 ? file.name.slice(lastDot).toLowerCase() : '';
  const isExtValid = ALLOWED_EXTENSIONS.includes(ext);

  if (!isMimeValid && !isExtValid) {
    return {
      valid: false,
      error: `صيغة الملف "${file.name}" غير مدعومة. الصيغ المسموحة هي JPG، PNG، WEBP، HEIC.`,
    };
  }

  // Max 50MB before compression
  if (file.size > 50 * 1024 * 1024) {
    return {
      valid: false,
      error: `حجم الصورة الأصلي كبير جداً (${(file.size / (1024 * 1024)).toFixed(1)} ميغابايت). الحد الأقصى هو 50 ميغابايت.`,
    };
  }

  return { valid: true };
}

export function isFirebaseStorageUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  return (
    url.includes('firebasestorage.googleapis.com') ||
    url.includes('storage.googleapis.com') ||
    url.includes('.firebasestorage.app')
  );
}

/**
 * Extract storage path from a Firebase Storage download URL
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

let isFirebaseStorageAvailable: boolean | null = null;

/**
 * High-performance browser-native image compression using createImageBitmap/canvas and ArrayBuffer.
 * Produces crisp, lightweight WebP/JPEG data URLs under ~80KB without relying on DOM events.
 */
export async function compressImageToDataUrl(
  file: File,
  maxWidth = 1080,
  quality = 0.82
): Promise<string> {
  // Method 1: Try browser createImageBitmap + HTMLCanvasElement for fast, hardware-accelerated compression
  if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      let width = bitmap.width;
      let height = bitmap.height;

      if (width > maxWidth || height > maxWidth) {
        if (width > height) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        } else {
          width = Math.round((width * maxWidth) / height);
          height = maxWidth;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(bitmap, 0, 0, width, height);
        if (typeof (bitmap as any).close === 'function') {
          (bitmap as any).close();
        }
        try {
          const webp = canvas.toDataURL('image/webp', quality);
          if (webp && webp.startsWith('data:image/webp')) {
            return webp;
          }
        } catch {}
        const jpeg = canvas.toDataURL('image/jpeg', quality);
        if (jpeg && jpeg.startsWith('data:image/jpeg')) {
          return jpeg;
        }
      }
    } catch (bitmapErr) {
      console.warn('Canvas compression bypassed, falling back to direct binary encoding:', bitmapErr);
    }
  }

  // Method 2: Standard FileReader + Image object + Canvas (100% compatible across iOS Safari, Android Chrome, etc.)
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('FileReader error'));
        reader.onload = () => {
          const img = new Image();
          img.onerror = () => reject(new Error('Image load error'));
          img.onload = () => {
            try {
              let width = img.width;
              let height = img.height;
              if (width > maxWidth || height > maxWidth) {
                if (width > height) {
                  height = Math.round((height * maxWidth) / width);
                  width = maxWidth;
                } else {
                  width = Math.round((width * maxWidth) / height);
                  height = maxWidth;
                }
              }
              const canvas = document.createElement('canvas');
              canvas.width = Math.max(1, width);
              canvas.height = Math.max(1, height);
              const ctx = canvas.getContext('2d');
              if (!ctx) {
                return resolve(reader.result as string);
              }
              ctx.drawImage(img, 0, 0, width, height);
              let result = '';
              try {
                result = canvas.toDataURL('image/webp', quality);
              } catch {}
              if (!result || !result.startsWith('data:image/webp')) {
                result = canvas.toDataURL('image/jpeg', quality);
              }
              resolve(result);
            } catch (err) {
              resolve(reader.result as string);
            }
          };
          img.src = reader.result as string;
        };
        reader.readAsDataURL(file);
      });
      if (dataUrl && dataUrl.startsWith('data:image/')) {
        return dataUrl;
      }
    } catch (e) {
      console.warn('FileReader image fallback note:', e);
    }
  }

  // Method 3: Direct ArrayBuffer conversion (emergency fallback)
  try {
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
    }
    const base64 = btoa(binary);
    const mime = file.type || 'image/jpeg';
    return `data:${mime};base64,${base64}`;
  } catch (bufferErr) {
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      return URL.createObjectURL(file);
    }
    throw new Error('تعذر قراءة ملف الصورة ومعالجته');
  }
}

/**
 * Probe if the configured Firebase Storage bucket is actually reachable.
 * Uses a lightweight, abortable probe to avoid hanging or triggering SDK retries.
 */
async function isBucketReady(): Promise<boolean> {
  if (isFirebaseStorageAvailable !== null) {
    return isFirebaseStorageAvailable;
  }
  try {
    const bucket = firebaseConfig.storageBucket;
    if (!bucket) {
      isFirebaseStorageAvailable = false;
      return false;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1000);
    const res = await fetch(`https://firebasestorage.googleapis.com/v0/b/${bucket}/o?maxResults=1`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    // If 404, the bucket is not provisioned on GCP
    if (res.status === 404) {
      isFirebaseStorageAvailable = false;
      return false;
    }
    if (res.status === 200 || res.status === 401 || res.status === 403) {
      isFirebaseStorageAvailable = true;
      return true;
    }
    isFirebaseStorageAvailable = false;
    return false;
  } catch {
    isFirebaseStorageAvailable = false;
    return false;
  }
}

/**
 * Generic image file upload function for Firebase Storage.
 * Supports folders: 'homepage', 'store-settings', 'products', etc.
 * Uses uploadBytesResumable, monitors state_changed, and ensures progress NEVER hangs.
 */
export interface UploadOptions {
  folder: 'homepage' | 'store-settings' | 'products' | string;
  subfolder?: string;
  file: File;
  onProgress?: (progress: number) => void;
}

export async function uploadImageFile({
  folder,
  subfolder,
  file,
  onProgress,
}: UploadOptions): Promise<UploadedImageResult> {
  // 1. Validate file
  if (!file || !(file instanceof File)) {
    throw new Error('لم يتم استلام ملف صالح للرفع.');
  }

  const validation = validateImageFile(file);
  if (!validation.valid) {
    throw new Error(validation.error || 'ملف الصورة غير صالح.');
  }

  // 2. Pre-upload Compression & Auto-conversion to .webp (< 1MB)
  onProgress?.(5);
  let processedFile = file;
  try {
    processedFile = await compressAndConvertToWebP(file, {
      maxSizeMB: 0.95,
      maxWidthOrHeight: 1920,
      initialQuality: 0.85,
      onProgress: (compPercent) => {
        // Map compression progress to 5% - 25% range
        onProgress?.(5 + Math.round((compPercent / 100) * 20));
      },
    });
  } catch (compErr) {
    console.warn('[Storage] Compression fallback to original file:', compErr);
  }

  // 3. Sanitize folder and generate collision-free, ASCII-safe storage path
  const cleanFolder = (folder || 'general').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanSub = subfolder ? `/${subfolder.trim().replace(/[^a-zA-Z0-9_-]/g, '_')}` : '';

  const rawBase = processedFile.name.substring(0, processedFile.name.lastIndexOf('.')) || 'image';
  const safeBase = rawBase.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 30) || 'img';
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 9);
  const uniqueFileName = `${timestamp}_${randomSuffix}_${safeBase}.webp`;
  const filePath = `${cleanFolder}${cleanSub}/${uniqueFileName}`;

  onProgress?.(25);

  const fallbackWithServerStorage = async (): Promise<UploadedImageResult> => {
    onProgress?.(35);
    try {
      const serverResult = await uploadViaServerStorage(
        cleanFolder,
        cleanSub.replace(/^\//, ''),
        uniqueFileName,
        processedFile,
        (p) => onProgress?.(35 + Math.round((p / 100) * 65))
      );
      return serverResult;
    } catch (err) {
      console.warn('[Storage Service] Server upload fallback notice, attempting base64:', err);
    }

    // Emergency local data URL fallback if server storage is unavailable
    const originalDataUrl = await fileToBase64(processedFile);
    onProgress?.(100);
    return {
      url: originalDataUrl,
      path: filePath,
      name: processedFile.name,
    };
  };

  // Check if Firebase Storage bucket is ready
  const isReady = await isBucketReady();
  if (!isReady) {
    return fallbackWithServerStorage();
  }

  // 4. Multi-attempt Upload Loop (up to 3 retries with dynamic heartbeat timeout)
  const maxAttempts = 3;
  let lastError: any = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const storageRef = ref(storage, filePath);
      const safeOriginalName = encodeURIComponent(processedFile.name.substring(0, 100));
      const uploadTask = uploadBytesResumable(storageRef, processedFile, {
        contentType: 'image/webp',
        customMetadata: {
          folder: cleanFolder,
          originalName: safeOriginalName,
          attempt: String(attempt),
        },
      });

      const result = await new Promise<UploadedImageResult>((resolve, reject) => {
        let isFinished = false;
        let watchdogTimer: any = null;

        const resetWatchdog = () => {
          if (watchdogTimer) clearTimeout(watchdogTimer);
          // 45-second heartbeat: resets whenever new bytes are actively transferred
          watchdogTimer = setTimeout(() => {
            if (!isFinished) {
              isFinished = true;
              try {
                uploadTask.cancel();
              } catch {}
              reject(
                new Error(
                  'انتهت مهلة انتظار نقل بيانات الصورة (Timeout). يرجى التحقق من الشبكة وإعادة المحاولة.'
                )
              );
            }
          }, 45000);
        };

        resetWatchdog();

        uploadTask.on(
          'state_changed',
          (snapshot) => {
            resetWatchdog();
            if (snapshot.totalBytes > 0 && onProgress) {
              const filePercent = Math.round(
                (snapshot.bytesTransferred / snapshot.totalBytes) * 100
              );
              // Map upload progress from 25% to 99%
              const overallPercent = 25 + Math.round((filePercent / 100) * 74);
              onProgress(Math.min(99, Math.max(25, overallPercent)));
            }
          },
          (error: any) => {
            if (watchdogTimer) clearTimeout(watchdogTimer);
            if (!isFinished) {
              isFinished = true;
              console.warn(`[Firebase Storage Attempt ${attempt}/${maxAttempts} Notice]:`, error);
              reject(error);
            }
          },
          async () => {
            if (watchdogTimer) clearTimeout(watchdogTimer);
            if (!isFinished) {
              isFinished = true;
              try {
                const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
                onProgress?.(100);
                resolve({
                  url: downloadUrl,
                  path: filePath,
                  name: processedFile.name,
                });
              } catch (err: any) {
                console.warn('[Firebase Storage] Download URL retrieval failed:', err);
                reject(err);
              }
            }
          }
        );
      });

      isFirebaseStorageAvailable = true;
      return result;
    } catch (err: any) {
      lastError = err;
      console.warn(`[Storage Service] Upload attempt ${attempt}/${maxAttempts} failed:`, err?.message || err);
      if (attempt < maxAttempts) {
        // Exponential backoff wait (e.g. 1.2s, 2.4s) before retrying
        await new Promise((r) => setTimeout(r, 1200 * attempt));
      }
    }
  }

  console.warn(
    'All Firebase Storage attempts failed. Falling back to local server storage:',
    lastError?.message || lastError
  );
  return fallbackWithServerStorage();
}

/**
 * Convert browser File object to Base64 string safely and reliably.
 * Supports multiple fallbacks:
 * 1. Standard FileReader with error protection
 * 2. Direct ArrayBuffer conversion with blob.slice
 * 3. Offscreen Canvas decoding (bypasses OS file descriptor locks on Android/iOS/Chrome)
 */
export async function fileToBase64(file: File): Promise<string> {
  if (!file) {
    throw new Error('لم يتم تحديد ملف صالح لتحويله.');
  }

  // 1. Try FileReader with complete error protection
  if (typeof FileReader !== 'undefined') {
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            resolve(reader.result);
          } else {
            reject(new Error('نتيجة قراءة الملف غير صالحة.'));
          }
        };
        reader.onerror = () => {
          const domErr = reader.error;
          reject(new Error(domErr?.message || domErr?.name || 'فشل في قراءة ملف الصورة'));
        };
        reader.onabort = () => {
          reject(new Error('تم إلغاء عملية قراءة الملف'));
        };
        reader.readAsDataURL(file);
      });

      if (dataUrl && typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
        return dataUrl;
      }
    } catch (frErr) {
      console.warn('[Storage Service] FileReader notice, trying ArrayBuffer fallback:', frErr);
    }
  }

  // 2. Direct ArrayBuffer conversion (with blob.slice to bypass potential file descriptor locks)
  try {
    const blob = typeof file.slice === 'function' ? file.slice(0, file.size) : file;
    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    const len = bytes.byteLength;
    const chunkSize = 16384;
    for (let i = 0; i < len; i += chunkSize) {
      const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    const base64 = btoa(binary);
    const mime = file.type || 'image/jpeg';
    return `data:${mime};base64,${base64}`;
  } catch (bufferErr: any) {
    console.warn('[Storage Service] ArrayBuffer reading notice, trying canvas extraction fallback:', bufferErr);
  }

  // 3. Canvas rendering via ImageBitmap / Image object URL
  // Even when direct stream reading fails due to OS permission revocation, browser graphics contexts
  // can still decode and paint the image buffer into an offscreen canvas.
  try {
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (ctx) {
        if (typeof createImageBitmap === 'function') {
          try {
            const bitmap = await createImageBitmap(file);
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            ctx.drawImage(bitmap, 0, 0);
            bitmap.close();
            const mime = file.type || 'image/jpeg';
            return canvas.toDataURL(mime, 0.95);
          } catch {}
        }

        if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
          const objUrl = URL.createObjectURL(file);
          try {
            const dataUrl = await new Promise<string>((resolve, reject) => {
              const img = new Image();
              img.onload = () => {
                canvas.width = img.naturalWidth || img.width;
                canvas.height = img.naturalHeight || img.height;
                ctx.drawImage(img, 0, 0);
                const mime = file.type || 'image/jpeg';
                resolve(canvas.toDataURL(mime, 0.95));
              };
              img.onerror = () => reject(new Error('Canvas image load failed'));
              img.src = objUrl;
            });
            return dataUrl;
          } finally {
            URL.revokeObjectURL(objUrl);
          }
        }
      }
    }
  } catch (canvasErr) {
    console.warn('[Storage Service] Canvas image extraction notice:', canvasErr);
  }

  throw new Error('تعذر قراءة ملف الصورة من جهازك بسبب قيود أذونات الملف في المتصفح. يرجى إعادة اختيار الصورة مرة أخرى.');
}

/**
 * Upload an image file directly to the server storage endpoint (/api/storage/upload).
 * Supports direct multipart/form-data for native browser streaming (bypasses FileReader limits),
 * with seamless JSON/Base64 fallback.
 * Saves to public/uploads/{folder}/{subfolder}/{fileName} and returns clean HTTP path.
 */
export async function uploadViaServerStorage(
  folder: string,
  subfolder: string,
  fileName: string,
  file: File,
  onProgress?: (progress: number) => void,
  preloadedBase64?: string
): Promise<UploadedImageResult> {
  onProgress?.(30);

  // Strategy A: Native browser FormData multipart upload
  // Bypasses all JS FileReader / memory limits and streams file directly to the server
  if (file && typeof FormData !== 'undefined') {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', folder);
      formData.append('subfolder', subfolder);
      formData.append('fileName', fileName);

      onProgress?.(60);
      const res = await fetch('/api/storage/upload', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.url) {
          onProgress?.(100);
          return {
            url: data.url,
            path: data.path || `${folder}/${subfolder ? subfolder + '/' : ''}${fileName}`,
            name: file.name,
          };
        }
      }
    } catch (formErr) {
      console.warn('[Storage Service] FormData upload notice, trying Base64 fallback:', formErr);
    }
  }

  // Strategy B: Base64 JSON fallback
  let fileBase64 = preloadedBase64;
  if (!fileBase64 && file) {
    try {
      fileBase64 = await fileToBase64(file);
    } catch (b64Err) {
      console.warn('[Storage Service] Base64 fallback conversion failed:', b64Err);
    }
  }

  if (fileBase64) {
    const res = await fetch('/api/storage/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        folder,
        subfolder,
        fileName,
        fileBase64,
        mimeType: file?.type || 'image/jpeg',
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && data.url) {
        onProgress?.(100);
        return {
          url: data.url,
          path: data.path || `${folder}/${subfolder ? subfolder + '/' : ''}${fileName}`,
          name: file ? file.name : fileName,
        };
      }
    }
  }

  throw new Error('فشل رفع وحفظ الصورة في وحدة التخزين.');
}

/**
 * Upload an image file under categories/{categoryId}/{uniqueFileName}
 * Uses optimized uploadImageFile with client-side WebP compression (< 1MB),
 * heartbeat watchdog timeout, automatic retries, and native FormData server fallback.
 */
export async function uploadCategoryImage(
  categoryId: string,
  file: File,
  onProgress?: (progress: number) => void,
  preloadedBase64?: string
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
    throw new Error('معرف المنتج (productId) غير محدد أو غير صالح قبل إنشاء مسار Storage.');
  }
  return uploadImageFile({
    folder: 'products',
    subfolder: productId.trim(),
    file,
    onProgress,
  });
}

/**
 * Delete a file from Firebase Storage given its download URL or reference path
 */
export async function deleteStorageFile(urlOrPath: string): Promise<boolean> {
  if (!urlOrPath) return false;

  // Local /uploads/ files
  if (urlOrPath.startsWith('/uploads/') || urlOrPath.includes('/uploads/')) {
    try {
      await fetch('/api/storage/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pathOrUrl: urlOrPath }),
      });
      return true;
    } catch {
      return false;
    }
  }

  if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
    if (!isFirebaseStorageUrl(urlOrPath)) {
      // External URL (e.g. Unsplash), no need to delete from Storage
      return true;
    }
  }

  try {
    const cleanPath = extractStoragePath(urlOrPath);
    const fileRef = ref(storage, cleanPath || urlOrPath);
    await deleteObject(fileRef);
    return true;
  } catch (err: any) {
    // If the object does not exist anymore, consider it deleted
    if (err.code === 'storage/object-not-found') {
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
      id: `img_legacy_${index}_${index}`,
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
 * Extract the main image URL for a product, handling both legacy strings and new ProductImage objects
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
