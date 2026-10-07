import React, { useState, useRef } from 'react';
import {
  Plus,
  Edit2,
  Trash2,
  X,
  Tag,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Upload,
  Image as ImageIcon,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { Category } from '../../../types';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../../firebase';
import {
  uploadCategoryImage,
  deleteStorageFile,
  validateImageFile,
  isFirebaseStorageUrl,
  fileToBase64,
  translateStorageErrorToArabic
} from '../../../services/storageService';

interface AdminCategoriesTabProps {
  categories: Category[];
  onRefresh: () => void;
}

export const AdminCategoriesTab: React.FC<AdminCategoriesTabProps> = ({
  categories,
  onRefresh,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editingCat, setEditingCat] = useState<Partial<Category> | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Image Upload & Preview State
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [bufferedImageBase64, setBufferedImageBase64] = useState<string | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Delete Category Confirmation State
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => {
      setSuccessToast((curr) => (curr === msg ? null : curr));
    }, 4000);
  };

  const handleCreateNew = () => {
    // Revoke previous blob URL if any
    if (imagePreviewUrl && imagePreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(imagePreviewUrl);
    }
    setEditingCat({
      id: `cat_${Date.now()}`,
      name: '',
      nameEn: '',
      slug: '',
      description: '',
      imageUrl: '',
      order: categories.length + 1,
      isActive: true,
    });
    setSelectedImageFile(null);
    setBufferedImageBase64(null);
    setImagePreviewUrl(null);
    setOriginalImageUrl(null);
    setUploadStatus('idle');
    setUploadProgress(0);
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setIsEditing(true);
  };

  const handleEdit = (cat: Category) => {
    if (imagePreviewUrl && imagePreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(imagePreviewUrl);
    }
    setEditingCat({ ...cat });
    setSelectedImageFile(null);
    setBufferedImageBase64(null);
    setImagePreviewUrl(cat.imageUrl || null);
    setOriginalImageUrl(cat.imageUrl || null);
    setUploadStatus('idle');
    setUploadProgress(0);
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setIsEditing(true);
  };

  // Handle selecting an image from mobile gallery / files
  const handleImageFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 1. Validate file type & size (JPG, JPEG, PNG, WEBP up to 10MB)
    const validation = validateImageFile(file);
    if (!validation.valid) {
      setUploadStatus('error');
      setUploadError(validation.error || 'صيغة الملف غير مدعومة. الصيغ المسموحة هي JPG، JPEG، PNG، WEBP فقط.');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    // 2. Revoke any existing object URL
    if (imagePreviewUrl && imagePreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(imagePreviewUrl);
    }

    setSelectedImageFile(file);
    setUploadStatus('idle');
    setUploadError(null);
    setUploadProgress(0);

    // Create fast, zero-memory object URL for immediate UI preview
    try {
      const localBlobUrl = URL.createObjectURL(file);
      setImagePreviewUrl(localBlobUrl);
    } catch (err) {
      console.warn('[Image Selection Notice]: Object URL creation notice:', err);
    }
  };

  // Remove the currently selected image preview
  const handleRemoveImage = () => {
    if (imagePreviewUrl && imagePreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(imagePreviewUrl);
    }
    setSelectedImageFile(null);
    setBufferedImageBase64(null);
    setImagePreviewUrl(null);
    if (editingCat) {
      setEditingCat({ ...editingCat, imageUrl: '' });
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setUploadStatus('idle');
    setUploadError(null);
  };

  const handleCloseModal = () => {
    if (isSaving) return;
    if (imagePreviewUrl && imagePreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(imagePreviewUrl);
    }
    setIsEditing(false);
    setEditingCat(null);
    setSelectedImageFile(null);
    setBufferedImageBase64(null);
    setImagePreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setUploadStatus('idle');
    setUploadError(null);
  };

  const openDeleteModal = (cat: Category) => {
    setCategoryToDelete(cat);
    setDeleteError(null);
  };

  const closeDeleteModal = () => {
    if (isDeleting) return;
    setCategoryToDelete(null);
    setDeleteError(null);
  };

  const handleConfirmDelete = async () => {
    if (!categoryToDelete) return;
    setIsDeleting(true);
    setDeleteError(null);

    const docId = categoryToDelete.id || categoryToDelete.slug;
    const catName = categoryToDelete.name;
    const catImage = categoryToDelete.imageUrl;

    try {
      if (!docId) {
        throw new Error('معرف الصنف غير صالح.');
      }

      // 1. Delete document from Firestore
      await deleteDoc(doc(db, 'categories', docId));

      // 2. If slug is different from id, also cleanup slug document if it exists
      if (categoryToDelete.slug && categoryToDelete.slug !== docId) {
        try {
          await deleteDoc(doc(db, 'categories', categoryToDelete.slug));
        } catch {}
      }

      // 3. Clean up associated image in Firebase Storage if present
      if (catImage && (isFirebaseStorageUrl(catImage) || catImage.startsWith('/uploads/'))) {
        deleteStorageFile(catImage).catch((err) => {
          console.warn('[Storage Cleanup Notice]:', err);
        });
      }

      // 4. Close modal, notify user & trigger immediate refresh
      setCategoryToDelete(null);
      setIsDeleting(false);
      showToast(`تم حذف صنف "${catName}" بنجاح`);
      onRefresh();
    } catch (err: any) {
      console.error('[Category Delete Error]:', err?.code, err?.message, err);
      setIsDeleting(false);
      const detail = err?.message || err?.code || 'فشل الاتصال بقاعدة البيانات';
      setDeleteError(`حدث خطأ أثناء حذف الصنف: ${detail}`);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCat || !editingCat.name?.trim()) return;
    if (isSaving) return;

    setIsSaving(true);
    setUploadError(null);

    const slug =
      editingCat.slug?.trim() ||
      editingCat.nameEn?.toLowerCase().replace(/\s+/g, '-') ||
      `cat-${Date.now()}`;

    // Target category ID for storage subfolder: categories/{categoryId}/{uniqueFileName}
    const targetCategoryId =
      editingCat.id && !editingCat.id.startsWith('cat_') ? editingCat.id : slug;

    let finalImageUrl = editingCat.imageUrl || '';

    // 1. If a new image was selected from device, upload it first to Firebase Storage!
    if (selectedImageFile) {
      setUploadStatus('uploading');
      setUploadProgress(15);
      try {
        const uploadResult = await uploadCategoryImage(
          targetCategoryId,
          selectedImageFile,
          (pct) => setUploadProgress(pct)
        );

        if (!uploadResult || !uploadResult.url) {
          throw new Error('لم يتم استلام رابط التحميل للصورة بعد الرفع.');
        }

        finalImageUrl = uploadResult.url;
        setUploadStatus('success');
        setUploadProgress(100);
      } catch (uploadErr: any) {
        const errorDetail = translateStorageErrorToArabic(uploadErr);
        console.error('[Category Image Upload Error]:', errorDetail);
        setUploadStatus('error');
        setUploadError(errorDetail);
        setIsSaving(false);
        // Do NOT proceed to Firestore or delete old image if upload failed!
        return;
      }
    } else if (!imagePreviewUrl) {
      // User explicitly cleared the image
      finalImageUrl = '';
    }

    // 2. Save category document with image URL in Firestore
    try {
      const payload: Category = {
        id: slug,
        name: editingCat.name.trim(),
        nameEn: (editingCat.nameEn || '').trim(),
        slug,
        description: (editingCat.description || '').trim(),
        imageUrl: finalImageUrl,
        order: Number(editingCat.order) || 1,
        isActive: editingCat.isActive ?? true,
      };

      await setDoc(doc(db, 'categories', slug), payload);

      // 3. Clean up old image if replaced and stored in system storage
      if (
        originalImageUrl &&
        originalImageUrl !== finalImageUrl &&
        (isFirebaseStorageUrl(originalImageUrl) || originalImageUrl.startsWith('/uploads/'))
      ) {
        deleteStorageFile(originalImageUrl).catch((cleanupErr) => {
          console.warn('[Old Category Image Cleanup Notice]:', cleanupErr);
        });
      }

      // 4. Revoke blob preview & reset
      if (imagePreviewUrl && imagePreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(imagePreviewUrl);
      }

      setIsEditing(false);
      setEditingCat(null);
      setSelectedImageFile(null);
      setBufferedImageBase64(null);
      setImagePreviewUrl(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      showToast('تم حفظ الصنف بنجاح');
      onRefresh();
    } catch (err: any) {
      console.error('Error saving category to Firestore:', err?.code, err?.message, err);
      setUploadError(err?.message || 'حدث خطأ أثناء حفظ بيانات الصنف في Firestore.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed bottom-6 left-6 z-[120] bg-neutral-900 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-200 border border-neutral-800">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-xs font-bold">{successToast}</span>
        </div>
      )}

      {/* Header action */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-base text-neutral-900">إدارة التصنيفات والتشكيلات</h3>
          <p className="text-xs text-neutral-500">تظهر التصنيفات في القائمة العلوية والصفحة الرئيسية والفلاتر</p>
        </div>

        <button
          onClick={handleCreateNew}
          className="px-4 py-2.5 bg-neutral-950 hover:bg-black text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة تصنيف جديد</span>
        </button>
      </div>

      {/* Categories Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {categories.length === 0 ? (
          <div className="col-span-full bg-white rounded-2xl border border-neutral-150 p-12 text-center text-neutral-400">
            <Tag className="w-12 h-12 mx-auto mb-3 text-neutral-300" />
            <p className="text-sm font-bold text-neutral-700">لا توجد أصناف حالياً</p>
            <p className="text-xs text-neutral-400 mt-1">يمكنك إضافة صنف جديد عبر الزر أعلاه في أي وقت.</p>
          </div>
        ) : (
          categories.map((cat) => (
            <div
              key={cat.id}
              className="bg-white rounded-2xl border border-neutral-150 overflow-hidden shadow-sm flex flex-col justify-between"
            >
              <div className="relative aspect-[16/9] w-full bg-neutral-100">
                {cat.imageUrl ? (
                  <img src={cat.imageUrl} alt={cat.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-neutral-300">
                    <Tag className="w-10 h-10" />
                  </div>
                )}
                <span className="absolute top-3 right-3 px-2 py-0.5 bg-black/70 text-white rounded text-[10px] font-mono">
                  ترتيب: {cat.order || 1}
                </span>
              </div>

              <div className="p-4 flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex items-baseline justify-between">
                    <h4 className="font-bold text-sm text-neutral-900">{cat.name}</h4>
                    {cat.nameEn && (
                      <span className="text-[11px] text-neutral-400 font-mono" dir="ltr">
                        {cat.nameEn}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-500 mt-1 line-clamp-2">{cat.description}</p>
                  <span className="text-[10px] text-neutral-400 font-mono mt-2 block" dir="ltr">
                    slug: /{cat.slug}
                  </span>
                </div>

                <div className="pt-4 border-t border-neutral-100 mt-4 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-emerald-600">نشط في المتجر</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleEdit(cat)}
                      className="p-1.5 text-neutral-600 hover:text-black rounded-lg hover:bg-neutral-100 transition-colors"
                      title="تعديل"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => openDeleteModal(cat)}
                      className="p-1.5 text-neutral-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                      title="حذف الصنف"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Delete Category Confirmation Dialog */}
      {categoryToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Overlay */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={closeDeleteModal}
          />

          {/* Dialog Container */}
          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 sm:p-7 overflow-hidden z-10 animate-in fade-in zoom-in-95">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-neutral-900">
                  هل أنت متأكد من حذف هذا الصنف؟
                </h3>
                <p className="text-xs text-neutral-500 mt-1">
                  سيتم حذف مستند هذا الصنف نهائياً من قاعدة بيانات Firestore.
                </p>
              </div>
            </div>

            {/* Target Category Summary Box */}
            <div className="p-3.5 bg-neutral-50 rounded-2xl border border-neutral-100 flex items-center gap-3 mb-4">
              {categoryToDelete.imageUrl ? (
                <img
                  src={categoryToDelete.imageUrl}
                  alt={categoryToDelete.name}
                  className="w-12 h-12 object-cover rounded-xl bg-neutral-200 shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-neutral-200 shrink-0 flex items-center justify-center text-neutral-400">
                  <Tag className="w-5 h-5" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h4 className="text-xs font-bold text-neutral-900 truncate">
                  {categoryToDelete.name}
                </h4>
                <div className="flex items-center gap-2 mt-1">
                  {categoryToDelete.nameEn && (
                    <span className="text-[11px] font-mono text-neutral-500" dir="ltr">
                      {categoryToDelete.nameEn}
                    </span>
                  )}
                  <span className="text-[10px] text-neutral-400 font-mono" dir="ltr">
                    /{categoryToDelete.slug}
                  </span>
                </div>
              </div>
            </div>

            {/* Products Reassurance Note */}
            <div className="mb-4 p-3 bg-neutral-100 rounded-xl text-[11px] text-neutral-600 border border-neutral-200">
              💡 <span className="font-bold text-neutral-800">ملاحظة هامة:</span> المنتجات المرتبطة بهذا الصنف لن تُحذف وستبقى محفوظة ومتاحة في المتجر بشكل طبيعي.
            </div>

            {/* Error Message */}
            {deleteError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{deleteError}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={closeDeleteModal}
                disabled={isDeleting}
                className="px-5 py-2.5 rounded-xl border border-neutral-200 text-xs font-bold text-neutral-700 hover:bg-neutral-50 transition-colors disabled:opacity-50"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md transition-colors disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جاري الحذف...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>نعم، حذف الصنف</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit / Create Modal */}
      {isEditing && editingCat && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
              onClick={handleCloseModal}
            />

            <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl p-6 sm:p-8 overflow-hidden my-8">
              <div className="flex items-center justify-between pb-4 border-b border-neutral-100 mb-6">
                <h3 className="font-bold text-base text-neutral-900">
                  {editingCat.id?.startsWith('cat_') ? 'إضافة تصنيف جديد' : 'تعديل التصنيف'}
                </h3>
                <button
                  onClick={handleCloseModal}
                  className="p-1.5 text-neutral-400 hover:text-black rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSave} className="space-y-4 text-xs">
                <div>
                  <label className="block font-bold text-neutral-900 mb-1">اسم التصنيف (بالعربية) *</label>
                  <input
                    type="text"
                    required
                    value={editingCat.name || ''}
                    onChange={(e) => setEditingCat({ ...editingCat, name: e.target.value })}
                    placeholder="مثال: هوديات وسويت شيرت"
                    className="w-full px-3.5 py-2.5 bg-neutral-50 border rounded-xl text-xs font-semibold focus:outline-none focus:border-black"
                  />
                </div>

                <div>
                  <label className="block font-bold text-neutral-900 mb-1">الاسم بالإنجليزية (Name in English)</label>
                  <input
                    type="text"
                    value={editingCat.nameEn || ''}
                    onChange={(e) => setEditingCat({ ...editingCat, nameEn: e.target.value })}
                    placeholder="Hoodies & Sweatshirts"
                    className="w-full px-3.5 py-2.5 bg-neutral-50 border rounded-xl text-xs font-mono focus:outline-none focus:border-black"
                    dir="ltr"
                  />
                </div>

                <div>
                  <label className="block font-bold text-neutral-900 mb-1">معرّف الرابط (Slug) *</label>
                  <input
                    type="text"
                    required
                    value={editingCat.slug || ''}
                    onChange={(e) => setEditingCat({ ...editingCat, slug: e.target.value })}
                    placeholder="hoodies"
                    className="w-full px-3.5 py-2.5 bg-neutral-50 border rounded-xl text-xs font-mono focus:outline-none focus:border-black"
                    dir="ltr"
                  />
                </div>

                {/* Category Image Upload & Preview Section */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <label className="block font-bold text-neutral-900 text-xs">
                      صورة الصنف (Category Image)
                    </label>
                    <span className="text-[11px] text-neutral-400">
                      اختياري • JPG, PNG, WEBP
                    </span>
                  </div>

                  {/* Hidden file input targeted for mobile photo gallery & file picker */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                    onChange={handleImageFileSelect}
                    className="hidden"
                  />

                  {/* Error Alert if Validation or Upload Failed */}
                  {uploadError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium flex items-center gap-2 animate-in fade-in">
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                      <span className="flex-1">{uploadError}</span>
                      <button
                        type="button"
                        onClick={() => setUploadError(null)}
                        className="p-1 hover:bg-red-100 rounded-lg text-red-500"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Uploading Status Indicator */}
                  {uploadStatus === 'uploading' && (
                    <div className="p-3 bg-neutral-900 text-white rounded-xl text-xs space-y-2 animate-in fade-in">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                          <span className="font-bold">جاري رفع وحفظ صورة الصنف...</span>
                        </div>
                        <span className="font-mono text-neutral-400">{uploadProgress}%</span>
                      </div>
                      <div className="w-full bg-neutral-800 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-amber-400 h-full transition-all duration-300 rounded-full"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Upload Success Indicator */}
                  {uploadStatus === 'success' && (
                    <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-bold flex items-center gap-2 animate-in fade-in">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>تم رفع الصورة بنجاح!</span>
                    </div>
                  )}

                  {/* Image Preview Box (If an image is selected or already exists) */}
                  {imagePreviewUrl ? (
                    <div className="relative rounded-2xl border border-neutral-200 overflow-hidden bg-neutral-50 p-2.5 space-y-2.5">
                      <div className="relative aspect-[16/9] w-full rounded-xl overflow-hidden bg-neutral-900 group">
                        <img
                          src={imagePreviewUrl}
                          alt="معاينة صورة الصنف"
                          className="w-full h-full object-contain"
                        />
                        <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-black/70 backdrop-blur-xs text-white text-[10px] font-mono px-2 py-0.5 rounded-md">
                          <ImageIcon className="w-3 h-3 text-amber-400" />
                          <span>معاينة قبل الحفظ</span>
                        </div>
                      </div>

                      {/* File Details & Action Buttons (Change / Delete) */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                        <div className="text-[11px] text-neutral-600 truncate min-w-0">
                          {selectedImageFile ? (
                            <span className="flex items-center gap-1.5 truncate">
                              <span className="font-bold text-neutral-900 truncate">
                                {selectedImageFile.name}
                              </span>
                              <span className="text-neutral-400 font-mono shrink-0">
                                ({(selectedImageFile.size / 1024).toFixed(0)} KB)
                              </span>
                            </span>
                          ) : (
                            <span className="text-neutral-500 font-mono text-[10px] truncate block" dir="ltr">
                              {editingCat.imageUrl ? 'الصورة المحفوظة حالياً' : 'معاينة الصورة'}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isSaving}
                            className="px-3 py-1.5 bg-white hover:bg-neutral-100 border border-neutral-300 text-neutral-800 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                          >
                            <RefreshCw className="w-3.5 h-3.5 text-neutral-600" />
                            <span>تغيير الصورة</span>
                          </button>

                          <button
                            type="button"
                            onClick={handleRemoveImage}
                            disabled={isSaving}
                            className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>حذف الصورة</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Clean Touch-Friendly Image Picker Button (When no image is chosen) */
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isSaving}
                      className="w-full border-2 border-dashed border-neutral-300 hover:border-black hover:bg-neutral-50/80 active:bg-neutral-100 rounded-2xl p-5 sm:p-6 transition-all flex flex-col items-center justify-center text-center cursor-pointer group focus:outline-none focus:ring-2 focus:ring-black"
                    >
                      <div className="w-12 h-12 rounded-2xl bg-neutral-100 group-hover:bg-neutral-200 flex items-center justify-center text-neutral-600 mb-2.5 transition-colors">
                        <Upload className="w-5 h-5 group-hover:scale-110 transition-transform" />
                      </div>
                      <span className="text-xs font-bold text-neutral-900 block mb-0.5">
                        اختيار صورة من الهاتف
                      </span>
                      <span className="text-[11px] text-neutral-400">
                        اضغط لفتح المعرض أو منتقي الملفات (JPG، PNG، WEBP)
                      </span>
                    </button>
                  )}
                </div>

                <div>
                  <label className="block font-bold text-neutral-900 mb-1">الوصف</label>
                  <textarea
                    rows={2}
                    value={editingCat.description || ''}
                    onChange={(e) => setEditingCat({ ...editingCat, description: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-neutral-50 border rounded-xl text-xs focus:outline-none focus:border-black"
                  />
                </div>

                <div>
                  <label className="block font-bold text-neutral-900 mb-1">ترتيب الظهور</label>
                  <input
                    type="number"
                    value={editingCat.order || 1}
                    onChange={(e) => setEditingCat({ ...editingCat, order: Number(e.target.value) })}
                    className="w-full px-3.5 py-2.5 bg-neutral-50 border rounded-xl text-xs font-mono focus:outline-none focus:border-black"
                  />
                </div>

                <div className="pt-4 border-t border-neutral-100 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    disabled={isSaving}
                    className="px-4 py-2 font-bold text-neutral-600 hover:text-black rounded-xl"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-5 py-2.5 bg-neutral-950 text-white rounded-xl font-bold shadow-md hover:bg-black disabled:opacity-50 flex items-center gap-2"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                        <span>{selectedImageFile ? 'جاري رفع الصورة والحفظ...' : 'جاري الحفظ...'}</span>
                      </>
                    ) : (
                      <span>حفظ التصنيف</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
