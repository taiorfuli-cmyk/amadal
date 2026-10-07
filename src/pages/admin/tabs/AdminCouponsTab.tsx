import React, { useState } from 'react';
import { Coupon } from '../../../types';
import { doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db, removeUndefinedFields } from '../../../firebase';
import {
  Plus,
  Trash2,
  Tag,
  Check,
  X,
  Calendar,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Percent,
  Edit2,
  Lock,
  Infinity as InfinityIcon
} from 'lucide-react';

interface AdminCouponsTabProps {
  coupons: Coupon[];
  onRefresh: () => void;
}

export const AdminCouponsTab: React.FC<AdminCouponsTabProps> = ({ coupons, onRefresh }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Partial<Coupon> | null>(null);
  const [isUnlimited, setIsUnlimited] = useState(false);
  const [usageLimitInput, setUsageLimitInput] = useState('10');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Delete Coupon Confirmation State
  const [couponToDelete, setCouponToDelete] = useState<Coupon | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => {
      setSuccessToast((curr) => (curr === msg ? null : curr));
    }, 4000);
  };

  const handleCreateNew = () => {
    setIsEditMode(false);
    setIsUnlimited(false);
    setUsageLimitInput('10');
    setSaveError(null);
    setEditingCoupon({
      code: '',
      discountType: 'percentage',
      discountValue: 10,
      minOrder: 0,
      usageLimit: 10,
      usageCount: 0,
      startDate: '',
      expiresAt: '',
      isActive: true,
    });
    setIsEditing(true);
  };

  const handleEdit = (coupon: Coupon) => {
    setIsEditMode(true);
    setSaveError(null);
    const unlimited = coupon.usageLimit === null || coupon.usageLimit === undefined;
    setIsUnlimited(unlimited);
    setUsageLimitInput(unlimited ? '' : String(coupon.usageLimit));

    setEditingCoupon({
      ...coupon,
      usageCount: typeof coupon.usageCount === 'number' ? coupon.usageCount : 0,
      minOrder: typeof coupon.minOrder === 'number' ? coupon.minOrder : 0,
      startDate: coupon.startDate || '',
      expiresAt: coupon.expiresAt || '',
      isActive: coupon.isActive ?? true,
    });
    setIsEditing(true);
  };

  const handleToggleActive = async (coupon: Coupon) => {
    try {
      const docId = coupon.code || coupon.id;
      await updateDoc(doc(db, 'coupons', docId), {
        isActive: !coupon.isActive,
      });
      onRefresh();
    } catch (e: any) {
      console.error('Error toggling coupon status:', e);
    }
  };

  const openDeleteModal = (coupon: Coupon) => {
    setCouponToDelete(coupon);
    setDeleteError(null);
  };

  const closeDeleteModal = () => {
    if (isDeleting) return;
    setCouponToDelete(null);
    setDeleteError(null);
  };

  const handleConfirmDelete = async () => {
    if (!couponToDelete) return;
    setIsDeleting(true);
    setDeleteError(null);

    const docId = couponToDelete.code || couponToDelete.id;
    const couponCode = couponToDelete.code;

    try {
      if (!docId) {
        throw new Error('كود الكوبون غير محدد.');
      }

      // 1. Delete primary document from Firestore
      await deleteDoc(doc(db, 'coupons', docId));

      // 2. If id is different from code, cleanup secondary document
      if (couponToDelete.id && couponToDelete.id !== docId) {
        try {
          await deleteDoc(doc(db, 'coupons', couponToDelete.id));
        } catch {
          // secondary delete cleanup ignored
        }
      }

      // 3. Close modal, notify user & trigger immediate refresh
      setCouponToDelete(null);
      setIsDeleting(false);
      showToast(`تم حذف كود الخصم "${couponCode}" بنجاح`);
      onRefresh();
    } catch (err: any) {
      console.error('[Coupon Delete Error]:', err?.code, err?.message, err);
      setIsDeleting(false);
      const detail = err?.message || err?.code || 'فشل الاتصال بقاعدة البيانات';
      setDeleteError(`حدث خطأ أثناء حذف الكوبون: ${detail}`);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCoupon || !editingCoupon.code) return;

    setSaveError(null);

    const code = editingCoupon.code.trim().toUpperCase();
    if (!code) {
      setSaveError('يرجى إدخال رمز الكوبون.');
      return;
    }

    const discountVal = Number(editingCoupon.discountValue);
    if (isNaN(discountVal) || discountVal <= 0) {
      setSaveError('يرجى إدخال قيمة خصم صالحة وأكبر من الصفر.');
      return;
    }

    // Validate usage limit
    let finalUsageLimit: number | null = null;
    if (!isUnlimited) {
      const parsedLimit = parseInt(usageLimitInput, 10);
      if (isNaN(parsedLimit) || parsedLimit <= 0) {
        setSaveError('يرجى إدخال عدد مرات استخدام صحيح وموجب (أكبر من 0) أو اختيار "استخدام غير محدود".');
        return;
      }
      finalUsageLimit = parsedLimit;
    }

    setIsSaving(true);

    try {
      const docId = isEditMode ? (editingCoupon.id || code) : code;

      // When editing: preserve existing usageCount!
      // When creating new: start at 0
      const currentUsageCount = isEditMode
        ? (typeof editingCoupon.usageCount === 'number' ? editingCoupon.usageCount : 0)
        : 0;

      const payload: Coupon = {
        id: docId,
        code: code,
        discountType: editingCoupon.discountType || 'percentage',
        discountValue: discountVal,
        minOrder: Math.max(0, Number(editingCoupon.minOrder) || 0),
        usageLimit: finalUsageLimit,
        usageCount: currentUsageCount, // Strictly preserved
        startDate: editingCoupon.startDate || '',
        expiresAt: editingCoupon.expiresAt || '',
        isActive: editingCoupon.isActive ?? true,
      };

      await setDoc(doc(db, 'coupons', docId), removeUndefinedFields(payload), { merge: isEditMode });

      setIsEditing(false);
      setEditingCoupon(null);
      showToast(isEditMode ? `تم تعديل كود الخصم "${code}" بنجاح` : `تم إنشاء كود الخصم "${code}" بنجاح`);
      onRefresh();
    } catch (err: any) {
      console.error('[Coupon Save Error]:', err?.code, err?.message, err);
      const detail = err?.message || err?.code || 'فشل حفظ الكوبون في قاعدة البيانات';
      setSaveError(`حدث خطأ أثناء الحفظ: ${detail}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed bottom-6 left-6 z-[120] bg-neutral-900 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-200 border border-neutral-800">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-xs font-bold">{successToast}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-base text-neutral-900">إدارة الكوبونات ورموز الخصم</h3>
          <p className="text-xs text-neutral-500">أنشئ وعدّل أكواد خصم ترويجية للعملاء مع تحديد عدد مرات الاستخدام والصلاحية</p>
        </div>

        <button
          onClick={handleCreateNew}
          className="px-4 py-2.5 bg-neutral-950 hover:bg-black text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>إنشاء كود خصم</span>
        </button>
      </div>

      {/* Coupons Table */}
      <div className="bg-white rounded-2xl border border-neutral-150 overflow-hidden shadow-sm">
        <div className="overflow-x-auto scroll-smooth touch-pan-x [-webkit-overflow-scrolling:touch]">
          <table className="w-full min-w-[650px] text-right text-xs">
            <thead className="bg-neutral-50 text-neutral-500 uppercase border-b border-neutral-150">
              <tr>
                <th className="py-3.5 px-4 font-bold">كود الخصم</th>
                <th className="py-3.5 px-4 font-bold">قيمة الخصم</th>
                <th className="py-3.5 px-4 font-bold">الحد الأدنى للطلب</th>
                <th className="py-3.5 px-4 font-bold">مرات الاستخدام</th>
                <th className="py-3.5 px-4 font-bold">تاريخ الانتهاء</th>
                <th className="py-3.5 px-4 font-bold">الحالة</th>
                <th className="py-3.5 px-4 font-bold text-left">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {coupons.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-neutral-400">
                    <Tag className="w-10 h-10 mx-auto mb-2 text-neutral-300" />
                    <p className="font-bold text-sm text-neutral-600">لا توجد كوبونات خصم حالياً</p>
                    <p className="text-xs text-neutral-400 mt-0.5">قائمة الكوبونات فارغة. يمكنك إنشاء كود خصم جديد في أي وقت.</p>
                  </td>
                </tr>
              ) : (
                coupons.map((c) => {
                  const usageCount = typeof c.usageCount === 'number' ? c.usageCount : 0;
                  const hasLimit = c.usageLimit !== null && c.usageLimit !== undefined && typeof c.usageLimit === 'number';
                  const isExhausted = hasLimit && usageCount >= (c.usageLimit as number);

                  return (
                    <tr key={c.id || c.code} className="hover:bg-neutral-50/70 transition-colors">
                      <td className="py-3 px-4 font-mono font-black text-sm text-neutral-950">
                        {c.code}
                      </td>
                      <td className="py-3 px-4 font-bold text-neutral-900">
                        {c.discountType === 'percentage'
                          ? `${c.discountValue}%`
                          : `${c.discountValue.toLocaleString()} د.ج`}
                      </td>
                      <td className="py-3 px-4 font-mono text-neutral-600">
                        {c.minOrder ? `${c.minOrder.toLocaleString()} د.ج` : 'لا يوجد'}
                      </td>
                      <td className="py-3 px-4">
                        {hasLimit ? (
                          <div className="flex items-center gap-1.5">
                            <span className={`font-mono font-bold ${isExhausted ? 'text-red-600' : 'text-neutral-900'}`}>
                              {usageCount} / {c.usageLimit}
                            </span>
                            {isExhausted && (
                              <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[9px] font-bold">
                                مستنفد
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 font-mono text-neutral-700">
                            <span className="font-bold">{usageCount}</span>
                            <span className="text-neutral-400">/</span>
                            <span className="text-neutral-500 text-[11px]">غير محدود</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-neutral-500">
                        {c.expiresAt || 'دائم'}
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => handleToggleActive(c)}
                          className={`px-2.5 py-0.5 rounded-full font-bold text-[10px] transition-colors ${
                            c.isActive
                              ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                              : 'bg-neutral-200 text-neutral-600 hover:bg-neutral-300'
                          }`}
                        >
                          {c.isActive ? 'مفعل' : 'معطل'}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-left">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleEdit(c)}
                            className="p-1.5 text-neutral-600 hover:text-black rounded-lg hover:bg-neutral-100 transition-colors"
                            title="تعديل الكوبون"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openDeleteModal(c)}
                            className="p-1.5 text-neutral-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                            title="حذف الكوبون"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Coupon Confirmation Dialog */}
      {couponToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Overlay */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={closeDeleteModal}
          />

          {/* Dialog Container */}
          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 sm:p-7 overflow-hidden z-10 animate-in fade-in zoom-in-95">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-neutral-900">
                  هل أنت متأكد من حذف هذا الكوبون؟
                </h3>
                <p className="text-xs text-neutral-500 mt-1">
                  سيتم حذف كود الخصم نهائياً من قاعدة بيانات Firestore ولن يتمكن العملاء من استخدامه عند الدفع.
                </p>
              </div>
            </div>

            {/* Target Coupon Summary Box */}
            <div className="p-3.5 bg-neutral-50 rounded-2xl border border-neutral-100 flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-neutral-900 text-white flex items-center justify-center shrink-0">
                  <Tag className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-mono font-black text-sm text-neutral-950 tracking-wider">
                    {couponToDelete.code}
                  </h4>
                  <p className="text-[11px] text-neutral-500">
                    الخصم: {couponToDelete.discountType === 'percentage' ? `${couponToDelete.discountValue}%` : `${couponToDelete.discountValue.toLocaleString()} د.ج`}
                  </p>
                </div>
              </div>
              <div className="text-left font-mono text-[11px] text-neutral-500">
                <span>{couponToDelete.expiresAt ? `ينتهي: ${couponToDelete.expiresAt}` : 'دائم'}</span>
              </div>
            </div>

            {/* Error Message */}
            {deleteError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{deleteError}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={closeDeleteModal}
                disabled={isDeleting}
                className="px-5 py-2.5 rounded-xl border border-neutral-200 text-xs font-bold text-neutral-700 hover:bg-neutral-50 transition-colors disabled:opacity-50"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md transition-colors disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جاري الحذف...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>نعم، حذف الكوبون</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit / Create Modal */}
      {isEditing && editingCoupon && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => {
                if (!isSaving) setIsEditing(false);
              }}
            />

            <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl p-6 sm:p-8 overflow-hidden my-8 z-10 animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between pb-4 border-b border-neutral-100 mb-6">
                <div>
                  <h3 className="font-bold text-base text-neutral-900">
                    {isEditMode ? 'تعديل كود الخصم' : 'إنشاء كود خصم جديد'}
                  </h3>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {isEditMode ? `تعديل شروط وإعدادات الكوبون (${editingCoupon.code})` : 'أنشئ كود خصم ترويجي جديد لعملائك'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  disabled={isSaving}
                  className="p-1.5 text-neutral-400 hover:text-black rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {saveError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{saveError}</span>
                </div>
              )}

              <form onSubmit={handleSave} className="space-y-4 text-xs">
                {/* Coupon Code */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-bold text-neutral-900">رمز الكوبون (Code) *</label>
                    {isEditMode && (
                      <span className="text-[10px] text-neutral-400 flex items-center gap-1 font-medium">
                        <Lock className="w-3 h-3" />
                        ثابت للحفاظ على معرف المستند
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    required
                    disabled={isEditMode}
                    value={editingCoupon.code || ''}
                    onChange={(e) => setEditingCoupon({ ...editingCoupon, code: e.target.value.toUpperCase() })}
                    placeholder="مثال: SUMMER25"
                    className={`w-full px-3.5 py-2.5 rounded-xl font-mono uppercase font-bold text-sm border transition-colors ${
                      isEditMode
                        ? 'bg-neutral-100 border-neutral-200 text-neutral-600 cursor-not-allowed'
                        : 'bg-neutral-50 border-neutral-200 focus:outline-none focus:border-black text-neutral-950'
                    }`}
                  />
                </div>

                {/* Discount Type & Value */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-neutral-900 mb-1">نوع الخصم</label>
                    <select
                      value={editingCoupon.discountType}
                      onChange={(e) => setEditingCoupon({ ...editingCoupon, discountType: e.target.value as any })}
                      className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl font-medium focus:outline-none focus:border-black"
                    >
                      <option value="percentage">نسبة مئوية (%)</option>
                      <option value="fixed">مبلغ ثابت (د.ج)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-neutral-900 mb-1">القيمة *</label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={editingCoupon.discountValue ?? ''}
                      onChange={(e) => setEditingCoupon({ ...editingCoupon, discountValue: Number(e.target.value) })}
                      className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl font-mono font-bold focus:outline-none focus:border-black"
                    />
                  </div>
                </div>

                {/* Min Order */}
                <div>
                  <label className="block font-bold text-neutral-900 mb-1">الحد الأدنى لقيمة الطلب (د.ج)</label>
                  <input
                    type="number"
                    min="0"
                    value={editingCoupon.minOrder ?? 0}
                    onChange={(e) => setEditingCoupon({ ...editingCoupon, minOrder: Number(e.target.value) })}
                    placeholder="0 في حال عدم وجود حد أدنى"
                    className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl font-mono focus:outline-none focus:border-black"
                  />
                </div>

                {/* Usage Limit Section */}
                <div className="p-3.5 bg-neutral-50 rounded-2xl border border-neutral-200/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-neutral-900 block text-xs">حد عدد مرات الاستخدام</span>
                      <span className="text-[11px] text-neutral-500">حدد إجمالي مرات الاستخدام المسموح بها في المتجر</span>
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={isUnlimited}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setIsUnlimited(checked);
                          if (checked) {
                            setUsageLimitInput('');
                          } else {
                            setUsageLimitInput('10');
                          }
                        }}
                        className="w-4 h-4 rounded text-black focus:ring-black accent-black cursor-pointer"
                      />
                      <span className="text-xs font-bold text-neutral-800 flex items-center gap-1">
                        <InfinityIcon className="w-3.5 h-3.5" />
                        استخدام غير محدود
                      </span>
                    </label>
                  </div>

                  {!isUnlimited ? (
                    <div>
                      <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                        عدد مرات الاستخدام المسموح بها *
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        required={!isUnlimited}
                        value={usageLimitInput}
                        onChange={(e) => setUsageLimitInput(e.target.value)}
                        placeholder="مثال: 10 أو 50"
                        className="w-full px-3.5 py-2 bg-white border border-neutral-200 rounded-xl font-mono font-bold focus:outline-none focus:border-black"
                      />
                      <p className="text-[10px] text-neutral-400 mt-1">
                        سيتم تعطيل الكوبون تلقائياً بعد استهلاكه {usageLimitInput || '0'} مرة.
                      </p>
                    </div>
                  ) : (
                    <div className="py-2 px-3 bg-neutral-100 rounded-xl text-[11px] text-neutral-600 font-medium flex items-center gap-2">
                      <InfinityIcon className="w-4 h-4 text-neutral-500" />
                      <span>الكوبون متاح للاستخدام لعدد غير محدود من المرات بدون سقف.</span>
                    </div>
                  )}

                  {/* Informative Current Usage Indicator in Edit Mode */}
                  {isEditMode && (
                    <div className="pt-2 border-t border-neutral-200/60 flex items-center justify-between text-[11px]">
                      <span className="text-neutral-500">
                        مرات الاستخدام الحالية: <strong className="font-mono text-neutral-900">{editingCoupon.usageCount ?? 0}</strong> مرة
                      </span>
                      <span className="text-neutral-400 text-[10px]">
                        (تعديل الحد لا يصفّر الاستخدامات السابقة)
                      </span>
                    </div>
                  )}
                </div>

                {/* Dates: Start Date & Expiration Date */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-neutral-900 mb-1">تاريخ البدء (اختياري)</label>
                    <input
                      type="date"
                      value={editingCoupon.startDate || ''}
                      onChange={(e) => setEditingCoupon({ ...editingCoupon, startDate: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl font-mono focus:outline-none focus:border-black"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-neutral-900 mb-1">تاريخ الانتهاء (اختياري)</label>
                    <input
                      type="date"
                      value={editingCoupon.expiresAt || ''}
                      onChange={(e) => setEditingCoupon({ ...editingCoupon, expiresAt: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl font-mono focus:outline-none focus:border-black"
                    />
                  </div>
                </div>

                {/* Active Status */}
                <div className="flex items-center justify-between p-3 bg-neutral-50 border border-neutral-200 rounded-xl">
                  <div>
                    <span className="font-bold text-neutral-900 block text-xs">حالة الكوبون</span>
                    <span className="text-[11px] text-neutral-500">تمكين أو تعطيل إمكانية تطبيق الكوبون عند الدفع</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingCoupon({ ...editingCoupon, isActive: !editingCoupon.isActive })}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                      editingCoupon.isActive
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-neutral-200 text-neutral-600'
                    }`}
                  >
                    {editingCoupon.isActive ? 'مفعل ومتاح' : 'معطل مؤقتاً'}
                  </button>
                </div>

                {/* Action Buttons */}
                <div className="pt-4 border-t border-neutral-100 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    disabled={isSaving}
                    className="px-4 py-2 font-bold text-neutral-600 hover:text-black transition-colors disabled:opacity-50"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-5 py-2.5 bg-neutral-950 text-white rounded-xl font-bold shadow-md hover:bg-black transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>جاري الحفظ...</span>
                      </>
                    ) : (
                      <span>{isEditMode ? 'حفظ التعديلات' : 'حفظ الكوبون'}</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
