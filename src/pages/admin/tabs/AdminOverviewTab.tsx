import React from 'react';
import {
  TrendingUp,
  ShoppingBag,
  Package,
  DollarSign,
  AlertTriangle,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  Truck
} from 'lucide-react';
import { Order, Product, Customer } from '../../../types';
import { useStore } from '../../../context/StoreContext';

interface AdminOverviewTabProps {
  orders: Order[];
  products: Product[];
  customers: Customer[];
  onSelectTab: (tab: string) => void;
  onViewOrder: (order: Order) => void;
}

export const AdminOverviewTab: React.FC<AdminOverviewTabProps> = ({
  orders,
  products,
  customers,
  onSelectTab,
  onViewOrder,
}) => {
  const { settings } = useStore();

  // Metrics calculation
  const totalRevenue = orders
    .filter((o) => o.status !== 'cancelled')
    .reduce((sum, o) => sum + o.total, 0);

  const totalOrdersCount = orders.length;
  const averageOrderValue = totalOrdersCount > 0 ? Math.round(totalRevenue / totalOrdersCount) : 0;
  const newOrdersCount = orders.filter((o) => o.status === 'new').length;

  // Inventory analysis
  const lowStockItems: { product: Product; variantName: string; stock: number }[] = [];
  products.forEach((p) => {
    p.variants?.forEach((v) => {
      if (v.stock <= (settings.lowStockThreshold || 3)) {
        lowStockItems.push({
          product: p,
          variantName: `${v.color} - ${v.size}`,
          stock: v.stock,
        });
      }
    });
  });

  const recentOrders = [...orders]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-8">
      {/* High-level Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {/* Total Sales */}
        <div className="bg-white rounded-2xl p-6 border border-neutral-150 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
              إجمالي المبيعات
            </span>
            <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center text-neutral-900">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-neutral-950 font-mono">
              {totalRevenue.toLocaleString()}
            </span>
            <span className="text-xs text-neutral-500 mr-1.5 font-bold">{settings.currency || 'د.ج'}</span>
          </div>
          <span className="text-[11px] text-emerald-600 font-semibold block mt-1">
            من {orders.filter((o) => o.status !== 'cancelled').length} طلب مكتمل أو جاري
          </span>
        </div>

        {/* Total Orders */}
        <div className="bg-white rounded-2xl p-6 border border-neutral-150 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
              عدد الطلبات
            </span>
            <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center text-neutral-900">
              <ShoppingBag className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-neutral-950 font-mono">
              {totalOrdersCount}
            </span>
            {newOrdersCount > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 bg-amber-100 text-amber-900 rounded-full">
                {newOrdersCount} طلبات جديدة
              </span>
            )}
          </div>
          <button
            onClick={() => onSelectTab('orders')}
            className="text-[11px] text-neutral-600 hover:text-black font-bold mt-1 inline-flex items-center gap-1"
          >
            <span>إدارة جميع الطلبات</span>
            <ArrowUpRight className="w-3 h-3" />
          </button>
        </div>

        {/* Average Order Value */}
        <div className="bg-white rounded-2xl p-6 border border-neutral-150 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
              متوسط قيمة الطلب
            </span>
            <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center text-neutral-900">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-neutral-950 font-mono">
              {averageOrderValue.toLocaleString()}
            </span>
            <span className="text-xs text-neutral-500 mr-1.5 font-bold">{settings.currency || 'د.ج'}</span>
          </div>
          <span className="text-[11px] text-neutral-400 block mt-1">AOV (Average Order Value)</span>
        </div>

        {/* Total Products */}
        <div className="bg-white rounded-2xl p-6 border border-neutral-150 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
              إجمالي المنتجات
            </span>
            <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center text-neutral-900">
              <Package className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-neutral-950 font-mono">
              {products.length}
            </span>
            <span className="text-xs text-neutral-500 mr-1.5">قطع منشورة</span>
          </div>
          <button
            onClick={() => onSelectTab('products')}
            className="text-[11px] text-neutral-600 hover:text-black font-bold mt-1 inline-flex items-center gap-1"
          >
            <span>إدارة الكتالوج</span>
            <ArrowUpRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Grid: Recent Orders & Low Stock Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Recent Orders (7 Cols) */}
        <div className="lg:col-span-7 bg-white rounded-2xl p-6 border border-neutral-150 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
            <div>
              <h3 className="font-bold text-sm text-neutral-900">أحدث الطلبات الواردة</h3>
              <p className="text-xs text-neutral-400">آخر 5 طلبات مسجلة بالمتجر</p>
            </div>
            <button
              onClick={() => onSelectTab('orders')}
              className="text-xs font-bold text-neutral-900 hover:underline"
            >
              عرض الكل ({orders.length})
            </button>
          </div>

          {recentOrders.length === 0 ? (
            <p className="py-8 text-center text-xs text-neutral-400">لا توجد طلبات بعد.</p>
          ) : (
            <div className="divide-y divide-neutral-100">
              {recentOrders.map((ord) => (
                <div
                  key={ord.id}
                  onClick={() => onViewOrder(ord)}
                  className="py-3 flex items-center justify-between hover:bg-neutral-50/80 p-2 rounded-xl transition-colors cursor-pointer"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xs text-neutral-950">
                        {ord.orderNumber}
                      </span>
                      <span className="text-xs font-medium text-neutral-800">
                        {ord.customerName}
                      </span>
                    </div>
                    <div className="text-[11px] text-neutral-400 mt-0.5">
                      {ord.wilaya} • {ord.items.length} قطع • {new Date(ord.createdAt).toLocaleDateString('ar-DZ')}
                    </div>
                  </div>

                  <div className="text-left">
                    <span className="font-mono font-bold text-xs text-neutral-950 block">
                      {ord.total.toLocaleString()} د.ج
                    </span>
                    <span
                      className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded-full mt-1 ${
                        ord.status === 'new'
                          ? 'bg-amber-100 text-amber-900'
                          : ord.status === 'confirmed'
                          ? 'bg-blue-100 text-blue-900'
                          : ord.status === 'shipped'
                          ? 'bg-purple-100 text-purple-900'
                          : ord.status === 'delivered'
                          ? 'bg-emerald-100 text-emerald-900'
                          : 'bg-red-100 text-red-900'
                      }`}
                    >
                      {ord.status === 'new'
                        ? 'جديد'
                        : ord.status === 'confirmed'
                        ? 'مؤكد'
                        : ord.status === 'preparing' || ord.status === 'processing'
                        ? 'تجهيز'
                        : ord.status === 'shipped'
                        ? 'مشحون'
                        : ord.status === 'delivered'
                        ? 'مكتمل'
                        : 'ملغي'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Low Stock Alerts (5 Cols) */}
        <div className="lg:col-span-5 bg-white rounded-2xl p-6 border border-neutral-150 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <h3 className="font-bold text-sm text-neutral-900">تنبيهات المخزون المنخفض</h3>
            </div>
            <button
              onClick={() => onSelectTab('inventory')}
              className="text-xs font-bold text-neutral-900 hover:underline"
            >
              إدارة المخزون
            </button>
          </div>

          {lowStockItems.length === 0 ? (
            <div className="py-8 text-center text-xs text-emerald-600 bg-emerald-50 rounded-xl p-4">
              <CheckCircle2 className="w-6 h-6 mx-auto mb-1.5" />
              <span>المخزون في حالة ممتازة لجميع المقاسات!</span>
            </div>
          ) : (
            <div className="divide-y divide-neutral-100 max-h-80 overflow-y-auto">
              {lowStockItems.slice(0, 6).map((item, idx) => (
                <div key={idx} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <h5 className="font-bold text-neutral-900 line-clamp-1">{item.product.name}</h5>
                    <span className="text-[11px] text-neutral-500">{item.variantName}</span>
                  </div>
                  <span
                    className={`font-mono font-bold px-2.5 py-1 rounded-lg text-xs ${
                      item.stock === 0
                        ? 'bg-red-100 text-red-700'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {item.stock === 0 ? 'نفذت' : `متبقي ${item.stock}`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

    </div>
  );
};
