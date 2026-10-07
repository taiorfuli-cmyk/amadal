import React, { useState, useEffect } from 'react';
import { ALGERIA_WILAYAS, ShippingRate } from '../../../types';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { db } from '../../../firebase';
import { Search, Save, Truck, Check, X, ShieldCheck, Building2, CheckCircle2, RotateCcw } from 'lucide-react';
import { useStore } from '../../../context/StoreContext';

type DeskFilter = 'all' | 'available' | 'unavailable';

export const AdminShippingTab: React.FC = () => {
  const { settings } = useStore();
  const [rates, setRates] = useState<Record<string, ShippingRate>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [deskFilter, setDeskFilter] = useState<DeskFilter>('all');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [autoSavedWilaya, setAutoSavedWilaya] = useState<string | null>(null);

  const fetchRates = async () => {
    setIsLoading(true);
    try {
      const snap = await getDocs(collection(db, 'shipping'));
      const map: Record<string, ShippingRate> = {};
      if (!snap.empty) {
        snap.forEach((d) => {
          const data = d.data() as ShippingRate;
          const wilayaMeta = ALGERIA_WILAYAS.find((w) => w.code === data.wilayaCode);
          map[data.wilayaCode] = {
            ...data,
            wilayaName: wilayaMeta?.name || data.wilayaName,
            wilayaNameFr: wilayaMeta?.nameFr || data.wilayaNameFr,
            isDeskAvailable: data.isDeskAvailable !== undefined ? data.isDeskAvailable : true,
          };
        });
      }

      // Ensure all 69 official wilayas are represented
      ALGERIA_WILAYAS.forEach((w) => {
        if (!map[w.code]) {
          map[w.code] = {
            id: `wilaya-${w.code}`,
            wilayaCode: w.code,
            wilayaName: w.name,
            wilayaNameFr: w.nameFr,
            homePrice: w.defaultHomePrice,
            deskPrice: w.defaultDeskPrice,
            estimatedDays: w.estimatedDays,
            isActive: true,
            isDeskAvailable: true,
          };
        } else if (map[w.code].isDeskAvailable === undefined) {
          map[w.code].isDeskAvailable = true;
        }
      });

      setRates(map);
    } catch (err) {
      console.error('Error fetching shipping rates:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRates();
  }, []);

  const handlePriceChange = (wilayaCode: string, field: 'homePrice' | 'deskPrice', value: number) => {
    setRates((prev) => {
      const current = prev[wilayaCode] || {
        id: `wilaya-${wilayaCode}`,
        wilayaCode,
        wilayaName: ALGERIA_WILAYAS.find((w) => w.code === wilayaCode)?.name || '',
        wilayaNameFr: ALGERIA_WILAYAS.find((w) => w.code === wilayaCode)?.nameFr || '',
        homePrice: 700,
        deskPrice: 400,
        estimatedDays: '2-3 أيام',
        isActive: true,
        isDeskAvailable: true,
      };
      return {
        ...prev,
        [wilayaCode]: {
          ...current,
          [field]: Math.max(0, value),
        },
      };
    });
  };

  // Toggle desk delivery availability for a wilaya with immediate persistence to Firestore
  const handleToggleDeskAvailable = async (wilayaCode: string) => {
    const current = rates[wilayaCode] || {
      id: `wilaya-${wilayaCode}`,
      wilayaCode,
      wilayaName: ALGERIA_WILAYAS.find((w) => w.code === wilayaCode)?.name || '',
      wilayaNameFr: ALGERIA_WILAYAS.find((w) => w.code === wilayaCode)?.nameFr || '',
      homePrice: 700,
      deskPrice: 400,
      estimatedDays: '2-3 أيام',
      isActive: true,
      isDeskAvailable: true,
    };
    const newStatus = !(current.isDeskAvailable !== false);

    // Update local state immediately
    setRates((prev) => ({
      ...prev,
      [wilayaCode]: {
        ...current,
        isDeskAvailable: newStatus,
      },
    }));

    // Persist change to Firestore
    try {
      const wilayaMeta = ALGERIA_WILAYAS.find((w) => w.code === wilayaCode);
      await setDoc(
        doc(db, 'shipping', `wilaya-${wilayaCode}`),
        {
          ...current,
          id: `wilaya-${wilayaCode}`,
          wilayaCode,
          wilayaName: wilayaMeta?.name || current.wilayaName,
          wilayaNameFr: wilayaMeta?.nameFr || current.wilayaNameFr,
          isDeskAvailable: newStatus,
        },
        { merge: true }
      );
      setAutoSavedWilaya(wilayaCode);
      setTimeout(() => setAutoSavedWilaya((prev) => (prev === wilayaCode ? null : prev)), 2000);
    } catch (err) {
      console.error(`Error saving desk availability for wilaya ${wilayaCode}:`, err);
    }
  };

  // Bulk enable or disable stop desk for all wilayas
  const handleBulkSetDeskAvailable = async (enable: boolean) => {
    setIsSaving(true);
    try {
      const updatedRates = { ...rates };
      for (const w of ALGERIA_WILAYAS) {
        const current = updatedRates[w.code] || {
          id: `wilaya-${w.code}`,
          wilayaCode: w.code,
          wilayaName: w.name,
          wilayaNameFr: w.nameFr,
          homePrice: w.defaultHomePrice,
          deskPrice: w.defaultDeskPrice,
          estimatedDays: w.estimatedDays,
          isActive: true,
          isDeskAvailable: true,
        };
        updatedRates[w.code] = {
          ...current,
          isDeskAvailable: enable,
        };
        await setDoc(
          doc(db, 'shipping', `wilaya-${w.code}`),
          {
            ...current,
            id: `wilaya-${w.code}`,
            wilayaCode: w.code,
            wilayaName: w.name,
            wilayaNameFr: w.nameFr,
            isDeskAvailable: enable,
          },
          { merge: true }
        );
      }
      setRates(updatedRates);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      console.error('Error in bulk setting desk availability:', err);
      alert('حدث خطأ أثناء تعديل توفر المكتب للجميع');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAll = async () => {
    setIsSaving(true);
    setSavedSuccess(false);
    try {
      for (const [code, rate] of Object.entries(rates)) {
        const wilayaMeta = ALGERIA_WILAYAS.find((w) => w.code === code);
        await setDoc(doc(db, 'shipping', `wilaya-${code}`), {
          ...rate,
          id: `wilaya-${code}`,
          wilayaCode: code,
          wilayaName: wilayaMeta?.name || rate.wilayaName,
          wilayaNameFr: wilayaMeta?.nameFr || rate.wilayaNameFr,
          isDeskAvailable: rate.isDeskAvailable !== false,
        });
      }
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3500);
    } catch (err) {
      console.error('Error saving shipping settings:', err);
      alert('حدث خطأ أثناء حفظ أسعار وإعدادات التوصيل');
    } finally {
      setIsSaving(false);
    }
  };

  // Stats
  const deskAvailableCount = Object.values(rates).filter((r) => r.isDeskAvailable !== false).length;
  const deskUnavailableCount = ALGERIA_WILAYAS.length - deskAvailableCount;

  // Filtering
  const filteredWilayas = ALGERIA_WILAYAS.filter((w) => {
    const q = searchTerm.toLowerCase().trim();
    const rate = rates[w.code];
    const isDeskAvailable = rate?.isDeskAvailable !== false;

    // Filter by availability tab
    if (deskFilter === 'available' && !isDeskAvailable) return false;
    if (deskFilter === 'unavailable' && isDeskAvailable) return false;

    // Filter by search query
    if (!q) return true;
    return (
      w.name.includes(q) ||
      w.nameFr.toLowerCase().includes(q) ||
      w.code.includes(q)
    );
  });

  return (
    <div className="space-y-6">
      
      {/* Header & Save Action */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-base text-neutral-900">
            الشحن وتوفر التوصيل لجميع الـ 69 ولاية
          </h3>
          <p className="text-xs text-neutral-500 mt-0.5">
            التحكم في أسعار التوصيل وتحديد توفر التوصيل إلى المكتب (Stop Desk) لكل ولاية
          </p>
        </div>

        <div className="flex items-center gap-3">
          {savedSuccess && (
            <span className="text-xs text-emerald-700 font-bold flex items-center gap-1.5 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>تم حفظ التعديلات في قاعدة البيانات!</span>
            </span>
          )}

          <button
            onClick={handleSaveAll}
            disabled={isSaving}
            className="px-6 py-2.5 bg-neutral-950 hover:bg-black text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md disabled:opacity-50 transition-all active:scale-95"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'جاري الحفظ في Firestore...' : 'حفظ جميع التغييرات'}</span>
          </button>
        </div>
      </div>

      {/* Delivery Rules & Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* Rule 1: Home Delivery Card (Always Available) */}
        <div className="p-4 bg-white rounded-2xl border border-neutral-200 shadow-sm flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-neutral-100 text-neutral-800 flex items-center justify-center shrink-0">
            <Truck className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <h4 className="font-bold text-xs text-neutral-900">1. التوصيل إلى المنزل (Domicile)</h4>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <Check className="w-3 h-3" />
                متوفر دائماً (69 ولاية)
              </span>
            </div>
            <p className="text-[11px] text-neutral-500 leading-relaxed">
              متوفر دائماً في جميع الـ 69 ولاية الجزائرية ولا يمكن تعطيله، لضمان وصول الطلبات لأي عميل في أي ولاية.
            </p>
          </div>
        </div>

        {/* Rule 2: Stop Desk Delivery Card (Configurable) */}
        <div className="p-4 bg-white rounded-2xl border border-neutral-200 shadow-sm flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <h4 className="font-bold text-xs text-neutral-900">2. التوصيل إلى المكتب (Stop Desk)</h4>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  {deskAvailableCount} متوفر
                </span>
                <span className="text-[11px] font-bold text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded border border-neutral-200">
                  {deskUnavailableCount} معطل
                </span>
              </div>
            </div>
            <p className="text-[11px] text-neutral-500 leading-relaxed">
              يمكنك تفعيل أو تعطيل التوصيل إلى المكتب لكل ولاية حسب توفر مكاتب الشحن. يتم الحفظ مباشرة في قاعدة البيانات.
            </p>
            <div className="mt-2.5 pt-2 border-t border-neutral-100 flex items-center gap-2">
              <span className="text-[10px] font-bold text-neutral-400">إجراء سريع:</span>
              <button
                type="button"
                onClick={() => handleBulkSetDeskAvailable(true)}
                disabled={isSaving}
                className="text-[10px] font-bold text-neutral-700 hover:text-black bg-neutral-100 hover:bg-neutral-200 px-2.5 py-1 rounded transition-colors"
              >
                تفعيل المكتب للجميع (69)
              </button>
              <button
                type="button"
                onClick={() => handleBulkSetDeskAvailable(false)}
                disabled={isSaving}
                className="text-[10px] font-bold text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 px-2.5 py-1 rounded transition-colors"
              >
                تعطيل المكتب للجميع
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* Search and Filters Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-neutral-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="ابحث برقم الولاية (01-69) أو الاسم بالعربية أو الفرنسية..."
            className="w-full pr-10 pl-4 py-2.5 bg-white border border-neutral-200 rounded-xl text-xs font-medium focus:outline-none focus:border-black transition-colors"
          />
        </div>

        {/* Filter Pills - Single row, smooth touch horizontal scroll */}
        <div className="w-full sm:w-auto min-w-0 overflow-hidden self-start sm:self-auto">
          <div
            className="flex items-center gap-1.5 bg-neutral-100 p-1 rounded-xl overflow-x-auto flex-nowrap scroll-smooth touch-pan-x no-scrollbar select-none [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            style={{
              display: 'flex',
              flexWrap: 'nowrap',
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}
          >
            <button
              type="button"
              onClick={() => setDeskFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 flex-shrink-0 transition-all whitespace-nowrap ${
                deskFilter === 'all'
                  ? 'bg-white text-neutral-900 shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-900'
              }`}
              style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
            >
              جميع الولايات ({ALGERIA_WILAYAS.length})
            </button>
            <button
              type="button"
              onClick={() => setDeskFilter('available')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 flex-shrink-0 transition-all whitespace-nowrap ${
                deskFilter === 'available'
                  ? 'bg-white text-emerald-700 shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-900'
              }`}
              style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
            >
              المكتب متوفر ({deskAvailableCount})
            </button>
            <button
              type="button"
              onClick={() => setDeskFilter('unavailable')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 flex-shrink-0 transition-all whitespace-nowrap ${
                deskFilter === 'unavailable'
                  ? 'bg-white text-rose-700 shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-900'
              }`}
              style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
            >
              المكتب غير متوفر ({deskUnavailableCount})
            </button>
          </div>
        </div>
      </div>

      {/* Wilayas Table */}
      <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto scroll-smooth touch-pan-x [-webkit-overflow-scrolling:touch]">
          <table className="w-full min-w-[750px] text-right text-xs">
            <thead className="bg-neutral-50 text-neutral-600 uppercase border-b border-neutral-200">
              <tr>
                <th className="py-3 px-4 font-bold w-16">الرمز</th>
                <th className="py-3 px-4 font-bold">الولاية (بالعربية)</th>
                <th className="py-3 px-4 font-bold">الولاية (بالفرنسية)</th>
                <th className="py-3 px-4 font-bold">
                  <div className="flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5 text-neutral-500" />
                    <span>توصيل منزلي (دائماً متوفر)</span>
                  </div>
                </th>
                <th className="py-3 px-4 font-bold">
                  <div className="flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-neutral-500" />
                    <span>التوصيل إلى المكتب (Stop Desk)</span>
                  </div>
                </th>
                <th className="py-3 px-4 font-bold">المدة التقديرية</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filteredWilayas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-neutral-400">
                    لا توجد ولايات مطابقة لمعايير البحث الحالية
                  </td>
                </tr>
              ) : (
                filteredWilayas.map((w) => {
                  const rate = rates[w.code] || {
                    id: `wilaya-${w.code}`,
                    wilayaCode: w.code,
                    wilayaName: w.name,
                    wilayaNameFr: w.nameFr,
                    homePrice: w.defaultHomePrice,
                    deskPrice: w.defaultDeskPrice,
                    estimatedDays: w.estimatedDays,
                    isActive: true,
                    isDeskAvailable: true,
                  };
                  const isDeskAvailable = rate.isDeskAvailable !== false;
                  const isRecentlySaved = autoSavedWilaya === w.code;

                  return (
                    <tr
                      key={w.code}
                      className={`hover:bg-neutral-50/80 transition-colors ${
                        isRecentlySaved ? 'bg-emerald-50/40' : ''
                      }`}
                    >
                      {/* Code */}
                      <td className="py-3.5 px-4 font-mono font-bold text-neutral-950">
                        {w.code}
                      </td>

                      {/* Name Arabic */}
                      <td className="py-3.5 px-4 font-bold text-neutral-900">
                        {w.name}
                      </td>

                      {/* Name French */}
                      <td className="py-3.5 px-4 font-mono text-neutral-600" dir="ltr">
                        {w.nameFr}
                      </td>

                      {/* Home Delivery (Always available + Price) */}
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                            <Check className="w-2.5 h-2.5" />
                            متاح دائماً
                          </span>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              step="50"
                              value={rate.homePrice}
                              onChange={(e) =>
                                handlePriceChange(w.code, 'homePrice', Number(e.target.value))
                              }
                              className="w-20 px-2.5 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg text-xs font-mono font-bold text-neutral-950 focus:outline-none focus:border-black"
                            />
                            <span className="text-[11px] text-neutral-400">د.ج</span>
                          </div>
                        </div>
                      </td>

                      {/* Stop Desk Delivery (Toggle + Badge + Price) */}
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-3">
                          {/* Interactive Toggle Switch */}
                          <button
                            type="button"
                            onClick={() => handleToggleDeskAvailable(w.code)}
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                              isDeskAvailable ? 'bg-emerald-600' : 'bg-neutral-300'
                            }`}
                            title={isDeskAvailable ? 'انقر لتعطيل التوصيل إلى المكتب' : 'انقر لتفعيل التوصيل إلى المكتب'}
                          >
                            <span
                              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                isDeskAvailable ? '-translate-x-5' : 'translate-x-0'
                              }`}
                            />
                          </button>

                          {/* Clear Status Badge */}
                          <span
                            onClick={() => handleToggleDeskAvailable(w.code)}
                            className={`cursor-pointer inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors select-none ${
                              isDeskAvailable
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                            }`}
                          >
                            {isDeskAvailable ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-600" />
                                <span>متوفر ✓</span>
                              </>
                            ) : (
                              <>
                                <X className="w-3 h-3 text-rose-600" />
                                <span>غير متوفر ✕</span>
                              </>
                            )}
                          </span>

                          {/* Desk Price Input (Active or Muted) */}
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              step="50"
                              disabled={!isDeskAvailable}
                              value={rate.deskPrice}
                              onChange={(e) =>
                                handlePriceChange(w.code, 'deskPrice', Number(e.target.value))
                              }
                              className={`w-20 px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all focus:outline-none ${
                                isDeskAvailable
                                  ? 'bg-neutral-50 border border-neutral-200 text-neutral-950 focus:border-black'
                                  : 'bg-neutral-100 border border-neutral-200/60 text-neutral-400 cursor-not-allowed line-through'
                              }`}
                            />
                            <span className="text-[11px] text-neutral-400">د.ج</span>
                          </div>

                          {isRecentlySaved && (
                            <span className="text-[10px] text-emerald-600 font-bold animate-in fade-in">
                              تم الحفظ!
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Estimated Days */}
                      <td className="py-3.5 px-4 text-neutral-500 font-mono">
                        {rate.estimatedDays || w.estimatedDays}
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
