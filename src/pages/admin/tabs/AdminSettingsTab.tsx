import React, { useState, useEffect } from 'react';
import { StoreSettings } from '../../../types';
import { doc, setDoc } from 'firebase/firestore';
import { db, removeUndefinedFields } from '../../../firebase';
import { useStore } from '../../../context/StoreContext';
import { Save, Check, RefreshCw, MessageCircle } from 'lucide-react';
import { AmadalLogo } from '../../../components/AmadalLogo';
import { ImageUploadField } from '../../../components/ImageUploadField';

export const AdminSettingsTab: React.FC = () => {
  const { settings, refreshData } = useStore();
  const [formData, setFormData] = useState<StoreSettings>({ ...settings });
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (settings) {
      setFormData(settings);
    }
  }, [settings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      await setDoc(doc(db, 'settings', 'store'), removeUndefinedFields(formData));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error(err);
      alert('حدث خطأ أثناء حفظ الإعدادات');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-8">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-base text-neutral-900">إعدادات متجر AMADAL</h3>
          <p className="text-xs text-neutral-500">
            تحكم في هوية البراند، الشعار، رقم واتساب المباشر، وروابط التواصل
          </p>
        </div>

        <div className="flex items-center gap-3">
          {saveSuccess && (
            <span className="text-xs text-emerald-700 font-bold flex items-center gap-1">
              <Check className="w-4 h-4" />
              <span>تم حفظ الإعدادات!</span>
            </span>
          )}

          <button
            type="submit"
            disabled={isSaving}
            className="px-6 py-2.5 bg-neutral-950 hover:bg-black text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'جاري الحفظ...' : 'حفظ الإعدادات'}</span>
          </button>
        </div>
      </div>

      {/* Brand Identity & Logo */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-neutral-150 shadow-sm space-y-6">
        <h4 className="font-bold text-sm text-neutral-900 pb-3 border-b border-neutral-100">
          هوية العلامة والشعار
        </h4>

        {/* Logo Preview */}
        <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-200 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <span className="text-xs font-bold text-neutral-900 block">معاينة الشعار الحالي في المتجر:</span>
            <span className="text-[11px] text-neutral-500">
              {formData.logoUrl ? 'يتم استخدام رابط الصورة المخصص أدناه' : 'الشعار الرسمي المعتمد لعلامة AMADAL'}
            </span>
          </div>

          <div className="p-3 bg-white rounded-xl border border-neutral-200">
            <AmadalLogo
              variant="dark"
              size="md"
              customLogoUrl={formData.logoUrl}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block font-bold text-neutral-900 mb-1">اسم المتجر / العلامة *</label>
            <input
              type="text"
              required
              value={formData.storeName}
              onChange={(e) => setFormData({ ...formData, storeName: e.target.value })}
              className="w-full px-3.5 py-2.5 bg-neutral-50 border rounded-xl font-bold focus:outline-none focus:border-black font-sans"
            />
          </div>

          <div className="sm:col-span-2">
            <ImageUploadField
              label="شعار المتجر (Logo Image)"
              value={formData.logoUrl || ''}
              onChange={(url) => setFormData((prev) => ({ ...prev, logoUrl: url }))}
              onSave={async (url) => {
                const updated = { ...formData, logoUrl: url };
                await setDoc(doc(db, 'settings', 'store'), removeUndefinedFields(updated), { merge: true });
                setFormData(updated);
                await refreshData();
              }}
              folder="store-settings"
              description="رفع صورة الشعار بدقة عالية بصيغة PNG أو WEBP أو JPG (اتركه فارغاً لاستخدام الشعار النصي الرسمي)"
              placeholder="https://... (اختياري)"
              aspectRatioClass="aspect-[4/1]"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block font-bold text-neutral-900 mb-1">وصف العلامة (Meta Description)</label>
            <textarea
              rows={2}
              value={formData.storeDescription}
              onChange={(e) => setFormData({ ...formData, storeDescription: e.target.value })}
              className="w-full px-3.5 py-2.5 bg-neutral-50 border rounded-xl focus:outline-none focus:border-black"
            />
          </div>
        </div>
      </div>

      {/* Announcement Bar */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-neutral-150 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
          <h4 className="font-bold text-sm text-neutral-900">شريط الإعلان العلوي (Announcement Bar)</h4>
          <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
            <input
              type="checkbox"
              checked={formData.showAnnouncement}
              onChange={(e) => setFormData({ ...formData, showAnnouncement: e.target.checked })}
              className="w-4 h-4 accent-black rounded"
            />
            <span>تفعيل وظهور الشريط</span>
          </label>
        </div>

        <div>
          <label className="block text-xs font-bold text-neutral-900 mb-1">نص الإعلان</label>
          <input
            type="text"
            value={formData.announcementText || ''}
            onChange={(e) => setFormData({ ...formData, announcementText: e.target.value })}
            placeholder="توصيل متوفر لجميع الـ 58 ولاية — الدفع عند الاستلام — استبدال سريع وسهل"
            className="w-full px-3.5 py-2.5 bg-neutral-50 border rounded-xl text-xs font-medium focus:outline-none focus:border-black"
          />
        </div>
      </div>

      {/* WhatsApp & Contact Settings */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-neutral-150 shadow-sm space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-neutral-100">
          <MessageCircle className="w-5 h-5 text-emerald-600" />
          <h4 className="font-bold text-sm text-neutral-900">إعدادات واتساب والتواصل مع العملاء</h4>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block font-bold text-neutral-900 mb-1">رقم واتساب المباشر للطلبات *</label>
            <input
              type="text"
              required
              value={formData.whatsappNumber}
              onChange={(e) => setFormData({ ...formData, whatsappNumber: e.target.value })}
              placeholder="+213550000000"
              className="w-full px-3.5 py-2.5 bg-neutral-50 border rounded-xl font-mono focus:outline-none focus:border-black"
              dir="ltr"
            />
          </div>

          <div>
            <label className="block font-bold text-neutral-900 mb-1">رقم الهاتف للاتصال المباشر</label>
            <input
              type="text"
              value={formData.phone || ''}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="0550 00 00 00"
              className="w-full px-3.5 py-2.5 bg-neutral-50 border rounded-xl font-mono focus:outline-none focus:border-black"
              dir="ltr"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block font-bold text-neutral-900 mb-1">
              قالب رسالة واتساب لتأكيد الطلب تلقائياً
            </label>
            <textarea
              rows={2}
              value={formData.whatsappMessageTemplate}
              onChange={(e) => setFormData({ ...formData, whatsappMessageTemplate: e.target.value })}
              className="w-full px-3.5 py-2.5 bg-neutral-50 border rounded-xl focus:outline-none focus:border-black"
            />
            <span className="text-[11px] text-neutral-400 mt-1 block">
              يمكنك استخدام المتغير: <code>{'{customerName}'}</code> لاسم العميل.
            </span>
          </div>

          <div>
            <label className="block font-bold text-neutral-900 mb-1">البريد الإلكتروني للعلامة</label>
            <input
              type="email"
              value={formData.email || ''}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="contact@amadal.dz"
              className="w-full px-3.5 py-2.5 bg-neutral-50 border rounded-xl focus:outline-none focus:border-black font-mono"
              dir="ltr"
            />
          </div>

          <div>
            <label className="block font-bold text-neutral-900 mb-1">مقر العلامة / العنوان</label>
            <input
              type="text"
              value={formData.address || ''}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="الجزائر العاصمة، الجزائر"
              className="w-full px-3.5 py-2.5 bg-neutral-50 border rounded-xl focus:outline-none focus:border-black"
            />
          </div>
        </div>
      </div>

      {/* Order & Auto-Archiving Settings */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-neutral-150 shadow-sm space-y-4">
        <h4 className="font-bold text-sm text-neutral-900 pb-3 border-b border-neutral-100 flex items-center gap-2">
          <span>إعدادات الطلبات والأرشفة التلقائية</span>
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block font-bold text-neutral-900 mb-1">
              مدة أرشفة الطلبات المسلمة تلقائياً (بالساعات)
            </label>
            <select
              value={formData.orderArchiveDurationHours ?? 48}
              onChange={(e) => setFormData({ ...formData, orderArchiveDurationHours: Number(e.target.value) })}
              className="w-full px-3.5 py-2.5 bg-neutral-50 border rounded-xl focus:outline-none focus:border-black font-bold"
            >
              <option value={0}>0 ساعة (أرشفة فورية بعد التسليم)</option>
              <option value={12}>12 ساعة بعد التسليم</option>
              <option value={24}>24 ساعة (يوم واحد)</option>
              <option value={48}>48 ساعة (يومان - الافتراضي)</option>
              <option value={72}>72 ساعة (3 أيام)</option>
              <option value={168}>7 أيام (أسبوع)</option>
              <option value={336}>14 يوم (أسبوعان)</option>
              <option value={720}>30 يوم (شهر)</option>
            </select>
            <span className="text-[11px] text-neutral-500 mt-1 block">
              تتم أرشفة الطلبات التي تصبح حالة شحنتها "تم التسليم" تلقائياً بعد انقضاء هذه المدة من تاريخ ووقت التسليم الفعلي المسجل في قاعدة البيانات.
            </span>
          </div>

          <div>
            <label className="block font-bold text-neutral-900 mb-1">
              حد تنبيه المخزون المنخفض (قطع)
            </label>
            <input
              type="number"
              min={1}
              value={formData.lowStockThreshold || 3}
              onChange={(e) => setFormData({ ...formData, lowStockThreshold: Number(e.target.value) })}
              className="w-full px-3.5 py-2.5 bg-neutral-50 border rounded-xl focus:outline-none focus:border-black font-mono"
            />
            <span className="text-[11px] text-neutral-500 mt-1 block">
              إظهار شارة تحذيرية في إدارة المنتجات عندما يقل المخزون عن هذا الحد.
            </span>
          </div>
        </div>
      </div>

      {/* Social Media Links */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-neutral-150 shadow-sm space-y-4">
        <h4 className="font-bold text-sm text-neutral-900 pb-3 border-b border-neutral-100">
          روابط شبكات التواصل الاجتماعي
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="block font-bold text-neutral-900 mb-1">رابط Instagram</label>
            <input
              type="url"
              value={formData.instagram || ''}
              onChange={(e) => setFormData({ ...formData, instagram: e.target.value })}
              placeholder="https://instagram.com/amadal.official"
              className="w-full px-3.5 py-2.5 bg-neutral-50 border rounded-xl font-mono focus:outline-none focus:border-black"
              dir="ltr"
            />
          </div>

          <div>
            <label className="block font-bold text-neutral-900 mb-1">رابط TikTok</label>
            <input
              type="url"
              value={formData.tiktok || ''}
              onChange={(e) => setFormData({ ...formData, tiktok: e.target.value })}
              placeholder="https://tiktok.com/@amadal.official"
              className="w-full px-3.5 py-2.5 bg-neutral-50 border rounded-xl font-mono focus:outline-none focus:border-black"
              dir="ltr"
            />
          </div>

          <div>
            <label className="block font-bold text-neutral-900 mb-1">رابط Facebook</label>
            <input
              type="url"
              value={formData.facebook || ''}
              onChange={(e) => setFormData({ ...formData, facebook: e.target.value })}
              placeholder="https://facebook.com/amadal.official"
              className="w-full px-3.5 py-2.5 bg-neutral-50 border rounded-xl font-mono focus:outline-none focus:border-black"
              dir="ltr"
            />
          </div>
        </div>
      </div>

    </form>
  );
};
