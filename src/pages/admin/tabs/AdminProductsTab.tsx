import React, { useState, useRef } from 'react';
import {
  Plus,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  Star,
  Search,
  Check,
  X,
  Image as ImageIcon,
  Upload,
  AlertTriangle,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Link as LinkIcon,
  Package,
  Ruler
} from 'lucide-react';
import { Product, ProductVariant, Category, ProductImage, SizeMeasurement } from '../../../types';
import { doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db, removeUndefinedFields } from '../../../firebase';
import { useStore } from '../../../context/StoreContext';
import { DEFAULT_SIZE_GUIDE } from '../../../components/SizeGuideModal';
import {
  uploadProductImage,
  deleteStorageFile,
  deleteProductImages,
  validateImageFile,
  isFirebaseStorageUrl,
  extractStoragePath,
  normalizeProductImages,
  getMainImageUrl,
  getAllImageUrls,
  compressAndConvertToWebP,
  translateStorageErrorToArabic
} from '../../../services/storageService';

interface AdminProductsTabProps {
  products: Product[];
  categories: Category[];
  onRefresh: () => void;
}

export const AdminProductsTab: React.FC<AdminProductsTabProps> = ({
  products,
  categories,
  onRefresh,
}) => {
  const { settings } = useStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Product Edit / Create State
  const [isEditing, setIsEditing] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Image Uploading State
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [tempImageUrl, setTempImageUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Variant generator state for editor
  const [tempColor, setTempColor] = useState('');
  const [tempSize, setTempSize] = useState('');

  // Quick Size Guide Modal State
  const [sizeGuideProduct, setSizeGuideProduct] = useState<Product | null>(null);
  const [sizeGuideRows, setSizeGuideRows] = useState<SizeMeasurement[]>([]);
  const [isSavingSizeGuide, setIsSavingSizeGuide] = useState(false);
  const [sizeGuideError, setSizeGuideError] = useState<string | null>(null);

  const openSizeGuideModal = (product: Product) => {
    setSizeGuideProduct(product);
    const rows: SizeMeasurement[] =
      product.sizeGuide && product.sizeGuide.length > 0
        ? JSON.parse(JSON.stringify(product.sizeGuide))
        : JSON.parse(JSON.stringify(DEFAULT_SIZE_GUIDE));
    setSizeGuideRows(rows);
    setIsSavingSizeGuide(false);
    setSizeGuideError(null);
  };

  const closeSizeGuideModal = () => {
    if (isSavingSizeGuide) return;
    setSizeGuideProduct(null);
    setSizeGuideError(null);
  };

  const handleUpdateQuickRow = (idx: number, field: keyof SizeMeasurement, value: string) => {
    const updated = [...sizeGuideRows];
    updated[idx] = { ...updated[idx], [field]: value };
    setSizeGuideRows(updated);
  };

  const handleAddQuickRow = () => {
    setSizeGuideRows((prev) => [
      ...prev,
      { size: '', length: '', chest: '', sleeve: '' },
    ]);
  };

  const handleDeleteQuickRow = (idx: number) => {
    setSizeGuideRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleResetQuickToDefault = () => {
    setSizeGuideRows(JSON.parse(JSON.stringify(DEFAULT_SIZE_GUIDE)));
  };

  const handleSaveQuickSizeGuide = async () => {
    if (!sizeGuideProduct) return;
    setIsSavingSizeGuide(true);
    setSizeGuideError(null);

    try {
      const cleanRows: SizeMeasurement[] = sizeGuideRows
        .map((r) => ({
          size: (r.size || '').trim(),
          length: (r.length || '').trim(),
          chest: (r.chest || '').trim(),
          sleeve: (r.sleeve || '').trim(),
        }))
        .filter(
          (r) =>
            r.size.length > 0 ||
            r.length.length > 0 ||
            r.chest.length > 0 ||
            r.sleeve.length > 0
        );

      await updateDoc(doc(db, 'products', sizeGuideProduct.id), {
        sizeGuide: cleanRows,
        updatedAt: new Date().toISOString(),
      });

      showToast('تم حفظ جدول المقاسات بنجاح');
      onRefresh();
      setSizeGuideProduct(null);
    } catch (err: any) {
      console.error('Error saving size guide:', err);
      setSizeGuideError(err?.message || 'تعذر حفظ جدول المقاسات. تحقق من الاتصال والصلاحيات.');
    } finally {
      setIsSavingSizeGuide(false);
    }
  };

  // Delete Confirmation Modal State
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => {
      setSuccessToast((curr) => (curr === msg ? null : curr));
    }, 4000);
  };

  const filteredProducts = products.filter((p) => {
    const matchCategory = categoryFilter === 'all' || p.categoryId === categoryFilter;
    const matchSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.sku?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchCategory && matchSearch;
  });

  const handleCreateNew = () => {
    const newId = `product_${Date.now()}`;
    setEditingProduct({
      id: newId,
      name: '',
      slug: `amadal-item-${Date.now()}`,
      description: '',
      price: 4500,
      categoryId: categories[0]?.slug || 't-shirts',
      categoryName: categories[0]?.name || 'تيشيرتات أوفرسايز',
      images: [],
      colors: ['أسود Carbon Black'],
      sizes: ['S', 'M', 'L', 'XL'],
      variants: [
        { id: 'v1', color: 'أسود Carbon Black', size: 'S', stock: 5 },
        { id: 'v2', color: 'أسود Carbon Black', size: 'M', stock: 10 },
        { id: 'v3', color: 'أسود Carbon Black', size: 'L', stock: 8 },
        { id: 'v4', color: 'أسود Carbon Black', size: 'XL', stock: 4 },
      ],
      sku: 'AMD-ITEM-001',
      fit: 'Oversized Fit',
      fabric: '100% قطن فاخر ممشط معالج 300 GSM',
      careInstructions: 'غسيل آلي بماء بارد 30 درجة، تجنب استخدام النشافة، كوي معتدل.',
      sizeGuide: JSON.parse(JSON.stringify(DEFAULT_SIZE_GUIDE)),
      isFeatured: false,
      isNew: true,
      isBestSeller: false,
      isPublished: true,
      createdAt: new Date().toISOString(),
    });
    setSaveError(null);
    setUploadError(null);
    setShowUrlInput(false);
    setIsEditing(true);
  };

  const handleEdit = (product: Product) => {
    setEditingProduct({
      ...product,
      images: normalizeProductImages(product.images),
      sizeGuide:
        product.sizeGuide && product.sizeGuide.length > 0
          ? JSON.parse(JSON.stringify(product.sizeGuide))
          : JSON.parse(JSON.stringify(DEFAULT_SIZE_GUIDE)),
    });
    setSaveError(null);
    setUploadError(null);
    setShowUrlInput(false);
    setIsEditing(true);
  };

  const handleUpdateEditProductSizeGuideRow = (
    idx: number,
    field: keyof SizeMeasurement,
    val: string
  ) => {
    if (!editingProduct) return;
    const current = [...(editingProduct.sizeGuide || [])];
    current[idx] = { ...current[idx], [field]: val };
    setEditingProduct({ ...editingProduct, sizeGuide: current });
  };

  const handleAddEditProductSizeGuideRow = () => {
    if (!editingProduct) return;
    const current = [...(editingProduct.sizeGuide || [])];
    current.push({ size: '', length: '', chest: '', sleeve: '' });
    setEditingProduct({ ...editingProduct, sizeGuide: current });
  };

  const handleDeleteEditProductSizeGuideRow = (idx: number) => {
    if (!editingProduct) return;
    const current = (editingProduct.sizeGuide || []).filter((_, i) => i !== idx);
    setEditingProduct({ ...editingProduct, sizeGuide: current });
  };

  const handleSyncSizeGuideWithSizes = () => {
    if (!editingProduct) return;
    const productSizes = editingProduct.sizes || [];
    if (productSizes.length === 0) return;

    const currentGuide = [...(editingProduct.sizeGuide || [])];
    const newGuide: SizeMeasurement[] = [];

    productSizes.forEach((sz) => {
      const existing = currentGuide.find((g) => g.size.toLowerCase() === sz.toLowerCase());
      if (existing) {
        newGuide.push(existing);
      } else {
        const std = DEFAULT_SIZE_GUIDE.find((g) => g.size.toLowerCase() === sz.toLowerCase());
        newGuide.push({
          size: sz,
          length: std ? std.length : '70 سم',
          chest: std ? std.chest : '60 سم',
          sleeve: std ? std.sleeve : '25 سم',
        });
      }
    });

    setEditingProduct({ ...editingProduct, sizeGuide: newGuide });
  };

  const handleTogglePublish = async (product: Product) => {
    try {
      await updateDoc(doc(db, 'products', product.id), {
        isPublished: !product.isPublished,
      });
      onRefresh();
    } catch (e) {
      console.error('Error toggling publish:', e);
    }
  };

  const handleToggleFeatured = async (product: Product) => {
    try {
      await updateDoc(doc(db, 'products', product.id), {
        isFeatured: !product.isFeatured,
      });
      onRefresh();
    } catch (e) {
      console.error('Error toggling featured:', e);
    }
  };

  // Open Delete Confirmation Dialog
  const openDeleteModal = (product: Product) => {
    setProductToDelete(product);
    setDeleteError(null);
    setIsDeleting(false);
  };

  // Close Delete Modal
  const closeDeleteModal = () => {
    if (isDeleting) return;
    setProductToDelete(null);
    setDeleteError(null);
  };

  // Execute Product Deletion
  const confirmDeleteProduct = async () => {
    if (!productToDelete) return;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      // 1. Delete associated images from Firebase Storage
      if (productToDelete.images && productToDelete.images.length > 0) {
        try {
          await deleteProductImages(productToDelete.images);
        } catch (storageErr) {
          console.warn('Storage image cleanup error (ignored to complete doc delete):', storageErr);
        }
      }

      // 2. Delete document from Firestore
      await deleteDoc(doc(db, 'products', productToDelete.id));

      // 3. Close dialog & notify
      setProductToDelete(null);
      setIsDeleting(false);
      showToast('تم حذف المنتج بنجاح');
      onRefresh();
    } catch (err: any) {
      console.error('Failed to delete product from Firestore:', err);
      setIsDeleting(false);
      setDeleteError('تعذر حذف المنتج، حاول مرة أخرى.');
    }
  };

  // Handle Multi-file Upload from Device
  const handleDeviceFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !editingProduct) return;

    setUploadError(null);
    const fileArray = Array.from(files);

    // Validate all files first
    for (const file of fileArray) {
      const check = validateImageFile(file);
      if (!check.valid) {
        setUploadError(check.error || 'صيغة الملف غير مدعومة.');
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
    }

    // Ensure valid, permanent productId exists before initiating storage path
    let targetProductId = editingProduct.id?.trim();
    if (!targetProductId) {
      targetProductId = `product_${Date.now()}`;
      setEditingProduct((prev) => (prev ? { ...prev, id: targetProductId } : null));
    }

    setIsUploadingImages(true);
    setUploadProgress(0);

    const currentImages = normalizeProductImages(editingProduct.images);
    const uploadedImagesList: ProductImage[] = [];
    const totalFiles = fileArray.length;

    try {
      for (let i = 0; i < totalFiles; i++) {
        const file = fileArray[i];
        const progressBase = (i / totalFiles) * 100;

        // 1. Compress image to under 1MB & auto-convert to WebP
        const compressedFile = await compressAndConvertToWebP(file, {
          maxSizeMB: 0.95,
          maxWidthOrHeight: 1920,
          initialQuality: 0.85,
          onProgress: (compPct) => {
            const compChunk = (compPct / 100) * 25;
            setUploadProgress(Math.round(progressBase + compChunk / totalFiles));
          },
        });

        // 2. Upload to Firebase Storage with timeout & retries
        const result = await uploadProductImage(targetProductId, compressedFile, (filePct) => {
          const uploadChunk = 25 + (filePct / 100) * 75;
          const totalPct = Math.round(progressBase + uploadChunk / totalFiles);
          setUploadProgress(Math.min(99, Math.max(1, totalPct)));
        });

        const isMain = currentImages.length === 0 && uploadedImagesList.length === 0;
        const newOrder = currentImages.length + uploadedImagesList.length;

        uploadedImagesList.push({
          id: `img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          url: result.url,
          path: result.path,
          name: result.name,
          isMain,
          order: newOrder,
        });
      }

      setEditingProduct((prev) => {
        if (!prev) return prev;
        const prevImages = normalizeProductImages(prev.images);
        const merged = [...prevImages, ...uploadedImagesList];
        if (merged.length > 0 && !merged.some((m) => m.isMain)) {
          merged[0].isMain = true;
        }
        return {
          ...prev,
          images: merged,
        };
      });

      setUploadProgress(100);
      showToast(`تم ضغط وتحويل ورفع ${uploadedImagesList.length} صورة بنجاح`);
    } catch (err: any) {
      const errorMsg = translateStorageErrorToArabic(err);
      console.error('Upload failed with details:', err);
      setUploadError(errorMsg);
      setUploadProgress(0);
    } finally {
      setIsUploadingImages(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Remove single image from product & delete from Firebase Storage
  const handleRemoveImage = async (index: number) => {
    if (!editingProduct?.images) return;
    const currentImages = normalizeProductImages(editingProduct.images);
    const targetImage = currentImages[index];
    if (!targetImage) return;

    // Remove from UI state and recalculate order
    currentImages.splice(index, 1);
    const updatedImages = currentImages.map((img, idx) => ({
      ...img,
      order: idx,
    }));
    // If deleted image was main, designate the first remaining image as main
    if (targetImage.isMain && updatedImages.length > 0) {
      updatedImages[0].isMain = true;
    }

    setEditingProduct((prev) => ({
      ...prev,
      images: updatedImages,
    }));

    // Delete from Firebase Storage if it has a path or is a Firebase Storage URL
    if (targetImage.path || isFirebaseStorageUrl(targetImage.url)) {
      try {
        await deleteStorageFile(targetImage.path || targetImage.url);
      } catch (err) {
        console.warn('Could not delete image from Firebase Storage:', err);
      }
    }

    // If product is already stored in Firestore, update Firestore document immediately
    if (editingProduct.id && products.some((p) => p.id === editingProduct.id)) {
      try {
        await updateDoc(doc(db, 'products', editingProduct.id), {
          images: updatedImages,
          updatedAt: new Date().toISOString(),
        });
      } catch (err) {
        console.warn('Could not update Firestore document after image deletion:', err);
      }
    }

    showToast('تم حذف الصورة من التخزين والمنتج');
  };

  // Set as Main Product Image
  const handleSetMainImage = (index: number) => {
    if (!editingProduct?.images) return;
    const currentImages = normalizeProductImages(editingProduct.images);
    const updated = currentImages.map((img, idx) => ({
      ...img,
      isMain: idx === index,
    }));
    setEditingProduct((prev) => ({
      ...prev,
      images: updated,
    }));
  };

  // Reorder Image: move earlier (towards first)
  const handleMoveImageEarlier = (index: number) => {
    if (!editingProduct?.images || index === 0) return;
    const images = [...normalizeProductImages(editingProduct.images)];
    const temp = images[index];
    images[index] = images[index - 1];
    images[index - 1] = temp;
    const reordered = images.map((img, idx) => ({ ...img, order: idx }));
    setEditingProduct((prev) => ({ ...prev, images: reordered }));
  };

  // Reorder Image: move later (towards end)
  const handleMoveImageLater = (index: number) => {
    if (!editingProduct?.images) return;
    const images = [...normalizeProductImages(editingProduct.images)];
    if (index >= images.length - 1) return;
    const temp = images[index];
    images[index] = images[index + 1];
    images[index + 1] = temp;
    const reordered = images.map((img, idx) => ({ ...img, order: idx }));
    setEditingProduct((prev) => ({ ...prev, images: reordered }));
  };

  // Add Image via URL (Secondary Option)
  const handleAddImageUrl = () => {
    if (!tempImageUrl.trim() || !editingProduct) return;
    const url = tempImageUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      setUploadError('يرجى إدخال رابط URL صالح يبدأ بـ http أو https');
      return;
    }

    const currentImages = normalizeProductImages(editingProduct.images);
    const isMain = currentImages.length === 0;
    const newImage: ProductImage = {
      id: `img_url_${Date.now()}`,
      url,
      path: isFirebaseStorageUrl(url) ? extractStoragePath(url) : '',
      name: url.split('/').pop()?.split('?')[0] || `صورة ${currentImages.length + 1}`,
      isMain,
      order: currentImages.length,
    };

    setEditingProduct((prev) => ({
      ...prev,
      images: [...currentImages, newImage],
    }));
    setTempImageUrl('');
    setShowUrlInput(false);
    showToast('تمت إضافة رابط الصورة');
  };

  // Add Color
  const handleAddColor = () => {
    if (!tempColor.trim()) return;
    const colors = editingProduct?.colors || [];
    if (!colors.includes(tempColor.trim())) {
      const newColors = [...colors, tempColor.trim()];
      setEditingProduct((prev) => ({ ...prev, colors: newColors }));
      // Generate variants for each size with this new color
      const currentVariants = editingProduct?.variants || [];
      const newVars: ProductVariant[] = (editingProduct?.sizes || ['M', 'L']).map((sz, idx) => ({
        id: `var_${Date.now()}_${idx}`,
        color: tempColor.trim(),
        size: sz,
        stock: 5,
        sku: `${editingProduct?.sku || 'AMD'}-${tempColor.trim().substring(0, 3)}-${sz}`,
      }));
      setEditingProduct((prev) => ({ ...prev, variants: [...currentVariants, ...newVars] }));
    }
    setTempColor('');
  };

  // Add Size
  const handleAddSize = () => {
    if (!tempSize.trim()) return;
    const sizes = editingProduct?.sizes || [];
    if (!sizes.includes(tempSize.trim())) {
      const newSizes = [...sizes, tempSize.trim()];
      setEditingProduct((prev) => ({ ...prev, sizes: newSizes }));
      // Generate variants for each color with this size
      const currentVariants = editingProduct?.variants || [];
      const newVars: ProductVariant[] = (editingProduct?.colors || ['أسود']).map((col, idx) => ({
        id: `var_${Date.now()}_sz_${idx}`,
        color: col,
        size: tempSize.trim(),
        stock: 5,
        sku: `${editingProduct?.sku || 'AMD'}-${col.substring(0, 3)}-${tempSize.trim()}`,
      }));
      setEditingProduct((prev) => ({ ...prev, variants: [...currentVariants, ...newVars] }));
    }
    setTempSize('');
  };

  // Save Product
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct || !editingProduct.name) return;

    if (isUploadingImages) {
      setSaveError('يرجى الانتظار حتى اكتمال رفع الصور إلى التخزين السحابي قبل حفظ المنتج.');
      return;
    }

    if (!editingProduct.price || Number(editingProduct.price) <= 0) {
      setSaveError('يرجى إدخال سعر صحيح للمنتج.');
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      const prodId = editingProduct.id || `product_${Date.now()}`;

      // Sanitize images array to ensure structured object format
      const rawImages = normalizeProductImages(editingProduct.images);
      const sanitizedImages: ProductImage[] = rawImages.map((img, idx) => ({
        url: img.url,
        path: img.path || (isFirebaseStorageUrl(img.url) ? extractStoragePath(img.url) : ''),
        isMain: Boolean(img.isMain),
        order: idx,
        name: img.name || `صورة ${idx + 1}`,
      }));

      // Ensure at least one image is main if images exist
      if (sanitizedImages.length > 0 && !sanitizedImages.some((i) => i.isMain)) {
        sanitizedImages[0].isMain = true;
      }

      const payload: Record<string, any> = {
        id: prodId,
        name: editingProduct.name.trim(),
        slug: editingProduct.slug?.trim() || prodId,
        description: editingProduct.description || '',
        price: Number(editingProduct.price) || 0,
        categoryId: editingProduct.categoryId || 'general',
        categoryName: categories.find((c) => c.slug === editingProduct.categoryId)?.name || 'عام',
        images: sanitizedImages,
        colors: editingProduct.colors || ['أسود'],
        sizes: editingProduct.sizes || ['M', 'L'],
        variants: editingProduct.variants || [],
        sku: editingProduct.sku || '',
        fit: editingProduct.fit || 'Oversized Fit',
        fabric: editingProduct.fabric || '100% قطن فاخر',
        careInstructions: editingProduct.careInstructions || '',
        isFeatured: editingProduct.isFeatured ?? false,
        isNew: editingProduct.isNew ?? true,
        isBestSeller: editingProduct.isBestSeller ?? false,
        isPublished: editingProduct.isPublished ?? true,
        createdAt: editingProduct.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Only assign salePrice if it's a valid numeric discount > 0
      if (
        editingProduct.salePrice !== undefined &&
        editingProduct.salePrice !== null &&
        editingProduct.salePrice !== ('' as any)
      ) {
        const parsedSalePrice = Number(editingProduct.salePrice);
        if (!isNaN(parsedSalePrice) && parsedSalePrice > 0) {
          payload.salePrice = parsedSalePrice;
        }
      }

      if (editingProduct.sizeGuide && editingProduct.sizeGuide.length > 0) {
        const cleanGuide: SizeMeasurement[] = editingProduct.sizeGuide
          .map((r) => ({
            size: (r.size || '').trim(),
            length: (r.length || '').trim(),
            chest: (r.chest || '').trim(),
            sleeve: (r.sleeve || '').trim(),
          }))
          .filter(
            (r) =>
              r.size.length > 0 ||
              r.length.length > 0 ||
              r.chest.length > 0 ||
              r.sleeve.length > 0
          );
        payload.sizeGuide = cleanGuide;
      } else {
        payload.sizeGuide = [];
      }

      if (editingProduct.modelInfo) {
        payload.modelInfo = removeUndefinedFields(editingProduct.modelInfo);
      }

      const cleanPayload = removeUndefinedFields(payload) as Product;
      await setDoc(doc(db, 'products', prodId), cleanPayload);
      setIsEditing(false);
      setEditingProduct(null);
      showToast('تم حفظ المنتج بنجاح');
      onRefresh();
    } catch (err: any) {
      console.error('Error saving product:', err);
      const detail = err?.message || '';
      setSaveError(detail ? `حدث خطأ أثناء حفظ المنتج: ${detail}` : 'حدث خطأ أثناء حفظ المنتج في قاعدة البيانات. تحقق من الاتصال والصلاحيات.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed bottom-6 left-6 z-[100] bg-neutral-900 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-neutral-800 animate-in fade-in slide-in-from-bottom-4">
          <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
            <Check className="w-4 h-4" />
          </div>
          <span className="text-xs font-bold">{successToast}</span>
        </div>
      )}

      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-neutral-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="بحث باسم المنتج أو الكود..."
              className="w-full pr-10 pl-4 py-2.5 bg-white border border-neutral-200 rounded-xl text-xs font-medium focus:outline-none focus:border-black"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="py-2.5 px-3 bg-white border border-neutral-200 rounded-xl text-xs font-medium focus:outline-none focus:border-black"
          >
            <option value="all">كل الأقسام</option>
            {categories.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={handleCreateNew}
          className="px-5 py-2.5 bg-neutral-950 hover:bg-black text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-md transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة منتج جديد</span>
        </button>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-2xl border border-neutral-150 overflow-hidden shadow-sm">
        <div className="overflow-x-auto scroll-smooth touch-pan-x [-webkit-overflow-scrolling:touch]">
          <table className="w-full min-w-[700px] text-right text-xs">
            <thead className="bg-neutral-50 text-neutral-500 uppercase border-b border-neutral-150">
              <tr>
                <th className="py-3.5 px-4 font-bold">المنتج</th>
                <th className="py-3.5 px-4 font-bold">التصنيف</th>
                <th className="py-3.5 px-4 font-bold">السعر</th>
                <th className="py-3.5 px-4 font-bold">المخزون الكلي</th>
                <th className="py-3.5 px-4 font-bold">شارات العرض</th>
                <th className="py-3.5 px-4 font-bold">الحالة</th>
                <th className="py-3.5 px-4 font-bold text-center">جدول المقاسات</th>
                <th className="py-3.5 px-4 font-bold text-left">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {products.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center">
                    <div className="max-w-sm mx-auto flex flex-col items-center">
                      <div className="w-16 h-16 rounded-2xl bg-neutral-100 flex items-center justify-center text-neutral-400 mb-4 shadow-inner">
                        <Package className="w-8 h-8" />
                      </div>
                      <h4 className="text-base font-bold text-neutral-900 mb-1.5">لا توجد منتجات حاليًا</h4>
                      <p className="text-xs text-neutral-500 mb-6 leading-relaxed">
                        قائمة منتجات المتجر فارغة تمامًا. يمكنك البدء بإضافة أول منتج لعلامة AMADAL الآن.
                      </p>
                      <button
                        type="button"
                        onClick={handleCreateNew}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-neutral-950 hover:bg-black text-white rounded-xl text-xs font-bold shadow-lg shadow-black/10 transition-all active:scale-95"
                      >
                        <Plus className="w-4 h-4" />
                        <span>+ إضافة منتج</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-neutral-400">
                    لا توجد منتجات تطابق البحث أو التصنيف المحدد.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p) => {
                  const totalStock = p.variants?.reduce((sum, v) => sum + (v.stock || 0), 0) ?? 0;
                  const hasDiscount = p.salePrice && p.salePrice < p.price;
                  const mainImage = getMainImageUrl(p.images);

                  return (
                    <tr key={p.id} className="hover:bg-neutral-50/70 transition-colors">
                      {/* Product Name & Image */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          {mainImage ? (
                            <div className="w-12 h-14 rounded-lg bg-neutral-100 p-1 flex items-center justify-center shrink-0 overflow-hidden border border-neutral-200/60">
                              <img
                                src={mainImage}
                                alt={p.name}
                                className="w-full h-full object-contain object-center"
                              />
                            </div>
                          ) : (
                            <div className="w-12 h-14 rounded-lg bg-neutral-100 shrink-0 flex items-center justify-center text-neutral-400">
                              <ImageIcon className="w-5 h-5" />
                            </div>
                          )}
                          <div>
                            <h4 className="font-bold text-neutral-900 line-clamp-1">{p.name}</h4>
                            <span className="text-[11px] text-neutral-400 font-mono block">
                              SKU: {p.sku || p.slug}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="py-3 px-4 text-neutral-600 font-medium">
                        {p.categoryName || p.categoryId}
                      </td>

                      {/* Price */}
                      <td className="py-3 px-4 font-mono font-bold text-neutral-950">
                        {hasDiscount ? (
                          <div>
                            <span>{p.salePrice?.toLocaleString()} د.ج</span>
                            <span className="block text-[10px] text-neutral-400 line-through">
                              {p.price.toLocaleString()} د.ج
                            </span>
                          </div>
                        ) : (
                          <span>{p.price.toLocaleString()} د.ج</span>
                        )}
                      </td>

                      {/* Stock */}
                      <td className="py-3 px-4 font-mono">
                        <span
                          className={`font-bold px-2 py-0.5 rounded-md ${
                            totalStock === 0
                              ? 'bg-red-100 text-red-700'
                              : totalStock <= 3
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-neutral-100 text-neutral-800'
                          }`}
                        >
                          {totalStock} قطعة
                        </span>
                      </td>

                      {/* Badges */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleToggleFeatured(p)}
                            title={p.isFeatured ? 'مميز' : 'غير مميز'}
                            className={`p-1.5 rounded-lg transition-colors ${
                              p.isFeatured ? 'bg-amber-100 text-amber-600' : 'text-neutral-300 hover:text-amber-500'
                            }`}
                          >
                            <Star className="w-3.5 h-3.5 fill-current" />
                          </button>
                          {p.isNew && (
                            <span className="px-1.5 py-0.5 bg-neutral-900 text-white rounded text-[9px] font-bold">
                              NEW
                            </span>
                          )}
                          {p.isBestSeller && (
                            <span className="px-1.5 py-0.5 bg-amber-500 text-black rounded text-[9px] font-bold">
                              BEST
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        <button
                          onClick={() => handleTogglePublish(p)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors ${
                            p.isPublished
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-neutral-200 text-neutral-600'
                          }`}
                        >
                          {p.isPublished ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                          <span>{p.isPublished ? 'منشور' : 'مخفي'}</span>
                        </button>
                      </td>

                      {/* Size Guide Column */}
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => openSizeGuideModal(p)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-xs font-bold transition-colors"
                          title="تعديل جدول مقاسات هذا المنتج"
                        >
                          <Ruler className="w-3.5 h-3.5 text-red-600" />
                          <span>جدول المقاسات</span>
                          <span className="text-[10px] text-red-400 font-mono">
                            ({p.sizeGuide?.length || DEFAULT_SIZE_GUIDE.length})
                          </span>
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-left">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openSizeGuideModal(p)}
                            className="p-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                            title="جدول المقاسات"
                          >
                            <Ruler className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleEdit(p)}
                            className="p-1.5 text-neutral-600 hover:text-black hover:bg-neutral-100 rounded-lg transition-colors"
                            title="تعديل"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openDeleteModal(p)}
                            className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="حذف المنتج"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Product Confirmation Dialog */}
      {productToDelete && (
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
                  هل أنت متأكد من حذف هذا المنتج؟
                </h3>
                <p className="text-xs text-neutral-500 mt-1">
                  سيتم حذف المنتج نهائياً من قاعدة بيانات المتجر وإزالة كافة الصور المرفوعة من التخزين السحابي.
                </p>
              </div>
            </div>

            {/* Target Product Summary Box */}
            <div className="p-3.5 bg-neutral-50 rounded-2xl border border-neutral-100 flex items-center gap-3 mb-5">
              {getMainImageUrl(productToDelete.images) ? (
                <div className="w-12 h-14 rounded-xl bg-neutral-200 p-1 flex items-center justify-center shrink-0 overflow-hidden border border-neutral-300">
                  <img
                    src={getMainImageUrl(productToDelete.images)}
                    alt={productToDelete.name}
                    className="w-full h-full object-contain object-center"
                  />
                </div>
              ) : (
                <div className="w-12 h-14 rounded-xl bg-neutral-200 shrink-0 flex items-center justify-center text-neutral-400">
                  <ImageIcon className="w-5 h-5" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h4 className="text-xs font-bold text-neutral-900 truncate">
                  {productToDelete.name}
                </h4>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[11px] font-mono text-neutral-500">
                    {productToDelete.price.toLocaleString()} {settings.currency || 'د.ج'}
                  </span>
                  {productToDelete.sku && (
                    <span className="text-[10px] text-neutral-400 font-mono">
                      | {productToDelete.sku}
                    </span>
                  )}
                </div>
              </div>
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
                onClick={confirmDeleteProduct}
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
                    <span>تأكيد الحذف</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product Edit / Create Modal */}
      {isEditing && editingProduct && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => {
                if (!isSaving && !isUploadingImages) setIsEditing(false);
              }}
            />

            <div className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl p-6 sm:p-8 overflow-hidden my-8">
              <div className="flex items-center justify-between pb-4 border-b border-neutral-100 mb-6">
                <div>
                  <h3 className="font-bold text-lg text-neutral-900">
                    {editingProduct.id?.startsWith('product_') ? 'إضافة منتج جديد' : 'تعديل بيانات المنتج'}
                  </h3>
                  <span className="text-xs text-neutral-400">AMADAL Product Inventory Engine</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  disabled={isSaving || isUploadingImages}
                  className="p-2 text-neutral-400 hover:text-black rounded-lg disabled:opacity-50"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Save or Upload Error Message */}
              {saveError && (
                <div className="mb-4 p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs font-bold text-red-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{saveError}</span>
                </div>
              )}

              <form onSubmit={handleSaveProduct} className="space-y-6 max-h-[75vh] overflow-y-auto px-1">
                {/* Basic Info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-neutral-900 mb-1">اسم المنتج *</label>
                    <input
                      type="text"
                      required
                      value={editingProduct.name || ''}
                      onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                      placeholder="مثال: هودي AMADAL بوكسي قطن ثقيل — أسود"
                      className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-black"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-900 mb-1">الرابط الفريد (Slug)</label>
                    <input
                      type="text"
                      value={editingProduct.slug || ''}
                      onChange={(e) => setEditingProduct({ ...editingProduct, slug: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-mono focus:outline-none focus:border-black"
                      dir="ltr"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-900 mb-1">التصنيف *</label>
                    <select
                      value={editingProduct.categoryId}
                      onChange={(e) => setEditingProduct({ ...editingProduct, categoryId: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium focus:outline-none focus:border-black"
                    >
                      {editingProduct.categoryId && !categories.some((c) => c.slug === editingProduct.categoryId || c.id === editingProduct.categoryId) && (
                        <option value={editingProduct.categoryId}>
                          {editingProduct.categoryName || editingProduct.categoryId} (تصنيف سابق)
                        </option>
                      )}
                      {categories.map((c) => (
                        <option key={c.id || c.slug} value={c.slug || c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Pricing & SKU */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-neutral-900 mb-1">السعر الأساسي (د.ج) *</label>
                    <input
                      type="number"
                      required
                      value={editingProduct.price || ''}
                      onChange={(e) => setEditingProduct({ ...editingProduct, price: Number(e.target.value) })}
                      className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-mono font-bold focus:outline-none focus:border-black"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-900 mb-1">سعر التخفيض (اختياري)</label>
                    <input
                      type="number"
                      value={editingProduct.salePrice || ''}
                      onChange={(e) =>
                        setEditingProduct({
                          ...editingProduct,
                          salePrice: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                      placeholder="اتركه فارغاً إذا لا يوجد خصم"
                      className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-mono focus:outline-none focus:border-black"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-900 mb-1">رمز المنتج (SKU)</label>
                    <input
                      type="text"
                      value={editingProduct.sku || ''}
                      onChange={(e) => setEditingProduct({ ...editingProduct, sku: e.target.value })}
                      placeholder="AMD-HD-001"
                      className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-mono focus:outline-none focus:border-black"
                    />
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-bold text-neutral-900 mb-1">وصف المنتج</label>
                  <textarea
                    rows={3}
                    value={editingProduct.description || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, description: e.target.value })}
                    placeholder="اكتب وصفاً مفصلاً لقصة القطعة وجودتها ونوع القماش..."
                    className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium focus:outline-none focus:border-black"
                  />
                </div>

                {/* Fabric & Fit & Care */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-neutral-900 mb-1">نوع القصة (Fit)</label>
                    <input
                      type="text"
                      value={editingProduct.fit || ''}
                      onChange={(e) => setEditingProduct({ ...editingProduct, fit: e.target.value })}
                      placeholder="Oversized Boxy Fit"
                      className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs focus:outline-none focus:border-black"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-900 mb-1">الخامة (Fabric)</label>
                    <input
                      type="text"
                      value={editingProduct.fabric || ''}
                      onChange={(e) => setEditingProduct({ ...editingProduct, fabric: e.target.value })}
                      placeholder="100% قطن French Terry 460 GSM"
                      className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs focus:outline-none focus:border-black"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-900 mb-1">تعليمات الغسيل</label>
                    <input
                      type="text"
                      value={editingProduct.careInstructions || ''}
                      onChange={(e) => setEditingProduct({ ...editingProduct, careInstructions: e.target.value })}
                      placeholder="غسيل آلي بماء بارد 30 درجة..."
                      className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs focus:outline-none focus:border-black"
                    />
                  </div>
                </div>

                {/* IMAGES MANAGER: Device Upload & Storage Management */}
                <div className="p-5 bg-neutral-50 rounded-2xl border border-neutral-200 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <label className="text-xs font-bold text-neutral-900 flex items-center gap-2">
                        <ImageIcon className="w-4 h-4 text-neutral-700" />
                        <span>صور المنتج ({editingProduct.images?.length || 0})</span>
                      </label>
                      <p className="text-[11px] text-neutral-500 mt-0.5">
                        الصور المرفوعة تخزن في Firebase Storage. أول صورة هي الصورة الرئيسية للمنتج.
                      </p>
                    </div>

                    {/* Upload Buttons */}
                    <div className="flex items-center gap-2">
                      {/* Hidden File Input */}
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                        onChange={handleDeviceFilesSelected}
                        className="hidden"
                      />

                      {/* Device Upload Trigger Button */}
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploadingImages}
                        className="px-4 py-2.5 bg-neutral-900 hover:bg-black text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition-all active:scale-95 disabled:opacity-50"
                      >
                        {isUploadingImages ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin text-white" />
                            <span>جاري رفع الصور ({uploadProgress}%)...</span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-4 h-4" />
                            <span>+ إضافة صور</span>
                          </>
                        )}
                      </button>

                      {/* Secondary URL Input Toggle */}
                      <button
                        type="button"
                        onClick={() => setShowUrlInput(!showUrlInput)}
                        className="px-3 py-2.5 bg-white border border-neutral-200 hover:bg-neutral-100 text-neutral-700 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors"
                        title="إضافة صورة عبر رابط"
                      >
                        <LinkIcon className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">أو عبر رابط</span>
                      </button>
                    </div>
                  </div>

                  {/* Upload Progress Bar */}
                  {isUploadingImages && (
                    <div className="p-3.5 bg-white rounded-xl border border-neutral-200 space-y-2 shadow-sm">
                      <div className="flex items-center justify-between text-xs font-medium text-neutral-800">
                        <span className="flex items-center gap-2">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-neutral-900" />
                          <span>جاري رفع الصور إلى Firebase Storage...</span>
                        </span>
                        <span className="font-mono font-bold text-neutral-900">{uploadProgress}%</span>
                      </div>
                      <div className="w-full bg-neutral-100 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-neutral-900 h-full transition-all duration-200"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Upload Error Banner with Full Firebase Error Code & Details */}
                  {uploadError && (
                    <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start justify-between gap-3 shadow-sm">
                      <div className="flex items-start gap-2.5">
                        <AlertTriangle className="w-5 h-5 shrink-0 text-red-600 mt-0.5" />
                        <div className="space-y-1">
                          <p className="font-bold text-red-900">تعذر رفع الصور إلى Firebase Storage</p>
                          <p className="whitespace-pre-line text-red-800 text-[11px] leading-relaxed font-sans">
                            {uploadError}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setUploadError(null)}
                        className="text-red-500 hover:text-red-700 p-1 shrink-0 rounded-lg hover:bg-red-100 transition-colors"
                        title="إغلاق التنبيه"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {/* Secondary URL Input Box */}
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

                  {/* Image Thumbnails & Management List */}
                  {editingProduct.images && editingProduct.images.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3 pt-1">
                      {normalizeProductImages(editingProduct.images).map((img, idx) => {
                        const isMain = Boolean(img.isMain);
                        return (
                          <div
                            key={img.id || idx}
                            className={`relative group bg-white rounded-2xl border overflow-hidden p-2.5 transition-all flex flex-col justify-between ${
                              isMain ? 'border-neutral-900 ring-2 ring-neutral-900/10 shadow-sm' : 'border-neutral-200'
                            }`}
                          >
                            {/* Image Preview */}
                            <div>
                              <div className="relative w-full rounded-xl overflow-hidden bg-neutral-100/60 flex items-center justify-center mb-2">
                                <img
                                  src={img.url}
                                  alt={img.name || ''}
                                  className="w-full h-auto object-contain block"
                                  style={{ width: '100%', height: 'auto', objectFit: 'contain' }}
                                />

                                {/* Main Image Badge */}
                                {isMain && (
                                  <span className="absolute top-1.5 right-1.5 px-2 py-0.5 bg-neutral-900 text-white text-[9px] font-bold rounded-md shadow-sm flex items-center gap-1">
                                    <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                                    <span>الرئيسية</span>
                                  </span>
                                )}

                                {/* Order Badge */}
                                <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 bg-black/60 text-white text-[9px] font-mono rounded backdrop-blur-sm">
                                  #{idx + 1}
                                </span>

                                {/* Delete Image Button */}
                                <button
                                  type="button"
                                  onClick={() => handleRemoveImage(idx)}
                                  title="حذف الصورة من التخزين والمنتج"
                                  className="absolute top-1.5 left-1.5 p-1 bg-black/60 hover:bg-red-600 text-white rounded-md transition-colors backdrop-blur-sm"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              {/* Image Name */}
                              {img.name && (
                                <p className="text-[10px] text-neutral-500 truncate font-mono mb-2 text-center" title={img.name}>
                                  {img.name}
                                </p>
                              )}
                            </div>

                            {/* Image Controls: Set Main & Reorder */}
                            <div className="flex items-center justify-between gap-1 text-[10px] pt-1 border-t border-neutral-100">
                              {!isMain ? (
                                <button
                                  type="button"
                                  onClick={() => handleSetMainImage(idx)}
                                  className="px-2 py-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded-lg font-bold flex-1 text-center transition-colors truncate"
                                >
                                  تعيين كرئيسية
                                </button>
                              ) : (
                                <span className="text-[10px] text-neutral-400 font-semibold px-1 flex-1 text-center">
                                  الصورة الرئيسية
                                </span>
                              )}

                              <div className="flex items-center gap-0.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleMoveImageEarlier(idx)}
                                  disabled={idx === 0}
                                  title="تقديم الترتيب"
                                  className="p-1 hover:bg-neutral-100 rounded text-neutral-600 disabled:opacity-30"
                                >
                                  <ArrowRight className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleMoveImageLater(idx)}
                                  disabled={idx === (editingProduct.images?.length || 0) - 1}
                                  title="تأخير الترتيب"
                                  className="p-1 hover:bg-neutral-100 rounded text-neutral-600 disabled:opacity-30"
                                >
                                  <ArrowLeft className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="py-8 text-center border-2 border-dashed border-neutral-200 rounded-2xl bg-white">
                      <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mx-auto text-neutral-400 mb-2">
                        <Upload className="w-5 h-5" />
                      </div>
                      <p className="text-xs font-bold text-neutral-800">لا توجد صور</p>
                      <p className="text-[11px] text-neutral-400 mt-0.5">
                        اضغط على زر &quot;+ إضافة صور&quot; لاختيار صور JPG أو PNG أو WEBP من جهازك
                      </p>
                    </div>
                  )}
                </div>

                {/* Colors & Sizes Tag Managers */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Colors */}
                  <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-200 space-y-2">
                    <label className="text-xs font-bold text-neutral-900 block">الألوان المتوفرة</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={tempColor}
                        onChange={(e) => setTempColor(e.target.value)}
                        placeholder="مثال: أسود Carbon Black"
                        className="flex-1 px-3 py-1.5 bg-white border border-neutral-200 rounded-xl text-xs"
                      />
                      <button
                        type="button"
                        onClick={handleAddColor}
                        className="px-3 py-1.5 bg-neutral-800 text-white rounded-xl text-xs font-bold"
                      >
                        إضافة
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {editingProduct.colors?.map((col) => (
                        <span
                          key={col}
                          className="px-2.5 py-1 bg-white border rounded-lg text-xs font-medium flex items-center gap-1.5"
                        >
                          <span>{col}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setEditingProduct({
                                ...editingProduct,
                                colors: editingProduct.colors?.filter((c) => c !== col),
                              })
                            }
                            className="text-neutral-400 hover:text-red-500"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Sizes */}
                  <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-200 space-y-2">
                    <label className="text-xs font-bold text-neutral-900 block">المقاسات المتوفرة</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={tempSize}
                        onChange={(e) => setTempSize(e.target.value)}
                        placeholder="مثال: XXL"
                        className="flex-1 px-3 py-1.5 bg-white border border-neutral-200 rounded-xl text-xs font-mono"
                      />
                      <button
                        type="button"
                        onClick={handleAddSize}
                        className="px-3 py-1.5 bg-neutral-800 text-white rounded-xl text-xs font-bold"
                      >
                        إضافة
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {editingProduct.sizes?.map((sz) => (
                        <span
                          key={sz}
                          className="px-2.5 py-1 bg-white border rounded-lg text-xs font-mono font-bold flex items-center gap-1.5"
                        >
                          <span>{sz}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setEditingProduct({
                                ...editingProduct,
                                sizes: editingProduct.sizes?.filter((s) => s !== sz),
                              })
                            }
                            className="text-neutral-400 hover:text-red-500"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Variants Inventory Matrix */}
                <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-200 space-y-3">
                  <h4 className="text-xs font-bold text-neutral-900">
                    مصفوفة المخزون لكل قياس ولون (Variants Inventory)
                  </h4>
                  <div className="max-h-52 overflow-y-auto divide-y divide-neutral-200 bg-white rounded-xl border">
                    {editingProduct.variants?.map((v, idx) => (
                      <div key={idx} className="p-3 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-neutral-900">{v.color}</span>
                          <span className="px-2 py-0.5 bg-neutral-100 rounded font-mono font-bold">{v.size}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-neutral-500">الكمية:</span>
                          <input
                            type="number"
                            min="0"
                            value={v.stock}
                            onChange={(e) => {
                              const newStock = Number(e.target.value);
                              const updated = [...(editingProduct.variants || [])];
                              updated[idx] = { ...v, stock: newStock };
                              setEditingProduct({ ...editingProduct, variants: updated });
                            }}
                            className="w-16 px-2 py-1 bg-neutral-50 border rounded-lg text-center font-mono font-bold"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Size Guide Table Section */}
                <div className="p-5 bg-neutral-50 rounded-2xl border border-neutral-200 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-neutral-200">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-neutral-900 text-white rounded-lg">
                        <Ruler className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-neutral-900">
                          جدول القياسات والمقاسات (Size Guide)
                        </h4>
                        <p className="text-[11px] text-neutral-500">
                          تحديد قيم الطول، الصدر، والكم المعروضة للزبون في نافذة القياسات
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSyncSizeGuideWithSizes}
                        className="px-2.5 py-1 bg-white border border-neutral-300 hover:bg-neutral-100 text-neutral-700 rounded-lg text-xs font-medium transition-colors"
                        title="مزامنة صفوف الجدول مع المقاسات المحددة أعلاه"
                      >
                        مزامنة مع المقاسات
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setEditingProduct({
                            ...editingProduct,
                            sizeGuide: JSON.parse(JSON.stringify(DEFAULT_SIZE_GUIDE)),
                          })
                        }
                        className="px-2.5 py-1 bg-white border border-neutral-300 hover:bg-neutral-100 text-neutral-700 rounded-lg text-xs font-medium transition-colors"
                      >
                        استعادة القيم القياسية
                      </button>
                    </div>
                  </div>

                  {/* Editable Table */}
                  <div className="overflow-x-auto bg-white rounded-xl border border-neutral-200">
                    <table className="w-full text-xs text-right border-collapse">
                      <thead>
                        <tr className="bg-neutral-100 border-b text-neutral-700 font-bold">
                          <th className="py-2.5 px-3">المقاس (Size)</th>
                          <th className="py-2.5 px-3">الطول (Length)</th>
                          <th className="py-2.5 px-3">عرض الصدر (Chest)</th>
                          <th className="py-2.5 px-3">طول الكم (Sleeve)</th>
                          <th className="py-2.5 px-3 text-center w-12">حذف</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100 font-mono">
                        {editingProduct.sizeGuide?.map((row, idx) => (
                          <tr key={idx} className="hover:bg-neutral-50/60">
                            <td className="p-2">
                              <input
                                type="text"
                                value={row.size}
                                onChange={(e) =>
                                  handleUpdateEditProductSizeGuideRow(idx, 'size', e.target.value)
                                }
                                placeholder="S"
                                className="w-full px-2 py-1 bg-neutral-50 border rounded-lg text-center font-bold font-sans text-neutral-900"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={row.length}
                                onChange={(e) =>
                                  handleUpdateEditProductSizeGuideRow(idx, 'length', e.target.value)
                                }
                                placeholder="70 سم"
                                className="w-full px-2 py-1 bg-neutral-50 border rounded-lg text-center font-mono text-neutral-700"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={row.chest}
                                onChange={(e) =>
                                  handleUpdateEditProductSizeGuideRow(idx, 'chest', e.target.value)
                                }
                                placeholder="58 سم"
                                className="w-full px-2 py-1 bg-neutral-50 border rounded-lg text-center font-mono text-neutral-700"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={row.sleeve}
                                onChange={(e) =>
                                  handleUpdateEditProductSizeGuideRow(idx, 'sleeve', e.target.value)
                                }
                                placeholder="24 سم"
                                className="w-full px-2 py-1 bg-neutral-50 border rounded-lg text-center font-mono text-neutral-700"
                              />
                            </td>
                            <td className="p-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleDeleteEditProductSizeGuideRow(idx)}
                                className="p-1 text-neutral-400 hover:text-red-500 rounded hover:bg-red-50 transition-colors"
                                title="حذف هذا المقاس من الجدول"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddEditProductSizeGuideRow}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded-xl text-xs font-bold transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>إضافة صف / مقاس جديد للجدول</span>
                  </button>
                </div>

                {/* Feature Toggles */}
                <div className="flex flex-wrap items-center gap-6 pt-2">
                  <label className="flex items-center gap-2 text-xs font-bold text-neutral-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingProduct.isPublished}
                      onChange={(e) => setEditingProduct({ ...editingProduct, isPublished: e.target.checked })}
                      className="w-4 h-4 accent-black rounded"
                    />
                    <span>منشور في المتجر</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs font-bold text-neutral-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingProduct.isFeatured}
                      onChange={(e) => setEditingProduct({ ...editingProduct, isFeatured: e.target.checked })}
                      className="w-4 h-4 accent-black rounded"
                    />
                    <span>مميز في الصفحة الرئيسية</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs font-bold text-neutral-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingProduct.isNew}
                      onChange={(e) => setEditingProduct({ ...editingProduct, isNew: e.target.checked })}
                      className="w-4 h-4 accent-black rounded"
                    />
                    <span>وصل حديثاً (New)</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs font-bold text-neutral-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingProduct.isBestSeller}
                      onChange={(e) => setEditingProduct({ ...editingProduct, isBestSeller: e.target.checked })}
                      className="w-4 h-4 accent-black rounded"
                    />
                    <span>الأكثر مبيعاً (Best Seller)</span>
                  </label>
                </div>

                {/* Form Footer */}
                <div className="pt-4 border-t border-neutral-100 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    disabled={isSaving || isUploadingImages}
                    className="px-5 py-2.5 text-xs font-bold text-neutral-600 hover:text-black disabled:opacity-50"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving || isUploadingImages}
                    className="px-6 py-2.5 bg-neutral-950 hover:bg-black text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md disabled:opacity-50 transition-all active:scale-95"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                        <span>جاري الحفظ...</span>
                      </>
                    ) : (
                      <span>حفظ ونشر التعديلات</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Dedicated Quick Size Guide Edit Modal */}
      {sizeGuideProduct && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={closeSizeGuideModal}
          />

          <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl p-6 sm:p-7 overflow-hidden z-10 animate-in fade-in zoom-in-95 max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-neutral-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-neutral-100 text-neutral-900 flex items-center justify-center shrink-0">
                  <Ruler className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-neutral-900">
                    تعديل جدول المقاسات
                  </h3>
                  <p className="text-xs text-neutral-500 truncate max-w-sm">
                    {sizeGuideProduct.name}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={closeSizeGuideModal}
                disabled={isSavingSizeGuide}
                className="p-1.5 text-neutral-400 hover:text-black rounded-lg hover:bg-neutral-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error banner */}
            {sizeGuideError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 font-bold shrink-0">
                {sizeGuideError}
              </div>
            )}

            {/* Content: Editable Table */}
            <div className="mt-4 flex-1 overflow-y-auto space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-neutral-500">
                  قم بتعديل المقاسات والقياسات، أو إضافة وحذف صفوف المقاسات.
                </span>
                <button
                  type="button"
                  onClick={handleResetQuickToDefault}
                  className="text-xs text-neutral-600 hover:text-black underline font-medium"
                >
                  استعادة القيم القياسية
                </button>
              </div>

              <div className="overflow-x-auto rounded-xl border border-neutral-200">
                <table className="w-full text-xs text-right border-collapse">
                  <thead>
                    <tr className="bg-neutral-100 border-b text-neutral-700 font-bold">
                      <th className="py-2.5 px-3">المقاس (Size)</th>
                      <th className="py-2.5 px-3">الطول (Length)</th>
                      <th className="py-2.5 px-3">عرض الصدر (Chest)</th>
                      <th className="py-2.5 px-3">طول الكم (Sleeve)</th>
                      <th className="py-2.5 px-3 text-center w-12">حذف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 font-mono">
                    {sizeGuideRows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-neutral-50/60">
                        <td className="p-2">
                          <input
                            type="text"
                            value={row.size}
                            onChange={(e) => handleUpdateQuickRow(idx, 'size', e.target.value)}
                            placeholder="S"
                            className="w-full px-2 py-1 bg-neutral-50 border rounded-lg text-center font-bold font-sans text-neutral-900"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={row.length}
                            onChange={(e) => handleUpdateQuickRow(idx, 'length', e.target.value)}
                            placeholder="70 سم"
                            className="w-full px-2 py-1 bg-neutral-50 border rounded-lg text-center font-mono text-neutral-700"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={row.chest}
                            onChange={(e) => handleUpdateQuickRow(idx, 'chest', e.target.value)}
                            placeholder="58 سم"
                            className="w-full px-2 py-1 bg-neutral-50 border rounded-lg text-center font-mono text-neutral-700"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={row.sleeve}
                            onChange={(e) => handleUpdateQuickRow(idx, 'sleeve', e.target.value)}
                            placeholder="24 سم"
                            className="w-full px-2 py-1 bg-neutral-50 border rounded-lg text-center font-mono text-neutral-700"
                          />
                        </td>
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleDeleteQuickRow(idx)}
                            className="p-1 text-neutral-400 hover:text-red-500 rounded hover:bg-red-50 transition-colors"
                            title="حذف الصف"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                type="button"
                onClick={handleAddQuickRow}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded-xl text-xs font-bold transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة صف / مقاس جديد</span>
              </button>
            </div>

            {/* Footer Buttons */}
            <div className="mt-5 pt-4 border-t border-neutral-100 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={closeSizeGuideModal}
                disabled={isSavingSizeGuide}
                className="px-4 py-2 border border-neutral-200 text-neutral-700 rounded-xl text-xs font-bold hover:bg-neutral-50 transition-colors"
              >
                إلغاء
              </button>

              <button
                type="button"
                onClick={handleSaveQuickSizeGuide}
                disabled={isSavingSizeGuide}
                className="px-6 py-2.5 bg-neutral-950 hover:bg-black text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md transition-colors disabled:opacity-50"
              >
                {isSavingSizeGuide ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جاري حفظ الجدول في Firestore...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>حفظ جدول المقاسات</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
