import React, { useState } from 'react';
import { Product, ProductVariant } from '../../../types';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../../firebase';
import { AlertTriangle, CheckCircle, Search, Save, RefreshCw } from 'lucide-react';
import { useStore } from '../../../context/StoreContext';

interface AdminInventoryTabProps {
  products: Product[];
  onRefresh: () => void;
}

export const AdminInventoryTab: React.FC<AdminInventoryTabProps> = ({ products, onRefresh }) => {
  const { settings } = useStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Flatten products into variant rows
  const inventoryRows: {
    product: Product;
    variant: ProductVariant;
    variantIndex: number;
  }[] = [];

  products.forEach((p) => {
    p.variants?.forEach((v, idx) => {
      inventoryRows.push({
        product: p,
        variant: v,
        variantIndex: idx,
      });
    });
  });

  const lowStockThreshold = settings.lowStockThreshold || 3;

  const filteredRows = inventoryRows.filter((r) => {
    const q = searchTerm.toLowerCase();
    const matchSearch =
      r.product.name.toLowerCase().includes(q) ||
      r.variant.color.toLowerCase().includes(q) ||
      r.variant.size.toLowerCase().includes(q) ||
      (r.variant.sku && r.variant.sku.toLowerCase().includes(q));

    if (!matchSearch) return false;

    if (stockFilter === 'out') return r.variant.stock === 0;
    if (stockFilter === 'low') return r.variant.stock > 0 && r.variant.stock <= lowStockThreshold;
    return true;
  });

  const handleUpdateStock = async (product: Product, variantIndex: number, newStock: number) => {
    const key = `${product.id}-${variantIndex}`;
    setUpdatingId(key);
    try {
      const updatedVariants = [...(product.variants || [])];
      updatedVariants[variantIndex] = {
        ...updatedVariants[variantIndex],
        stock: Math.max(0, newStock),
      };

      await updateDoc(doc(db, 'products', product.id), {
        variants: updatedVariants,
      });
      onRefresh();
    } catch (err) {
      console.error(err);
      alert('حدث خطأ أثناء تحديث المخزون');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header & Filter Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-neutral-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ابحث بالمنتج أو اللون أو المقاس..."
              className="w-full pr-10 pl-4 py-2.5 bg-white border border-neutral-200 rounded-xl text-xs font-medium focus:outline-none focus:border-black"
            />
          </div>

          <select
            value={stockFilter}
            onChange={(e) => setStockFilter(e.target.value as any)}
            className="py-2.5 px-3 bg-white border border-neutral-200 rounded-xl text-xs font-bold focus:outline-none focus:border-black"
          >
            <option value="all">كل المخزون</option>
            <option value="low">مخزون منخفض (≤ {lowStockThreshold})</option>
            <option value="out">القطع النافذة (0)</option>
          </select>
        </div>

        <div className="text-xs text-neutral-500 font-mono">
          إجمالي المتغيرات المسجلة: {filteredRows.length}
        </div>
      </div>

      {/* Inventory Table */}
      <div className="bg-white rounded-2xl border border-neutral-150 overflow-hidden shadow-sm">
        <div className="overflow-x-auto scroll-smooth touch-pan-x [-webkit-overflow-scrolling:touch]">
          <table className="w-full min-w-[650px] text-right text-xs">
            <thead className="bg-neutral-50 text-neutral-500 uppercase border-b border-neutral-150">
              <tr>
                <th className="py-3.5 px-4 font-bold">المنتج</th>
                <th className="py-3.5 px-4 font-bold">اللون</th>
                <th className="py-3.5 px-4 font-bold">المقاس</th>
                <th className="py-3.5 px-4 font-bold">كود التخزين (SKU)</th>
                <th className="py-3.5 px-4 font-bold">الكمية الحالية</th>
                <th className="py-3.5 px-4 font-bold">الحالة</th>
                <th className="py-3.5 px-4 font-bold text-left">تعديل فوري</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-neutral-400">
                    لا توجد متغيرات تطابق الفلتر.
                  </td>
                </tr>
              ) : (
                filteredRows.map(({ product, variant, variantIndex }) => {
                  const key = `${product.id}-${variantIndex}`;
                  const isUpdating = updatingId === key;
                  const isOut = variant.stock === 0;
                  const isLow = variant.stock > 0 && variant.stock <= lowStockThreshold;

                  return (
                    <tr key={key} className="hover:bg-neutral-50/70 transition-colors">
                      <td className="py-3 px-4 font-bold text-neutral-900">
                        {product.name}
                      </td>
                      <td className="py-3 px-4 text-neutral-700">{variant.color}</td>
                      <td className="py-3 px-4 font-mono font-bold">{variant.size}</td>
                      <td className="py-3 px-4 font-mono text-neutral-400 text-[11px]">
                        {variant.sku || '-'}
                      </td>
                      <td className="py-3 px-4 font-mono font-black text-sm">
                        {variant.stock}
                      </td>
                      <td className="py-3 px-4">
                        {isOut ? (
                          <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-md font-bold text-[10px]">
                            نفد المخزون
                          </span>
                        ) : isLow ? (
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-md font-bold text-[10px]">
                            مخزون منخفض
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md font-bold text-[10px]">
                            متوفر
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-left">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleUpdateStock(product, variantIndex, variant.stock - 1)}
                            disabled={variant.stock <= 0 || isUpdating}
                            className="px-2 py-1 bg-neutral-100 hover:bg-neutral-200 rounded font-mono font-bold text-xs"
                          >
                            -1
                          </button>
                          <button
                            onClick={() => handleUpdateStock(product, variantIndex, variant.stock + 1)}
                            disabled={isUpdating}
                            className="px-2 py-1 bg-neutral-100 hover:bg-neutral-200 rounded font-mono font-bold text-xs"
                          >
                            +1
                          </button>
                          <button
                            onClick={() => handleUpdateStock(product, variantIndex, variant.stock + 10)}
                            disabled={isUpdating}
                            className="px-2.5 py-1 bg-neutral-950 text-white hover:bg-black rounded font-mono font-bold text-xs"
                          >
                            +10
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

    </div>
  );
};
