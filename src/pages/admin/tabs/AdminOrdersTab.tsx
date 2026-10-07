import React, { useState, useEffect } from 'react';
import {
  Search,
  Filter,
  Eye,
  MessageCircle,
  Phone,
  CheckCircle,
  Clock,
  Truck,
  Package,
  XCircle,
  X,
  Trash2,
  Send,
  RefreshCw,
  ExternalLink,
  Archive,
  ArchiveRestore,
  Calendar,
  Layers,
  Settings,
  AlertCircle,
  Check,
  Building,
  Navigation,
  CheckCheck,
  PauseCircle,
  RotateCcw,
  CornerUpLeft
} from 'lucide-react';
import {
  Order,
  OrderStatus,
  AmadalOrderStatus,
  DeliveryShippingStatus,
  Product,
  ProductVariant
} from '../../../types';
import { doc, updateDoc, deleteDoc, runTransaction, setDoc } from 'firebase/firestore';
import { db } from '../../../firebase';
import { useStore } from '../../../context/StoreContext';
import { sendOrderToAnderson } from '../../../services/andersonService';
import {
  AMADAL_ORDER_STATUSES,
  DELIVERY_SHIPPING_STATUSES,
  normalizeAmadalStatus,
  getNormalizedShippingStatus,
  getNormalizedTrackingNumber,
  getNormalizedShippingUpdatedAt,
  isOrderArchived,
  getHoursUntilArchive,
  getAmadalStatusBadge,
  getShippingStatusBadge,
  DEFAULT_ARCHIVE_DURATION_HOURS
} from '../../../utils/orderStatusUtils';

interface AdminOrdersTabProps {
  orders: Order[];
  onRefresh: () => void;
  selectedOrder?: Order | null;
  onSelectOrder: (order: Order | null) => void;
}

export const AdminOrdersTab: React.FC<AdminOrdersTabProps> = ({
  orders,
  onRefresh,
  selectedOrder,
  onSelectOrder,
}) => {
  const { settings, refreshData } = useStore();

  // Active View Tab: 'active' (non-archived), 'archived' (archived orders), 'all' (all orders)
  const [viewSection, setViewSection] = useState<'active' | 'archived' | 'all'>('active');

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [amadalFilter, setAmadalFilter] = useState<string>('all');
  const [shippingFilter, setShippingFilter] = useState<string>('all');

  // Archive Duration Setting (in hours)
  const [archiveDuration, setArchiveDuration] = useState<number>(
    settings?.orderArchiveDurationHours ?? DEFAULT_ARCHIVE_DURATION_HOURS
  );
  const [isSavingArchiveDuration, setIsSavingArchiveDuration] = useState(false);
  const [archiveDurationFeedback, setArchiveDurationFeedback] = useState<string | null>(null);

  // Status updating states
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isUpdatingShippingStatus, setIsUpdatingShippingStatus] = useState(false);
  const [isTogglingArchive, setIsTogglingArchive] = useState(false);

  // Anderson Delivery dispatch states
  const [isSendingToAnderson, setIsSendingToAnderson] = useState(false);
  const [andersonFeedback, setAndersonFeedback] = useState<string | null>(null);

  // Permanent order deletion states
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccessToast, setDeleteSuccessToast] = useState<string | null>(null);

  // Keep archiveDuration synced if settings loaded from Firestore
  useEffect(() => {
    if (settings?.orderArchiveDurationHours !== undefined) {
      setArchiveDuration(settings.orderArchiveDurationHours);
    }
  }, [settings?.orderArchiveDurationHours]);

  // Handle changing archive duration and persisting to Firestore settings/store
  const handleUpdateArchiveDuration = async (hours: number) => {
    setArchiveDuration(hours);
    setIsSavingArchiveDuration(true);
    setArchiveDurationFeedback(null);
    try {
      await setDoc(
        doc(db, 'settings', 'store'),
        { orderArchiveDurationHours: hours, updatedAt: new Date().toISOString() },
        { merge: true }
      );
      setArchiveDurationFeedback(`تم حفظ مدة الأرشفة: ${hours} ساعة بعد التسليم.`);
      setTimeout(() => setArchiveDurationFeedback(null), 3500);
      if (refreshData) refreshData();
    } catch (err: any) {
      console.error('[Update Archive Duration Error]:', err);
      setArchiveDurationFeedback('حدث خطأ أثناء حفظ مدة الأرشفة');
      setTimeout(() => setArchiveDurationFeedback(null), 3500);
    } finally {
      setIsSavingArchiveDuration(false);
    }
  };

  // Automated background persistence for delivered orders that crossed the archive duration
  useEffect(() => {
    const unflaggedDeliveredOrders = orders.filter((o) => {
      const shippingStatus = getNormalizedShippingStatus(o);
      if (shippingStatus === 'delivered' && o.deliveredAt && !o.isArchived) {
        const elapsedHours = (Date.now() - new Date(o.deliveredAt).getTime()) / (1000 * 60 * 60);
        return elapsedHours >= archiveDuration;
      }
      return false;
    });

    if (unflaggedDeliveredOrders.length > 0) {
      // Silently update Firestore document so isArchived is explicitly saved
      unflaggedDeliveredOrders.forEach(async (orderToFlag) => {
        try {
          await updateDoc(doc(db, 'orders', orderToFlag.id), {
            isArchived: true,
            archivedAt: new Date().toISOString(),
          });
        } catch {
          // ignore silent background sync error
        }
      });
    }
  }, [orders, archiveDuration]);

  // Counts
  const activeOrdersCount = orders.filter((o) => !isOrderArchived(o, archiveDuration)).length;
  const archivedOrdersCount = orders.filter((o) => isOrderArchived(o, archiveDuration)).length;
  const totalOrdersCount = orders.length;

  // Filter orders according to ViewSection, Search, and Statuses
  const filteredOrders = orders.filter((o) => {
    // 1. View section filter
    const isArchived = isOrderArchived(o, archiveDuration);
    if (viewSection === 'active' && isArchived) return false;
    if (viewSection === 'archived' && !isArchived) return false;

    // 2. AMADAL Order Status filter
    if (amadalFilter !== 'all') {
      const norm = normalizeAmadalStatus(o.status);
      if (norm !== amadalFilter) return false;
    }

    // 3. Courier Delivery Shipping Status filter
    if (shippingFilter !== 'all') {
      const shipNorm = getNormalizedShippingStatus(o);
      if (shipNorm !== shippingFilter) return false;
    }

    // 4. Search query filter
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const tracking = (getNormalizedTrackingNumber(o) || '').toLowerCase();
      const matchSearch =
        o.orderNumber.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.phone.includes(q) ||
        o.wilaya.toLowerCase().includes(q) ||
        (o.commune || '').toLowerCase().includes(q) ||
        tracking.includes(q);

      if (!matchSearch) return false;
    }

    return true;
  });

  // Manual Anderson Dispatch from Modal
  const handleSendToAnderson = async (orderId: string) => {
    setIsSendingToAnderson(true);
    setAndersonFeedback(null);
    try {
      const res = await sendOrderToAnderson(orderId, true);
      if (res.success) {
        setAndersonFeedback(res.message || `تم إرسال الشحنة بنجاح لـ Anderson (رقم التتبع: ${res.trackingNumber})`);
      } else {
        setAndersonFeedback(`فشل إرسال الشحنة لـ Anderson: ${res.error}`);
      }
      onRefresh();
      if (selectedOrder && selectedOrder.id === orderId) {
        const updatedStatus = res.success ? 'created' : 'failed';
        const updatedTracking = res.trackingNumber || selectedOrder.shippingTrackingNumber || selectedOrder.andersonTrackingNumber;
        onSelectOrder({
          ...selectedOrder,
          shippingStatus: updatedStatus as DeliveryShippingStatus,
          shippingTrackingNumber: updatedTracking,
          shippingUpdatedAt: new Date().toISOString(),
          andersonStatus: res.success ? 'sent' : 'failed',
          andersonTrackingNumber: updatedTracking,
          andersonError: res.error,
          andersonLastAttemptAt: new Date().toISOString(),
        });
      }
    } catch (err: any) {
      setAndersonFeedback(`خطأ: ${err.message}`);
    } finally {
      setIsSendingToAnderson(false);
      setTimeout(() => setAndersonFeedback(null), 5000);
    }
  };

  // 1. Update AMADAL Order Status (مستقلة تماماً)
  const handleUpdateAmadalStatus = async (orderId: string, newStatus: OrderStatus) => {
    setIsUpdatingStatus(true);
    try {
      const orderRef = doc(db, 'orders', orderId);
      const currentOrder = orders.find((o) => o.id === orderId) || selectedOrder;

      // Check if transitioning to 'cancelled' and inventory needs to be restored
      const shouldRestoreInventory =
        newStatus === 'cancelled' &&
        currentOrder &&
        currentOrder.inventoryDeducted !== false &&
        !currentOrder.stockRestored &&
        Array.isArray(currentOrder.items) &&
        currentOrder.items.length > 0;

      if (shouldRestoreInventory) {
        await runTransaction(db, async (transaction) => {
          const freshOrderSnap = await transaction.get(orderRef);
          if (!freshOrderSnap.exists()) return;
          const freshOrderData = freshOrderSnap.data() as Order;

          // Fetch products
          const itemProductIds = Array.from(new Set(freshOrderData.items.map((i) => i.productId)));
          const productDocsMap = new Map();
          for (const pid of itemProductIds) {
            const pRef = doc(db, 'products', pid);
            const pSnap = await transaction.get(pRef);
            if (pSnap.exists()) {
              productDocsMap.set(pid, pSnap);
            }
          }

          const updatedVariantsMap = new Map<string, ProductVariant[]>();
          for (const item of freshOrderData.items) {
            const pSnap = productDocsMap.get(item.productId);
            if (!pSnap) continue;
            const pData = pSnap.data() as Product;
            let productVariants: ProductVariant[] = updatedVariantsMap.get(item.productId) || (
              Array.isArray(pData.variants) ? JSON.parse(JSON.stringify(pData.variants)) : []
            );
            updatedVariantsMap.set(item.productId, productVariants);

            const qty = Number(item.quantity) || 1;
            let vIdx = productVariants.findIndex((v) => {
              const matchSize = (v.size || '').trim().toLowerCase() === (item.size || '').trim().toLowerCase();
              if (item.color) {
                return matchSize && (v.color || '').trim().toLowerCase() === item.color.trim().toLowerCase();
              }
              return matchSize;
            });

            if (vIdx === -1 && productVariants.length > 0) {
              vIdx = productVariants.findIndex(
                (v) => (v.size || '').trim().toLowerCase() === (item.size || '').trim().toLowerCase()
              );
            }

            if (vIdx !== -1) {
              productVariants[vIdx].stock = (Number(productVariants[vIdx].stock) || 0) + qty;
            }
          }

          for (const [pid, updatedVariants] of updatedVariantsMap.entries()) {
            const pref = productDocsMap.get(pid)!.ref;
            transaction.update(pref, {
              variants: updatedVariants,
              updatedAt: new Date().toISOString(),
            });
          }

          const existingHistory = freshOrderData.statusHistory || [];
          transaction.update(orderRef, {
            status: 'cancelled',
            stockRestored: true,
            statusHistory: [
              ...existingHistory,
              {
                status: 'cancelled',
                timestamp: new Date().toISOString(),
                note: 'تم إلغاء الطلب واسترجاع القطع إلى المخزون تلقائياً',
              },
            ],
            updatedAt: new Date().toISOString(),
          });
        });

        if (selectedOrder && selectedOrder.id === orderId) {
          onSelectOrder({ ...selectedOrder, status: 'cancelled', stockRestored: true });
        }
      } else {
        // Standard AMADAL status update
        const nowIso = new Date().toISOString();
        const existingHistory = currentOrder?.statusHistory || [];
        await updateDoc(orderRef, {
          status: newStatus,
          statusHistory: [
            ...existingHistory,
            {
              status: newStatus,
              timestamp: nowIso,
              note: `تحديث حالة طلب AMADAL إلى: ${newStatus}`,
            },
          ],
          updatedAt: nowIso,
        });

        if (selectedOrder && selectedOrder.id === orderId) {
          onSelectOrder({ ...selectedOrder, status: newStatus });
        }
      }

      onRefresh();
    } catch (err) {
      console.error(err);
      alert('حدث خطأ أثناء تحديث حالة طلب AMADAL');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // 2. Update Delivery Shipping Status (مستقلة تماماً)
  const handleUpdateShippingStatus = async (
    orderId: string,
    newShippingStatus: DeliveryShippingStatus,
    newTrackingNumber?: string
  ) => {
    setIsUpdatingShippingStatus(true);
    try {
      const orderRef = doc(db, 'orders', orderId);
      const currentOrder = orders.find((o) => o.id === orderId) || selectedOrder;
      const nowIso = new Date().toISOString();

      const updateData: Record<string, any> = {
        shippingStatus: newShippingStatus,
        shippingUpdatedAt: nowIso,
        updatedAt: nowIso,
      };

      if (newTrackingNumber) {
        updateData.shippingTrackingNumber = newTrackingNumber;
        updateData.andersonTrackingNumber = newTrackingNumber;
      }

      // If becoming delivered, record deliveredAt in Firestore!
      if (newShippingStatus === 'delivered') {
        if (!currentOrder?.deliveredAt) {
          updateData.deliveredAt = nowIso;
        }
        updateData.andersonStatus = 'sent';
      } else if (newShippingStatus === 'failed') {
        updateData.andersonStatus = 'failed';
      } else if (newShippingStatus === 'sending') {
        updateData.andersonStatus = 'sending';
      } else if (newShippingStatus === 'created') {
        updateData.andersonStatus = 'sent';
      }

      const existingHistory = currentOrder?.statusHistory || [];
      updateData.statusHistory = [
        ...existingHistory,
        {
          status: currentOrder?.status || 'new',
          shippingStatus: newShippingStatus,
          timestamp: nowIso,
          note: `تحديث حالة شحنة شركة التوصيل إلى: ${newShippingStatus}${
            newShippingStatus === 'delivered' ? ' (تم تسجيل تاريخ ووقت التسليم الفعلي)' : ''
          }`,
        },
      ];

      await updateDoc(orderRef, updateData);

      if (selectedOrder && selectedOrder.id === orderId) {
        onSelectOrder({
          ...selectedOrder,
          ...updateData,
        });
      }

      onRefresh();
    } catch (err) {
      console.error(err);
      alert('حدث خطأ أثناء تحديث حالة الشحنة');
    } finally {
      setIsUpdatingShippingStatus(false);
    }
  };

  // 3. Manual Archive / Unarchive Toggle
  const handleToggleArchive = async (orderId: string, targetArchiveState: boolean) => {
    setIsTogglingArchive(true);
    try {
      const orderRef = doc(db, 'orders', orderId);
      const nowIso = new Date().toISOString();
      await updateDoc(orderRef, {
        isArchived: targetArchiveState,
        archivedAt: targetArchiveState ? nowIso : null,
        updatedAt: nowIso,
      });

      if (selectedOrder && selectedOrder.id === orderId) {
        onSelectOrder({
          ...selectedOrder,
          isArchived: targetArchiveState,
          archivedAt: targetArchiveState ? nowIso : undefined,
        });
      }

      onRefresh();
    } catch (err) {
      console.error(err);
      alert('حدث خطأ أثناء تغيير حالة أرشفة الطلب');
    } finally {
      setIsTogglingArchive(false);
    }
  };

  // Permanent Delete Handlers
  const handleConfirmDelete = async () => {
    if (!orderToDelete) return;
    setIsDeleting(true);
    setDeleteError(null);

    const targetId = orderToDelete.id;
    const targetOrderNumber = orderToDelete.orderNumber;

    try {
      await deleteDoc(doc(db, 'orders', targetId));
      if (targetOrderNumber && targetOrderNumber !== targetId) {
        try {
          await deleteDoc(doc(db, 'orders', targetOrderNumber));
        } catch {
          // Ignore fallback if doc did not exist
        }
      }

      if (selectedOrder && (selectedOrder.id === targetId || selectedOrder.orderNumber === targetOrderNumber)) {
        onSelectOrder(null);
      }

      onRefresh();
      setOrderToDelete(null);
      setDeleteSuccessToast(`تم حذف الطلبية ${targetOrderNumber || targetId} نهائياً بنجاح.`);
      setTimeout(() => {
        setDeleteSuccessToast(null);
      }, 4000);
    } catch (err: any) {
      console.error('[Delete Order Error]:', err);
      setDeleteError(err?.message || 'حدث خطأ أثناء محاولة حذف الطلب من قاعدة البيانات.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 w-full max-w-full min-w-0">

      {/* Toast Notification */}
      {deleteSuccessToast && (
        <div className="p-3.5 bg-emerald-500 text-white text-xs font-bold rounded-2xl shadow-lg flex items-center justify-between animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4" />
            <span>{deleteSuccessToast}</span>
          </div>
          <button onClick={() => setDeleteSuccessToast(null)} className="p-1 hover:bg-emerald-600 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Bar: View Navigation (Active / Archived / All) + Archive Settings */}
      <div className="bg-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 border border-neutral-150 shadow-sm space-y-3.5 sm:space-y-4 w-full max-w-full min-w-0 overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4 w-full max-w-full min-w-0">
          
          {/* Main Section Navigation Tabs - Single row, smooth touch horizontal scroll */}
          <div className="w-full lg:w-auto min-w-0 max-w-full">
            <div
              className="flex items-center gap-1.5 sm:gap-2 bg-neutral-100 p-1.5 rounded-2xl w-full sm:w-auto overflow-x-auto flex-nowrap scroll-smooth touch-pan-x no-scrollbar select-none [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
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
                onClick={() => setViewSection('active')}
                className={`flex-shrink-0 shrink-0 flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  viewSection === 'active'
                    ? 'bg-white text-neutral-950 shadow-sm ring-1 ring-black/5'
                    : 'text-neutral-600 hover:text-neutral-950 hover:bg-neutral-200/50'
                }`}
                style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
              >
                <Package className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="whitespace-nowrap">الطلبات النشطة</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-neutral-200/80 text-neutral-700 font-mono shrink-0">
                  {activeOrdersCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setViewSection('archived')}
                className={`flex-shrink-0 shrink-0 flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  viewSection === 'archived'
                    ? 'bg-white text-neutral-950 shadow-sm ring-1 ring-black/5'
                    : 'text-neutral-600 hover:text-neutral-950 hover:bg-neutral-200/50'
                }`}
                style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
              >
                <Archive className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="whitespace-nowrap">الطلبات المؤرشفة</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-800 font-mono shrink-0">
                  {archivedOrdersCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setViewSection('all')}
                className={`flex-shrink-0 shrink-0 flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  viewSection === 'all'
                    ? 'bg-white text-neutral-950 shadow-sm ring-1 ring-black/5'
                    : 'text-neutral-600 hover:text-neutral-950 hover:bg-neutral-200/50'
                }`}
                style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
              >
                <Layers className="w-4 h-4 text-neutral-500 shrink-0" />
                <span className="whitespace-nowrap">جميع الطلبات</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-neutral-200/80 text-neutral-700 font-mono shrink-0">
                  {totalOrdersCount}
                </span>
              </button>
            </div>
          </div>

          {/* Auto-Archive Duration Setting Dropdown - Fully contained and responsive */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-neutral-50 border border-neutral-200 p-2.5 sm:px-3.5 sm:py-2 rounded-2xl w-full lg:w-auto min-w-0 max-w-full">
            <div className="flex items-center gap-1.5 text-xs text-neutral-600 min-w-0 shrink-0">
              <Clock className="w-4 h-4 text-neutral-500 shrink-0" />
              <span className="font-bold whitespace-nowrap">أرشفة الطلبات المسلّمة بعد:</span>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto min-w-0">
              <select
                value={archiveDuration}
                onChange={(e) => handleUpdateArchiveDuration(Number(e.target.value))}
                disabled={isSavingArchiveDuration}
                className="w-full sm:w-auto flex-1 sm:flex-initial px-2.5 py-1.5 bg-white border border-neutral-300 rounded-xl text-xs font-bold text-neutral-900 focus:outline-none focus:border-black cursor-pointer min-w-0"
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

              {archiveDurationFeedback && (
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg animate-in fade-in shrink-0 whitespace-nowrap">
                  {archiveDurationFeedback}
                </span>
              )}
            </div>
          </div>

        </div>

        {/* Informative Hint */}
        <p className="text-[11px] text-neutral-500 leading-relaxed">
          {viewSection === 'active' && (
            <span>
              يعرض الطلبات قيد المعالجة، الشحن، أو التي تم تسليمها مؤخراً ولم تنته مدة أرشفتها بعد ({archiveDuration} ساعة من وقت التسليم).
            </span>
          )}
          {viewSection === 'archived' && (
            <span>
              قسم الطلبات المؤرشفة: يضم الطلبات المكتملة التي تم تسليمها فعلياً وانقضت مدة أرشفتها. تبقى جميع بياناتها محفوظة في Firestore وقابلة للبحث والرجوع إليها دائماً.
            </span>
          )}
          {viewSection === 'all' && (
            <span>
              عرض شامل لكافة الطلبات المسجلة في النظام (النشطة والمؤرشفة).
            </span>
          )}
        </p>
      </div>

      {/* Search & Independent Status Filters */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 w-full max-w-full min-w-0">
        
        {/* Search bar */}
        <div className="relative w-full lg:max-w-md min-w-0">
          <Search className="w-4 h-4 text-neutral-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="بحث برقم الطلب، اسم العميل، الهاتف، أو رقم الشحنة..."
            className="w-full pr-10 pl-4 py-2.5 bg-white border border-neutral-200 rounded-xl text-xs font-medium focus:outline-none focus:border-black min-w-0"
          />
        </div>

        {/* 2 Independent Filter Dropdowns - Single row, smooth touch horizontal scroll */}
        <div className="w-full lg:w-auto min-w-0 max-w-full">
          <div
            className="flex items-center gap-2 overflow-x-auto flex-nowrap scroll-smooth touch-pan-x no-scrollbar select-none py-1 w-full max-w-full min-w-0 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            style={{
              display: 'flex',
              flexWrap: 'nowrap',
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}
          >
            {/* 1. Filter: حالة طلب AMADAL */}
            <div className="flex items-center gap-1.5 shrink-0 flex-shrink-0">
              <span className="text-[11px] font-bold text-neutral-500 whitespace-nowrap">طلب AMADAL:</span>
              <select
                value={amadalFilter}
                onChange={(e) => setAmadalFilter(e.target.value)}
                className="py-2 px-3 bg-white border border-neutral-200 rounded-xl text-xs font-bold text-neutral-800 focus:outline-none focus:border-black shrink-0 cursor-pointer"
              >
                <option value="all">كل حالات AMADAL</option>
                {AMADAL_ORDER_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Filter: حالة شحنة شركة التوصيل */}
            <div className="flex items-center gap-1.5 shrink-0 flex-shrink-0">
              <span className="text-[11px] font-bold text-neutral-500 whitespace-nowrap">شحنة التوصيل:</span>
              <select
                value={shippingFilter}
                onChange={(e) => setShippingFilter(e.target.value)}
                className="py-2 px-3 bg-white border border-neutral-200 rounded-xl text-xs font-bold text-neutral-800 focus:outline-none focus:border-black shrink-0 cursor-pointer"
              >
                <option value="all">كل حالات الشحن</option>
                {DELIVERY_SHIPPING_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Result Count */}
            <div className="text-xs text-neutral-500 font-mono px-2.5 py-1.5 bg-white rounded-xl border border-neutral-200 shrink-0 flex-shrink-0 whitespace-nowrap">
              العدد: {filteredOrders.length}
            </div>
          </div>
        </div>
      </div>

      {/* Orders Table - Standalone horizontally scrollable container */}
      <div className="bg-white rounded-2xl sm:rounded-3xl border border-neutral-150 shadow-sm w-full max-w-full min-w-0 overflow-hidden">
        <div
          className="overflow-x-auto w-full max-w-full scroll-smooth touch-pan-x [-webkit-overflow-scrolling:touch]"
          style={{
            WebkitOverflowScrolling: 'touch',
            overflowX: 'auto',
          }}
        >
          <table className="w-full min-w-[760px] text-right text-xs">
            <thead className="bg-neutral-50 text-neutral-500 uppercase border-b border-neutral-150">
              <tr>
                <th className="py-3.5 px-4 font-bold">رقم الطلب</th>
                <th className="py-3.5 px-4 font-bold">العميل</th>
                <th className="py-3.5 px-4 font-bold">الوجهة</th>
                <th className="py-3.5 px-4 font-bold">المجموع</th>
                {/* 1. حالة طلب AMADAL */}
                <th className="py-3.5 px-4 font-bold">حالة طلب AMADAL</th>
                {/* 2. حالة شحنة شركة التوصيل */}
                <th className="py-3.5 px-4 font-bold">حالة شحنة التوصيل</th>
                <th className="py-3.5 px-4 font-bold">تاريخ التسجيل</th>
                <th className="py-3.5 px-4 font-bold text-left">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-neutral-400">
                    <Package className="w-8 h-8 mx-auto mb-2 text-neutral-300" />
                    <p className="font-bold text-neutral-600">لا توجد طلبات مطابقة للمعايير المحددة.</p>
                    <p className="text-[11px] text-neutral-400 mt-1">
                      {viewSection === 'archived'
                        ? 'لم يتم نقل أي طلبات إلى الأرشيف بعد، أو تم نقلها جميعاً للنشطة.'
                        : 'جرب تغيير خيارات التصفية أو البحث.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredOrders.map((o) => {
                  const isArchived = isOrderArchived(o, archiveDuration);
                  const shippingStatus = getNormalizedShippingStatus(o);
                  const trackingNumber = getNormalizedTrackingNumber(o);
                  const shippingUpdatedAt = getNormalizedShippingUpdatedAt(o);
                  const hoursUntilArchive = getHoursUntilArchive(o, archiveDuration);

                  return (
                    <tr
                      key={o.id}
                      onClick={() => onSelectOrder(o)}
                      className={`hover:bg-neutral-50/80 transition-colors cursor-pointer ${
                        isArchived ? 'bg-neutral-50/40' : ''
                      }`}
                    >
                      {/* Order Number + Badges */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-neutral-950 text-xs">
                            {o.orderNumber}
                          </span>
                          {isArchived && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-neutral-200 text-neutral-700">
                              <Archive className="w-2.5 h-2.5" />
                              <span>مؤرشف</span>
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-neutral-400 block font-mono">
                          {o.source === 'instant_buy' ? 'شراء فوري' : 'سلة التسوق'}
                        </span>
                      </td>

                      {/* Customer Name & Phone */}
                      <td className="py-3.5 px-4">
                        <span className="font-bold text-neutral-900 block">{o.customerName}</span>
                        <div className="flex items-center gap-1 text-[11px] text-neutral-500 font-mono" dir="ltr">
                          <a
                            href={`https://wa.me/${o.phone.replace(/[^0-9]/g, '')}`}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-emerald-600 hover:text-emerald-800"
                            title="مراسلة عبر واتساب"
                          >
                            <MessageCircle className="w-3 h-3" />
                          </a>
                          <span>{o.phone}</span>
                        </div>
                      </td>

                      {/* Destination */}
                      <td className="py-3.5 px-4 text-neutral-700">
                        <span className="font-medium">{o.wilaya}</span>
                        <span className="text-neutral-400 text-[11px] block">{o.commune}</span>
                      </td>

                      {/* Price & Items */}
                      <td className="py-3.5 px-4">
                        <span className="font-mono font-bold text-neutral-950 block">
                          {o.total.toLocaleString()} د.ج
                        </span>
                        <span className="text-neutral-400 text-[10px] font-mono">
                          {o.items?.reduce((s, i) => s + i.quantity, 0) || 1} قطع
                        </span>
                      </td>

                      {/* 1. حالة طلب AMADAL */}
                      <td className="py-3.5 px-4">
                        {getAmadalStatusBadge(o.status)}
                      </td>

                      {/* 2. حالة شحنة شركة التوصيل */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          <div>{getShippingStatusBadge(shippingStatus)}</div>
                          
                          {/* Tracking number if available */}
                          {trackingNumber && (
                            <div className="flex items-center gap-1 text-[10px] font-mono text-neutral-600">
                              <span className="bg-neutral-100 px-1.5 py-0.5 rounded border border-neutral-200">
                                {trackingNumber}
                              </span>
                              <a
                                href="https://suivi.ecotrack.dz/suivi/"
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-blue-600 hover:text-blue-800 p-0.5"
                                title="تتبع الشحنة"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                          )}

                          {/* Last update date or delivered countdown */}
                          {shippingStatus === 'delivered' && o.deliveredAt ? (
                            <span className="text-[10px] text-emerald-800 block">
                              تم التسليم: {new Date(o.deliveredAt).toLocaleDateString('ar-DZ')}
                              {hoursUntilArchive !== null && hoursUntilArchive > 0 && (
                                <span className="text-neutral-400 font-mono block">
                                  (أرشفة خلال {hoursUntilArchive} س)
                                </span>
                              )}
                            </span>
                          ) : shippingUpdatedAt ? (
                            <span className="text-[10px] text-neutral-400 block font-mono">
                              تحديث: {new Date(shippingUpdatedAt).toLocaleDateString('ar-DZ')}
                            </span>
                          ) : null}
                        </div>
                      </td>

                      {/* Creation Date */}
                      <td className="py-3.5 px-4 text-neutral-400 text-[11px] font-mono">
                        {new Date(o.createdAt).toLocaleDateString('ar-DZ')}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-left" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onSelectOrder(o)}
                            className="px-2.5 py-1.5 bg-neutral-900 hover:bg-black text-white rounded-lg text-[11px] font-bold inline-flex items-center gap-1 transition-colors"
                            title="عرض تفاصيل الطلب"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>تفاصيل</span>
                          </button>

                          {/* Quick Archive / Unarchive Button */}
                          <button
                            type="button"
                            onClick={() => handleToggleArchive(o.id, !isArchived)}
                            className={`p-1.5 rounded-lg border text-[11px] font-bold transition-colors inline-flex items-center ${
                              isArchived
                                ? 'border-neutral-200 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
                                : 'border-neutral-200 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800'
                            }`}
                            title={isArchived ? 'استعادة الطلب من الأرشيف' : 'نقل الطلب إلى الأرشيف'}
                          >
                            {isArchived ? (
                              <ArchiveRestore className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Archive className="w-3.5 h-3.5" />
                            )}
                          </button>

                          {/* Delete Button */}
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteError(null);
                              setOrderToDelete(o);
                            }}
                            className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="حذف الطلبية"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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

      {/* Order Details Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => onSelectOrder(null)}
            />

            <div className="relative w-full max-w-2xl bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-neutral-150 z-10 text-right animate-in fade-in duration-200">
              
              {/* Modal Header */}
              <div className="flex items-center justify-between pb-4 border-b border-neutral-150 mb-6">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-neutral-400 uppercase tracking-wider">
                      تفاصيل الطلبية
                    </span>
                    {isOrderArchived(selectedOrder, archiveDuration) && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-neutral-100 text-neutral-700 rounded-md text-[10px] font-bold">
                        <Archive className="w-3 h-3 text-neutral-500" />
                        <span>طلب مؤرشف</span>
                      </span>
                    )}
                  </div>
                  <h3 className="font-mono font-black text-2xl text-neutral-950 mt-1">
                    {selectedOrder.orderNumber}
                  </h3>
                  <span className="text-[11px] text-neutral-400">
                    تم التسجيل في: {new Date(selectedOrder.createdAt).toLocaleString('ar-DZ')}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onSelectOrder(null)}
                  className="p-2 text-neutral-400 hover:text-black rounded-xl hover:bg-neutral-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-6 max-h-[75vh] overflow-y-auto px-1">
                
                {/* ─────────────────────────────────────────────────────────────
                    1. فصل الحالات: حالة طلب AMADAL المستقلة
                   ───────────────────────────────────────────────────────────── */}
                <div className="p-4 bg-amber-50/60 rounded-2xl border border-amber-200/80 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-amber-700" />
                        <h4 className="font-bold text-xs text-amber-950">حالة طلب AMADAL (مستقلة عن الشحن)</h4>
                      </div>
                      <span className="text-[11px] text-amber-800">
                        مرحلة معالجة وتجهيز الطلب داخل متجر AMADAL
                      </span>
                    </div>

                    <div>
                      {getAmadalStatusBadge(selectedOrder.status)}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-amber-200/60">
                    <span className="text-xs font-bold text-neutral-800">تحديث حالة طلب AMADAL:</span>
                    <select
                      value={normalizeAmadalStatus(selectedOrder.status)}
                      onChange={(e) => handleUpdateAmadalStatus(selectedOrder.id, e.target.value as OrderStatus)}
                      disabled={isUpdatingStatus}
                      className="px-3 py-2 bg-white border border-amber-300 rounded-xl text-xs font-bold text-neutral-900 focus:outline-none focus:border-black shadow-sm"
                    >
                      {AMADAL_ORDER_STATUSES.map((st) => (
                        <option key={st.value} value={st.value}>
                          {st.label} ({st.description})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* ─────────────────────────────────────────────────────────────
                    2. فصل الحالات: حالة شحنة شركة التوصيل المستقلة + الأرشفة
                   ───────────────────────────────────────────────────────────── */}
                <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-200 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Truck className="w-4 h-4 text-neutral-700" />
                      <h4 className="font-bold text-xs text-neutral-900">حالة شحنة شركة التوصيل (مستقلة)</h4>
                    </div>

                    <div>
                      {getShippingStatusBadge(getNormalizedShippingStatus(selectedOrder))}
                    </div>
                  </div>

                  {andersonFeedback && (
                    <div className="p-2.5 bg-neutral-900 text-white rounded-xl text-xs">
                      {andersonFeedback}
                    </div>
                  )}

                  {/* Shipping Details Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-white p-3.5 rounded-xl border border-neutral-200">
                    <div>
                      <span className="text-neutral-500 block text-[11px]">شركة التوصيل:</span>
                      <span className="font-bold text-neutral-900">Anderson Delivery (EcoTrack)</span>
                    </div>

                    <div>
                      <span className="text-neutral-500 block text-[11px]">رقم الشحنة (Tracking):</span>
                      {getNormalizedTrackingNumber(selectedOrder) ? (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono font-bold text-neutral-950 bg-neutral-100 px-2 py-0.5 rounded border border-neutral-200">
                            {getNormalizedTrackingNumber(selectedOrder)}
                          </span>
                          <a
                            href="https://suivi.ecotrack.dz/suivi/"
                            target="_blank"
                            rel="noreferrer"
                            className="p-1 text-blue-600 hover:text-blue-800"
                            title="تتبع في موقع Anderson"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      ) : (
                        <span className="text-neutral-400 font-mono text-[11px]">لم يتم توليد رقم بعد</span>
                      )}
                    </div>

                    <div>
                      <span className="text-neutral-500 block text-[11px]">تاريخ ووقت آخر تحديث للشحنة:</span>
                      <span className="text-neutral-800 font-mono text-[11px]">
                        {getNormalizedShippingUpdatedAt(selectedOrder)
                          ? new Date(getNormalizedShippingUpdatedAt(selectedOrder)!).toLocaleString('ar-DZ')
                          : 'لم يتم التحديث بعد'}
                      </span>
                    </div>

                    {/* Delivered At & Archive Status */}
                    <div>
                      <span className="text-neutral-500 block text-[11px]">تاريخ ووقت التسليم الفعلي (Delivered At):</span>
                      {selectedOrder.deliveredAt ? (
                        <div className="text-emerald-700 font-mono text-[11px] font-bold">
                          {new Date(selectedOrder.deliveredAt).toLocaleString('ar-DZ')}
                          {getHoursUntilArchive(selectedOrder, archiveDuration) !== null &&
                          getHoursUntilArchive(selectedOrder, archiveDuration)! > 0 ? (
                            <span className="text-neutral-500 block font-normal text-[10px]">
                              متبقي {getHoursUntilArchive(selectedOrder, archiveDuration)} ساعة على الأرشفة التلقائية
                            </span>
                          ) : (
                            <span className="text-emerald-800 block text-[10px]">
                              تمت الأرشفة التلقائية
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-neutral-400 text-[11px]">
                          لم يتم التسليم بعد (غير مؤهل للأرشفة التلقائية)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Manual Update Delivery Status Dropdown */}
                  <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-neutral-200">
                    <div>
                      <span className="text-xs font-bold text-neutral-900 block">تحديث حالة الشحنة يدوياً:</span>
                      <span className="text-[11px] text-neutral-500">اختر الحالة الفعلية للشحنة</span>
                    </div>

                    <select
                      value={getNormalizedShippingStatus(selectedOrder)}
                      onChange={(e) =>
                        handleUpdateShippingStatus(selectedOrder.id, e.target.value as DeliveryShippingStatus)
                      }
                      disabled={isUpdatingShippingStatus}
                      className="px-3.5 py-2 bg-white border border-neutral-300 rounded-xl text-xs font-bold text-neutral-900 focus:outline-none focus:border-black"
                    >
                      {DELIVERY_SHIPPING_STATUSES.map((ds) => (
                        <option key={ds.value} value={ds.value}>
                          {ds.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Quick Action: Mark as Delivered Now */}
                  <div className="pt-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleUpdateShippingStatus(selectedOrder.id, 'delivered')}
                        disabled={isUpdatingShippingStatus || getNormalizedShippingStatus(selectedOrder) === 'delivered'}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-40 flex items-center gap-1.5"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>تأكيد تم التسليم (Delivered)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSendToAnderson(selectedOrder.id)}
                        disabled={isSendingToAnderson}
                        className="px-3 py-1.5 bg-neutral-900 hover:bg-black text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1.5"
                      >
                        <Send className={`w-3.5 h-3.5 ${isSendingToAnderson ? 'animate-spin' : ''}`} />
                        <span>{isSendingToAnderson ? 'جارٍ الإرسال...' : 'إرسال لـ Anderson'}</span>
                      </button>
                    </div>

                    {/* Archive toggle button */}
                    <button
                      type="button"
                      onClick={() =>
                        handleToggleArchive(selectedOrder.id, !isOrderArchived(selectedOrder, archiveDuration))
                      }
                      disabled={isTogglingArchive}
                      className="px-3 py-1.5 bg-white border border-neutral-300 hover:bg-neutral-100 text-neutral-800 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                    >
                      {isOrderArchived(selectedOrder, archiveDuration) ? (
                        <>
                          <ArchiveRestore className="w-3.5 h-3.5 text-emerald-600" />
                          <span>استعادة من الأرشيف للنشطة</span>
                        </>
                      ) : (
                        <>
                          <Archive className="w-3.5 h-3.5 text-neutral-600" />
                          <span>نقل إلى الأرشيف الآن</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Customer Contact & Quick Actions */}
                <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-xs text-neutral-900">بيانات العميل والتوصيل</h4>
                    <div className="flex items-center gap-2">
                      <a
                        href={`https://wa.me/${selectedOrder.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                          `مرحبًا ${selectedOrder.customerName}، معك فريق AMADAL بخصوص طلبك رقم ${selectedOrder.orderNumber}.`
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>واتساب</span>
                      </a>

                      <a
                        href={`tel:${selectedOrder.phone}`}
                        className="px-3 py-1.5 bg-neutral-900 hover:bg-black text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>اتصال</span>
                      </a>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-neutral-700">
                    <p><strong>الاسم:</strong> {selectedOrder.customerName}</p>
                    <p><strong>الهاتف:</strong> <span className="font-mono">{selectedOrder.phone}</span></p>
                    <p><strong>الولاية:</strong> {selectedOrder.wilaya}</p>
                    <p><strong>البلدية:</strong> {selectedOrder.commune}</p>
                    <p className="sm:col-span-2"><strong>العنوان:</strong> {selectedOrder.address}</p>
                    {selectedOrder.notes && (
                      <p className="sm:col-span-2 text-amber-900 bg-amber-50 p-2 rounded-lg border border-amber-200">
                        <strong>ملاحظات العميل:</strong> {selectedOrder.notes}
                      </p>
                    )}
                  </div>
                </div>

                {/* Ordered Items List */}
                <div className="space-y-2">
                  <h4 className="font-bold text-xs text-neutral-900">القطع المطلوبة</h4>
                  <div className="divide-y divide-neutral-100 border border-neutral-150 rounded-2xl overflow-hidden bg-white">
                    {selectedOrder.items?.map((item, idx) => (
                      <div key={idx} className="p-3 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-3">
                          {item.image && (
                            <div className="w-12 h-14 rounded-lg bg-neutral-100 p-1 flex items-center justify-center shrink-0 overflow-hidden border border-neutral-200/60">
                              <img
                                src={item.image}
                                alt=""
                                className="w-full h-full object-contain object-center"
                              />
                            </div>
                          )}
                          <div>
                            <span className="font-bold text-neutral-900 block">{item.name}</span>
                            <span className="text-[11px] text-neutral-500">
                              المقاس: {item.size} • اللون: {item.color} • الكمية: {item.quantity}
                            </span>
                          </div>
                        </div>

                        <span className="font-mono font-bold text-neutral-950">
                          {(item.price * item.quantity).toLocaleString()} د.ج
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Financial Summary */}
                <div className="p-4 bg-neutral-50 rounded-2xl space-y-2 text-xs text-neutral-600">
                  <div className="flex justify-between">
                    <span>المجموع الفرعي للسلع:</span>
                    <span className="font-mono font-bold">{selectedOrder.subtotal.toLocaleString()} د.ج</span>
                  </div>
                  <div className="flex justify-between">
                    <span>تكلفة الشحن ({selectedOrder.deliveryType === 'home' ? 'منزلي' : 'مكتب'}):</span>
                    <span className="font-mono font-bold">{selectedOrder.shippingCost.toLocaleString()} د.ج</span>
                  </div>
                  {selectedOrder.discount ? (
                    <div className="flex justify-between text-emerald-700">
                      <span>الخصم المطبق ({selectedOrder.couponCode || 'قسيمة'}):</span>
                      <span className="font-mono font-bold">-{selectedOrder.discount.toLocaleString()} د.ج</span>
                    </div>
                  ) : null}
                  <div className="pt-2 border-t border-neutral-200 flex justify-between font-black text-sm text-neutral-950 font-mono">
                    <span>الإجمالي المستحق الدفع عند الاستلام:</span>
                    <span>{selectedOrder.total.toLocaleString()} د.ج</span>
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="pt-2 flex justify-between items-center">
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteError(null);
                      setOrderToDelete(selectedOrder);
                    }}
                    className="text-xs text-red-600 hover:text-red-800 font-bold flex items-center gap-1.5 px-3 py-1.5 hover:bg-red-50 rounded-xl transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>حذف هذا الطلب نهائياً</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onSelectOrder(null)}
                    className="px-5 py-2 bg-neutral-900 text-white rounded-xl text-xs font-bold hover:bg-black transition-colors"
                  >
                    إغلاق
                  </button>
                </div>

              </div>

            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Permanent Order Deletion */}
      {orderToDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={() => !isDeleting && setOrderToDelete(null)}
          />
          <div className="relative w-full max-w-md bg-white rounded-3xl p-6 sm:p-7 shadow-2xl z-10 border border-neutral-150 animate-in fade-in zoom-in-95 duration-200 text-right">
            <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mb-4">
              <Trash2 className="w-6 h-6" />
            </div>

            <h3 className="text-base font-bold text-neutral-900 mb-2">
              تأكيد حذف الطلبية نهائياً
            </h3>

            <p className="text-xs text-neutral-600 leading-relaxed mb-4">
              هل أنت متأكد من حذف هذه الطلبية نهائيًا؟ لن تظهر في قائمة الطلبات النشطة أو المؤرشفة بعد الآن.
            </p>

            <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 text-xs mb-4">
              <span className="text-neutral-500">رقم الطلب:</span>{' '}
              <strong className="font-mono text-neutral-900">{orderToDelete.orderNumber}</strong>
              <br />
              <span className="text-neutral-500">اسم العميل:</span>{' '}
              <strong className="text-neutral-900">{orderToDelete.customerName}</strong>
            </div>

            {deleteError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-bold mb-4">
                {deleteError}
              </div>
            )}

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setOrderToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 border border-neutral-200 rounded-xl text-xs font-bold text-neutral-700 hover:bg-neutral-50"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-red-500/20"
              >
                {isDeleting ? 'جارٍ الحذف...' : 'حذف نهائياً'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
