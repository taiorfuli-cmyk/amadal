import React, { useState, useEffect } from 'react';
import { HomepageConfig } from '../../../types';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, removeUndefinedFields } from '../../../firebase';
import { DEFAULT_HOMEPAGE } from '../../../services/storeService';
import { Save, Eye, EyeOff, Sparkles, Check } from 'lucide-react';
import { ImageUploadField } from '../../../components/ImageUploadField';

export const AdminHomepageTab: React.FC = () => {
  const [config, setConfig] = useState<HomepageConfig>(DEFAULT_HOMEPAGE);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const snap = await getDoc(doc(db, 'homepage', 'main'));
        if (snap.exists()) {
          setConfig((prev) => ({ ...prev, ...(snap.data() as HomepageConfig) }));
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchConfig();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      await setDoc(doc(db, 'homepage', 'main'), removeUndefinedFields(config));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error(err);
      alert('حدث خطأ أثناء حفظ بيانات الصفحة الرئيسية');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-8">
      
      {/* Action Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-base text-neutral-900">إدارة محتوى وتصميم الصفحة الرئيسية</h3>
          <p className="text-xs text-neutral-500">
            عدل البنرات الرئيسية والنصوص والصور الترويجية التي يراها زوار AMADAL
          </p>
        </div>

        <div className="flex items-center gap-3">
          {saveSuccess && (
            <span className="text-xs text-emerald-700 font-bold flex items-center gap-1">
              <Check className="w-4 h-4" />
              <span>تم حفظ الصفحة الرئيسية!</span>
            </span>
          )}

          <button
            type="submit"
            disabled={isSaving}
            className="px-6 py-2.5 bg-neutral-950 hover:bg-black text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'جاري الحفظ...' : 'حفظ ونشر التعديلات'}</span>
          </button>
        </div>
      </div>

      {/* 1. Hero Section Box */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-neutral-150 shadow-sm space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-neutral-100">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <h4 className="font-bold text-sm text-neutral-900">القسم الرئيسي (Hero Section)</h4>
          </div>

          <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
            <input
              type="checkbox"
              checked={config.hero?.isVisible !== false}
              onChange={(e) =>
                setConfig({
                  ...config,
                  hero: { ...config.hero, isVisible: e.target.checked },
                })
              }
              className="w-4 h-4 accent-black rounded"
            />
            <span>تفعيل وظهور القسم</span>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="sm:col-span-2">
            <label className="block font-bold text-neutral-900 mb-1">العنوان الرئيسي (Title) *</label>
            <input
              type="text"
              required
              value={config.hero?.title || ''}
              onChange={(e) =>
                setConfig({
                  ...config,
                  hero: { ...config.hero, title: e.target.value },
                })
              }
              placeholder="NEW ERA OF CONTEMPORARY STREETWEAR"
              className="w-full px-3.5 py-2.5 bg-neutral-50 border rounded-xl font-bold text-sm focus:outline-none focus:border-black font-sans"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block font-bold text-neutral-900 mb-1">الوصف الفرعي (Subtitle)</label>
            <textarea
              rows={2}
              value={config.hero?.subtitle || ''}
              onChange={(e) =>
                setConfig({
                  ...config,
                  hero: { ...config.hero, subtitle: e.target.value },
                })
              }
              className="w-full px-3.5 py-2.5 bg-neutral-50 border rounded-xl focus:outline-none focus:border-black"
            />
          </div>

          <div>
            <label className="block font-bold text-neutral-900 mb-1">نص زر التفاعل (CTA Button Text)</label>
            <input
              type="text"
              value={config.hero?.ctaText || ''}
              onChange={(e) =>
                setConfig({
                  ...config,
                  hero: { ...config.hero, ctaText: e.target.value },
                })
              }
              placeholder="اكتشف التشكيلة الجديدة"
              className="w-full px-3.5 py-2.5 bg-neutral-50 border rounded-xl focus:outline-none focus:border-black"
            />
          </div>

          <div className="sm:col-span-2">
            <ImageUploadField
              label="صورة خلفية القسم الرئيسي (Hero Background Image)"
              value={config.hero?.imageUrl || ''}
              onChange={(url) =>
                setConfig((prev) => ({
                  ...prev,
                  hero: { ...prev.hero, imageUrl: url },
                }))
              }
              onSave={async (url) => {
                const updated = {
                  ...config,
                  hero: { ...config.hero, imageUrl: url },
                };
                await setDoc(doc(db, 'homepage', 'main'), removeUndefinedFields(updated), { merge: true });
                setConfig(updated);
              }}
              folder="homepage"
              description="الصورة الرئيسية التي تظهر في أول الصفحة على كامل الشاشة (تُحفظ في homepage/{uniqueFileName})"
              aspectRatioClass="aspect-[21/9]"
            />
          </div>
        </div>
      </div>

      {/* 2. Promotional Banner */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-neutral-150 shadow-sm space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-neutral-100">
          <h4 className="font-bold text-sm text-neutral-900">البانر الترويجي الأوسط (Promo Banner)</h4>
          <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
            <input
              type="checkbox"
              checked={config.promoBanner?.isVisible !== false}
              onChange={(e) =>
                setConfig({
                  ...config,
                  promoBanner: { ...config.promoBanner, isVisible: e.target.checked },
                })
              }
              className="w-4 h-4 accent-black rounded"
            />
            <span>تفعيل وظهور البانر</span>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block font-bold text-neutral-900 mb-1">عنوان البانر</label>
            <input
              type="text"
              value={config.promoBanner?.title || ''}
              onChange={(e) =>
                setConfig({
                  ...config,
                  promoBanner: { ...config.promoBanner, title: e.target.value },
                })
              }
              className="w-full px-3.5 py-2.5 bg-neutral-50 border rounded-xl font-bold focus:outline-none focus:border-black"
            />
          </div>

          <div>
            <label className="block font-bold text-neutral-900 mb-1">نص الزر</label>
            <input
              type="text"
              value={config.promoBanner?.buttonText || ''}
              onChange={(e) =>
                setConfig({
                  ...config,
                  promoBanner: { ...config.promoBanner, buttonText: e.target.value },
                })
              }
              className="w-full px-3.5 py-2.5 bg-neutral-50 border rounded-xl focus:outline-none focus:border-black"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block font-bold text-neutral-900 mb-1">النص التوضيحي</label>
            <textarea
              rows={2}
              value={config.promoBanner?.subtitle || ''}
              onChange={(e) =>
                setConfig({
                  ...config,
                  promoBanner: { ...config.promoBanner, subtitle: e.target.value },
                })
              }
              className="w-full px-3.5 py-2.5 bg-neutral-50 border rounded-xl focus:outline-none focus:border-black"
            />
          </div>

          <div className="sm:col-span-2">
            <ImageUploadField
              label="صورة البانر الإعلاني (Promo Banner Image)"
              value={config.promoBanner?.imageUrl || ''}
              onChange={(url) =>
                setConfig((prev) => ({
                  ...prev,
                  promoBanner: { ...prev.promoBanner, imageUrl: url },
                }))
              }
              onSave={async (url) => {
                const updated = {
                  ...config,
                  promoBanner: { ...config.promoBanner, imageUrl: url },
                };
                await setDoc(doc(db, 'homepage', 'main'), removeUndefinedFields(updated), { merge: true });
                setConfig(updated);
              }}
              folder="homepage"
              description="الصورة الترويجية للبانر الأوسط (تُحفظ في homepage/{uniqueFileName})"
              aspectRatioClass="aspect-[16/9]"
            />
          </div>
        </div>
      </div>

      {/* 3. Brand Philosophy Section */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-neutral-150 shadow-sm space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-neutral-100">
          <h4 className="font-bold text-sm text-neutral-900">قسم فلسفة وهوية AMADAL (Brand Section)</h4>
          <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
            <input
              type="checkbox"
              checked={config.brandSection?.isVisible !== false}
              onChange={(e) =>
                setConfig({
                  ...config,
                  brandSection: { ...config.brandSection, isVisible: e.target.checked },
                })
              }
              className="w-4 h-4 accent-black rounded"
            />
            <span>تفعيل ظهور القسم</span>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block font-bold text-neutral-900 mb-1">شارة التعريف (Badge)</label>
            <input
              type="text"
              value={config.brandSection?.badge || ''}
              onChange={(e) =>
                setConfig({
                  ...config,
                  brandSection: { ...config.brandSection, badge: e.target.value },
                })
              }
              className="w-full px-3.5 py-2.5 bg-neutral-50 border rounded-xl font-mono focus:outline-none focus:border-black"
            />
          </div>

          <div>
            <label className="block font-bold text-neutral-900 mb-1">العنوان</label>
            <input
              type="text"
              value={config.brandSection?.title || ''}
              onChange={(e) =>
                setConfig({
                  ...config,
                  brandSection: { ...config.brandSection, title: e.target.value },
                })
              }
              className="w-full px-3.5 py-2.5 bg-neutral-50 border rounded-xl font-bold focus:outline-none focus:border-black"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block font-bold text-neutral-900 mb-1">النص الفلسفي</label>
            <textarea
              rows={3}
              value={config.brandSection?.content || ''}
              onChange={(e) =>
                setConfig({
                  ...config,
                  brandSection: { ...config.brandSection, content: e.target.value },
                })
              }
              className="w-full px-3.5 py-2.5 bg-neutral-50 border rounded-xl focus:outline-none focus:border-black leading-relaxed"
            />
          </div>

          <div>
            <label className="block font-bold text-neutral-900 mb-1">الشعار اللفظي (Tagline)</label>
            <input
              type="text"
              value={config.brandSection?.tagline || ''}
              onChange={(e) =>
                setConfig({
                  ...config,
                  brandSection: { ...config.brandSection, tagline: e.target.value },
                })
              }
              className="w-full px-3.5 py-2.5 bg-neutral-50 border rounded-xl font-mono focus:outline-none focus:border-black"
            />
          </div>

          <div className="sm:col-span-2">
            <ImageUploadField
              label="صورة فلسفة وهوية العلامة المعمارية (Brand Image)"
              value={config.brandSection?.imageUrl || ''}
              onChange={(url) =>
                setConfig((prev) => ({
                  ...prev,
                  brandSection: { ...prev.brandSection, imageUrl: url },
                }))
              }
              onSave={async (url) => {
                const updated = {
                  ...config,
                  brandSection: { ...config.brandSection, imageUrl: url },
                };
                await setDoc(doc(db, 'homepage', 'main'), removeUndefinedFields(updated), { merge: true });
                setConfig(updated);
              }}
              folder="homepage"
              description="الصورة المعمارية لقسم هوية وفلسفة AMADAL (تُحفظ في homepage/{uniqueFileName})"
              aspectRatioClass="aspect-[4/3]"
            />
          </div>
        </div>
      </div>

    </form>
  );
};
