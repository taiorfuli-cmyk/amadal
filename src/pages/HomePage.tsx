import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Sparkles,
  Flame,
  Truck,
  ShieldCheck,
  RefreshCw,
  Layers,
  ChevronRight
} from 'lucide-react';
import { Product, HomepageConfig } from '../types';
import { ProductCard } from '../components/ProductCard';
import { useStore } from '../context/StoreContext';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { DEFAULT_HOMEPAGE } from '../services/storeService';

interface HomePageProps {
  products: Product[];
  onSelectProduct: (product: Product) => void;
  onNavigate: (view: string, params?: any) => void;
}

export const HomePage: React.FC<HomePageProps> = ({
  products,
  onSelectProduct,
  onNavigate,
}) => {
  const { categories, settings } = useStore();
  const [homepageConfig, setHomepageConfig] = useState<HomepageConfig>(DEFAULT_HOMEPAGE);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'homepage', 'main'), (snap) => {
      if (snap.exists()) {
        setHomepageConfig((prev) => ({ ...prev, ...(snap.data() as HomepageConfig) }));
      }
    });
    return () => unsub();
  }, []);

  const featuredProducts = products.filter((p) => p.isPublished && p.isFeatured).slice(0, 8);
  const bestSellers = products.filter((p) => p.isPublished && p.isBestSeller).slice(0, 4);
  const newArrivals = products.filter((p) => p.isPublished && p.isNew).slice(0, 4);

  return (
    <div className="space-y-16 sm:space-y-24 pb-20">
      
      {/* Hero Section */}
      {homepageConfig.hero?.isVisible !== false && (
        <section className="relative min-h-[80vh] flex items-center justify-center bg-neutral-950 overflow-hidden">
          {/* Hero Background Image */}
          <div className="absolute inset-0 z-0">
            <img
              src={
                homepageConfig.hero?.imageUrl ||
                'https://images.unsplash.com/photo-1509631179647-0177331693ae?q=80&w=1600&auto=format&fit=crop'
              }
              alt="AMADAL Contemporary Streetwear"
              className="w-full h-full object-cover object-center opacity-45 scale-105 animate-fade-in"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/40 to-neutral-950/70" />
          </div>

          {/* Hero Content */}
          <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center space-y-6">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-white text-xs font-semibold tracking-wider uppercase">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>AMADAL // CONTEMPORARY WEAR</span>
            </div>

            <h1 className="text-3xl sm:text-5xl md:text-6xl font-black text-white uppercase tracking-tight font-sans leading-[1.15] max-w-4xl mx-auto">
              {homepageConfig.hero?.title || 'NEW ERA OF CONTEMPORARY STREETWEAR'}
            </h1>

            <p className="text-sm sm:text-base md:text-lg text-neutral-300 max-w-2xl mx-auto font-light leading-relaxed">
              {homepageConfig.hero?.subtitle ||
                'أزياء عصرية شبابية بهندسة تصميم دقيقة وأقمشة قطنية ثقيلة تلائم ذوقك الفاخر.'}
            </p>

            <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={() => onNavigate('shop')}
                className="w-full sm:w-auto px-8 py-4 bg-white hover:bg-neutral-100 text-neutral-950 text-sm font-bold rounded-xl shadow-2xl transition-all active:scale-95 flex items-center justify-center gap-2 group"
              >
                <span>{homepageConfig.hero?.ctaText || 'اكتشف التشكيلة الكاملة'}</span>
                <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              </button>

              <button
                onClick={() => onNavigate('shop', { category: 'new-drop' })}
                className="w-full sm:w-auto px-8 py-4 bg-white/10 hover:bg-white/20 text-white border border-white/20 text-sm font-semibold rounded-xl backdrop-blur-md transition-all active:scale-95"
              >
                وصل حديثاً (New Drop)
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Categories Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between mb-8">
          <div>
            <span className="text-xs font-bold text-neutral-400 uppercase tracking-widest">التصنيفات</span>
            <h2 className="text-xl sm:text-2xl font-black text-neutral-900 mt-1">اختر أسلوبك</h2>
          </div>
          <button
            onClick={() => onNavigate('shop')}
            className="text-xs sm:text-sm font-bold text-neutral-900 hover:text-black flex items-center gap-1 group"
          >
            <span>كل الأقسام</span>
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
          {categories.filter((c) => c.isActive !== false).map((cat) => (
            <div
              key={cat.id}
              onClick={() => onNavigate('shop', { category: cat.slug })}
              className="group relative aspect-[4/5] rounded-2xl overflow-hidden bg-neutral-900 cursor-pointer shadow-md hover:shadow-xl transition-all"
            >
              <img
                src={
                  cat.imageUrl ||
                  'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?q=80&w=800'
                }
                alt={cat.name}
                className="w-full h-full object-cover object-center opacity-85 group-hover:scale-105 group-hover:opacity-95 transition-all duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              
              <div className="absolute inset-x-4 bottom-4 text-right">
                <span className="text-[10px] text-neutral-300 font-mono uppercase tracking-wider block" dir="ltr">
                  {cat.nameEn || 'AMADAL'}
                </span>
                <h3 className="text-base sm:text-lg font-bold text-white mt-0.5">
                  {cat.name}
                </h3>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Featured Products Collection */}
      {products.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between mb-8">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-neutral-400 uppercase tracking-widest">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>مختارات AMADAL الحصرية</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-neutral-900 mt-1">القطع المميزة</h2>
            </div>
            <button
              onClick={() => onNavigate('shop')}
              className="text-xs sm:text-sm font-bold text-neutral-900 hover:text-black flex items-center gap-1 group"
            >
              <span>عرض المزيد</span>
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
            {featuredProducts.length > 0
              ? featuredProducts.map((p) => (
                  <ProductCard key={p.id} product={p} onSelect={onSelectProduct} />
                ))
              : products.slice(0, 4).map((p) => (
                  <ProductCard key={p.id} product={p} onSelect={onSelectProduct} />
                ))}
          </div>
        </section>
      )}

      {/* Promotional Banner */}
      {homepageConfig.promoBanner?.isVisible !== false && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative rounded-3xl overflow-hidden bg-neutral-950 text-white min-h-[360px] flex items-center shadow-2xl">
            <div className="absolute inset-0 z-0">
              <img
                src={
                  homepageConfig.promoBanner?.imageUrl ||
                  'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?q=80&w=1600&auto=format&fit=crop'
                }
                alt="AMADAL Drop"
                className="w-full h-full object-cover object-center opacity-40"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-neutral-950 via-neutral-950/80 to-transparent" />
            </div>

            <div className="relative z-10 p-8 sm:p-14 max-w-xl space-y-4 text-right">
              <span className="text-xs font-mono tracking-widest text-neutral-400 uppercase">
                LIMITED RELEASE // قطن ثقيل
              </span>
              <h2 className="text-2xl sm:text-4xl font-black uppercase font-sans leading-tight">
                {homepageConfig.promoBanner?.title || 'DROP 01 // OVERSIZED ESSENTIALS'}
              </h2>
              <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed">
                {homepageConfig.promoBanner?.subtitle ||
                  'تصاميم مريحة بقصات حصرية وأقمشة قطن معالج 100% 280-450 GSM خالي من الوبر ومقاوم للانكماش.'}
              </p>
              <div className="pt-2">
                <button
                  onClick={() => onNavigate('shop')}
                  className="px-6 py-3 bg-white hover:bg-neutral-100 text-neutral-950 text-xs font-bold rounded-xl transition-all active:scale-95 flex items-center gap-2"
                >
                  <span>{homepageConfig.promoBanner?.buttonText || 'تسوق التشكيلة'}</span>
                  <ArrowLeft className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Best Sellers Section */}
      {bestSellers.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between mb-8">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600 uppercase tracking-widest">
                <Flame className="w-3.5 h-3.5" />
                <span>الأكثر طلباً</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-neutral-900 mt-1">الأكثر مبيعاً</h2>
            </div>
            <button
              onClick={() => onNavigate('shop')}
              className="text-xs sm:text-sm font-bold text-neutral-900 hover:text-black flex items-center gap-1 group"
            >
              <span>تصفح الكل</span>
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
            {bestSellers.map((p) => (
              <ProductCard key={p.id} product={p} onSelect={onSelectProduct} />
            ))}
          </div>
        </section>
      )}

      {/* Brand Philosophy Section */}
      {homepageConfig.brandSection?.isVisible !== false && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-neutral-100 rounded-3xl p-8 sm:p-14 border border-neutral-200/80 grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
            <div className="space-y-4 text-right">
              <span className="text-xs font-mono font-bold text-neutral-500 uppercase tracking-widest">
                {homepageConfig.brandSection?.badge || 'THE AMADAL PHILOSOPHY'}
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-neutral-950">
                {homepageConfig.brandSection?.title || 'فلسفة التصميم المعاصر'}
              </h2>
              <p className="text-xs sm:text-sm text-neutral-600 leading-relaxed">
                {homepageConfig.brandSection?.content ||
                  'ولدت علامة AMADAL لترسم ملامح جديدة للأزياء الشبابية في الجزائر. نؤمن بأن البساطة قوة، والتفاصيل تصنع الفارق. ملابس صممت لتمنحك حضوراً واثقاً وأناقة هادئة تدوم مع الزمن دون مساومة على الراحة وجودة الخامات.'}
              </p>
              <div className="pt-2 text-xs font-mono font-bold text-neutral-900 tracking-wider">
                {homepageConfig.brandSection?.tagline || 'CONFIDENT. MINIMAL. CONTEMPORARY.'}
              </div>
              <div className="pt-2">
                <button
                  onClick={() => onNavigate('content', { pageId: 'about' })}
                  className="text-xs font-bold text-neutral-900 underline hover:text-black"
                >
                  اقرأ قصة العلامة بالتفصيل ←
                </button>
              </div>
            </div>

            <div className="relative aspect-[4/3] rounded-2xl overflow-hidden shadow-lg bg-neutral-200">
              <img
                src={
                  homepageConfig.brandSection?.imageUrl ||
                  'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?q=80&w=1200&auto=format&fit=crop'
                }
                alt="AMADAL Contemporary Look"
                className="w-full h-full object-cover object-center"
              />
            </div>
          </div>
        </section>
      )}

      {/* Algerian Market Guarantee Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 text-center">
          <div className="p-6 bg-white rounded-2xl border border-neutral-100 shadow-sm flex flex-col items-center">
            <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center text-neutral-900 mb-3">
              <Truck className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-xs sm:text-sm text-neutral-900">توصيل لـ 69 ولاية</h4>
            <p className="text-[11px] text-neutral-500 mt-1">توصيل منزلي أو للمكتب</p>
          </div>

          <div className="p-6 bg-white rounded-2xl border border-neutral-100 shadow-sm flex flex-col items-center">
            <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center text-neutral-900 mb-3">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-xs sm:text-sm text-neutral-900">الدفع عند الاستلام</h4>
            <p className="text-[11px] text-neutral-500 mt-1">افحص طردك ثم ادفع نقداً</p>
          </div>

          <div className="p-6 bg-white rounded-2xl border border-neutral-100 shadow-sm flex flex-col items-center">
            <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center text-neutral-900 mb-3">
              <RefreshCw className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-xs sm:text-sm text-neutral-900">استبدال سهل</h4>
            <p className="text-[11px] text-neutral-500 mt-1">المقاس غير مضبوط؟ نبدله فوراً</p>
          </div>

          <div className="p-6 bg-white rounded-2xl border border-neutral-100 shadow-sm flex flex-col items-center">
            <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center text-neutral-900 mb-3">
              <Layers className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-xs sm:text-sm text-neutral-900">قطن فاخر 100%</h4>
            <p className="text-[11px] text-neutral-500 mt-1">أقمشة ثقيلة تدوم طويلاً</p>
          </div>
        </div>
      </section>

    </div>
  );
};
