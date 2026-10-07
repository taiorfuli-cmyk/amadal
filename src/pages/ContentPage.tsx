import React, { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { PageContent } from '../types';
import { INITIAL_CONTENT } from '../services/storeService';
import { ArrowRight, BookOpen, ShieldCheck, HelpCircle, Truck, Phone } from 'lucide-react';

interface ContentPageProps {
  pageId: string;
  onNavigate: (view: string, params?: any) => void;
}

export const ContentPage: React.FC<ContentPageProps> = ({ pageId, onNavigate }) => {
  const [page, setPage] = useState<PageContent | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchPage = async () => {
      setIsLoading(true);
      try {
        const snap = await getDoc(doc(db, 'content', pageId));
        if (snap.exists()) {
          setPage(snap.data() as PageContent);
        } else {
          const fallback = INITIAL_CONTENT.find((p) => p.id === pageId || p.slug === pageId);
          setPage(fallback || null);
        }
      } catch (err) {
        const fallback = INITIAL_CONTENT.find((p) => p.id === pageId || p.slug === pageId);
        setPage(fallback || null);
      } finally {
        setIsLoading(false);
      }
    };
    fetchPage();
  }, [pageId]);

  const getPageIcon = (id: string) => {
    switch (id) {
      case 'about':
        return BookOpen;
      case 'faq':
        return HelpCircle;
      case 'contact':
        return Phone;
      default:
        return BookOpen;
    }
  };

  const IconComponent = getPageIcon(pageId);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-16">
      
      {/* Breadcrumb */}
      <button
        onClick={() => onNavigate('home')}
        className="inline-flex items-center gap-1.5 text-xs font-bold text-neutral-600 hover:text-black mb-8"
      >
        <ArrowRight className="w-4 h-4" />
        <span>العودة للرئيسية</span>
      </button>

      {isLoading ? (
        <div className="py-20 text-center text-xs text-neutral-400">جاري تحميل المحتوى...</div>
      ) : page ? (
        <div className="bg-white rounded-3xl p-8 sm:p-14 border border-neutral-150 shadow-sm space-y-8">
          
          <div className="pb-6 border-b border-neutral-100 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-neutral-950 text-white flex items-center justify-center shrink-0">
              <IconComponent className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] font-mono font-bold text-neutral-400 uppercase tracking-widest block">
                AMADAL // OFFICIAL INFO
              </span>
              <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 mt-0.5">
                {page.title}
              </h1>
            </div>
          </div>

          {/* Body Content */}
          <div
            className="prose prose-neutral max-w-none text-xs sm:text-sm text-neutral-700 leading-relaxed space-y-4 font-sans [&>h2]:text-base [&>h2]:sm:text-lg [&>h2]:font-bold [&>h2]:text-neutral-950 [&>h2]:mt-6 [&>h2]:mb-2 [&>p]:leading-relaxed [&>ul]:list-disc [&>ul]:pr-5 [&>ul]:space-y-1.5 [&>strong]:text-neutral-950"
            dangerouslySetInnerHTML={{ __html: page.content }}
          />

          <div className="pt-8 border-t border-neutral-100 flex flex-col sm:flex-row items-center justify-between gap-4">
            <span className="text-[11px] text-neutral-400">
              آخر تحديث: {page.updatedAt ? new Date(page.updatedAt).toLocaleDateString('ar-DZ') : '2025'}
            </span>

            <button
              onClick={() => onNavigate('shop')}
              className="px-6 py-2.5 bg-neutral-950 hover:bg-black text-white rounded-xl text-xs font-bold transition-all"
            >
              تصفح التشكيلات الجديدة
            </button>
          </div>

        </div>
      ) : (
        <div className="text-center py-20 text-neutral-500">الصفحة غير موجودة.</div>
      )}

    </div>
  );
};
