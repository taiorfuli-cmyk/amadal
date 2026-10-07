import React, { useState } from 'react';
import { Product } from '../types';
import { useStore } from '../context/StoreContext';
import { Eye, ShoppingBag, Image as ImageIcon } from 'lucide-react';
import { getMainImageUrl, getAllImageUrls } from '../services/storageService';

interface ProductCardProps {
  product: Product;
  onSelect: (product: Product) => void;
  onQuickAdd?: (product: Product) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onSelect,
  onQuickAdd,
}) => {
  const { settings } = useStore();
  const [isHovered, setIsHovered] = useState(false);

  const allImages = getAllImageUrls(product.images);
  const primaryImage = getMainImageUrl(product.images);
  const secondaryImage = (allImages.length > 1 && allImages[1] !== primaryImage) ? allImages[1] : primaryImage;

  const hasDiscount = product.salePrice && product.salePrice < product.price;
  const discountPercent = hasDiscount
    ? Math.round(((product.price - product.salePrice!) / product.price) * 100)
    : 0;

  // Calculate total stock across variants
  const totalStock = product.variants?.reduce((sum, v) => sum + (v.stock || 0), 0) ?? 10;
  const isOutOfStock = totalStock === 0;

  return (
    <div
      className="group relative flex flex-col bg-white rounded-2xl overflow-hidden border border-neutral-100 hover:border-neutral-300 hover:shadow-xl transition-all duration-300 cursor-pointer"
      onClick={() => onSelect(product)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Image Container */}
      <div className="relative w-full overflow-hidden bg-neutral-100/60 flex items-center justify-center">
        {primaryImage ? (
          <img
            src={isHovered ? (secondaryImage || primaryImage) : primaryImage}
            alt={product.name}
            className="w-full h-auto object-contain block transition-transform duration-500 ease-out group-hover:scale-105"
            style={{ width: '100%', height: 'auto', objectFit: 'contain' }}
            loading="lazy"
          />
        ) : (
          <div className="aspect-[4/3] w-full flex flex-col items-center justify-center bg-neutral-100 text-neutral-400 p-4">
            <ImageIcon className="w-8 h-8 mb-2 stroke-1" />
            <span className="text-[11px] font-medium text-neutral-500">لا توجد صور</span>
          </div>
        )}

        {/* Badges Overlay */}
        <div className="absolute top-3 right-3 flex flex-col gap-1.5 z-10">
          {hasDiscount && (
            <span className="px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider bg-red-600 text-white rounded-md shadow-sm">
              تخفيض {discountPercent}%
            </span>
          )}
          {product.isNew && (
            <span className="px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider bg-black text-white rounded-md shadow-sm">
              NEW
            </span>
          )}
          {product.isBestSeller && !hasDiscount && (
            <span className="px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider bg-amber-500 text-neutral-950 rounded-md shadow-sm">
              BEST SELLER
            </span>
          )}
          {isOutOfStock && (
            <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-neutral-900/80 text-white rounded-md backdrop-blur-sm">
              نفذت الكمية
            </span>
          )}
        </div>

        {/* Quick Action Overlay on Desktop */}
        <div className="absolute inset-x-3 bottom-3 hidden sm:flex items-center justify-between gap-2 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-y-2 group-hover:translate-y-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSelect(product);
            }}
            className="flex-1 py-2.5 px-3 bg-white/95 hover:bg-white text-neutral-900 text-xs font-bold rounded-xl shadow-lg backdrop-blur-sm flex items-center justify-center gap-1.5 transition-colors"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>عرض التفاصيل</span>
          </button>
        </div>
      </div>

      {/* Details Container */}
      <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between">
        <div>
          {/* Fit / Category tag */}
          <div className="flex items-center justify-between text-[11px] text-neutral-400 mb-1.5 font-medium">
            <span>{product.fit || 'AMADAL FIT'}</span>
            {product.categoryName && (
              <span className="text-neutral-500 truncate max-w-[120px]">{product.categoryName}</span>
            )}
          </div>

          {/* Product Title */}
          <h3 className="font-bold text-xs sm:text-sm text-neutral-900 group-hover:text-black line-clamp-1 leading-snug">
            {product.name}
          </h3>
        </div>

        {/* Pricing & Stock status */}
        <div className="mt-3 pt-3 border-t border-neutral-100 flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <span className="text-sm sm:text-base font-extrabold text-neutral-950 font-mono">
              {(hasDiscount ? product.salePrice! : product.price).toLocaleString()} {settings.currency || 'د.ج'}
            </span>
            {hasDiscount && (
              <span className="text-xs text-neutral-400 line-through font-mono">
                {product.price.toLocaleString()}
              </span>
            )}
          </div>

          {/* Color dots preview */}
          {product.colors && product.colors.length > 0 && (
            <div className="flex items-center -space-x-1 space-x-reverse" title={`${product.colors.length} ألوان متوفرة`}>
              {product.colors.slice(0, 3).map((col, idx) => (
                <span
                  key={idx}
                  className="w-3 h-3 rounded-full border border-white bg-neutral-800 shadow-sm"
                  style={{
                    backgroundColor: col.toLowerCase().includes('أبيض') || col.toLowerCase().includes('white')
                      ? '#ffffff'
                      : col.toLowerCase().includes('رمادي') || col.toLowerCase().includes('grey')
                      ? '#71717a'
                      : col.toLowerCase().includes('أزرق') || col.toLowerCase().includes('navy')
                      ? '#1e293b'
                      : col.toLowerCase().includes('أخضر') || col.toLowerCase().includes('green')
                      ? '#166534'
                      : '#18181b',
                  }}
                />
              ))}
              {product.colors.length > 3 && (
                <span className="text-[9px] text-neutral-400 font-mono pr-1">+{product.colors.length - 3}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
