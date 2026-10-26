import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  KeyRound,
  User,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Clock,
  ShieldAlert,
  Save,
  RefreshCw,
  Hash
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';

export const AdminAccountTab: React.FC = () => {
  const { adminUsername, updateCredentials } = useAuth();

  const [currentUsername, setCurrentUsername] = useState<string>(adminUsername || 'admin');
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [isFetchingStatus, setIsFetchingStatus] = useState<boolean>(true);

  // Form Fields
  const [currentPassword, setCurrentPassword] = useState('');
  const [newUsername, setNewUsername] = useState(adminUsername || 'admin');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Password Visibility
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // State Management
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch current admin profile info
  const fetchStatus = async () => {
    setIsFetchingStatus(true);
    try {
      const res = await fetch('/api/admin/status');
      if (res.ok) {
        const data = await res.json();
        if (data.username) {
          setCurrentUsername(data.username);
          setNewUsername(data.username);
        }
        if (data.updatedAt) {
          setLastUpdatedAt(data.updatedAt);
        }
      }
    } catch (e) {
      console.warn('Failed to fetch admin status:', e);
    } finally {
      setIsFetchingStatus(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  // Password strength calculation
  const getPasswordStrength = (pass: string) => {
    if (!pass) return { score: 0, label: '', color: '' };
    let score = 0;
    if (pass.length >= 6) score++;
    if (pass.length >= 10) score++;
    if (/[A-Z]/.test(pass) || /[a-z]/.test(pass)) score++;
    if (/[0-9]/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;

    if (score <= 2) return { score: 1, label: 'ضعيفة', color: 'bg-red-500 text-red-500' };
    if (score <= 4) return { score: 2, label: 'متوسطة إلى جيدة', color: 'bg-amber-500 text-amber-500' };
    return { score: 3, label: 'قوية وممتازة', color: 'bg-emerald-500 text-emerald-500' };
  };

  const strength = getPasswordStrength(newPassword);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage(null);
    setErrorMessage(null);

    if (!currentPassword.trim()) {
      setErrorMessage('يرجى إدخال كلمة المرور الحالية لتأكيد هويتك.');
      return;
    }

    if (!newUsername.trim()) {
      setErrorMessage('يرجى تحديد اسم مستخدم صالح.');
      return;
    }

    if (newUsername.trim().length < 3) {
      setErrorMessage('يجب ألا يقل اسم المستخدم عن 3 أحرف.');
      return;
    }

    if (newPassword) {
      if (newPassword.length < 6) {
        setErrorMessage('يجب ألا تقل كلمة المرور الجديدة عن 6 خانات.');
        return;
      }
      if (newPassword !== confirmPassword) {
        setErrorMessage('كلمة المرور الجديدة غير متطابقة مع خانة التأكيد.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const result = await updateCredentials(
        currentPassword,
        newUsername.trim() !== currentUsername ? newUsername.trim() : undefined,
        newPassword ? newPassword : undefined
      );

      if (result.success) {
        setSuccessMessage('تم تحديث بيانات الدخول وحفظها بنجاح مع تشفير PBKDF2 الآمن.');
        setCurrentUsername(newUsername.trim());
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        await fetchStatus();
      } else {
        setErrorMessage(result.error || 'تعذر تحديث البيانات. يرجى التأكد من كلمة المرور الحالية.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'حدث خطأ غير متوقع أثناء معالجة الطلب.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return 'لم يتم التحديث مسبقاً (البيانات الافتراضية)';
    try {
      return new Date(isoString).toLocaleString('ar-DZ', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Header Banner */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden shadow-xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-neutral-800 border border-neutral-700 text-xs font-mono text-emerald-400">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>SECURITY & CREDENTIALS</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              إدارة حساب المشرف والأمان
            </h1>
            <p className="text-neutral-400 text-xs sm:text-sm max-w-xl">
              يمكنك من هنا تعديل اسم المستخدم وكلمة المرور الخاصة بلوحة التحكم. يتم حفظ وتشفير كلمات المرور في قاعدة البيانات وفق خوارزمية PBKDF2 مع مفتاح تشفير ملحي (Salt) فريد لمنع أي محاولات اختراق.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row md:flex-col gap-2 shrink-0">
            <div className="bg-neutral-800/80 border border-neutral-700/80 rounded-2xl p-4">
              <div className="text-[11px] text-neutral-400 flex items-center gap-1.5 mb-1 font-sans">
                <User className="w-3.5 h-3.5 text-neutral-300" />
                <span>المشرف الحالي</span>
              </div>
              <div className="text-sm font-bold font-mono text-white tracking-wide">
                @{currentUsername}
              </div>
            </div>

            <div className="bg-neutral-800/80 border border-neutral-700/80 rounded-2xl p-4">
              <div className="text-[11px] text-neutral-400 flex items-center gap-1.5 mb-1 font-sans">
                <Clock className="w-3.5 h-3.5 text-neutral-300" />
                <span>آخر تحديث للأمان</span>
              </div>
              <div className="text-xs font-medium text-neutral-200">
                {isFetchingStatus ? 'جاري الفحص...' : formatDate(lastUpdatedAt)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Security notice if still default */}
      {currentUsername === 'admin' && !lastUpdatedAt && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 shrink-0 text-amber-500 mt-0.5" />
          <div className="text-xs space-y-1">
            <div className="font-bold">تنبيه أمان للمشرف</div>
            <p className="text-neutral-700 dark:text-amber-200/90 leading-relaxed">
              المتجر يستخدم حالياً بيانات الدخول الافتراضية الأولية (<code className="font-mono bg-black/10 dark:bg-black/30 px-1 py-0.5 rounded">admin</code> / <code className="font-mono bg-black/10 dark:bg-black/30 px-1 py-0.5 rounded">admin123</code>). يُنصح بشدة بتغيير اسم المستخدم وتعيين كلمة مرور مخصصة لحماية متجرك.
            </p>
          </div>
        </div>
      )}

      {/* Notification Messages */}
      {successMessage && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 flex items-center gap-3 animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-500" />
          <span className="text-xs sm:text-sm font-semibold">{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-800 dark:text-red-300 flex items-center gap-3 animate-in fade-in">
          <AlertCircle className="w-5 h-5 shrink-0 text-red-500" />
          <span className="text-xs sm:text-sm font-semibold">{errorMessage}</span>
        </div>
      )}

      {/* Update Credentials Form */}
      <div className="bg-white rounded-3xl border border-neutral-200 p-6 sm:p-8 shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-neutral-100">
            <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center text-neutral-900">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-neutral-950">تحديث بيانات الحساب وكلمة المرور</h2>
              <p className="text-xs text-neutral-500">
                يتطلب أي تعديل تأكيد كلمة المرور الحالية لحماية الحساب.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* New Username Field */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-neutral-800">
                اسم المستخدم (Username)
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-neutral-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="مثال: amadal_manager"
                  dir="ltr"
                  required
                  className="w-full pr-10 pl-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-mono focus:bg-white focus:border-black focus:ring-1 focus:ring-black outline-none transition-all"
                />
              </div>
              <p className="text-[11px] text-neutral-500">
                اسم المستخدم المستخدم لتسجيل الدخول إلى لوحة التحكم.
              </p>
            </div>

            {/* Current Password Field */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-neutral-800">
                كلمة المرور الحالية <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-neutral-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="أدخل كلمة المرور الحالية للتأكيد"
                  dir="ltr"
                  required
                  className="w-full pr-10 pl-11 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-mono focus:bg-white focus:border-black focus:ring-1 focus:ring-black outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute inset-y-0 left-0 pl-3 flex items-center text-neutral-400 hover:text-neutral-700"
                >
                  {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-neutral-500">
                مطلوبة للتحقق قبل تطبيق أي تعديلات.
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-neutral-100">
            <h3 className="text-xs font-bold text-neutral-900 mb-1">
              تعيين كلمة مرور جديدة (اختياري)
            </h3>
            <p className="text-[11px] text-neutral-500 mb-4">
              اترك هذه الحقول فارغة إذا كنت ترغب فقط في تعديل اسم المستخدم دون تغيير كلمة المرور.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* New Password */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-neutral-800">
                  كلمة المرور الجديدة
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-neutral-400">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="6 أحرف أو أرقام على الأقل"
                    dir="ltr"
                    className="w-full pr-10 pl-11 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-mono focus:bg-white focus:border-black focus:ring-1 focus:ring-black outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute inset-y-0 left-0 pl-3 flex items-center text-neutral-400 hover:text-neutral-700"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {newPassword && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-neutral-500">قوة كلمة المرور:</span>
                      <span className={`font-bold ${strength.color.split(' ')[1]}`}>
                        {strength.label}
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-neutral-100 rounded-full overflow-hidden flex gap-1">
                      <div
                        className={`h-full transition-all ${
                          strength.score >= 1 ? 'bg-red-500 w-1/3' : 'w-0'
                        }`}
                      />
                      <div
                        className={`h-full transition-all ${
                          strength.score >= 2 ? 'bg-amber-500 w-1/3' : 'w-0'
                        }`}
                      />
                      <div
                        className={`h-full transition-all ${
                          strength.score >= 3 ? 'bg-emerald-500 w-1/3' : 'w-0'
                        }`}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm New Password */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-neutral-800">
                  تأكيد كلمة المرور الجديدة
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-neutral-400">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="أعد إدخال كلمة المرور الجديدة"
                    dir="ltr"
                    className="w-full pr-10 pl-11 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-mono focus:bg-white focus:border-black focus:ring-1 focus:ring-black outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute inset-y-0 left-0 pl-3 flex items-center text-neutral-400 hover:text-neutral-700"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {confirmPassword && newPassword !== confirmPassword && (
                  <p className="text-[11px] text-red-500 font-medium">
                    كلمات المرور غير متطابقة!
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Cryptography Info Card */}
          <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200 flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-neutral-200 text-neutral-700 flex items-center justify-center shrink-0 mt-0.5">
              <Hash className="w-4 h-4" />
            </div>
            <div className="text-xs text-neutral-600 space-y-1">
              <span className="font-bold text-neutral-900 block">
                تأمين التشفير السحابي (Cryptographic Security Architecture):
              </span>
              <p className="leading-relaxed">
                يتم تشفير كلمة المرور عبر 10,000 جولة من خوارزمية PBKDF2-HMAC-SHA512 مدعمة بملح عشوائي 128-بت (Cryptographic Salt). لا يتم حفظ كلمات المرور بنص صريح أبداً في أي مكان داخل النظام.
              </p>
            </div>
          </div>

          {/* Submit Actions */}
          <div className="pt-4 border-t border-neutral-100 flex items-center justify-end gap-3">
            <button
              type="submit"
              disabled={isSubmitting}
              className="py-3 px-6 bg-neutral-950 hover:bg-black text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>جاري تشفير وحفظ البيانات...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>حفظ وتحديث بيانات الدخول</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
