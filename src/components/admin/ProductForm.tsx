import React, { useState, useRef } from 'react';
import imageCompression from 'browser-image-compression';
import {
  Upload,
  X,
  Image as ImageIcon,
  Loader2,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Sparkles,
  Link as LinkIcon,
  Trash2,
  Star,
  Plus,
  Info,
} from 'lucide-react';
import { Product, ProductImage, ProductVariant, Category } from '../../types';
import {
  uploadProductImage,
  normalizeProductImages,
  validateImageFile,
  translateStorageErrorToArabic,
  compressAndConvertToWebP,
} from '../../services/storageService';

export interface ProductFormProps {
  product: Partial<Product>;
  categories: Category[];
  isSaving: boolean;
  onSave: (product: Partial<Product>) => Promise<void>;
  onCancel: () => void;
  onProductChange?: (product: Partial<Product>) => void;
}

export const ProductForm: React.FC<ProductFormProps> = ({
  product: initialProduct,
  categories,
  isSaving,
  onSave,
  onCancel,
  onProductChange,
}) => {
  const [product, setProduct] = useState<Partial<Product>>(initialProduct);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Image Upload State
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [activeStepText, setActiveStepText] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [failedFilesQueue, setFailedFilesQueue] = useState<File[]>([]);
  const [compressionSummary, setCompressionSummary] = useState<{
    originalSizeMB: number;
    compressedSizeMB: number;
    savedPercent: number;
  } | null>(null);

  // Secondary direct URL input
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [tempImageUrl, setTempImageUrl] = useState('');

  // Update internal product and notify parent if callback provided
  const updateProduct = (updated: Partial<Product>) => {
    setProduct(updated);
    onProductChange?.(updated);
  };

  const images = normalizeProductImages(product.images);

  /**
   * Compress and upload selected image files with retry, timeout, and Arabic error handling
   */
  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadError(null);
    setCompressionSummary(null);
    const fileArray = Array.from(files);

    // Initial validation
    for (const f of fileArray) {
      const check = validateImageFile(f);
      if (!check.valid) {
        setUploadError(check.error || 'صيغة الملف غير مدعومة.');
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
    }

    let targetProductId = product.id?.trim();
    if (!targetProductId) {
      targetProductId = `product_${Date.now()}`;
      updateProduct({ ...product, id: targetProductId });
    }

    setIsUploading(true);
    setUploadProgress(0);

    const uploadedList: ProductImage[] = [];
    const totalFiles = fileArray.length;
    let totalOriginalBytes = 0;
    let totalCompressedBytes = 0;
    const failedFiles: File[] = [];

    try {
      for (let i = 0; i < totalFiles; i++) {
        const originalFile = fileArray[i];
        totalOriginalBytes += originalFile.size;
        const fileBaseProgress = (i / totalFiles) * 100;

        // ─────────────────────────────────────────────────────────────
        // 1. Client-side Image Compression (< 1MB) & WebP Conversion
        // ─────────────────────────────────────────────────────────────
        setActiveStepText(
          totalFiles > 1
            ? `جاري ضغط وتحويل الصورة (${i + 1}/${totalFiles}) إلى صيغة WebP...`
            : 'جاري ضغط الصورة وتحويلها إلى صيغة WebP بأعلى دقة...'
        );

        let preparedFile: File;
        try {
          preparedFile = await compressAndConvertToWebP(originalFile, {
            maxSizeMB: 0.95, // Strictly < 1MB
            maxWidthOrHeight: 1920,
            initialQuality: 0.85,
            onProgress: (p) => {
              // Compression occupies 0% - 30% of this file's progress chunk
              const currentChunk = (p / 100) * 30;
              const currentTotal = Math.round(fileBaseProgress + currentChunk / totalFiles);
              setUploadProgress(Math.min(99, Math.max(1, currentTotal)));
            },
          });
        } catch (compErr: any) {
          console.warn('[ProductForm Compression Notice]:', compErr);
          preparedFile = originalFile;
        }

        totalCompressedBytes += preparedFile.size;

        // ─────────────────────────────────────────────────────────────
        // 2. Upload to Firebase Storage with Timeout & Auto-Retry
        // ─────────────────────────────────────────────────────────────
        setActiveStepText(
          totalFiles > 1
            ? `جاري رفع الصورة (${i + 1}/${totalFiles}) إلى التخزين السحابي...`
            : 'جاري رفع الصورة إلى التخزين السحابي...'
        );

        let uploadSuccess = false;
        let lastError: any = null;
        const maxRetries = 3;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            if (attempt > 1) {
              setActiveStepText(`إعادة محاولة الرفع (${attempt}/${maxRetries})...`);
            }

            const result = await uploadProductImage(targetProductId, preparedFile, (filePct) => {
              // Upload occupies 30% - 100% of this file's progress chunk
              const currentChunk = 30 + (filePct / 100) * 70;
              const currentTotal = Math.round(fileBaseProgress + currentChunk / totalFiles);
              setUploadProgress(Math.min(99, Math.max(1, currentTotal)));
            });

            const isMain = images.length === 0 && uploadedList.length === 0;
            const newOrder = images.length + uploadedList.length;

            uploadedList.push({
              id: `img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              url: result.url,
              path: result.path,
              name: result.name,
              isMain,
              order: newOrder,
            });

            uploadSuccess = true;
            break;
          } catch (err: any) {
            lastError = err;
            console.warn(`Upload attempt ${attempt} failed:`, err);
            if (attempt < maxRetries) {
              // Wait with exponential backoff before retry
              await new Promise((res) => setTimeout(res, 1200 * attempt));
            }
          }
        }

        if (!uploadSuccess) {
          failedFiles.push(originalFile);
          throw lastError || new Error('فشل رفع الملف بعد عدة محاولات.');
        }
      }

      // Update state with newly uploaded images
      const currentImgs = normalizeProductImages(product.images);
      const merged = [...currentImgs, ...uploadedList];
      if (merged.length > 0 && !merged.some((m) => m.isMain)) {
        merged[0].isMain = true;
      }

      updateProduct({
        ...product,
        images: merged,
      });

      // Compute compression statistics
      if (totalOriginalBytes > 0 && totalCompressedBytes > 0) {
        const origMB = Number((totalOriginalBytes / (1024 * 1024)).toFixed(2));
        const compMB = Number((totalCompressedBytes / (1024 * 1024)).toFixed(2));
        const savedPct = Math.max(
          0,
          Math.round(((totalOriginalBytes - totalCompressedBytes) / totalOriginalBytes) * 100)
        );
        setCompressionSummary({
          originalSizeMB: origMB,
          compressedSizeMB: compMB,
          savedPercent: savedPct,
        });
      }

      setUploadProgress(100);
      setActiveStepText('تم رفع جميع الصور بنجاح!');
    } catch (err: any) {
      console.error('[ProductForm Upload Error]:', err);
      const arabicMsg = translateStorageErrorToArabic(err);
      setUploadError(arabicMsg);
      setFailedFilesQueue(failedFiles);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Re-try failed files
  const handleRetryFailedFiles = () => {
    if (failedFilesQueue.length === 0) return;
    const dt = new DataTransfer();
    failedFilesQueue.forEach((file) => dt.items.add(file));
    if (fileInputRef.current) {
      fileInputRef.current.files = dt.files;
      handleFilesSelected({
        target: fileInputRef.current,
      } as React.ChangeEvent<HTMLInputElement>);
    }
  };

  // Set main image
  const handleSetMainImage = (index: number) => {
    const updated = images.map((img, i) => ({
      ...img,
      isMain: i === index,
    }));
    updateProduct({ ...product, images: updated });
  };

  // Delete an image
  const handleDeleteImage = (index: number) => {
    const updated = images.filter((_, i) => i !== index);
    if (updated.length > 0 && !updated.some((img) => img.isMain)) {
      updated[0].isMain = true;
    }
    updateProduct({ ...product, images: updated });
  };

  // Add image by direct URL
  const handleAddImageUrl = () => {
    if (!tempImageUrl.trim()) return;
    const isMain = images.length === 0;
    const newImg: ProductImage = {
      id: `img_url_${Date.now()}`,
      url: tempImageUrl.trim(),
      path: '',
      name: 'External Image',
      isMain,
      order: images.length,
    };
    const updated = [...images, newImg];
    updateProduct({ ...product, images: updated });
    setTempImageUrl('');
    setShowUrlInput(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving || isUploading) return;
    await onSave(product);
  };

  return (
    <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-4xl mx-auto space-y-6">
      
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-neutral-100">
        <div>
          <h2 className="text-xl font-black text-neutral-900">
            {product.id?.startsWith('product_') || !product.id ? 'إضافة منتج جديد' : 'تعديل بيانات المنتج'}
          </h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            AMADAL Product Engine // إدارة المخزون والصور
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving || isUploading}
          className="p-2 text-neutral-400 hover:text-black rounded-xl hover:bg-neutral-100 transition-colors disabled:opacity-50"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* Basic Details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-neutral-900 mb-1">اسم المنتج *</label>
            <input
              type="text"
              required
              value={product.name || ''}
              onChange={(e) => updateProduct({ ...product, name: e.target.value })}
              placeholder="مثال: هودي AMADAL بوكسي قطن ثقيل — أسود مات"
              className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-black"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-900 mb-1">الرابط المخصص (Slug) *</label>
            <input
              type="text"
              required
              value={product.slug || ''}
              onChange={(e) => updateProduct({ ...product, slug: e.target.value })}
              placeholder="amadal-boxy-hoodie-black"
              className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-mono focus:outline-none focus:border-black"
              dir="ltr"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-900 mb-1">التصنيف *</label>
            <select
              value={product.categoryId || ''}
              onChange={(e) => {
                const cat = categories.find((c) => c.slug === e.target.value || c.id === e.target.value);
                updateProduct({
                  ...product,
                  categoryId: e.target.value,
                  categoryName: cat?.name || e.target.value,
                });
              }}
              className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-black"
            >
              <option value="">اختر التصنيف...</option>
              {categories.map((c) => (
                <option key={c.id} value={c.slug || c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-900 mb-1">السعر الأصلي (د.ج) *</label>
            <input
              type="number"
              required
              min="0"
              value={product.price || ''}
              onChange={(e) => updateProduct({ ...product, price: Number(e.target.value) || 0 })}
              placeholder="5800"
              className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-mono font-bold focus:outline-none focus:border-black"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-900 mb-1">سعر التخفيض (اختياري)</label>
            <input
              type="number"
              min="0"
              value={product.salePrice || ''}
              onChange={(e) =>
                updateProduct({
                  ...product,
                  salePrice: e.target.value ? Number(e.target.value) : undefined,
                })
              }
              placeholder="مثال: 4900 (اتركه فارغاً إن لم يكن هناك تخفيض)"
              className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-mono focus:outline-none focus:border-black"
            />
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────────
            IMAGES UPLOAD COMPONENT (Compressed WebP < 1MB + Progress Bar)
            ───────────────────────────────────────────────────────────── */}
        <div className="p-5 bg-neutral-50 rounded-2xl border border-neutral-200 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <label className="text-xs font-bold text-neutral-900 flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-neutral-700" />
                <span>صور المنتج ({images.length})</span>
              </label>
              <p className="text-[11px] text-neutral-500 mt-0.5">
                يتم ضغط صور الهاتف تلقائياً لأقل من 1MB وتحويلها إلى WebP لضمان سرعة فائقة في التحميل.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {/* Hidden File Input */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.jpg,.jpeg,.png,.webp,.heic,.heif"
                onChange={handleFilesSelected}
                className="hidden"
              />

              {/* Upload Trigger Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="px-4 py-2.5 bg-neutral-900 hover:bg-black text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition-all active:scale-95 disabled:opacity-50"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>جاري المعالجة ({uploadProgress}%)...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    <span>+ رفع صور من الهاتف</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowUrlInput(!showUrlInput)}
                className="px-3 py-2.5 bg-white border border-neutral-200 hover:bg-neutral-100 text-neutral-700 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors"
                title="إضافة صورة عبر رابط مباشر"
              >
                <LinkIcon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">أو عبر رابط</span>
              </button>
            </div>
          </div>

          {/* Upload Progress Bar with Step Indicator */}
          {isUploading && (
            <div className="p-4 bg-white rounded-xl border border-neutral-200 space-y-2.5 shadow-sm">
              <div className="flex items-center justify-between text-xs font-medium text-neutral-800">
                <span className="flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-neutral-900" />
                  <span>{activeStepText || 'جاري معالجة ورفع الصور...'}</span>
                </span>
                <span className="font-mono font-bold text-neutral-900">{uploadProgress}%</span>
              </div>
              <div className="w-full bg-neutral-100 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-neutral-900 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-[10px] text-neutral-400">
                يتم تطبيق خوارزمية الضغط الذكي لتقليص حجم الصور مع الحفاظ على وضوح وتفاصيل القماش.
              </p>
            </div>
          )}

          {/* Compression Success Summary Badge */}
          {compressionSummary && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                <span>
                  تم ضغط الصور وتحويلها إلى <strong>WebP</strong> بنجاح: الحجم الأصلي{' '}
                  <span className="font-mono font-bold">{compressionSummary.originalSizeMB} MB</span> ➔
                  الحجم بعد الضغط{' '}
                  <span className="font-mono font-bold">{compressionSummary.compressedSizeMB} MB</span>
                </span>
              </div>
              <span className="px-2 py-0.5 bg-emerald-600 text-white rounded-md text-[10px] font-extrabold">
                توفير {compressionSummary.savedPercent}%
              </span>
            </div>
          )}

          {/* Upload Error Banner with Retry */}
          {uploadError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-bold text-red-900">تعذر رفع الصور</h5>
                    <p className="text-[11px] text-red-700 mt-0.5 leading-relaxed">{uploadError}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setUploadError(null)}
                  className="text-red-400 hover:text-red-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {failedFilesQueue.length > 0 && (
                <div className="pt-2 border-t border-red-200/60 flex items-center justify-between">
                  <span className="text-[11px] text-red-700">
                    تبقت {failedFilesQueue.length} صورة لم يكتمل رفعها.
                  </span>
                  <button
                    type="button"
                    onClick={handleRetryFailedFiles}
                    className="px-3 py-1 bg-red-700 hover:bg-red-800 text-white rounded-lg text-[11px] font-bold flex items-center gap-1.5 shadow-sm"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>إعادة المحاولة الآن</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Direct URL Input */}
          {showUrlInput && (
            <div className="p-3 bg-white rounded-xl border border-neutral-200 space-y-2">
              <label className="text-[11px] font-bold text-neutral-600 block">
                إضافة صورة عبر رابط URL مباشر
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={tempImageUrl}
                  onChange={(e) => setTempImageUrl(e.target.value)}
                  placeholder="https://example.com/image.webp"
                  className="flex-1 px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-mono focus:outline-none focus:border-black"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={handleAddImageUrl}
                  className="px-4 py-2 bg-neutral-800 text-white rounded-xl text-xs font-bold hover:bg-neutral-900"
                >
                  إضافة
                </button>
              </div>
            </div>
          )}

          {/* Images Thumbnails Grid */}
          {images.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3 pt-2">
              {images.map((img, idx) => (
                <div
                  key={img.id || idx}
                  className={`group relative rounded-xl overflow-hidden border-2 bg-white aspect-square flex items-center justify-center ${
                    img.isMain ? 'border-neutral-950 ring-2 ring-black/10' : 'border-neutral-200'
                  }`}
                >
                  <img
                    src={img.url}
                    alt={img.name || `صورة ${idx + 1}`}
                    className="w-full h-full object-contain p-1"
                  />

                  {/* Badges & Actions Overlay */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-2">
                    <div className="flex items-center justify-between">
                      {img.isMain ? (
                        <span className="px-2 py-0.5 bg-black text-white text-[9px] font-bold rounded">
                          الرئيسية
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSetMainImage(idx)}
                          className="px-2 py-0.5 bg-white/90 hover:bg-white text-neutral-900 text-[9px] font-bold rounded shadow"
                          title="تعيين كصورة رئيسية"
                        >
                          تعيين رئيسية
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleDeleteImage(idx)}
                        className="p-1 bg-red-600 hover:bg-red-700 text-white rounded-md shadow"
                        title="حذف الصورة"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>

                    <span className="text-[10px] text-white/90 font-mono truncate">
                      {img.name || `image_${idx + 1}.webp`}
                    </span>
                  </div>

                  {img.isMain && (
                    <span className="absolute top-1.5 right-1.5 p-1 bg-neutral-950 text-white rounded-md group-hover:hidden shadow-sm">
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center border-2 border-dashed border-neutral-200 rounded-xl bg-white/60">
              <ImageIcon className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
              <p className="text-xs font-bold text-neutral-600">لا توجد صور مرفوعة بعد</p>
              <p className="text-[11px] text-neutral-400 mt-0.5">
                اختر صور المنتج من هاتفك أو حاسوبك (سيتم ضغطها وتجهيزها تلقائياً)
              </p>
            </div>
          )}
        </div>

        {/* Product Details & Specifications */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-neutral-900 mb-1">وصف المنتج</label>
            <textarea
              rows={3}
              value={product.description || ''}
              onChange={(e) => updateProduct({ ...product, description: e.target.value })}
              placeholder="وصف مفصل للقصة والخامة وطريقة الارتداء..."
              className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium focus:outline-none focus:border-black"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-neutral-900 mb-1">نوع القصة (Fit)</label>
              <input
                type="text"
                value={product.fit || ''}
                onChange={(e) => updateProduct({ ...product, fit: e.target.value })}
                placeholder="مثال: Boxy Oversized Fit"
                className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs focus:outline-none focus:border-black"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-900 mb-1">نوع القماش (Fabric)</label>
              <input
                type="text"
                value={product.fabric || ''}
                onChange={(e) => updateProduct({ ...product, fabric: e.target.value })}
                placeholder="100% قطن فاخر 400 GSM"
                className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs focus:outline-none focus:border-black"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-900 mb-1">رمز المنتج (SKU)</label>
              <input
                type="text"
                value={product.sku || ''}
                onChange={(e) => updateProduct({ ...product, sku: e.target.value })}
                placeholder="AMD-HD-001"
                className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-mono focus:outline-none focus:border-black"
                dir="ltr"
              />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-100">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving || isUploading}
            className="px-5 py-2.5 rounded-xl border border-neutral-200 text-xs font-bold text-neutral-700 hover:bg-neutral-50 transition-colors disabled:opacity-50"
          >
            إلغاء
          </button>

          <button
            type="submit"
            disabled={isSaving || isUploading}
            className="px-6 py-2.5 bg-neutral-950 hover:bg-black text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-black/15 transition-all active:scale-95 disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>جاري الحفظ...</span>
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                <span>حفظ بيانات المنتج</span>
              </>
            )}
          </button>
        </div>

      </form>
    </div>
  );
};
