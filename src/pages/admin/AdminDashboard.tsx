import React, { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  Layers,
  Archive,
  Users,
  Tag,
  Truck,
  Sliders,
  Settings,
  ArrowRight,
  LogOut,
  ShieldCheck,
  ExternalLink,
  Lock,
  UserCheck,
  Send,
  Eye,
  EyeOff,
  KeyRound,
  User,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { Product, Order, Customer, Category } from '../../types';
import { collection, onSnapshot, query, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useStore } from '../../context/StoreContext';
import { AmadalLogo } from '../../components/AmadalLogo';

// Tabs
import { AdminOverviewTab } from './tabs/AdminOverviewTab';
import { AdminProductsTab } from './tabs/AdminProductsTab';
import { AdminOrdersTab } from './tabs/AdminOrdersTab';
import { AdminCategoriesTab } from './tabs/AdminCategoriesTab';
import { AdminInventoryTab } from './tabs/AdminInventoryTab';
import { AdminCustomersTab } from './tabs/AdminCustomersTab';
import { AdminCouponsTab } from './tabs/AdminCouponsTab';
import { AdminShippingTab } from './tabs/AdminShippingTab';
import { AdminHomepageTab } from './tabs/AdminHomepageTab';
import { AdminSettingsTab } from './tabs/AdminSettingsTab';
import { AdminAndersonTab } from './tabs/AdminAndersonTab';
import { AdminAccountTab } from './tabs/AdminAccountTab';
import { Coupon } from '../../types';

interface AdminDashboardProps {
  onBackToStore: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onBackToStore }) => {
  const { currentUser, isAdmin, adminUsername, loginWithCredentials, logout, isLoading: authLoading } = useAuth();
  const { settings, categories, refreshData } = useStore();

  const [activeTab, setActiveTab] = useState<string>('overview');
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Traditional Login Credentials Form State
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    if (!loginUsername.trim() || !loginPassword) {
      setLoginError('يرجى إدخال اسم المستخدم وكلمة المرور.');
      return;
    }
    setIsLoggingIn(true);
    const result = await loginWithCredentials(loginUsername, loginPassword);
    setIsLoggingIn(false);
    if (!result.success) {
      setLoginError(result.error || 'اسم المستخدم أو كلمة المرور غير صحيحة.');
    }
  };

  // Subscribe to Products
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'products'), (snapshot) => {
      const list: Product[] = [];
      snapshot.forEach((d) => list.push({ ...(d.data() as Product), id: d.id }));
      setProducts(list);
    });
    return () => unsub();
  }, []);

  // Subscribe to Orders
  useEffect(() => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: Order[] = [];
        snapshot.forEach((d) => {
          list.push({ ...(d.data() as Order), id: d.id });
        });
        setOrders(list);
      },
      (err) => console.warn('Orders listener error:', err)
    );
    return () => unsub();
  }, []);

  // Subscribe to Customers
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'customers'),
      (snapshot) => {
        const list: Customer[] = [];
        snapshot.forEach((d) => list.push(d.data() as Customer));
        setCustomers(list);
      },
      (err) => console.warn('Customers listener error:', err)
    );
    return () => unsub();
  }, []);

  // Subscribe to Coupons
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'coupons'), (snapshot) => {
      const list: Coupon[] = [];
      snapshot.forEach((d) => list.push({ ...(d.data() as Coupon), id: d.id, code: d.data().code || d.id }));
      setCoupons(list);
    });
    return () => unsub();
  }, []);

  const refreshCoupons = useCallback(async () => {
    try {
      const snap = await getDocs(collection(db, 'coupons'));
      const list: Coupon[] = [];
      snap.forEach((d) => list.push({ ...(d.data() as Coupon), id: d.id, code: d.data().code || d.id }));
      setCoupons(list);
    } catch (e) {
      console.warn('refreshCoupons error:', e);
    }
  }, []);

  // Loading State
  if (authLoading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col justify-center items-center text-white px-4">
        <RefreshCw className="w-8 h-8 animate-spin text-neutral-400 mb-3" />
        <span className="text-xs font-mono text-neutral-400">AMADAL SECURITY VERIFICATION...</span>
      </div>
    );
  }

  // Unauthenticated Screen - Strictly Username & Password
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col justify-center items-center px-4 py-12 text-white">
        <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl p-8 sm:p-10 space-y-6 shadow-2xl">
          <div className="text-center space-y-3">
            <AmadalLogo variant="light" size="lg" customLogoUrl={settings.logoUrl} className="mx-auto" />
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-neutral-800 text-xs text-neutral-300 font-mono mb-2">
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span>AMADAL ADMIN PORTAL</span>
              </div>
              <h2 className="text-xl font-bold text-white mt-1">بوابة إدارة المتجر</h2>
              <p className="text-xs text-neutral-400 mt-1">
                تسجيل الدخول مخصص حصرياً للمشرف وفريق الإدارة.
              </p>
            </div>
          </div>

          {loginError && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-2.5 text-xs animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div className="space-y-1.5 text-right">
              <label className="block text-xs font-semibold text-neutral-300">
                اسم المستخدم
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-neutral-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={loginUsername}
                  onChange={(e) => {
                    setLoginUsername(e.target.value);
                    if (loginError) setLoginError(null);
                  }}
                  placeholder="اسم المستخدم"
                  dir="ltr"
                  autoComplete="username"
                  required
                  className="w-full pr-10 pl-4 py-3 bg-neutral-950 border border-neutral-800 focus:border-white focus:ring-1 focus:ring-white rounded-xl text-sm font-mono text-white outline-none transition-all placeholder:text-neutral-500"
                />
              </div>
            </div>

            <div className="space-y-1.5 text-right">
              <label className="block text-xs font-semibold text-neutral-300">
                كلمة المرور
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-neutral-400">
                  <KeyRound className="w-4 h-4" />
                </div>
                <input
                  type={showLoginPassword ? 'text' : 'password'}
                  value={loginPassword}
                  onChange={(e) => {
                    setLoginPassword(e.target.value);
                    if (loginError) setLoginError(null);
                  }}
                  placeholder="••••••••"
                  dir="ltr"
                  autoComplete="current-password"
                  required
                  className="w-full pr-10 pl-11 py-3 bg-neutral-950 border border-neutral-800 focus:border-white focus:ring-1 focus:ring-white rounded-xl text-sm font-mono text-white outline-none transition-all placeholder:text-neutral-500"
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword(!showLoginPassword)}
                  className="absolute inset-y-0 left-0 pl-3 flex items-center text-neutral-400 hover:text-white transition-colors"
                >
                  {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-3.5 px-4 bg-white hover:bg-neutral-100 text-neutral-950 font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-50 cursor-pointer mt-2"
            >
              {isLoggingIn ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-neutral-950" />
                  <span>جاري التحقق من بيانات الدخول...</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>تسجيل الدخول</span>
                </>
              )}
            </button>
          </form>

          <div className="pt-4 border-t border-neutral-800/80">
            <button
              onClick={onBackToStore}
              className="text-xs text-neutral-400 hover:text-white flex items-center justify-center gap-1.5 mx-auto transition-colors"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              <span>الرجوع إلى المتجر الإلكتروني</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const navItems = [
    { id: 'overview', label: 'لوحة المؤشرات', icon: LayoutDashboard },
    { id: 'orders', label: 'إدارة الطلبات', icon: ShoppingBag, count: orders.filter((o) => o.status === 'new').length },
    { id: 'products', label: 'المنتجات والكتالوج', icon: Package, count: products.length },
    { id: 'categories', label: 'التصنيفات والتشكيلات', icon: Layers },
    { id: 'inventory', label: 'إدارة المخزون', icon: Archive },
    { id: 'customers', label: 'سجل العملاء', icon: Users, count: customers.length },
    { id: 'coupons', label: 'الكوبونات والخصومات', icon: Tag },
    { id: 'shipping', label: 'توصيل الـ 69 ولاية', icon: Truck },
    {
      id: 'anderson',
      label: 'ربط Anderson Delivery',
      icon: Send,
      count: orders.filter((o) => o.andersonStatus === 'failed').length,
    },
    { id: 'homepage', label: 'الصفحة الرئيسية', icon: Sliders },
    { id: 'settings', label: 'إعدادات المتجر', icon: Settings },
    { id: 'account', label: 'حساب المشرف والأمان', icon: KeyRound },
  ];

  return (
    <div className="min-h-screen bg-neutral-100 flex flex-col w-full max-w-full overflow-x-hidden">
      {/* Top Admin Header */}
      <header className="sticky top-0 z-40 bg-neutral-950 text-white border-b border-neutral-800 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onBackToStore}
            className="flex items-center gap-2 text-xs font-bold text-neutral-400 hover:text-white transition-colors"
          >
            <ArrowRight className="w-4 h-4" />
            <span className="hidden sm:inline">العودة للمتجر</span>
          </button>
          <div className="h-4 w-px bg-neutral-800 hidden sm:block" />
          <AmadalLogo variant="light" size="sm" customLogoUrl={settings.logoUrl} />
          <span className="text-[10px] font-mono font-bold bg-neutral-850 px-2 py-0.5 rounded text-neutral-400 uppercase">
            ADMIN PANEL
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onBackToStore}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-850 hover:bg-neutral-800 text-xs font-medium text-neutral-300 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>عرض المتجر المباشر</span>
          </button>

          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-900 border border-neutral-800 text-xs font-mono text-neutral-300">
            <User className="w-3.5 h-3.5 text-neutral-400" />
            <span>@{adminUsername || 'admin'}</span>
          </div>

          <button
            onClick={() => logout()}
            className="p-1.5 text-neutral-400 hover:text-red-400 rounded-lg transition-colors cursor-pointer"
            title="تسجيل الخروج"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Admin Body */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-3.5 sm:px-6 lg:px-8 py-4 sm:py-6 min-w-0 max-w-full">
        
        {/* Navigation Tabs Bar - Single row, smooth touch horizontal scroll */}
        <div className="w-full max-w-full min-w-0 overflow-hidden mb-4 sm:mb-6">
          <div
            className="flex items-center gap-1.5 overflow-x-auto flex-nowrap pb-2 scroll-smooth touch-pan-x no-scrollbar select-none [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            style={{
              display: 'flex',
              flexWrap: 'nowrap',
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}
          >
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    if (item.id === 'orders') setSelectedOrder(null);
                  }}
                  className={`px-3.5 py-2.5 rounded-xl text-xs font-bold shrink-0 flex-shrink-0 flex items-center gap-2 transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-neutral-950 text-white shadow-md ring-1 ring-black/10'
                      : 'bg-white text-neutral-600 hover:text-neutral-950 border border-neutral-200/80 hover:border-neutral-300'
                  }`}
                  style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="whitespace-nowrap">{item.label}</span>
                  {item.count !== undefined && item.count > 0 && (
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono shrink-0 ${
                        isActive ? 'bg-white text-black font-bold' : 'bg-neutral-100 text-neutral-700'
                      }`}
                    >
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content Panels */}
        <div className="pb-16 w-full max-w-full min-w-0">
          {activeTab === 'overview' && (
            <AdminOverviewTab
              orders={orders}
              products={products}
              customers={customers}
              onSelectTab={setActiveTab}
              onViewOrder={(o) => {
                setSelectedOrder(o);
                setActiveTab('orders');
              }}
            />
          )}

          {activeTab === 'products' && (
            <AdminProductsTab
              products={products}
              categories={categories}
              onRefresh={refreshData}
            />
          )}

          {activeTab === 'orders' && (
            <AdminOrdersTab
              orders={orders}
              onRefresh={refreshData}
              selectedOrder={selectedOrder}
              onSelectOrder={setSelectedOrder}
            />
          )}

          {activeTab === 'categories' && (
            <AdminCategoriesTab categories={categories} onRefresh={refreshData} />
          )}

          {activeTab === 'inventory' && (
            <AdminInventoryTab products={products} onRefresh={refreshData} />
          )}

          {activeTab === 'customers' && <AdminCustomersTab customers={customers} />}

          {activeTab === 'coupons' && (
            <AdminCouponsTab
              coupons={coupons}
              onRefresh={() => {
                refreshData();
                refreshCoupons();
              }}
            />
          )}

          {activeTab === 'shipping' && <AdminShippingTab />}

          {activeTab === 'anderson' && (
            <AdminAndersonTab
              orders={orders}
              onRefreshOrders={refreshData}
              onViewOrder={(o) => {
                setSelectedOrder(o);
                setActiveTab('orders');
              }}
            />
          )}

          {activeTab === 'homepage' && <AdminHomepageTab />}

          {activeTab === 'settings' && <AdminSettingsTab />}

          {activeTab === 'account' && <AdminAccountTab />}
        </div>
      </div>
    </div>
  );
};
