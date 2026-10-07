import React from 'react';
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  Truck,
  RotateCcw,
  XCircle,
  Package,
  Send,
  Building,
  Navigation,
  CheckCheck,
  PauseCircle,
  CornerUpLeft
} from 'lucide-react';
import {
  Order,
  OrderStatus,
  AmadalOrderStatus,
  DeliveryShippingStatus
} from '../types';

/**
 * ─────────────────────────────────────────────────────────────
 * 1. قائمة حالات طلب AMADAL الرسمية
 * ─────────────────────────────────────────────────────────────
 */
export const AMADAL_ORDER_STATUSES: {
  value: AmadalOrderStatus;
  label: string;
  description: string;
}[] = [
  { value: 'new', label: 'جديد', description: 'طلب مسجل جديد في انتظار المراجعة والتأكيد' },
  { value: 'confirmed', label: 'مؤكد', description: 'تم تأكيد الطلب مع العميل هاتفياً أو عبر واتساب' },
  { value: 'preparing', label: 'قيد التحضير', description: 'الطلب قيد تجهيز الطرود وتغليف الملابس' },
  { value: 'shipped', label: 'تم الشحن', description: 'تم تسليم الطرد لشركة التوصيل للشحن' },
  { value: 'completed', label: 'مكتمل', description: 'تم تسليم الطلب للعميل واستلام المبلغ بنجاح' },
  { value: 'cancelled', label: 'ملغى', description: 'تم إلغاء الطلب من قبل العميل أو الإدارة' },
  { value: 'returned', label: 'مرتجع', description: 'تم استرجاع الطلب بعد عدم الاستلام' },
];

/**
 * ─────────────────────────────────────────────────────────────
 * 2. قائمة حالات شحنة شركة التوصيل الرسمية
 * ─────────────────────────────────────────────────────────────
 */
export const DELIVERY_SHIPPING_STATUSES: {
  value: DeliveryShippingStatus;
  label: string;
  description: string;
}[] = [
  { value: 'not_sent', label: 'لم يتم الإرسال', description: 'لم ترسل الشحنة بعد إلى شركة التوصيل' },
  { value: 'sending', label: 'قيد الإرسال', description: 'جارٍ تسجيل الشحنة لدى شركة التوصيل حالياً' },
  { value: 'created', label: 'تم إنشاء الشحنة', description: 'تم توليد بوليصة الشحن ورقم التتبع بنجاح' },
  { value: 'at_hub', label: 'في محطة الانطلاق', description: 'الطرد موجود في مركز فرز الانطلاق الرئيسي' },
  { value: 'in_transit', label: 'قيد المعالجة', description: 'الشحنة في طريقها بين المراكز والولايات' },
  { value: 'at_delivery_hub', label: 'في محطة التوصيل', description: 'وصلت الشحنة إلى مركز ولاية العميل' },
  { value: 'out_for_delivery', label: 'خرج للتوصيل', description: 'الشحنة مع الموزع في طريقها لعنوان العميل' },
  { value: 'delivered', label: 'تم التسليم', description: 'تم تسليم الطرد للعميل واستلام الدفع' },
  { value: 'delivery_pending', label: 'التوصيل معلق', description: 'تعذر التوصيل مؤقتاً (الهاتف مغلق / تأجيل)' },
  { value: 'returning', label: 'في طريق العودة', description: 'الشحنة في طريق الإرجاع إلى متجر AMADAL' },
  { value: 'returned', label: 'تم الإرجاع', description: 'تم استلام الطرد المرتجع في مقر المتجر' },
  { value: 'failed', label: 'فشل الإرسال', description: 'فشل ربط أو إرسال الشحنة لشركة التوصيل' },
];

/**
 * Normalizes AMADAL order status (handling legacy 'processing' and 'delivered')
 */
export function normalizeAmadalStatus(status?: string): AmadalOrderStatus {
  if (!status) return 'new';
  if (status === 'processing') return 'preparing';
  if (status === 'delivered') return 'completed';
  const valid: AmadalOrderStatus[] = ['new', 'confirmed', 'preparing', 'shipped', 'completed', 'cancelled', 'returned'];
  if (valid.includes(status as AmadalOrderStatus)) {
    return status as AmadalOrderStatus;
  }
  return 'new';
}

/**
 * Normalizes Shipping Status from Order (with legacy Anderson fallback)
 */
export function getNormalizedShippingStatus(order: Order): DeliveryShippingStatus {
  if (order.shippingStatus) {
    return order.shippingStatus;
  }
  // Fallbacks for existing orders
  if (order.andersonStatus === 'sent') return 'created';
  if (order.andersonStatus === 'sending') return 'sending';
  if (order.andersonStatus === 'failed') return 'failed';
  return 'not_sent';
}

/**
 * Normalizes Tracking Number
 */
export function getNormalizedTrackingNumber(order: Order): string | null {
  return order.shippingTrackingNumber || order.andersonTrackingNumber || null;
}

/**
 * Normalizes Last Shipping Update Date
 */
export function getNormalizedShippingUpdatedAt(order: Order): string | null {
  return order.shippingUpdatedAt || order.andersonLastAttemptAt || order.updatedAt || null;
}

/**
 * ─────────────────────────────────────────────────────────────
 * 3. خوارزمية الأرشفة التلقائية المعتمدة على تاريخ التسليم في Firestore
 * ─────────────────────────────────────────────────────────────
 */

export const DEFAULT_ARCHIVE_DURATION_HOURS = 48; // الافتراضي: 48 ساعة (يومان)

/**
 * Checks whether an order is archived based on stored Firestore data and settings.
 * Condition:
 * 1. If explicitly marked isArchived === true -> Archived.
 * 2. If shippingStatus === 'delivered' AND deliveredAt is present:
 *    elapsed hours >= archiveDurationHours -> Archived.
 * 3. Any non-delivered shipment (e.g. in_transit, returning, returned, failed, on_hold)
 *    is STRICTLY NOT auto-archived!
 */
export function isOrderArchived(order: Order, archiveDurationHours: number = DEFAULT_ARCHIVE_DURATION_HOURS): boolean {
  // Explicitly archived manually
  if (order.isArchived === true) {
    return true;
  }

  // Only auto-archive when actual shipment is 'delivered'
  const shippingStatus = getNormalizedShippingStatus(order);
  const isDelivered = shippingStatus === 'delivered' || (order.status === 'delivered' && order.deliveredAt);

  if (isDelivered && order.deliveredAt) {
    const deliveredTime = new Date(order.deliveredAt).getTime();
    if (!isNaN(deliveredTime)) {
      const elapsedHours = (Date.now() - deliveredTime) / (1000 * 60 * 60);
      return elapsedHours >= archiveDurationHours;
    }
  }

  return false;
}

/**
 * Calculates remaining hours until auto-archive fires for a delivered order.
 * Returns null if not delivered or already archived.
 */
export function getHoursUntilArchive(order: Order, archiveDurationHours: number = DEFAULT_ARCHIVE_DURATION_HOURS): number | null {
  if (order.isArchived) return 0;
  const shippingStatus = getNormalizedShippingStatus(order);
  if (shippingStatus !== 'delivered' || !order.deliveredAt) return null;

  const deliveredTime = new Date(order.deliveredAt).getTime();
  if (isNaN(deliveredTime)) return null;

  const elapsedHours = (Date.now() - deliveredTime) / (1000 * 60 * 60);
  const remaining = archiveDurationHours - elapsedHours;
  return Math.max(0, Math.round(remaining * 10) / 10);
}

/**
 * ─────────────────────────────────────────────────────────────
 * 4. عناصر واجهة المستخدم: شارات الحالات
 * ─────────────────────────────────────────────────────────────
 */

/**
 * AMADAL Order Status Badge
 */
export function getAmadalStatusBadge(status?: string) {
  const norm = normalizeAmadalStatus(status);
  switch (norm) {
    case 'new':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-900 border border-amber-200">
          <Clock className="w-3 h-3 text-amber-600" />
          <span>جديد</span>
        </span>
      );
    case 'confirmed':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-900 border border-blue-200">
          <CheckCircle2 className="w-3 h-3 text-blue-600" />
          <span>مؤكد</span>
        </span>
      );
    case 'preparing':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-900 border border-indigo-200">
          <Package className="w-3 h-3 text-indigo-600" />
          <span>قيد التحضير</span>
        </span>
      );
    case 'shipped':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-50 text-purple-900 border border-purple-200">
          <Truck className="w-3 h-3 text-purple-600" />
          <span>تم الشحن</span>
        </span>
      );
    case 'completed':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-900 border border-emerald-200">
          <CheckCheck className="w-3 h-3 text-emerald-600" />
          <span>مكتمل</span>
        </span>
      );
    case 'cancelled':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-neutral-100 text-neutral-700 border border-neutral-300">
          <XCircle className="w-3 h-3 text-neutral-500" />
          <span>ملغى</span>
        </span>
      );
    case 'returned':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-900 border border-rose-200">
          <CornerUpLeft className="w-3 h-3 text-rose-600" />
          <span>مرتجع</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-neutral-100 text-neutral-800">
          <span>{status || 'غير محدد'}</span>
        </span>
      );
  }
}

/**
 * Delivery Courier Shipping Status Badge
 */
export function getShippingStatusBadge(status?: DeliveryShippingStatus) {
  switch (status) {
    case 'not_sent':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-neutral-100 text-neutral-600 border border-neutral-200">
          <Clock className="w-3 h-3 text-neutral-400" />
          <span>لم يتم الإرسال</span>
        </span>
      );
    case 'sending':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-900 border border-amber-200">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
          <span>قيد الإرسال...</span>
        </span>
      );
    case 'created':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-sky-50 text-sky-900 border border-sky-200">
          <Send className="w-3 h-3 text-sky-600" />
          <span>تم إنشاء الشحنة</span>
        </span>
      );
    case 'at_hub':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-50 text-blue-900 border border-blue-200">
          <Building className="w-3 h-3 text-blue-600" />
          <span>في محطة الانطلاق</span>
        </span>
      );
    case 'in_transit':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-900 border border-indigo-200">
          <Truck className="w-3 h-3 text-indigo-600" />
          <span>قيد المعالجة</span>
        </span>
      );
    case 'at_delivery_hub':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-cyan-50 text-cyan-900 border border-cyan-200">
          <Building className="w-3 h-3 text-cyan-600" />
          <span>في محطة التوصيل</span>
        </span>
      );
    case 'out_for_delivery':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-violet-50 text-violet-900 border border-violet-200">
          <Navigation className="w-3 h-3 text-violet-600" />
          <span>خرج للتوصيل</span>
        </span>
      );
    case 'delivered':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-950 border border-emerald-300">
          <CheckCircle2 className="w-3 h-3 text-emerald-700" />
          <span>تم التسليم</span>
        </span>
      );
    case 'delivery_pending':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-orange-50 text-orange-900 border border-orange-200">
          <PauseCircle className="w-3 h-3 text-orange-600" />
          <span>التوصيل معلق</span>
        </span>
      );
    case 'returning':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-900 border border-amber-200">
          <RotateCcw className="w-3 h-3 text-amber-600" />
          <span>في طريق العودة</span>
        </span>
      );
    case 'returned':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-50 text-red-900 border border-red-200">
          <CornerUpLeft className="w-3 h-3 text-red-600" />
          <span>تم الإرجاع</span>
        </span>
      );
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-100 text-red-950 border border-red-300">
          <AlertCircle className="w-3 h-3 text-red-600" />
          <span>فشل الإرسال</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-neutral-100 text-neutral-600">
          <span>{status || 'لم يتم الإرسال'}</span>
        </span>
      );
  }
}
