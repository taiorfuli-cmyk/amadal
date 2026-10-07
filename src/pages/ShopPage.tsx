import React, { useState, useMemo } from 'react';
import {
  SlidersHorizontal,
  X,
  Search,
  Check,
  ChevronDown,
  RotateCcw
} from 'lucide-react';
import { Product } from '../types';
import { ProductCard } from '../components/ProductCard';
import { useStore } from '../context/StoreContext';

interface ShopPageProps {
  products: Product[];
  initialCategory?: string;
  onSelectProduct: (product: Product) => void;
}

export const ShopPage: React.FC<ShopPageProps> = ({
  products,
  initialCategory,
  onSelectProduct,
}) => {
  const { categories, settings } = useStore();

  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory || 'all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [priceRange, setPriceRange] = useState<number>(15000);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'newest' | 'price-asc' | 'price-desc' | 'popular'>('newest');
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);

  // Collect all available sizes and colors from products
  const availableSizes = ['S', 'M', 'L', 'XL', 'XXL'];

  const availableColors = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      p.colors?.forEach((c) => set.add(c));
    });
    return Array.from(set);
  }, [products]);

  // Filter & Sort Logic
  const filteredProducts = useMemo(() => {
    return products
      .filter((p) => {
        if (!p.isPublished) return false;

        // Category filter
        if (selectedCategory !== 'all') {
          if (p.categoryId !== selectedCategory && p.slug !== selectedCategory) {
            return false;
          }
        }

        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const match =
            p.name.toLowerCase().includes(q) ||
            p.description?.toLowerCase().includes(q) ||
            p.fit?.toLowerCase().includes(q) ||
            p.sku?.toLowerCase().includes(q);
          if (!match) return false;
        }

        // Price filter
        const activePrice = p.salePrice || p.price;
        if (activePrice > priceRange) return false;

        // Size filter
        if (selectedSizes.length > 0) {
          const hasSelectedSize = p.variants?.some(
            (v) => selectedSizes.includes(v.size) && v.stock > 0
          );
          if (!hasSelectedSize) return false;
        }

        // Color filter
        if (selectedColors.length > 0) {
          const hasSelectedColor = p.colors?.some((c) => selectedColors.includes(c));
          if (!hasSelectedColor) return false;
        }

        // In Stock only
        if (inStockOnly) {
          const totalStock = p.variants?.reduce((sum, v) => sum + (v.stock || 0), 0) ?? 0;
          if (totalStock <= 0) return false;
        }

        return true;
      })
      .sort((a, b) => {
        const priceA = a.salePrice || a.price;
        const priceB = b.salePrice || b.price;

        if (sortBy === 'price-asc') return priceA - priceB;
        if (sortBy === 'price-desc') return priceB - priceA;
        if (sortBy === 'popular') return (b.isBestSeller ? 1 : 0) - (a.isBestSeller ? 1 : 0);
        // Default newest
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [
    products,
    selectedCategory,
    searchQuery,
    priceRange,
    selectedSizes,
    selectedColors,
    inStockOnly,
    sortBy,
  ]);

  const toggleSize = (size: string) => {
    setSelectedSizes((prev) =>
      prev.includes(size) ? prev.filter((s) => s !== size) : [...prev, size]
    );
  };

  const toggleColor = (color: string) => {
    setSelectedColors((prev) =>
      prev.includes(color) ? prev.filter((c) => c !== color) : [...prev, color]
    );
  };

  const resetFilters = () => {
    setSelectedCategory('all');
    setSearchQuery('');
    setSelectedSizes([]);
    setSelectedColors([]);
    setPriceRange(15000);
    setInStockOnly(false);
    setSortBy('newest');
  };

  const hasActiveFilters =
    selectedCategory !== 'all' ||
    searchQuery.trim() !== '' ||
    selectedSizes.length > 0 ||
    selectedColors.length > 0 ||
    priceRange < 15000 ||
    inStockOnly;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      
      {/* Page Title & Breadcrumb */}
      <div className="mb-8">
        <span className="text-xs font-mono font-bold text-neutral-400 uppercase tracking-widest">
          AMADAL CATALOG // متجر الملابس
        </span>
        <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 mt-1">
          جميع التشكيلات والمنتجات
        </h1>
        <p className="text-xs sm:text-sm text-neutral-500 mt-1">
          قصات عصرية استثنائية من أجود أنواع القطن المعالج French Terry & Heavyweight.
        </p>
      </div>

      {/* Category Pills Slider - Single row, smooth touch horizontal scroll */}
      <div className="w-full max-w-full min-w-0 overflow-hidden mb-6">
        <div
          className="flex items-center gap-2 overflow-x-auto flex-nowrap pb-2 scroll-smooth touch-pan-x no-scrollbar select-none [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          style={{
            display: 'flex',
            flexWrap: 'nowrap',
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold shrink-0 flex-shrink-0 transition-all whitespace-nowrap ${
              selectedCategory === 'all'
                ? 'bg-neutral-950 text-white shadow-md'
                : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
            }`}
            style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
          >
            كل المنتجات ({products.filter((p) => p.isPublished).length})
          </button>

          {categories.filter((c) => c.isActive !== false).map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.slug)}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold shrink-0 flex-shrink-0 transition-all whitespace-nowrap ${
                selectedCategory === cat.slug
                  ? 'bg-neutral-950 text-white shadow-md'
                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
              }`}
              style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Filter and Sort Control Bar */}
      <div className="bg-white rounded-2xl p-4 border border-neutral-150 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 mb-8">
        {/* Search Field */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-neutral-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث بالاسم أو القصة أو الكود..."
            className="w-full pr-10 pl-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-black"
          />
        </div>

        {/* Filter Toggle & Sorting */}
        <div className="flex items-center justify-between md:justify-end gap-3">
          {/* Mobile Filter Drawer Button */}
          <button
            onClick={() => setIsFilterDrawerOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-900 rounded-xl text-xs font-bold transition-colors"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>الفلاتر والتصفية</span>
            {hasActiveFilters && (
              <span className="w-2 h-2 rounded-full bg-black ml-1" />
            )}
          </button>

          {/* Reset button if active */}
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="text-xs text-neutral-500 hover:text-black flex items-center gap-1"
              title="إعادة ضبط الفلاتر"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">إعادة ضبط</span>
            </button>
          )}

          {/* Sorting Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500 hidden sm:inline">الترتيب:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-bold text-neutral-900 focus:outline-none focus:border-black"
            >
              <option value="newest">الأحدث وصولاً</option>
              <option value="popular">الأكثر طلباً</option>
              <option value="price-asc">السعر: من الأقل للأعلى</option>
              <option value="price-desc">السعر: من الأعلى للأقل</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Content Layout (Sidebar on desktop + Grid) */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Desktop Sidebar Filters */}
        <div className="hidden lg:block space-y-6 bg-white p-6 rounded-2xl border border-neutral-150 h-fit">
          <div className="flex items-center justify-between pb-4 border-b border-neutral-100">
            <h3 className="font-bold text-sm text-neutral-900">تصفية المنتجات</h3>
            {hasActiveFilters && (
              <button
                onClick={resetFilters}
                className="text-[11px] text-neutral-500 hover:text-black font-medium"
              >
                مسح الكل
              </button>
            )}
          </div>

          {/* Sizes Filter */}
          <div>
            <h4 className="text-xs font-bold text-neutral-900 uppercase tracking-wider mb-3">
              المقاس (Size)
            </h4>
            <div className="grid grid-cols-3 gap-2">
              {availableSizes.map((sz) => {
                const isSelected = selectedSizes.includes(sz);
                return (
                  <button
                    key={sz}
                    onClick={() => toggleSize(sz)}
                    className={`py-2 text-xs font-bold rounded-xl border transition-all ${
                      isSelected
                        ? 'bg-neutral-950 text-white border-neutral-950 shadow-sm'
                        : 'bg-neutral-50 text-neutral-700 border-neutral-200 hover:border-neutral-400'
                    }`}
                  >
                    {sz}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Price Range Slider */}
          <div className="pt-4 border-t border-neutral-100">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-bold text-neutral-900">الحد الأقصى للسعر:</span>
              <span className="font-mono font-bold text-neutral-950">
                {priceRange.toLocaleString()} {settings.currency || 'د.ج'}
              </span>
            </div>
            <input
              type="range"
              min="2000"
              max="15000"
              step="500"
              value={priceRange}
              onChange={(e) => setPriceRange(Number(e.target.value))}
              className="w-full accent-neutral-950 cursor-pointer"
            />
          </div>

          {/* Stock Availability Toggle */}
          <div className="pt-4 border-t border-neutral-100 flex items-center justify-between">
            <span className="text-xs font-bold text-neutral-900">المتوفر فقط بالمخزون</span>
            <input
              type="checkbox"
              checked={inStockOnly}
              onChange={(e) => setInStockOnly(e.target.checked)}
              className="w-4 h-4 rounded text-black accent-black cursor-pointer"
            />
          </div>
        </div>

        {/* Products Grid */}
        <div className="lg:col-span-3">
          {products.length === 0 ? (
            <div className="bg-white rounded-2xl border border-neutral-150 p-12 text-center">
              <p className="text-base font-bold text-neutral-900 mb-1">
                لا توجد منتجات حاليًا
              </p>
              <p className="text-xs text-neutral-500 max-w-sm mx-auto">
                ترقبوا التشكيلات والإصدارات الجديدة قريباً في متجر AMADAL.
              </p>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="bg-white rounded-2xl border border-neutral-150 p-12 text-center">
              <p className="text-base font-bold text-neutral-900 mb-1">
                لا توجد منتجات تطابق خيارات التصفية
              </p>
              <p className="text-xs text-neutral-500 mb-6 max-w-sm mx-auto">
                جرب تغيير خيارات البحث أو إعادة ضبط الفلاتر لاستعراض جميع قطع AMADAL.
              </p>
              <button
                onClick={resetFilters}
                className="px-6 py-2.5 bg-neutral-950 text-white rounded-xl text-xs font-bold hover:bg-black transition-colors"
              >
                إعادة ضبط جميع الفلاتر
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
              {filteredProducts.map((p) => (
                <ProductCard key={p.id} product={p} onSelect={onSelectProduct} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Mobile Filters Drawer */}
      {isFilterDrawerOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden lg:hidden">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={() => setIsFilterDrawerOpen(false)}
          />

          <div className="fixed inset-y-0 right-0 max-w-full flex">
            <div className="w-screen max-w-xs bg-white shadow-2xl flex flex-col p-6 overflow-y-auto">
              <div className="flex items-center justify-between pb-4 border-b border-neutral-100">
                <h3 className="font-bold text-base text-neutral-900">فلاتر التصفية</h3>
                <button
                  onClick={() => setIsFilterDrawerOpen(false)}
                  className="p-1.5 text-neutral-400 hover:text-black rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="py-6 space-y-6 flex-1">
                {/* Sizes */}
                <div>
                  <h4 className="text-xs font-bold text-neutral-900 mb-3">المقاسات المتوفرة</h4>
                  <div className="grid grid-cols-3 gap-2">
                    {availableSizes.map((sz) => {
                      const isSelected = selectedSizes.includes(sz);
                      return (
                        <button
                          key={sz}
                          onClick={() => toggleSize(sz)}
                          className={`py-2 text-xs font-bold rounded-xl border ${
                            isSelected
                              ? 'bg-neutral-950 text-white border-neutral-950'
                              : 'bg-neutral-50 text-neutral-700 border-neutral-200'
                          }`}
                        >
                          {sz}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Price */}
                <div>
                  <div className="flex justify-between text-xs mb-2">
                    <span className="font-bold text-neutral-900">الحد الأقصى:</span>
                    <span className="font-mono font-bold">
                      {priceRange.toLocaleString()} {settings.currency || 'د.ج'}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="2000"
                    max="15000"
                    step="500"
                    value={priceRange}
                    onChange={(e) => setPriceRange(Number(e.target.value))}
                    className="w-full accent-black"
                  />
                </div>

                {/* In stock */}
                <label className="flex items-center justify-between text-xs font-bold text-neutral-900 cursor-pointer">
                  <span>المتوفر بالمخزون فقط</span>
                  <input
                    type="checkbox"
                    checked={inStockOnly}
                    onChange={(e) => setInStockOnly(e.target.checked)}
                    className="w-4 h-4 rounded accent-black"
                  />
                </label>
              </div>

              <div className="pt-4 border-t border-neutral-100 space-y-2">
                <button
                  onClick={() => setIsFilterDrawerOpen(false)}
                  className="w-full py-3 bg-neutral-950 text-white text-xs font-bold rounded-xl"
                >
                  تطبيق الفلاتر ({filteredProducts.length} قطعة)
                </button>
                <button
                  onClick={() => {
                    resetFilters();
                    setIsFilterDrawerOpen(false);
                  }}
                  className="w-full py-2.5 text-xs text-neutral-500 font-bold"
                >
                  إعادة ضبط
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
