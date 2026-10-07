import React, { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { useStore } from '../context/StoreContext';

export const WhatsAppButton: React.FC = () => {
  const { settings } = useStore();
  const [isOpen, setIsOpen] = useState(false);

  if (!settings.whatsappNumber) return null;

  const rawPhone = settings.whatsappNumber.replace(/[^0-9]/g, '');
  const defaultText = encodeURIComponent('مرحبًا AMADAL، لدي استفسار بخصوص منتجاتكم.');
  const whatsappUrl = `https://wa.me/${rawPhone}?text=${defaultText}`;

  return (
    <div className="fixed bottom-6 left-6 z-40 flex flex-col items-start gap-2">
      {isOpen && (
        <div className="bg-white rounded-2xl shadow-xl border border-neutral-150 p-4 max-w-xs text-right animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-neutral-100">
            <span className="font-bold text-xs text-neutral-900">خدمة عملاء AMADAL</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <p className="text-xs text-neutral-600 leading-relaxed mb-3">
            تحتاج مساعدة في اختيار المقاس أو تأكيد طلبك؟ تواصل معنا عبر واتساب مباشرة وسنرد عليك في أقرب وقت.
          </p>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noreferrer"
            className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-sm"
          >
            <MessageCircle className="w-4 h-4" />
            <span>بدء المحادثة على واتساب</span>
          </a>
        </div>
      )}

      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-13 h-13 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-xl hover:shadow-2xl flex items-center justify-center transition-all duration-300 active:scale-95 group"
        aria-label="تواصل عبر واتساب"
        title="تواصل معنا عبر واتساب"
      >
        <MessageCircle className="w-7 h-7 group-hover:scale-110 transition-transform" />
      </button>
    </div>
  );
};
