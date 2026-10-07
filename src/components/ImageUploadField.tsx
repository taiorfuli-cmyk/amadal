import React, { useState, useRef, useEffect } from 'react';
import { Upload, X, Check, AlertCircle, Link as LinkIcon, RefreshCw } from 'lucide-react';
import { uploadImageFile, deleteStorageFile, isFirebaseStorageUrl, validateImageFile, translateStorageErrorToArabic } from '../services/storageService';

export type ImageUploadStatus = 'idle' | 'validating' | 'uploading' | 'success' | 'error';

interface ImageUploadFieldProps {
  label: string;
  value: string;
  onChange: (url: string) => void;
  onSave?: (url: string) => Promise<void>;
  folder: 'homepage' | 'store-settings';
  description?: string;
  placeholder?: string;
  aspectRatioClass?: string;
  className?: string;
}

export const ImageUploadField: React.FC<ImageUploadFieldProps> = ({
  label,
  value,
  onChange,
  onSave,
  folder,
  description,
  placeholder = 'https://...',
  aspectRatioClass = 'aspect-video',
  className = '',
}) => {
  const [status, setStatus] = useState<ImageUploadStatus>('idle');
  const [progress, setProgress] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showManualInput, setShowManualInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clean up any temporary object URL when unmounting or changing preview
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputElement = e.target;
    const file = inputElement.files?.[0];
    if (!file) return;

    try {
      // 1. Enter validating state
      setStatus('validating');
      setErrorMessage(null);
      setSuccessMessage(null);
      setProgress(0);

      // Validate MIME, extension, and file size
      const validation = validateImageFile(file);
      if (!validation.valid) {
        setStatus('error');
        setErrorMessage(validation.error || 'الملف المختار غير صالح.');
        return;
      }

      // Preload image locally to ensure it is a valid, uncorrupted image file
      const localBlobUrl = URL.createObjectURL(file);
      const isValidImageFile = await new Promise<boolean>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = localBlobUrl;
      });

      if (!isValidImageFile) {
        URL.revokeObjectURL(localBlobUrl);
        setStatus('error');
        setErrorMessage('ملف الصورة تالف أو غير صالح للعرض.');
        return;
      }

      // Set local preview so user immediately sees selected image
      setPreviewUrl(localBlobUrl);

      // 2. Enter uploading state
      setStatus('uploading');
      setProgress(10);

      const oldUrl = value;

      try {
        // Step 1 & 2: Upload file and obtain download URL
        const result = await uploadImageFile({
          folder,
          file,
          onProgress: (pct) => {
            setProgress(Math.min(90, Math.max(10, pct)));
          },
        });

        if (!result || !result.url) {
          throw new Error('لم يتم استلام رابط صالح للصورة بعد الرفع.');
        }

        setProgress(95);

        // Step 3: Save to Firestore if onSave handler is provided
        if (onSave) {
          await onSave(result.url);
        }

        // Step 4: Update parent state
        onChange(result.url);
        setProgress(100);

        // Step 5: Mark success
        setStatus('success');
        setSuccessMessage('تم رفع الصورة وحفظها بنجاح!');

        // Switch from local blob preview to final saved URL
        URL.revokeObjectURL(localBlobUrl);
        setPreviewUrl(null);

        // Step 6: After successful upload AND Firestore save, delete the replaced old image only
        if (oldUrl && isFirebaseStorageUrl(oldUrl) && oldUrl !== result.url) {
          deleteStorageFile(oldUrl).catch((delErr) => {
            console.warn('[Image Replacement Cleanup]:', delErr);
          });
        }

        // Auto-clear success message after 4 seconds
        setTimeout(() => {
          setSuccessMessage((prev) => (prev ? null : null));
          setStatus((prevStatus) => (prevStatus === 'success' ? 'idle' : prevStatus));
        }, 4000);
      } catch (err: any) {
        console.warn('[Image Upload Error]:', err?.code || err?.message || err);
        // Revoke local preview on failure and keep old image intact
        URL.revokeObjectURL(localBlobUrl);
        setPreviewUrl(null);

        setStatus('error');
        const displayMsg = translateStorageErrorToArabic(err);
        setErrorMessage(displayMsg);
        setProgress(0);
      }
    } finally {
      if (inputElement) {
        try {
          inputElement.value = '';
        } catch {}
      }
    }
  };

  const handleClearImage = async () => {
    const oldUrl = value;
    try {
      if (onSave) {
        await onSave('');
      }
      onChange('');
      setPreviewUrl(null);
      setErrorMessage(null);
      setSuccessMessage(null);
      setProgress(0);
      setStatus('idle');

      if (oldUrl && isFirebaseStorageUrl(oldUrl)) {
        deleteStorageFile(oldUrl).catch(console.warn);
      }
    } catch (err: any) {
      setStatus('error');
      setErrorMessage('تعذر حذف الصورة من قاعدة البيانات.');
    }
  };

  // Determine which image URL to display: local preview takes precedence during upload, then prop value
  const displayImage = previewUrl || value;
  const isBusy = status === 'validating' || status === 'uploading';

  return (
    <div className={`space-y-2.5 ${className}`}>
      <div className="flex items-center justify-between">
        <label className="block font-bold text-xs text-neutral-900">
          {label}
        </label>
        <button
          type="button"
          onClick={() => setShowManualInput(!showManualInput)}
          className="text-[11px] text-neutral-500 hover:text-black flex items-center gap-1 font-mono transition-colors"
        >
          <LinkIcon className="w-3 h-3" />
          <span>{showManualInput ? 'إخفاء الرابط المباشر' : 'تعديل الرابط يدوياً'}</span>
        </button>
      </div>

      {description && (
        <p className="text-[11px] text-neutral-500 leading-normal">{description}</p>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/jpg"
        onChange={handleFileChange}
        disabled={isBusy}
        className="hidden"
      />

      {/* Main Container: Preview & Action Area */}
      <div className="border border-neutral-200 rounded-2xl p-3 sm:p-4 bg-neutral-50/50 space-y-3">
        {/* Preview section if displayImage exists */}
        {displayImage ? (
          <div className="relative group rounded-xl overflow-hidden border border-neutral-200 bg-neutral-900 flex items-center justify-center max-h-56">
            <img
              src={displayImage}
              alt={label}
              className={`w-full max-h-56 object-contain rounded-xl ${aspectRatioClass}`}
              onError={() => {
                if (status !== 'uploading' && status !== 'validating') {
                  setStatus('error');
                  setErrorMessage('تعذر تحميل الصورة من الرابط الحالي.');
                }
              }}
            />

            {/* Hover overlay with actions */}
            {!isBusy && (
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 p-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 bg-white text-black text-xs font-bold rounded-xl shadow-lg hover:bg-neutral-100 transition-colors flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>تغيير الصورة</span>
                </button>

                <button
                  type="button"
                  onClick={handleClearImage}
                  className="p-1.5 bg-red-600 text-white rounded-xl shadow-lg hover:bg-red-700 transition-colors"
                  title="إزالة الصورة"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Empty State: Upload Prompt */
          <div
            onClick={() => !isBusy && fileInputRef.current?.click()}
            className={`border-2 border-dashed border-neutral-300 rounded-xl p-6 text-center cursor-pointer transition-colors bg-white hover:bg-neutral-50/50 ${
              isBusy ? 'opacity-60 cursor-not-allowed' : 'hover:border-black'
            }`}
          >
            <div className="w-10 h-10 mx-auto rounded-full bg-neutral-100 flex items-center justify-center text-neutral-600 mb-2">
              <Upload className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-neutral-900 block">
              اضغط لرفع صورة من جهازك
            </span>
            <span className="text-[11px] text-neutral-400 mt-0.5 block">
              الصيغ المدعومة: JPG، JPEG، PNG، WEBP (بحد أقصى 10 ميغابايت)
            </span>
          </div>
        )}

        {/* Action button if image already exists */}
        {displayImage && !isBusy && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <button
              type="button"
              disabled={isBusy}
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-neutral-900 hover:bg-black text-white text-xs font-bold rounded-xl shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>رفع صورة بديلة من الجهاز</span>
            </button>

            <button
              type="button"
              disabled={isBusy}
              onClick={handleClearImage}
              className="text-xs text-red-600 hover:text-red-700 font-bold px-2 py-1 transition-colors"
            >
              إزالة الصورة
            </button>
          </div>
        )}

        {/* Live Validating Indicator */}
        {status === 'validating' && (
          <div className="p-3 bg-white rounded-xl border border-neutral-200 flex items-center gap-2 text-xs font-bold text-neutral-800">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-neutral-600" />
            <span>جاري التحقق من صلاحية الصورة...</span>
          </div>
        )}

        {/* Live Upload Progress Indicator */}
        {status === 'uploading' && (
          <div className="p-3 bg-white rounded-xl border border-neutral-200 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-neutral-800 flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-neutral-600" />
                <span>جاري رفع ومعالجة الصورة...</span>
              </span>
              <span className="font-mono font-bold text-neutral-900">{progress}%</span>
            </div>

            <div className="w-full h-2 bg-neutral-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-neutral-950 transition-all duration-300 rounded-full"
                style={{ width: `${Math.max(5, progress)}%` }}
              />
            </div>
          </div>
        )}

        {/* Success message: Only shown when status === 'success' */}
        {status === 'success' && successMessage && (
          <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-bold flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Error message: Only shown when status === 'error' */}
        {status === 'error' && errorMessage && (
          <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span className="flex-1">{errorMessage}</span>
            <button
              type="button"
              onClick={() => {
                setErrorMessage(null);
                setStatus('idle');
              }}
              className="text-neutral-400 hover:text-neutral-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Manual URL input toggle (maintains full compatibility with existing URLs) */}
        {showManualInput && (
          <div className="pt-2 border-t border-neutral-200/70 space-y-1">
            <label className="block text-[11px] font-mono font-bold text-neutral-600">
              الرابط المباشر (URL أو Storage Path):
            </label>
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-xl text-xs font-mono focus:outline-none focus:border-black"
              dir="ltr"
            />
          </div>
        )}
      </div>
    </div>
  );
};
