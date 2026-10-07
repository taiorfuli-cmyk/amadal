import React from 'react';
import { X, Ruler } from 'lucide-react';
import { SizeMeasurement } from '../types';

export const DEFAULT_SIZE_GUIDE: SizeMeasurement[] = [
  { size: 'S', length: '70 سم', chest: '58 سم', sleeve: '24 سم' },
  { size: 'M', length: '73 سم', chest: '61 سم', sleeve: '25 سم' },
  { size: 'L', length: '76 سم', chest: '64 سم', sleeve: '26 سم' },
  { size: 'XL', length: '79 سم', chest: '67 سم', sleeve: '27 سم' },
  { size: 'XXL', length: '82 سم', chest: '70 سم', sleeve: '28 سم' },
];

interface SizeGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  sizeGuide?: SizeMeasurement[];
  modelInfo?: {
    height?: string;
    wearingSize?: string;
    fitNote?: string;
  };
  productName: string;
}

export const SizeGuideModal: React.FC<SizeGuideModalProps> = ({
  isOpen,
  onClose,
  sizeGuide,
  modelInfo,
  productName,
}) => {
  if (!isOpen) return null;

  const guideData = sizeGuide && sizeGuide.length > 0 ? sizeGuide : DEFAULT_SIZE_GUIDE;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />

        <div className="relative transform overflow-hidden rounded-2xl bg-white text-right shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-xl p-6 sm:p-8">
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-neutral-100">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-neutral-100 rounded-lg text-neutral-900">
                <Ruler className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-neutral-900">دليل القياسات والمقاسات</h3>
                <p className="text-xs text-neutral-500">{productName}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-neutral-400 hover:text-black rounded-lg hover:bg-neutral-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Model info banner if present */}
          {modelInfo && (
            <div className="mt-4 p-3.5 bg-neutral-50 rounded-xl border border-neutral-200/60 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-neutral-700">
                <span className="font-semibold text-neutral-900">طول الموديل:</span>
                <span>{modelInfo.height || '182 سم'}</span>
              </div>
              <div className="flex items-center gap-2 text-neutral-700">
                <span className="font-semibold text-neutral-900">المقاس المعروض:</span>
                <span className="px-2 py-0.5 bg-black text-white rounded font-mono font-bold">
                  {modelInfo.wearingSize || 'L'}
                </span>
              </div>
            </div>
          )}

          {/* Measurements Table - Smooth touch horizontal scroll */}
          <div className="mt-6 overflow-x-auto scroll-smooth touch-pan-x no-scrollbar [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <table className="w-full min-w-[360px] text-xs text-right border-collapse">
              <thead>
                <tr className="bg-neutral-950 text-white font-medium">
                  <th className="py-3 px-4 rounded-r-lg font-bold">المقاس (Size)</th>
                  <th className="py-3 px-4">الطول (Length)</th>
                  <th className="py-3 px-4">عرض الصدر (Chest)</th>
                  <th className="py-3 px-4 rounded-l-lg">طول الكم (Sleeve)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 font-mono">
                {guideData.map((row, idx) => (
                  <tr key={idx} className="hover:bg-neutral-50/80 transition-colors">
                    <td className="py-3 px-4 font-bold text-neutral-950 font-sans">{row.size}</td>
                    <td className="py-3 px-4 text-neutral-600">{row.length}</td>
                    <td className="py-3 px-4 text-neutral-600">{row.chest}</td>
                    <td className="py-3 px-4 text-neutral-600">{row.sleeve}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 pt-4 border-t border-neutral-100 flex justify-end">
            <button
              onClick={onClose}
              className="px-6 py-2.5 bg-neutral-950 text-white rounded-xl text-xs font-semibold hover:bg-black transition-colors"
            >
              فهمت، إغلاق الدليل
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
