import React from 'react';
import { X, Trash2, Plus, Minus, ArrowLeft, ShoppingBag } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useStore } from '../context/StoreContext';

interface CartDrawerProps {
  onProceedToCheckout: () => void;
  onExploreShop: () => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  onProceedToCheckout,
  onExploreShop,
}) => {
  const { items, isDrawerOpen, closeDrawer, removeFromCart, updateQuantity, subtotal, totalItemsCount } = useCart();
  const { settings } = useStore();

  if (!isDrawerOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={closeDrawer}
      />

      <div className="fixed inset-y-0 left-0 max-w-full flex pl-0 md:pl-10">
        <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col">
          
          {/* Header */}
          <div className="p-5 border-b border-neutral-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-neutral-900" />
              <h3 className="font-bold text-base text-neutral-900">حقيبة التسوق</h3>
              <span className="text-xs bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded-full font-mono">
                {totalItemsCount}
              </span>
            </div>
            <button
              onClick={closeDrawer}
              className="p-1.5 text-neutral-400 hover:text-neutral-900 rounded-full hover:bg-neutral-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Items list */}
          <div className="flex-1 overflow-y-auto p-5 divide-y divide-neutral-100">
            {items.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-12">
                <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-400 mb-4">
                  <ShoppingBag className="w-8 h-8" />
                </div>
                <h4 className="font-bold text-neutral-800 text-base mb-1">حقيبتك فارغة</h4>
                <p className="text-xs text-neutral-500 max-w-[240px] mb-6">
                  استكشف تشكيلات AMADAL الحصرية واختر ما يناسب أناقتك العصرية.
                </p>
                <button
                  onClick={() => {
                    closeDrawer();
                    onExploreShop();
                  }}
                  className="px-6 py-2.5 bg-neutral-950 text-white rounded-lg text-xs font-semibold hover:bg-black transition-colors"
                >
                  تصفح المنتجات
                </button>
              </div>
            ) : (
              items.map((item) => (
                <div key={item.id} className="py-4 flex gap-4">
                  {/* Thumbnail */}
                  <div className="w-20 h-24 rounded-lg bg-neutral-100 p-1 flex items-center justify-center shrink-0 overflow-hidden border border-neutral-200/60">
                    <img
                      src={item.image}
                      alt={item.productName}
                      className="w-full h-full object-contain object-center"
                    />
                  </div>

                  {/* Details */}
                  <div className="flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-xs font-bold text-neutral-900 line-clamp-1">
                          {item.productName}
                        </h4>
                        <button
                          onClick={() => removeFromCart(item.id)}
                          className="text-neutral-400 hover:text-red-500 p-1 transition-colors"
                          title="حذف"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Variant Badges */}
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {item.size && (
                          <span className="text-[11px] px-2 py-0.5 bg-neutral-100 text-neutral-700 rounded font-medium">
                            المقاس: {item.size}
                          </span>
                        )}
                        {item.color && (
                          <span className="text-[11px] px-2 py-0.5 bg-neutral-100 text-neutral-700 rounded font-medium">
                            اللون: {item.color}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Quantity & Price */}
                    <div className="flex items-center justify-between mt-3">
                      <div className="flex items-center border border-neutral-200 rounded-lg overflow-hidden bg-neutral-50">
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          className="p-1 hover:bg-white text-neutral-600 transition-colors"
                          disabled={item.quantity <= 1}
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="px-3 text-xs font-semibold text-neutral-900 font-mono">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          className="p-1 hover:bg-white text-neutral-600 transition-colors"
                          disabled={item.maxStock ? item.quantity >= item.maxStock : false}
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="text-left font-bold text-sm text-neutral-950 font-mono">
                        {(item.price * item.quantity).toLocaleString()} {settings.currency || 'د.ج'}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer / Subtotal / Checkout */}
          {items.length > 0 && (
            <div className="p-5 border-t border-neutral-100 bg-neutral-50/50 space-y-4">
              <div className="space-y-1.5 text-xs text-neutral-600">
                <div className="flex justify-between items-center text-sm font-bold text-neutral-900">
                  <span>المجموع الفرعي:</span>
                  <span className="font-mono text-base">{subtotal.toLocaleString()} {settings.currency || 'د.ج'}</span>
                </div>
                <p className="text-[11px] text-neutral-400">
                  تكلفة التوصيل تحسب بدقة في خطوة الدفع حسب ولايتك المختارة (69 ولاية).
                </p>
              </div>

              <button
                onClick={() => {
                  closeDrawer();
                  onProceedToCheckout();
                }}
                className="w-full py-3.5 px-4 bg-neutral-950 hover:bg-black text-white text-sm font-bold rounded-xl shadow-lg shadow-black/10 flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
              >
                <span>متابعة الطلب (الدفع عند الاستلام)</span>
                <ArrowLeft className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
