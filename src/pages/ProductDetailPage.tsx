import React, { useState, useEffect } from 'react';
import {
  Ruler,
  Truck,
  ShieldCheck,
  RefreshCw,
  Plus,
  Minus,
  ShoppingBag,
  ArrowRight,
  Share2,
  Check,
  AlertCircle,
  Image as ImageIcon
} from 'lucide-react';
import { Product, ProductVariant, CartItem } from '../types';
import { useCart } from '../context/CartContext';
import { useStore } from '../context/StoreContext';
import { SizeGuideModal } from '../components/SizeGuideModal';
import { ProductCard } from '../components/ProductCard';
import { getMainImageUrl, getAllImageUrls } from '../services/storageService';

interface ProductDetailPageProps {
  product: Product;
  allProducts: Product[];
  onBack: () => void;
  onSelectProduct: (p: Product) => void;
  onProceedToCheckout: () => void;
  onInstantBuy?: (item: CartItem) => void;
}

export const ProductDetailPage: React.FC<ProductDetailPageProps> = ({
  product,
  allProducts,
  onBack,
  onSelectProduct,
  onProceedToCheckout,
  onInstantBuy,
}) => {
  const { addToCart } = useCart();
  const { settings } = useStore();

  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [selectedColor, setSelectedColor] = useState<string>(product.colors?.[0] || '');
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [quantity, setQuantity] = useState(1);
  const [isSizeGuideOpen, setIsSizeGuideOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [activeTab, setActiveTab] = useState<'fabric' | 'care' | 'shipping'>('fabric');
  const [sizeError, setSizeError] = useState(false);

  // Reset variant selections when product changes
  useEffect(() => {
    setSelectedImageIndex(0);
    const initialColor = product.colors?.[0] || '';
    setSelectedColor(initialColor);

    // Auto-pick the first available size with stock
    const firstAvailable = product.variants?.find(
      (v) => (!initialColor || v.color === initialColor) && v.stock > 0
    );
    setSelectedSize(firstAvailable ? firstAvailable.size : (product.sizes?.[0] || ''));
    setSizeError(false);
    setQuantity(1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [product]);

  const lowStockThreshold = Number(settings.lowStockThreshold) || 3;

  // Find active variant
  const activeVariant: ProductVariant | undefined = product.variants?.find(
    (v) => v.color === selectedColor && v.size === selectedSize
  );

  const availableStock = activeVariant ? activeVariant.stock : 0;
  const isSelectedVariantSoldOut = activeVariant ? activeVariant.stock <= 0 : false;

  const hasDiscount = product.salePrice && product.salePrice < product.price;
  const discountPercent = hasDiscount
    ? Math.round(((product.price - product.salePrice!) / product.price) * 100)
    : 0;

  const images = getAllImageUrls(product.images);
  const mainImage = getMainImageUrl(product.images) || images[0] || '';

  const handleAddToCart = () => {
    if (!selectedSize) {
      setSizeError(true);
      return;
    }
    setSizeError(false);
    if (isSelectedVariantSoldOut) return;

    addToCart({
      id: `${product.id}-${selectedColor}-${selectedSize}`,
      productId: product.id,
      productName: product.name,
      price: product.salePrice || product.price,
      image: images[selectedImageIndex] || mainImage,
      color: selectedColor,
      size: selectedSize,
      quantity,
      maxStock: availableStock || 99,
    });
  };

  const handleInstantBuy = () => {
    if (!selectedSize) {
      setSizeError(true);
      return;
    }
    setSizeError(false);
    if (isSelectedVariantSoldOut) return;

    const directItem: CartItem = {
      id: `instant_${product.id}-${selectedColor}-${selectedSize}-${Date.now()}`,
      productId: product.id,
      productName: product.name,
      price: product.salePrice || product.price,
      image: images[selectedImageIndex] || mainImage,
      color: selectedColor,
      size: selectedSize,
      quantity,
      maxStock: availableStock || 99,
    };

    if (onInstantBuy) {
      onInstantBuy(directItem);
    } else {
      onProceedToCheckout();
    }
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: product.name,
        text: product.description,
        url: window.location.href,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  // Suggested products (same category or others)
  const relatedProducts = allProducts
    .filter((p) => p.id !== product.id && p.isPublished)
    .slice(0, 4);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 pb-24">
      
      {/* Back button & Breadcrumb */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs font-bold text-neutral-600 hover:text-black transition-colors"
        >
          <ArrowRight className="w-4 h-4" />
          <span>العودة للمتجر</span>
        </button>

        <button
          onClick={handleShare}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-xs font-medium text-neutral-700 transition-colors"
        >
          {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Share2 className="w-3.5 h-3.5" />}
          <span>{copiedLink ? 'تم نسخ الرابط' : 'مشاركة'}</span>
        </button>
      </div>

      {/* Main Product Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-14">
        
        {/* Images Gallery (7 Cols on desktop) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Main Large Image */}
          <div className="relative w-full rounded-2xl overflow-hidden bg-neutral-100/60 border border-neutral-200/60 shadow-sm flex items-center justify-center">
            {images.length > 0 ? (
              <img
                src={images[selectedImageIndex] || images[0]}
                alt={product.name}
                className="w-full h-auto object-contain block transition-all duration-300"
                style={{ width: '100%', height: 'auto', objectFit: 'contain' }}
              />
            ) : (
              <div className="w-full aspect-[4/3] flex flex-col items-center justify-center text-neutral-400 p-8">
                <ImageIcon className="w-16 h-16 stroke-1 mb-3 text-neutral-300" />
                <p className="text-sm font-bold text-neutral-700 mb-1">لا توجد صور لهذا المنتج</p>
                <p className="text-xs text-neutral-400">سيتم إضافة صور لهذه القطعة قريباً</p>
              </div>
            )}
            {hasDiscount && (
              <span className="absolute top-4 right-4 px-3 py-1 bg-red-600 text-white font-extrabold text-xs uppercase tracking-wider rounded-md shadow-md z-10">
                تخفيض {discountPercent}%
              </span>
            )}
          </div>

          {/* Thumbnails - Single row, smooth touch horizontal scroll */}
          {images.length > 1 && (
            <div className="w-full max-w-full min-w-0 overflow-hidden">
              <div
                className="flex gap-3 overflow-x-auto flex-nowrap pb-2 scroll-smooth touch-pan-x no-scrollbar select-none [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                style={{
                  display: 'flex',
                  flexWrap: 'nowrap',
                  overflowX: 'auto',
                  WebkitOverflowScrolling: 'touch',
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none',
                }}
              >
                {images.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedImageIndex(idx)}
                    className={`relative w-20 h-24 sm:w-24 sm:h-28 rounded-xl overflow-hidden shrink-0 flex-shrink-0 border-2 transition-all bg-neutral-100/60 flex items-center justify-center ${
                      selectedImageIndex === idx
                        ? 'border-black shadow-md scale-95 ring-1 ring-black/10'
                        : 'border-transparent opacity-70 hover:opacity-100'
                    }`}
                    style={{ flexShrink: 0 }}
                  >
                    <img src={img} alt="" className="w-full h-full object-contain object-center" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Product Info & Action Form (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Header Info */}
          <div>
            <div className="flex items-center gap-2 mb-2 text-xs font-mono text-neutral-500 font-semibold uppercase tracking-wider">
              <span>{product.fit || 'AMADAL FIT'}</span>
              <span>•</span>
              <span>{product.categoryName || 'STREETWEAR'}</span>
            </div>

            <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-neutral-950 leading-tight">
              {product.name}
            </h1>

            {/* Price Box */}
            <div className="mt-3 flex items-baseline gap-3">
              <span className="text-2xl sm:text-3xl font-black text-neutral-950 font-mono">
                {(hasDiscount ? product.salePrice! : product.price).toLocaleString()} {settings.currency || 'د.ج'}
              </span>
              {hasDiscount && (
                <span className="text-base text-neutral-400 line-through font-mono">
                  {product.price.toLocaleString()} {settings.currency || 'د.ج'}
                </span>
              )}
            </div>

            <p className="mt-4 text-xs sm:text-sm text-neutral-600 leading-relaxed">
              {product.description}
            </p>
          </div>

          {/* Color Selector */}
          {product.colors && product.colors.length > 0 && (
            <div className="pt-4 border-t border-neutral-100">
              <div className="flex items-center justify-between mb-3 text-xs">
                <span className="font-bold text-neutral-900">اللون:</span>
                <span className="text-neutral-600 font-medium">{selectedColor}</span>
              </div>
              <div className="flex flex-wrap gap-2.5">
                {product.colors.map((color) => {
                  const isSelected = selectedColor === color;
                  return (
                    <button
                      key={color}
                      onClick={() => setSelectedColor(color)}
                      className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-all ${
                        isSelected
                          ? 'border-black bg-neutral-950 text-white shadow-sm'
                          : 'border-neutral-200 bg-neutral-50 text-neutral-800 hover:border-neutral-400'
                      }`}
                    >
                      {color}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Size Selector with Real Inventory Status */}
          <div className="pt-4 border-t border-neutral-100">
            {sizeError && !selectedSize && (
              <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>يرجى اختيار المقاس المطلوب أولاً قبل إتمام الشراء.</span>
              </div>
            )}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-neutral-900">
                <span>المقاس (Size):</span>
                {selectedSize && <span className="font-mono text-black font-extrabold">{selectedSize}</span>}
              </div>

              <button
                type="button"
                onClick={() => setIsSizeGuideOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-sm transition-all hover:shadow active:scale-95"
              >
                <Ruler className="w-3.5 h-3.5 text-white" />
                <span>جدول المقاسات</span>
              </button>
            </div>

            {/* Sizes Buttons with Live Variant Stock */}
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2.5">
              {(product.sizes || ['S', 'M', 'L', 'XL']).map((sz) => {
                // Find stock for this specific size and color
                const variantForSize = product.variants?.find(
                  (v) => (!selectedColor || v.color === selectedColor) && v.size === sz
                );
                const isSoldOut = variantForSize ? variantForSize.stock <= 0 : false;
                const isSelected = selectedSize === sz;

                return (
                  <button
                    key={sz}
                    disabled={isSoldOut}
                    onClick={() => {
                      setSelectedSize(sz);
                      setSizeError(false);
                      setQuantity(1);
                    }}
                    className={`py-3 text-xs font-bold rounded-xl border flex flex-col items-center justify-center transition-all ${
                      isSoldOut
                        ? 'border-dashed border-neutral-200 bg-neutral-100/60 text-neutral-400 cursor-not-allowed line-through'
                        : isSelected
                        ? 'border-black bg-black text-white shadow-md'
                        : 'border-neutral-200 bg-white text-neutral-900 hover:border-black'
                    }`}
                  >
                    <span>{sz}</span>
                    {isSoldOut ? (
                      <span className="text-[9px] font-normal no-underline mt-0.5 text-neutral-400">نفد المخزون</span>
                    ) : variantForSize && variantForSize.stock <= lowStockThreshold ? (
                      <span className="text-[9px] text-amber-500 font-mono mt-0.5 font-normal">
                        مخزون منخفض ({variantForSize.stock})
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            {/* Low stock or Out of stock alert */}
            {isSelectedVariantSoldOut ? (
              <div className="mt-3 flex items-center gap-1.5 text-xs text-red-700 bg-red-50 p-2.5 rounded-lg border border-red-200">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>نفد المخزون — هذا المقاس غير متوفر حالياً.</span>
              </div>
            ) : activeVariant && activeVariant.stock > 0 && activeVariant.stock <= lowStockThreshold ? (
              <div className="mt-3 flex items-center gap-1.5 text-xs text-amber-800 bg-amber-50 p-2.5 rounded-lg border border-amber-200/60">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>مخزون منخفض — متبقي {activeVariant.stock} قطع فقط في هذا المقاس.</span>
              </div>
            ) : null}
          </div>

          {/* Quantity Selector */}
          <div className="pt-4 border-t border-neutral-100 flex items-center justify-between">
            <span className="text-xs font-bold text-neutral-900">الكمية المطلوبة:</span>
            <div className="flex items-center border border-neutral-200 rounded-xl overflow-hidden bg-neutral-50">
              <button
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1 || isSelectedVariantSoldOut}
                className="p-2 hover:bg-white text-neutral-600 transition-colors disabled:opacity-40"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="px-4 text-xs font-bold font-mono text-neutral-900">{isSelectedVariantSoldOut ? 0 : quantity}</span>
              <button
                onClick={() => setQuantity((q) => (availableStock ? Math.min(availableStock, q + 1) : q + 1))}
                disabled={isSelectedVariantSoldOut || (availableStock ? quantity >= availableStock : false)}
                className="p-2 hover:bg-white text-neutral-600 transition-colors disabled:opacity-40"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Action CTAs */}
          <div className="space-y-2.5 pt-2">
            <button
              onClick={handleAddToCart}
              disabled={isSelectedVariantSoldOut}
              className={`w-full py-4 px-6 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.99] ${
                isSelectedVariantSoldOut
                  ? 'bg-neutral-200 text-neutral-500 cursor-not-allowed'
                  : 'bg-neutral-950 hover:bg-black text-white shadow-xl shadow-black/10'
              }`}
            >
              <ShoppingBag className="w-4 h-4" />
              <span>{isSelectedVariantSoldOut ? 'نفد المخزون — غير متوفر' : 'إضافة إلى حقيبة التسوق'}</span>
            </button>

            <button
              onClick={handleInstantBuy}
              disabled={isSelectedVariantSoldOut}
              className={`w-full py-3.5 px-6 rounded-xl text-sm font-bold border transition-all ${
                isSelectedVariantSoldOut
                  ? 'border-neutral-200 text-neutral-400 bg-neutral-100 cursor-not-allowed'
                  : 'border-neutral-900 bg-white hover:bg-neutral-50 text-neutral-950 shadow-sm'
              }`}
            >
              {isSelectedVariantSoldOut ? 'غير متوفر للشراء' : 'شراء فوري — الدفع عند الاستلام'}
            </button>
          </div>

          {/* Guarantee points */}
          <div className="pt-4 border-t border-neutral-100 space-y-2 text-xs text-neutral-600">
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-neutral-800" />
              <span>توصيل سريع لجميع الـ 69 ولاية (24-72 ساعة)</span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-neutral-800" />
              <span>الدفع نقداً عند استلام الطرد وفحصه</span>
            </div>
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-neutral-800" />
              <span>إمكانية الاستبدال السهل في حال عدم ملاءمة المقاس</span>
            </div>
          </div>

          {/* Detailed Info Tabs */}
          <div className="pt-4 border-t border-neutral-100">
            <div className="flex border-b border-neutral-100 text-xs font-bold text-neutral-500">
              <button
                onClick={() => setActiveTab('fabric')}
                className={`pb-2.5 px-3 border-b-2 transition-colors ${
                  activeTab === 'fabric' ? 'border-black text-black' : 'border-transparent hover:text-neutral-800'
                }`}
              >
                الخامة والقصة
              </button>
              <button
                onClick={() => setActiveTab('care')}
                className={`pb-2.5 px-3 border-b-2 transition-colors ${
                  activeTab === 'care' ? 'border-black text-black' : 'border-transparent hover:text-neutral-800'
                }`}
              >
                تعليمات الغسيل
              </button>
              <button
                onClick={() => setActiveTab('shipping')}
                className={`pb-2.5 px-3 border-b-2 transition-colors ${
                  activeTab === 'shipping' ? 'border-black text-black' : 'border-transparent hover:text-neutral-800'
                }`}
              >
                الشحن والتوصيل
              </button>
            </div>

            <div className="py-4 text-xs text-neutral-600 leading-relaxed">
              {activeTab === 'fabric' && (
                <div className="space-y-2">
                  <p><strong>الخامة:</strong> {product.fabric || '100% قطن فاخر ممشط معالج ضد الانكماش والوبر.'}</p>
                  <p><strong>نوع القصة:</strong> {product.fit || 'Oversized Boxy Cut'}</p>
                  {product.sku && <p><strong>رمز المنتج (SKU):</strong> <span className="font-mono">{product.sku}</span></p>}
                </div>
              )}

              {activeTab === 'care' && (
                <div>
                  <p>{product.careInstructions || 'غسيل آلي بماء بارد 30 درجة، تجفيف بالهواء، تجنب المبيضات، الكوي على حرارة متوسطة.'}</p>
                </div>
              )}

              {activeTab === 'shipping' && (
                <div className="space-y-1.5">
                  <p>• التوصيل لجميع الولايات الـ 69 متاح.</p>
                  <p>• خيار التوصيل للمنزل أو استلام من أقرب مكتب Stop Desk.</p>
                  <p>• لا يوجد دفع إلكتروني إجباري؛ الدفع عند الاستلام دائماً.</p>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Suggested Products */}
      {relatedProducts.length > 0 && (
        <div className="mt-20 pt-12 border-t border-neutral-100">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-lg sm:text-xl font-black text-neutral-900">قد يعجبك أيضاً</h2>
            <span className="text-xs text-neutral-400 font-mono">COMPLETE THE LOOK</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
            {relatedProducts.map((p) => (
              <ProductCard key={p.id} product={p} onSelect={onSelectProduct} />
            ))}
          </div>
        </div>
      )}

      {/* Size Guide Modal */}
      <SizeGuideModal
        isOpen={isSizeGuideOpen}
        onClose={() => setIsSizeGuideOpen(false)}
        sizeGuide={product.sizeGuide}
        modelInfo={product.modelInfo}
        productName={product.name}
      />

      {/* Sticky Mobile Add To Cart Bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 lg:hidden bg-white/95 backdrop-blur-md border-t border-neutral-200 p-3 shadow-2xl flex items-center justify-between gap-3">
        <div>
          <span className="text-[10px] text-neutral-400 font-mono uppercase block">السعر</span>
          <span className="font-black text-sm text-neutral-950 font-mono">
            {(hasDiscount ? product.salePrice! : product.price).toLocaleString()} {settings.currency || 'د.ج'}
          </span>
        </div>

        <button
          onClick={handleAddToCart}
          disabled={isSelectedVariantSoldOut}
          className={`flex-1 py-3 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 ${
            isSelectedVariantSoldOut
              ? 'bg-neutral-200 text-neutral-400'
              : 'bg-neutral-950 text-white shadow-md'
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          <span>{isSelectedVariantSoldOut ? 'غير متوفر' : 'أضف للسلة'}</span>
        </button>
      </div>

    </div>
  );
};
