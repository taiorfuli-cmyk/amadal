import React, { useState, useEffect } from 'react';
import {
  Truck,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Send,
  ExternalLink,
  Copy,
  Check,
  ShieldCheck,
  Globe,
  Key,
  Clock,
  Search,
  Filter,
  Eye
} from 'lucide-react';
import { Order } from '../../../types';
import {
  getAndersonSettings,
  saveAndersonSettings,
  testAndersonConnection,
  sendOrderToAnderson,
  retryAllFailedOrders,
  AndersonApiSettingsResponse
} from '../../../services/andersonService';

interface AdminAndersonTabProps {
  orders: Order[];
  onRefreshOrders: () => void;
  onViewOrder: (order: Order) => void;
}

export const AdminAndersonTab: React.FC<AdminAndersonTabProps> = ({
  orders,
  onRefreshOrders,
  onViewOrder,
}) => {
  // Settings state
  const [enabled, setEnabled] = useState(true);
  const [autoSendOrders, setAutoSendOrders] = useState(true);
  const [apiToken, setApiToken] = useState('');
  const [apiBaseUrl, setApiBaseUrl] = useState('https://anderson.ecotrack.dz/');
  const [hasStoredToken, setHasStoredToken] = useState(false);
  const [maskedToken, setMaskedToken] = useState('');
  const [showToken, setShowToken] = useState(false);

  // Status & testing states
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success?: boolean;
    message?: string;
    error?: string;
  } | null>(null);

  // Manual retry states
  const [retryingOrderId, setRetryingOrderId] = useState<string | null>(null);
  const [isRetryingAll, setIsRetryingAll] = useState(false);
  const [batchActionMessage, setBatchActionMessage] = useState<string | null>(null);
  const [copiedTracking, setCopiedTracking] = useState<string | null>(null);

  // Search & filter
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'sent' | 'failed' | 'pending' | 'sending'>('all');

  // Load Anderson settings from server
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setIsLoadingSettings(true);
    try {
      const res = await getAndersonSettings();
      if (res && res.settings) {
        setEnabled(res.settings.enabled);
        setAutoSendOrders(res.settings.autoSendOrders);
        setApiBaseUrl(res.settings.apiBaseUrl || 'https://anderson.ecotrack.dz/');
        setHasStoredToken(res.settings.hasToken);
        setMaskedToken(res.settings.maskedToken || '');
        if (res.settings.lastTestStatus && res.settings.lastTestStatus !== 'untested') {
          setTestResult({
            success: res.settings.lastTestStatus === 'success',
            message: res.settings.lastTestMessage,
          });
        }
      }
    } catch (err: any) {
      console.warn('Error loading Anderson settings:', err);
    } finally {
      setIsLoadingSettings(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(null);
    setSaveError(null);

    try {
      const payload: any = {
        enabled,
        autoSendOrders,
        apiBaseUrl,
      };
      // Only send token if user typed a new token (not empty and not masked)
      if (apiToken.trim() && !apiToken.includes('••••')) {
        payload.apiToken = apiToken.trim();
      }

      const res = await saveAndersonSettings(payload);
      setSaveSuccess(res.message || 'تم حفظ إعدادات التكامل بنجاح');
      setHasStoredToken(res.settings?.hasToken ?? true);
      setMaskedToken(res.settings?.maskedToken || '');
      setApiToken(''); // Clear input for security

      setTimeout(() => setSaveSuccess(null), 4000);
    } catch (err: any) {
      setSaveError(err.message || 'حدث خطأ أثناء حفظ الإعدادات');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      const tokenToTest = apiToken.trim() && !apiToken.includes('••••') ? apiToken.trim() : undefined;
      const res = await testAndersonConnection(tokenToTest, apiBaseUrl);

      if (res.success) {
        setTestResult({
          success: true,
          message: res.message || 'تم الاتصال بحساب Anderson Delivery بنجاح والتحقق من صلاحية الـ API Token!',
        });
      } else {
        setTestResult({
          success: false,
          error: res.error || 'تعذر الاتصال بخادم Anderson Delivery. يرجى مراجعة الـ Token أو الرابط.',
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        error: err.message || 'خطأ غير متوقع أثناء فحص الاتصال',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleRetryOrder = async (orderId: string) => {
    setRetryingOrderId(orderId);
    try {
      const res = await sendOrderToAnderson(orderId, true);
      if (res.success) {
        setBatchActionMessage(res.message || `تم إرسال الطلب بنجاح (رقم التتبع: ${res.trackingNumber})`);
      } else {
        setBatchActionMessage(`فشل إرسال الطلب: ${res.error}`);
      }
      onRefreshOrders();
    } catch (err: any) {
      setBatchActionMessage(`خطأ: ${err.message}`);
    } finally {
      setRetryingOrderId(null);
      setTimeout(() => setBatchActionMessage(null), 5000);
    }
  };

  const handleRetryAllFailed = async () => {
    setIsRetryingAll(true);
    setBatchActionMessage(null);
    try {
      const res = await retryAllFailedOrders();
      setBatchActionMessage(res.message || `تم بدء إعادة إرسال ${res.count || 0} طلب.`);
      onRefreshOrders();
    } catch (err: any) {
      setBatchActionMessage(`خطأ أثناء محاولة الإرسال الجماعي: ${err.message}`);
    } finally {
      setIsRetryingAll(false);
      setTimeout(() => setBatchActionMessage(null), 5000);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTracking(text);
    setTimeout(() => setCopiedTracking(null), 2000);
  };

  // Metrics
  const sentOrders = orders.filter((o) => o.andersonStatus === 'sent');
  const failedOrders = orders.filter((o) => o.andersonStatus === 'failed');
  const sendingOrders = orders.filter((o) => o.andersonStatus === 'sending');
  const pendingOrders = orders.filter(
    (o) => !o.andersonStatus || o.andersonStatus === 'pending'
  );

  // Filtered orders list
  const filteredOrders = orders.filter((o) => {
    const status = o.andersonStatus || 'pending';
    const matchStatus = statusFilter === 'all' || status === statusFilter;

    const q = searchTerm.toLowerCase();
    const matchSearch =
      !q ||
      o.orderNumber.toLowerCase().includes(q) ||
      o.customerName.toLowerCase().includes(q) ||
      o.phone.includes(q) ||
      (o.andersonTrackingNumber && o.andersonTrackingNumber.toLowerCase().includes(q));

    return matchStatus && matchSearch;
  });

  return (
    <div className="space-y-8">
      {/* Top Banner & Header */}
      <div className="bg-white rounded-2xl border border-neutral-150 p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-neutral-100 pb-6">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-neutral-900 text-white flex items-center justify-center shadow-sm">
              <Truck className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <h2 className="text-lg font-black text-neutral-950 flex items-center gap-2">
                <span>تكامل شركة التوصيل Anderson Delivery</span>
                <span className="text-[11px] font-mono font-bold bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded">
                  EcoTrack API
                </span>
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                الربط التلقائي عبر API لإرسال الطلبات مباشرة، توليد أرقام التتبع، وإدارة التوصيل للمنزل والمكتب.
              </p>
            </div>
          </div>

          {/* Quick status pill */}
          <div className="flex items-center gap-2">
            {hasStoredToken && testResult?.success ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>متصل ونشط بحساب Anderson</span>
              </span>
            ) : hasStoredToken ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                <ShieldCheck className="w-4 h-4 text-blue-600" />
                <span>الرمز محفوظ (بانتظار الاختبار)</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                <span>غير متصل — يرجى إدخال الـ Token</span>
              </span>
            )}
          </div>
        </div>

        {/* Global Action Message Banner */}
        {batchActionMessage && (
          <div className="mt-4 p-3.5 bg-neutral-900 text-white rounded-xl text-xs flex items-center justify-between animate-in fade-in">
            <span>{batchActionMessage}</span>
            <button
              onClick={() => setBatchActionMessage(null)}
              className="text-neutral-400 hover:text-white text-xs font-bold"
            >
              إغلاق
            </button>
          </div>
        )}

        {/* Settings Form */}
        <form onSubmit={handleSaveSettings} className="mt-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* API Token Input */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-neutral-800 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-neutral-500" />
                  <span>Anderson API Token (Bearer Token)</span>
                </span>
                {hasStoredToken && (
                  <span className="text-[11px] font-mono text-emerald-600 font-bold">
                    ✓ محفوظ في الخادم: {maskedToken}
                  </span>
                )}
              </label>
              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  placeholder={hasStoredToken ? 'اتركه فارغاً للاحتفاظ بالرمز المحفوظ، أو أدخل رمزاً جديداً' : 'الصق رمز API Token الخاص بك من Anderson'}
                  className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-mono focus:outline-none focus:border-black focus:bg-white transition-all text-neutral-900"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-neutral-400 hover:text-neutral-700 font-bold"
                >
                  {showToken ? 'إخفاء' : 'إظهار'}
                </button>
              </div>
              <p className="text-[11px] text-neutral-400 leading-relaxed">
                يتم حفظ الـ API Token بأمان في الخادم ولا يظهر لزوار المتجر. يمكنك الحصول على الرمز من لوحة تحكم Anderson Delivery / EcoTrack.
              </p>
            </div>

            {/* API Base URL */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-neutral-500" />
                <span>رابط خادم Anderson Delivery API</span>
              </label>
              <input
                type="text"
                value={apiBaseUrl}
                onChange={(e) => setApiBaseUrl(e.target.value)}
                placeholder="https://anderson.ecotrack.dz/"
                className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-mono focus:outline-none focus:border-black focus:bg-white transition-all text-neutral-900"
              />
              <p className="text-[11px] text-neutral-400 leading-relaxed">
                الافتراضي هو <code>https://anderson.ecotrack.dz/</code>. يمكنك تعديله إذا كان لديك نطاق مخصص.
              </p>
            </div>
          </div>

          {/* Toggles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-neutral-100">
            <div className="flex items-center justify-between p-3.5 bg-neutral-50 rounded-xl border border-neutral-150">
              <div>
                <span className="text-xs font-bold text-neutral-900 block">تفعيل التكامل مع Anderson</span>
                <span className="text-[11px] text-neutral-500">تمكين المعالجة وإرسال الشحنات</span>
              </div>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="w-4 h-4 accent-black cursor-pointer rounded"
              />
            </div>

            <div className="flex items-center justify-between p-3.5 bg-neutral-50 rounded-xl border border-neutral-150">
              <div>
                <span className="text-xs font-bold text-neutral-900 block">الإرسال التلقائي الفوري</span>
                <span className="text-[11px] text-neutral-500">إرسال الطلب لـ Anderson فور تأكيد الزبون للشراء</span>
              </div>
              <input
                type="checkbox"
                checked={autoSendOrders}
                onChange={(e) => setAutoSendOrders(e.target.checked)}
                className="w-4 h-4 accent-black cursor-pointer rounded"
              />
            </div>
          </div>

          {/* Connection Test Result Feedback */}
          {testResult && (
            <div
              className={`p-4 rounded-xl text-xs flex items-start gap-3 border ${
                testResult.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-red-50 border-red-200 text-red-900'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1">
                <p className="font-bold">{testResult.success ? 'نجح اختبار الاتصال' : 'فشل اختبار الاتصال'}</p>
                <p className="text-[11px] leading-relaxed">
                  {testResult.success ? testResult.message : testResult.error}
                </p>
              </div>
            </div>
          )}

          {/* Save Result Feedback */}
          {saveSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600" />
              <span>{saveSuccess}</span>
            </div>
          )}
          {saveError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600" />
              <span>{saveError}</span>
            </div>
          )}

          {/* Actions Bar */}
          <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting || (!hasStoredToken && !apiToken.trim())}
              className="px-4 py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded-xl text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {isTesting ? <RefreshCw className="w-4 h-4 animate-spin text-neutral-600" /> : <Globe className="w-4 h-4" />}
              <span>{isTesting ? 'جارٍ الفحص والاتصال...' : 'اختبار الاتصال بحساب Anderson'}</span>
            </button>

            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2.5 bg-neutral-900 hover:bg-black text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-2 shadow-sm"
            >
              {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              <span>{isSaving ? 'جارٍ الحفظ...' : 'حفظ الإعدادات'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-neutral-150 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-neutral-500">تم الإرسال لـ Anderson</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-neutral-950 font-mono">{sentOrders.length}</div>
          <span className="text-[11px] text-neutral-400 mt-1 block">شحنات بأرقام تتبع رسمية</span>
        </div>

        <div className="bg-white rounded-2xl border border-neutral-150 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-neutral-500">قيد الإرسال حالياً</span>
            <RefreshCw className="w-4 h-4 text-amber-600 animate-spin" />
          </div>
          <div className="text-2xl font-black text-amber-600 font-mono">{sendingOrders.length}</div>
          <span className="text-[11px] text-neutral-400 mt-1 block">جارٍ التواصل مع API</span>
        </div>

        <div className="bg-white rounded-2xl border border-neutral-150 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-neutral-500">فشل في الإرسال</span>
            <XCircle className="w-4 h-4 text-red-600" />
          </div>
          <div className="text-2xl font-black text-red-600 font-mono">{failedOrders.length}</div>
          <span className="text-[11px] text-neutral-400 mt-1 block">تحتاج إعادة محاولة</span>
        </div>

        <div className="bg-white rounded-2xl border border-neutral-150 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-neutral-500">في انتظار الإرسال</span>
            <Clock className="w-4 h-4 text-neutral-400" />
          </div>
          <div className="text-2xl font-black text-neutral-700 font-mono">{pendingOrders.length}</div>
          <span className="text-[11px] text-neutral-400 mt-1 block">لم تُرسل بعد</span>
        </div>
      </div>

      {/* Orders Shipments Section */}
      <div className="bg-white rounded-2xl border border-neutral-150 overflow-hidden shadow-sm">
        {/* Table Filter / Toolbar */}
        <div className="p-4 sm:p-5 border-b border-neutral-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 max-w-md">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-neutral-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ابحث برقم الطلب، اسم العميل، الهاتف، أو رقم الشحنة..."
                className="w-full pr-10 pl-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium focus:outline-none focus:border-black"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="py-2 px-3 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-bold focus:outline-none focus:border-black"
            >
              <option value="all">جميع الشحنات ({orders.length})</option>
              <option value="sent">تم الإرسال ({sentOrders.length})</option>
              <option value="failed">فشلت ({failedOrders.length})</option>
              <option value="sending">قيد الإرسال ({sendingOrders.length})</option>
              <option value="pending">في الانتظار ({pendingOrders.length})</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            {failedOrders.length > 0 && (
              <button
                onClick={handleRetryAllFailed}
                disabled={isRetryingAll}
                className="px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRetryingAll ? 'animate-spin' : ''}`} />
                <span>إعادة إرسال كل الطلبات المتعثرة ({failedOrders.length})</span>
              </button>
            )}

            <button
              onClick={onRefreshOrders}
              className="p-2 text-neutral-600 hover:text-black hover:bg-neutral-100 rounded-xl transition-colors"
              title="تحديث القائمة"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Orders Table */}
        <div className="overflow-x-auto scroll-smooth touch-pan-x [-webkit-overflow-scrolling:touch]">
          <table className="w-full min-w-[700px] text-right text-xs">
            <thead className="bg-neutral-50 text-neutral-500 uppercase border-b border-neutral-150">
              <tr>
                <th className="py-3.5 px-4 font-bold">رقم الطلب</th>
                <th className="py-3.5 px-4 font-bold">العميل والموقع</th>
                <th className="py-3.5 px-4 font-bold">نوع التوصيل</th>
                <th className="py-3.5 px-4 font-bold">المبلغ (COD)</th>
                <th className="py-3.5 px-4 font-bold">حالة الإرسال لـ Anderson</th>
                <th className="py-3.5 px-4 font-bold">رقم الشحنة (Tracking)</th>
                <th className="py-3.5 px-4 font-bold text-left">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-neutral-400">
                    لا توجد طلبات تطابق معايير البحث.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((o) => {
                  const status = o.andersonStatus || 'pending';
                  const isRetryingThis = retryingOrderId === o.id;

                  return (
                    <tr
                      key={o.id}
                      className="hover:bg-neutral-50/70 transition-colors cursor-pointer"
                      onClick={() => onViewOrder(o)}
                    >
                      {/* Order Number */}
                      <td className="py-3.5 px-4 font-mono font-bold text-neutral-950">
                        {o.orderNumber}
                      </td>

                      {/* Customer & Wilaya */}
                      <td className="py-3.5 px-4">
                        <span className="font-bold text-neutral-900 block">{o.customerName}</span>
                        <span className="text-[11px] text-neutral-500 font-mono" dir="ltr">
                          {o.phone}
                        </span>
                        <span className="text-[11px] text-neutral-400 block mt-0.5">
                          {o.wilaya} — {o.commune}
                        </span>
                      </td>

                      {/* Delivery Type */}
                      <td className="py-3.5 px-4">
                        {o.deliveryType === 'desk' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-50 text-purple-800 text-[10px] font-bold border border-purple-200">
                            مكتب (Stop Desk)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-blue-800 text-[10px] font-bold border border-blue-200">
                            منزل (Domicile)
                          </span>
                        )}
                      </td>

                      {/* Total Amount */}
                      <td className="py-3.5 px-4 font-mono font-bold text-neutral-950">
                        {o.total.toLocaleString()} د.ج
                      </td>

                      {/* Anderson Integration Status */}
                      <td className="py-3.5 px-4">
                        {status === 'sent' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-900">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>تم الإرسال بنجاح</span>
                          </span>
                        )}
                        {status === 'sending' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900">
                            <RefreshCw className="w-3 h-3 animate-spin text-amber-600" />
                            <span>قيد الإرسال...</span>
                          </span>
                        )}
                        {status === 'failed' && (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-100 text-red-900">
                              <XCircle className="w-3 h-3 text-red-600" />
                              <span>فشل الإرسال</span>
                            </span>
                            {o.andersonError && (
                              <p className="text-[10px] text-red-600 max-w-xs truncate" title={o.andersonError}>
                                {o.andersonError}
                              </p>
                            )}
                          </div>
                        )}
                        {status === 'pending' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-neutral-100 text-neutral-700">
                            <Clock className="w-3 h-3 text-neutral-400" />
                            <span>في الانتظار</span>
                          </span>
                        )}
                      </td>

                      {/* Tracking Number */}
                      <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                        {o.andersonTrackingNumber ? (
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-neutral-900 text-xs bg-neutral-100 px-2 py-0.5 rounded">
                              {o.andersonTrackingNumber}
                            </span>
                            <button
                              onClick={() => handleCopy(o.andersonTrackingNumber!)}
                              className="p-1 text-neutral-400 hover:text-black rounded"
                              title="نسخ رقم الشحنة"
                            >
                              {copiedTracking === o.andersonTrackingNumber ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <a
                              href="https://suivi.ecotrack.dz/suivi/"
                              target="_blank"
                              rel="noreferrer"
                              className="p-1 text-neutral-400 hover:text-blue-600 rounded"
                              title="تتبع الشحنة في Anderson EcoTrack"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        ) : (
                          <span className="text-[11px] text-neutral-400 font-mono">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-left" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          {status !== 'sent' && (
                            <button
                              onClick={() => handleRetryOrder(o.id)}
                              disabled={isRetryingThis}
                              className="px-2.5 py-1.5 bg-neutral-900 hover:bg-black text-white rounded-lg font-bold text-[11px] transition-all disabled:opacity-50 flex items-center gap-1 shadow-sm"
                              title="إرسال الطلب الآن لشركة التوصيل"
                            >
                              <Send className={`w-3 h-3 ${isRetryingThis ? 'animate-spin' : ''}`} />
                              <span>{isRetryingThis ? 'جارٍ الإرسال...' : 'إرسال لـ Anderson'}</span>
                            </button>
                          )}

                          <button
                            onClick={() => onViewOrder(o)}
                            className="p-1.5 text-neutral-700 hover:text-black hover:bg-neutral-100 rounded-lg transition-colors font-bold text-[11px] inline-flex items-center gap-1"
                            title="عرض تفاصيل الطلب"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>تفاصيل</span>
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
    </div>
  );
};
