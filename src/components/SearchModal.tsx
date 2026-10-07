import React, { useState, useEffect, useRef } from 'react';
import { Search, X, ArrowLeft, Tag, Image as ImageIcon } from 'lucide-react';
import { Product } from '../types';
import { useStore } from '../context/StoreContext';
import { getMainImageUrl } from '../services/storageService';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  onSelectProduct: (product: Product) => void;
  onSelectCategory: (slug: string) => void;
}

export const SearchModal: React.FC<SearchModalProps> = ({
  isOpen,
  onClose,
  products,
  onSelectProduct,
  onSelectCategory,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const { settings, categories } = useStore();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setSearchTerm('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const filtered = searchTerm.trim()
    ? products.filter(
        (p) =>
          p.isPublished &&
          (p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.categoryName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.fit?.toLowerCase().includes(searchTerm.toLowerCase()))
      )
    : [];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div className="relative min-h-screen flex items-start justify-center p-4 sm:pt-20">
        <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden border border-neutral-150">
          
          {/* Search Input Bar */}
          <div className="p-4 sm:p-5 border-b border-neutral-100 flex items-center gap-3">
            <Search className="w-5 h-5 text-neutral-400 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ابحث عن هودي، تيشيرت، كاجول، مقاس أو كود..."
              className="flex-1 bg-transparent text-sm sm:text-base font-medium text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="text-xs text-neutral-400 hover:text-black p-1"
              >
                مسح
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-neutral-400 hover:text-black rounded-lg hover:bg-neutral-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Categories Bar */}
          {!searchTerm && (
            <div className="p-5">
              <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">
                التصنيفات الأكثر بحثاً
              </p>
              <div className="flex flex-wrap gap-2">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => {
                      onSelectCategory(cat.slug);
                      onClose();
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-xs font-medium text-neutral-800 transition-colors flex items-center gap-1.5"
                  >
                    <Tag className="w-3 h-3 text-neutral-400" />
                    <span>{cat.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Results List */}
          {searchTerm.trim() && (
            <div className="max-h-[60vh] overflow-y-auto divide-y divide-neutral-100 p-2 sm:p-4">
              {filtered.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-sm font-semibold text-neutral-700">لم يتم العثور على نتائج</p>
                  <p className="text-xs text-neutral-400 mt-1">جرب البحث بكلمات أخرى أو تصفح الأقسام</p>
                </div>
              ) : (
                filtered.map((product) => {
                  const hasDiscount = product.salePrice && product.salePrice < product.price;
                  return (
                    <div
                      key={product.id}
                      onClick={() => {
                        onSelectProduct(product);
                        onClose();
                      }}
                      className="p-3 rounded-xl hover:bg-neutral-50 transition-colors flex items-center justify-between gap-4 cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        {getMainImageUrl(product.images) ? (
                          <div className="w-14 h-16 rounded-lg bg-neutral-100 p-1 flex items-center justify-center shrink-0 overflow-hidden border border-neutral-200/60">
                            <img
                              src={getMainImageUrl(product.images)}
                              alt={product.name}
                              className="w-full h-full object-contain object-center"
                            />
                          </div>
                        ) : (
                          <div className="w-14 h-16 rounded-lg bg-neutral-100 shrink-0 flex items-center justify-center text-neutral-400">
                            <ImageIcon className="w-5 h-5 stroke-1" />
                          </div>
                        )}
                        <div>
                          <span className="text-[10px] text-neutral-400 font-semibold">{product.categoryName}</span>
                          <h4 className="text-xs sm:text-sm font-bold text-neutral-900 line-clamp-1">
                            {product.name}
                          </h4>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs font-extrabold text-neutral-950 font-mono">
                              {(hasDiscount ? product.salePrice! : product.price).toLocaleString()} {settings.currency || 'د.ج'}
                            </span>
                            {hasDiscount && (
                              <span className="text-[10px] text-neutral-400 line-through font-mono">
                                {product.price.toLocaleString()}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="text-neutral-400">
                        <ArrowLeft className="w-4 h-4" />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
