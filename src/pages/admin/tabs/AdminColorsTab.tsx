import React, { useState, useEffect } from 'react';
import {
  Palette,
  Save,
  RotateCcw,
  Undo2,
  Check,
  Eye,
  Sparkles,
  ShoppingBag,
  AlertCircle,
  Truck,
  CheckCircle2,
  Layers,
  ArrowRight
} from 'lucide-react';
import { StoreThemeColors, ElementColorConfig } from '../../../types';
import { useStore } from '../../../context/StoreContext';
import { apiFetch } from '../../../utils/apiConfig';
import { removeUndefinedFields } from '../../../firebase';
import {
  DEFAULT_THEME_COLORS,
  THEME_CATEGORY_GROUPS,
  resolveThemeColors,
  sanitizeHexColor,
  ThemeCategoryGroup
} from '../../../utils/themeConfig';

export const AdminColorsTab: React.FC = () => {
  const { settings, refreshData, setPreviewThemeColors } = useStore();

  // Initialize draft from saved settings or defaults
  const [draftColors, setDraftColors] = useState<StoreThemeColors>(() =>
    resolveThemeColors(settings?.themeColors)
  );
  const [savedColors, setSavedColors] = useState<StoreThemeColors>(() =>
    resolveThemeColors(settings?.themeColors)
  );

  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('all');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showLivePreviewBox, setShowLivePreviewBox] = useState(true);

  // Synchronize when settings change from external source
  useEffect(() => {
    const resolved = resolveThemeColors(settings?.themeColors);
    setDraftColors(resolved);
    setSavedColors(resolved);
  }, [settings?.themeColors]);

  // Clean up preview on unmount
  useEffect(() => {
    return () => {
      setPreviewThemeColors(null);
    };
  }, [setPreviewThemeColors]);

  // Check if there are unsaved modifications
  const hasChanges = JSON.stringify(draftColors) !== JSON.stringify(savedColors);

  // Update a single element's color (text or bg ONLY)
  const handleColorChange = (
    elementKey: keyof StoreThemeColors,
    field: 'textColor' | 'bgColor',
    value: string
  ) => {
    setDraftColors((prev) => {
      const updated = {
        ...prev,
        [elementKey]: {
          ...prev[elementKey],
          [field]: value,
        },
      };
      // Immediately reflect into live CSS variables
      setPreviewThemeColors(updated);
      return updated;
    });
  };

  // Save changes to Firestore
  const handleSave = async () => {
    setIsSaving(true);
    setErrorMessage(null);
    setSaveSuccess(false);

    try {
      const cleanTheme = resolveThemeColors(draftColors);
      const res = await apiFetch('/api/admin/settings', {
        method: 'POST',
        body: JSON.stringify(
          removeUndefinedFields({
            themeColors: cleanTheme,
          })
        ),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'فشل حفظ تخصيص الألوان.');
      }

      setSavedColors(cleanTheme);
      setPreviewThemeColors(null); // Clear preview override so settings apply normally
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3500);

      if (refreshData) {
        await refreshData();
      }
    } catch (err: any) {
      console.error('[AdminColorsTab] Save error:', err);
      setErrorMessage(err.message || 'حدث خطأ أثناء حفظ الألوان في قاعدة البيانات.');
    } finally {
      setIsSaving(false);
    }
  };

  // Revert changes back to saved settings
  const handleCancel = () => {
    setDraftColors(savedColors);
    setPreviewThemeColors(null);
    setErrorMessage(null);
  };

  // Reset to default AMADAL colors
  const handleResetToDefaults = () => {
    if (window.confirm('هل أنت متأكد من استعادة الألوان الافتراضية الأصلية لمتجر AMADAL؟')) {
      const defaults = { ...DEFAULT_THEME_COLORS };
      setDraftColors(defaults);
      setPreviewThemeColors(defaults);
      setErrorMessage(null);
    }
  };

  const filteredGroups = activeCategoryFilter === 'all'
    ? THEME_CATEGORY_GROUPS
    : THEME_CATEGORY_GROUPS.filter((g) => g.id === activeCategoryFilter);

  return (
    <div className="space-y-6">
      
      {/* Top Banner & Action Controls */}
      <div className="bg-white rounded-3xl p-6 sm:p-7 border border-neutral-200/80 shadow-sm space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-neutral-950 text-white">
                <Palette className="w-5 h-5" />
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-neutral-900">
                تخصيص ألوان متجر AMADAL
              </h2>
              {hasChanges && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 animate-pulse">
                  تعديلات غير محفوظة
                </span>
              )}
            </div>
            <p className="text-xs text-neutral-500 max-w-2xl leading-relaxed">
              تحكم كامل في مظهر وهوية المتجر. كل عنصر يمتلك خيارين فقط: <strong>لون النص (Text Color)</strong> و <strong>لون الخلفية (Background Color)</strong>.
              يتم تطبيق التغييرات فورياً عبر تقنية CSS Variables.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleResetToDefaults}
              className="px-3.5 py-2.5 rounded-xl border border-neutral-200 hover:border-neutral-300 bg-neutral-50 hover:bg-neutral-100 text-neutral-700 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
              title="استعادة الألوان الأصلية للمتجر"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>استعادة الألوان الافتراضية</span>
            </button>

            <button
              type="button"
              onClick={handleCancel}
              disabled={!hasChanges}
              className="px-3.5 py-2.5 rounded-xl border border-neutral-200 hover:border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-700 text-xs font-bold flex items-center gap-1.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              title="إلغاء التعديلات والعودة للنسخة المحفوظة"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span>إلغاء التغييرات</span>
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !hasChanges}
              className="px-5 py-2.5 rounded-xl bg-neutral-950 hover:bg-black text-white text-xs font-bold flex items-center gap-2 shadow-md hover:shadow-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {isSaving ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>جاري الحفظ...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>حفظ التغييرات</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Feedback Alerts */}
        {saveSuccess && (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2 animate-in fade-in">
            <Check className="w-4 h-4 text-emerald-600" />
            <span>تم حفظ ونشر جميع الألوان بنجاح! تم تحديث هوية المتجر لجميع الزوار.</span>
          </div>
        )}

        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs font-bold flex items-center gap-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-red-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Category Filters Bar */}
        <div className="pt-3 border-t border-neutral-100 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
            <button
              onClick={() => setActiveCategoryFilter('all')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all whitespace-nowrap ${
                activeCategoryFilter === 'all'
                  ? 'bg-neutral-950 text-white shadow-sm'
                  : 'bg-neutral-100 text-neutral-600 hover:text-neutral-900'
              }`}
            >
              جميع العناصر (24)
            </button>
            {THEME_CATEGORY_GROUPS.map((group) => {
              const isActive = activeCategoryFilter === group.id;
              return (
                <button
                  key={group.id}
                  onClick={() => setActiveCategoryFilter(group.id)}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-neutral-950 text-white shadow-sm'
                      : 'bg-neutral-100 text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  {group.title} ({group.elements.length})
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setShowLivePreviewBox(!showLivePreviewBox)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 text-xs font-bold text-neutral-700 hover:bg-neutral-50 transition-colors"
          >
            <Eye className="w-3.5 h-3.5 text-neutral-500" />
            <span>{showLivePreviewBox ? 'إخفاء المعاينة الحية' : 'إظهار المعاينة الحية'}</span>
          </button>
        </div>
      </div>

      {/* Embedded Live Preview Showcase */}
      {showLivePreviewBox && (
        <div className="bg-white rounded-3xl p-6 sm:p-7 border border-neutral-200/80 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm font-bold text-neutral-900">
                معاينة حية فورية (Live Component Preview)
              </h3>
            </div>
            <span className="text-[11px] text-neutral-400 font-medium">
              تتغير هذه المكونات لحظياً بمجرد اختيار أي لون أدناه
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            
            {/* 1. Header & Navigation Preview */}
            <div
              className="rounded-2xl p-4 border border-neutral-200 transition-colors space-y-3"
              style={{
                backgroundColor: draftColors.navbar.bgColor,
                color: draftColors.navbar.textColor,
              }}
            >
              <div
                className="px-3 py-1.5 rounded-lg text-center text-[10px] font-bold"
                style={{
                  backgroundColor: draftColors.header.bgColor,
                  color: draftColors.header.textColor,
                }}
              >
                الهيدر: شحن سريع لكافة الولايات 69
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs font-black tracking-widest font-mono">AMADAL</span>
                <div className="flex items-center gap-2 text-[10px] font-bold opacity-80">
                  <span>الرئيسية</span>
                  <span>المنتجات</span>
                  <span>التصنيفات</span>
                </div>
              </div>
            </div>

            {/* 2. Product Card Preview */}
            <div
              className="rounded-2xl p-4 border border-neutral-200 transition-colors space-y-3"
              style={{
                backgroundColor: draftColors.productCard.bgColor,
                color: draftColors.productCard.textColor,
              }}
            >
              <div className="flex items-center justify-between">
                <span
                  className="px-2 py-0.5 rounded text-[10px] font-bold"
                  style={{
                    backgroundColor: draftColors.categoryCard.bgColor,
                    color: draftColors.categoryCard.textColor,
                  }}
                >
                  هودي فاخر
                </span>
                <span
                  className="text-xs font-mono font-extrabold px-2 py-0.5 rounded"
                  style={{
                    backgroundColor: draftColors.productPrice.bgColor,
                    color: draftColors.productPrice.textColor,
                  }}
                >
                  6,800 د.ج
                </span>
              </div>
              <div>
                <h4
                  className="text-xs font-bold leading-snug px-1 py-0.5 rounded"
                  style={{
                    backgroundColor: draftColors.productName.bgColor,
                    color: draftColors.productName.textColor,
                  }}
                >
                  AMADAL Signature Oversized Hoodie
                </h4>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  className="py-2 px-2.5 rounded-xl text-[10px] font-bold flex items-center justify-center gap-1 transition-all"
                  style={{
                    backgroundColor: draftColors.btnAddToCart.bgColor,
                    color: draftColors.btnAddToCart.textColor,
                  }}
                >
                  <ShoppingBag className="w-3 h-3" />
                  <span>أضف للسلة</span>
                </button>
                <button
                  type="button"
                  className="py-2 px-2.5 rounded-xl text-[10px] font-bold flex items-center justify-center gap-1 border border-neutral-300 transition-all"
                  style={{
                    backgroundColor: draftColors.btnBuyNow.bgColor,
                    color: draftColors.btnBuyNow.textColor,
                  }}
                >
                  <span>شراء الآن</span>
                </button>
              </div>
            </div>

            {/* 3. Checkout & Customer Input Preview */}
            <div
              className="rounded-2xl p-4 border border-neutral-200 transition-colors space-y-3"
              style={{
                backgroundColor: draftColors.checkoutPage.bgColor,
                color: draftColors.checkoutPage.textColor,
              }}
            >
              <div
                className="p-2.5 rounded-xl text-xs space-y-2 border border-neutral-200/60"
                style={{
                  backgroundColor: draftColors.orderSummary.bgColor,
                  color: draftColors.orderSummary.textColor,
                }}
              >
                <div className="flex justify-between text-[11px] font-bold">
                  <span>ملخص الطلب:</span>
                  <span className="font-mono">7,400 د.ج</span>
                </div>
              </div>

              <div>
                <input
                  type="text"
                  readOnly
                  value="أمين بن علي — الجزائر العاصمة"
                  className="w-full px-3 py-2 rounded-xl text-xs font-medium border border-neutral-200 outline-none"
                  style={{
                    backgroundColor: draftColors.customerInputs.bgColor,
                    color: draftColors.customerInputs.textColor,
                  }}
                />
              </div>

              <button
                type="button"
                className="w-full py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all"
                style={{
                  backgroundColor: draftColors.btnConfirmOrder.bgColor,
                  color: draftColors.btnConfirmOrder.textColor,
                }}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>تأكيد الطلب (الدفع عند الاستلام)</span>
              </button>
            </div>

            {/* 4. Alert & Status Banner Preview */}
            <div
              className="rounded-2xl p-3.5 border flex items-center gap-2 text-xs font-bold"
              style={{
                backgroundColor: draftColors.alerts.bgColor,
                color: draftColors.alerts.textColor,
              }}
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>تنبيه: متبقي 2 قطع فقط في هذا المقاس!</span>
            </div>

            {/* 5. Success Status Banner Preview */}
            <div
              className="rounded-2xl p-3.5 border flex items-center gap-2 text-xs font-bold"
              style={{
                backgroundColor: draftColors.statusBanners.bgColor,
                color: draftColors.statusBanners.textColor,
              }}
            >
              <Check className="w-4 h-4 shrink-0" />
              <span>تم استلام وتأكيد طلبك بنجاح! رقم الطلب AMD-82914</span>
            </div>

            {/* 6. Footer Preview */}
            <div
              className="rounded-2xl p-3.5 border flex items-center justify-between text-xs font-medium"
              style={{
                backgroundColor: draftColors.footer.bgColor,
                color: draftColors.footer.textColor,
              }}
            >
              <span>فوتر AMADAL — جميع الحقوق محفوظة</span>
              <span className="text-[10px] opacity-70">توصيل 69 ولاية</span>
            </div>

          </div>
        </div>
      )}

      {/* Main Elements Customization Cards */}
      <div className="space-y-6">
        {filteredGroups.map((group) => (
          <div
            key={group.id}
            className="bg-white rounded-3xl p-6 sm:p-7 border border-neutral-200/80 shadow-sm space-y-5"
          >
            <div className="pb-3 border-b border-neutral-100">
              <h3 className="text-base font-bold text-neutral-900">
                {group.title}
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                {group.description}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {group.elements.map((element) => {
                const config: ElementColorConfig = draftColors[element.key] || {
                  textColor: '#000000',
                  bgColor: '#ffffff',
                };

                return (
                  <div
                    key={element.key}
                    className="p-4 sm:p-5 rounded-2xl border border-neutral-200/80 bg-neutral-50/40 hover:bg-white hover:border-neutral-300 transition-all space-y-3.5"
                  >
                    {/* Element Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="text-xs sm:text-sm font-bold text-neutral-900">
                          {element.label}
                        </h4>
                        <p className="text-[11px] text-neutral-500 mt-0.5 leading-snug">
                          {element.description}
                        </p>
                      </div>

                      {/* Mini Live Preview Swatch */}
                      <div
                        className="px-2.5 py-1 rounded-lg border border-neutral-200 text-[10px] font-bold shadow-xs shrink-0 select-none"
                        style={{
                          backgroundColor: config.bgColor,
                          color: config.textColor,
                        }}
                      >
                        معاينة Aa
                      </div>
                    </div>

                    {/* ONLY TWO OPTIONS: Text Color & Background Color */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      
                      {/* Option 1: Text Color (لون النص) */}
                      <div className="bg-white p-2.5 rounded-xl border border-neutral-200/80 space-y-1.5">
                        <label className="text-[11px] font-bold text-neutral-700 flex items-center justify-between">
                          <span>لون النص (Text Color)</span>
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-neutral-300 inline-block shrink-0 shadow-2xs"
                            style={{ backgroundColor: config.textColor }}
                          />
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={config.textColor}
                            onChange={(e) =>
                              handleColorChange(element.key, 'textColor', e.target.value)
                            }
                            className="w-8 h-8 rounded-lg cursor-pointer border border-neutral-200 p-0.5 shrink-0 bg-white"
                            aria-label={`اختيار لون نص ${element.label}`}
                          />
                          <input
                            type="text"
                            value={config.textColor}
                            onChange={(e) =>
                              handleColorChange(element.key, 'textColor', e.target.value)
                            }
                            placeholder="#000000"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-200 text-xs font-mono text-neutral-900 uppercase focus:outline-none focus:border-black"
                            dir="ltr"
                            maxLength={7}
                          />
                        </div>
                      </div>

                      {/* Option 2: Background Color (لون الخلفية) */}
                      <div className="bg-white p-2.5 rounded-xl border border-neutral-200/80 space-y-1.5">
                        <label className="text-[11px] font-bold text-neutral-700 flex items-center justify-between">
                          <span>لون الخلفية (Background)</span>
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-neutral-300 inline-block shrink-0 shadow-2xs"
                            style={{ backgroundColor: config.bgColor }}
                          />
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={config.bgColor}
                            onChange={(e) =>
                              handleColorChange(element.key, 'bgColor', e.target.value)
                            }
                            className="w-8 h-8 rounded-lg cursor-pointer border border-neutral-200 p-0.5 shrink-0 bg-white"
                            aria-label={`اختيار لون خلفية ${element.label}`}
                          />
                          <input
                            type="text"
                            value={config.bgColor}
                            onChange={(e) =>
                              handleColorChange(element.key, 'bgColor', e.target.value)
                            }
                            placeholder="#ffffff"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-200 text-xs font-mono text-neutral-900 uppercase focus:outline-none focus:border-black"
                            dir="ltr"
                            maxLength={7}
                          />
                        </div>
                      </div>

                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Sticky Bottom Floating Bar when changes exist */}
      {hasChanges && (
        <div className="sticky bottom-4 z-30 bg-neutral-950 text-white rounded-2xl p-4 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-3 animate-in slide-in-from-bottom-2">
          <div className="flex items-center gap-2 text-xs font-bold">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <span>لديك تعديلات غير محفوظة على نظام ألوان المتجر.</span>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold transition-colors cursor-pointer"
            >
              إلغاء التغييرات
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-5 py-2 rounded-xl bg-white hover:bg-neutral-100 text-neutral-950 text-xs font-bold flex items-center gap-1.5 transition-colors shadow-md disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5 text-neutral-950" />
              <span>{isSaving ? 'جاري الحفظ...' : 'حفظ التغييرات الآن'}</span>
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
