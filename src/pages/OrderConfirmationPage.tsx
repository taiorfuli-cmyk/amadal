import React from 'react';
import { CheckCircle2, MessageCircle, ArrowLeft, Printer } from 'lucide-react';
import { Order } from '../types';
import { useStore } from '../context/StoreContext';

interface OrderConfirmationPageProps {
  order: Order;
  onContinueShopping: () => void;
}

export const OrderConfirmationPage: React.FC<OrderConfirmationPageProps> = ({
  order,
  onContinueShopping,
}) => {
  const { settings } = useStore();

  const handlePrint = () => {
    window.print();
  };

  // WhatsApp confirmation message
  const rawPhone = settings.whatsappNumber?.replace(/[^0-9]/g, '') || '';
  const messageText = settings.whatsappMessageTemplate
    ? settings.whatsappMessageTemplate
        .replace(/رقم\s*\{orderNumber\}/g, '')
        .replace(/\{orderNumber\}/g, '')
        .replace('{customerName}', order.customerName)
        .replace(/\s+/g, ' ')
        .trim()
    : `مرحبًا AMADAL، أود تأكيد طلبي باسم ${order.customerName}.`;

  const whatsappUrl = `https://wa.me/${rawPhone}?text=${encodeURIComponent(messageText)}`;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
      
      {/* Success Banner */}
      <div className="bg-white rounded-3xl p-8 sm:p-12 border border-neutral-150 shadow-xl text-center space-y-6">
        <div className="w-16 h-16 sm:w-20 sm:h-20 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
          <CheckCircle2 className="w-10 h-10 sm:w-12 sm:h-12" />
        </div>

        <div>
          <span className="text-xs font-mono font-bold text-neutral-400 uppercase tracking-widest">
            ORDER CONFIRMED // تم استلام طلبك
          </span>
          <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 mt-1">
            شكراً لك، {order.customerName}!
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-2 max-w-md mx-auto">
            تم تسجيل طلبك بنجاح في نظام AMADAL. سنقوم بمراجعة الطلب وتجهيزه وتمريره لشركة التوصيل في أقرب وقت.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          {rawPhone && (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="w-full sm:w-auto px-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition-all"
            >
              <MessageCircle className="w-4 h-4" />
              <span>تأكيد الطلب فوراً عبر واتساب</span>
            </a>
          )}
        </div>

        {/* Detailed Receipt Box */}
        <div className="text-right pt-6 border-t border-neutral-100 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-neutral-900">تفاصيل الطلب</h3>
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-black"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>طباعة الإشعار</span>
            </button>
          </div>

          {/* Items */}
          <div className="divide-y divide-neutral-100 bg-neutral-50/50 rounded-xl p-4">
            {order.items.map((item, idx) => (
              <div key={idx} className="py-2.5 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-neutral-900">{item.name}</span>
                  <div className="text-[11px] text-neutral-500 mt-0.5">
                    المقاس: {item.size} • اللون: {item.color} • الكمية: {item.quantity}
                  </div>
                </div>
                <span className="font-mono font-bold text-neutral-950">
                  {(item.price * item.quantity).toLocaleString()} {settings.currency || 'د.ج'}
                </span>
              </div>
            ))}
          </div>

          {/* Delivery & Summary details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs bg-neutral-50 p-4 rounded-xl">
            <div>
              <span className="text-neutral-400 block mb-1">عنوان التوصيل:</span>
              <p className="font-semibold text-neutral-900">{order.customerName}</p>
              <p className="text-neutral-700">{order.phone}</p>
              <p className="text-neutral-700">{order.wilaya} — {order.commune}</p>
              <p className="text-neutral-600">{order.address}</p>
            </div>

            <div className="space-y-1.5 sm:text-left font-mono">
              <span className="text-neutral-400 block mb-1 font-sans text-right sm:text-left">ملخص الحساب:</span>
              <div className="flex justify-between sm:justify-end gap-4 text-neutral-600">
                <span>المجموع الفرعي:</span>
                <span>{order.subtotal.toLocaleString()} د.ج</span>
              </div>
              <div className="flex justify-between sm:justify-end gap-4 text-neutral-600">
                <span>التوصيل:</span>
                <span>{order.shippingCost.toLocaleString()} د.ج</span>
              </div>
              {order.discount ? (
                <div className="flex justify-between sm:justify-end gap-4 text-emerald-700">
                  <span>الخصم:</span>
                  <span>-{order.discount.toLocaleString()} د.ج</span>
                </div>
              ) : null}
              <div className="flex justify-between sm:justify-end gap-4 font-bold text-neutral-950 text-sm pt-1 border-t border-neutral-200">
                <span>الإجمالي:</span>
                <span>{order.total.toLocaleString()} د.ج</span>
              </div>
            </div>
          </div>
        </div>

        <div className="pt-4">
          <button
            onClick={onContinueShopping}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-neutral-600 hover:text-black transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>العودة والتسوق مجدداً</span>
          </button>
        </div>

      </div>

    </div>
  );
};
