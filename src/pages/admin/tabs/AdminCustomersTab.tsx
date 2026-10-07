import React, { useState } from 'react';
import { Customer } from '../../../types';
import { Search, MessageCircle, Phone, User, ShoppingBag } from 'lucide-react';
import { useStore } from '../../../context/StoreContext';

interface AdminCustomersTabProps {
  customers: Customer[];
}

export const AdminCustomersTab: React.FC<AdminCustomersTabProps> = ({ customers }) => {
  const { settings } = useStore();
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = customers.filter((c) => {
    const q = searchTerm.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      (c.wilaya && c.wilaya.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      
      {/* Top Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-neutral-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="بحث بالاسم أو الهاتف أو الولاية..."
            className="w-full pr-10 pl-4 py-2.5 bg-white border border-neutral-200 rounded-xl text-xs font-medium focus:outline-none focus:border-black"
          />
        </div>

        <div className="text-xs text-neutral-500 font-mono">
          إجمالي العملاء المسجلين: {customers.length}
        </div>
      </div>

      {/* Customers Table */}
      <div className="bg-white rounded-2xl border border-neutral-150 overflow-hidden shadow-sm">
        <div className="overflow-x-auto scroll-smooth touch-pan-x [-webkit-overflow-scrolling:touch]">
          <table className="w-full min-w-[650px] text-right text-xs">
            <thead className="bg-neutral-50 text-neutral-500 uppercase border-b border-neutral-150">
              <tr>
                <th className="py-3.5 px-4 font-bold">العميل</th>
                <th className="py-3.5 px-4 font-bold">رقم الهاتف</th>
                <th className="py-3.5 px-4 font-bold">الولاية</th>
                <th className="py-3.5 px-4 font-bold">عدد الطلبات</th>
                <th className="py-3.5 px-4 font-bold">إجمالي المشتريات</th>
                <th className="py-3.5 px-4 font-bold">آخر طلب</th>
                <th className="py-3.5 px-4 font-bold text-left">تواصل</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-neutral-400">
                    لا يوجد عملاء مسجلين بعد.
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-neutral-50/70 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center font-bold text-neutral-800">
                          {c.name.charAt(0)}
                        </div>
                        <span className="font-bold text-neutral-900">{c.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono font-medium" dir="ltr">
                      {c.phone}
                    </td>
                    <td className="py-3 px-4 text-neutral-600">{c.wilaya || '-'}</td>
                    <td className="py-3 px-4 font-mono font-bold">
                      {c.totalOrders} {c.totalOrders > 1 ? 'طلبات' : 'طلب'}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-neutral-950">
                      {c.totalSpent.toLocaleString()} {settings.currency || 'د.ج'}
                    </td>
                    <td className="py-3 px-4 text-neutral-400 text-[11px]">
                      {c.lastOrderDate ? new Date(c.lastOrderDate).toLocaleDateString('ar-DZ') : '-'}
                    </td>
                    <td className="py-3 px-4 text-left">
                      <div className="flex items-center justify-end gap-2">
                        <a
                          href={`https://wa.me/${c.phone.replace(/[^0-9]/g, '')}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg transition-colors"
                          title="واتساب"
                        >
                          <MessageCircle className="w-4 h-4" />
                        </a>
                        <a
                          href={`tel:${c.phone}`}
                          className="p-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded-lg transition-colors"
                          title="اتصال هاتفي"
                        >
                          <Phone className="w-4 h-4" />
                        </a>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
