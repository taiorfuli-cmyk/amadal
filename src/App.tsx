/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { StoreProvider, useStore } from './context/StoreContext';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { CartDrawer } from './components/CartDrawer';
import { SearchModal } from './components/SearchModal';
import { WhatsAppButton } from './components/WhatsAppButton';
import { AlertCircle, RefreshCw } from 'lucide-react';

// Pages
import { HomePage } from './pages/HomePage';
import { ShopPage } from './pages/ShopPage';
import { ProductDetailPage } from './pages/ProductDetailPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { OrderConfirmationPage } from './pages/OrderConfirmationPage';
import { ContentPage } from './pages/ContentPage';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { Order, Product, CartItem } from './types';

type ViewMode =
  | 'home'
  | 'shop'
  | 'product'
  | 'checkout'
  | 'confirmation'
  | 'content'
  | 'admin';

function AppContent() {
  const { settings, isSettingsLoading, settingsError, retryLoadSettings, products } = useStore();
  const [currentView, setCurrentView] = useState<ViewMode>('home');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedCategorySlug, setSelectedCategorySlug] = useState<string>('all');
  const [selectedContentId, setSelectedContentId] = useState<string>('about');
  const [confirmedOrder, setConfirmedOrder] = useState<Order | null>(null);
  const [directCheckoutItem, setDirectCheckoutItem] = useState<CartItem | null>(null);

  // Modals
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Scroll to top on view changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentView, selectedProduct, selectedCategorySlug, selectedContentId]);

  // Sync view from URL path on load or popstate
  useEffect(() => {
    const syncViewFromLocation = () => {
      const pathname = window.location.pathname;
      const cleanPath = pathname.replace(/^\/+|\/+$/g, '');
      const searchParams = new URLSearchParams(window.location.search);

      if (cleanPath === 'admin' || cleanPath.startsWith('admin/')) {
        setCurrentView('admin');
      } else if (cleanPath === 'checkout') {
        setCurrentView('checkout');
      } else if (cleanPath === 'shop') {
        const cat = searchParams.get('category');
        if (cat) setSelectedCategorySlug(cat);
        setCurrentView('shop');
      } else if (cleanPath.startsWith('product/')) {
        const prodIdOrSlug = cleanPath.replace(/^product\//, '');
        const found = products.find((p) => p.id === prodIdOrSlug || p.slug === prodIdOrSlug);
        if (found) {
          setSelectedProduct(found);
          setCurrentView('product');
        }
      } else if (cleanPath.startsWith('content/')) {
        const pageId = cleanPath.replace(/^content\//, '');
        setSelectedContentId(pageId);
        setCurrentView('content');
      } else if (cleanPath === 'about' || cleanPath === 'faq' || cleanPath === 'contact') {
        setSelectedContentId(cleanPath);
        setCurrentView('content');
      } else if (cleanPath === 'confirmation') {
        setCurrentView('confirmation');
      } else if (cleanPath === '' || cleanPath === 'home') {
        setCurrentView('home');
      }
    };

    syncViewFromLocation();
    window.addEventListener('popstate', syncViewFromLocation);
    return () => window.removeEventListener('popstate', syncViewFromLocation);
  }, [products]);

  const handleNavigate = (view: string, params?: any, replace = false) => {
    let url = '/';

    if (view === 'home') {
      url = '/';
      setCurrentView('home');
    } else if (view === 'shop') {
      if (params?.category && params.category !== 'all') {
        setSelectedCategorySlug(params.category);
        url = `/shop?category=${encodeURIComponent(params.category)}`;
      } else {
        setSelectedCategorySlug('all');
        url = '/shop';
      }
      setCurrentView('shop');
    } else if (view === 'product') {
      if (params?.id) {
        const found = products.find((p) => p.id === params.id || p.slug === params.id);
        if (found) {
          setSelectedProduct(found);
          url = `/product/${encodeURIComponent(found.slug || found.id)}`;
        } else {
          url = `/product/${encodeURIComponent(params.id)}`;
        }
      }
      setCurrentView('product');
    } else if (view === 'checkout') {
      setDirectCheckoutItem(null);
      url = '/checkout';
      setCurrentView('checkout');
    } else if (view === 'content') {
      if (params?.pageId) {
        setSelectedContentId(params.pageId);
        url = `/content/${encodeURIComponent(params.pageId)}`;
      }
      setCurrentView('content');
    } else if (view === 'admin') {
      url = '/admin';
      setCurrentView('admin');
    } else if (view === 'confirmation') {
      url = '/confirmation';
      setCurrentView('confirmation');
    }

    if (window.location.pathname !== url) {
      if (replace) {
        window.history.replaceState({ view }, '', url);
      } else {
        window.history.pushState({ view }, '', url);
      }
    }
  };

  const handleSelectProduct = (product: Product) => {
    setSelectedProduct(product);
    setCurrentView('product');
    const url = `/product/${encodeURIComponent(product.slug || product.id)}`;
    if (window.location.pathname !== url) {
      window.history.pushState({ view: 'product' }, '', url);
    }
  };

  const handleOrderSuccess = (order: Order) => {
    setDirectCheckoutItem(null);
    setConfirmedOrder(order);
    setCurrentView('confirmation');
    if (window.location.pathname !== '/confirmation') {
      window.history.pushState({ view: 'confirmation' }, '', '/confirmation');
    }
  };

  // Loading & Error States: While real store settings are loading from Firestore, do NOT render the store with default/mock values
  if (isSettingsLoading || !settings) {
    if (settingsError) {
      return (
        <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-6 text-white text-center" dir="rtl">
          <div className="max-w-md w-full bg-neutral-900 border border-neutral-800 rounded-3xl p-8 space-y-5 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto text-red-500">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div className="space-y-2">
              <h2 className="text-base font-bold text-white">تعذر تحميل بيانات المتجر</h2>
              <p className="text-xs text-neutral-400 leading-relaxed">{settingsError}</p>
            </div>
            <button
              type="button"
              onClick={retryLoadSettings}
              className="w-full py-3 px-4 bg-white hover:bg-neutral-100 text-black font-bold text-xs rounded-xl transition-colors shadow-md flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>إعادة المحاولة</span>
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-6 text-white text-center select-none" dir="rtl">
        <div className="flex flex-col items-center gap-4 animate-in fade-in duration-300">
          <div className="w-10 h-10 rounded-full border-2 border-neutral-800 border-t-white animate-spin" />
          <div className="space-y-1">
            <span className="font-mono text-sm tracking-[0.25em] uppercase text-neutral-200 block font-bold">AMADAL</span>
            <span className="text-[11px] text-neutral-500 block">جاري تحميل المتجر...</span>
          </div>
        </div>
      </div>
    );
  }

  const isAdminView = currentView === 'admin';

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans selection:bg-neutral-900 selection:text-white flex flex-col justify-between">
      
      {/* Top Navigation Bar */}
      {!isAdminView && (
        <Navbar
          currentView={currentView}
          setCurrentView={handleNavigate}
          onOpenSearch={() => setIsSearchOpen(true)}
        />
      )}

      {/* Main Pages Switcher */}
      <main className="flex-1">
        {currentView === 'home' && (
          <HomePage
            products={products}
            onSelectProduct={handleSelectProduct}
            onNavigate={handleNavigate}
          />
        )}

        {currentView === 'shop' && (
          <ShopPage
            products={products}
            initialCategory={selectedCategorySlug}
            onSelectProduct={handleSelectProduct}
          />
        )}

        {currentView === 'product' && selectedProduct && (
          <ProductDetailPage
            product={selectedProduct}
            allProducts={products}
            onBack={() => setCurrentView('shop')}
            onSelectProduct={handleSelectProduct}
            onProceedToCheckout={() => {
              setDirectCheckoutItem(null);
              setCurrentView('checkout');
            }}
            onInstantBuy={(item) => {
              setDirectCheckoutItem(item);
              setCurrentView('checkout');
            }}
          />
        )}

        {currentView === 'checkout' && (
          <CheckoutPage
            directItem={directCheckoutItem}
            onBackToShop={() => {
              if (directCheckoutItem && selectedProduct) {
                setDirectCheckoutItem(null);
                setCurrentView('product');
              } else {
                setDirectCheckoutItem(null);
                setCurrentView('shop');
              }
            }}
            onOrderSuccess={handleOrderSuccess}
          />
        )}

        {currentView === 'confirmation' && confirmedOrder && (
          <OrderConfirmationPage
            order={confirmedOrder}
            onContinueShopping={() => setCurrentView('shop')}
          />
        )}

        {currentView === 'content' && (
          <ContentPage
            pageId={selectedContentId}
            onNavigate={handleNavigate}
          />
        )}

        {currentView === 'admin' && (
          <AdminDashboard onBackToStore={() => setCurrentView('home')} />
        )}
      </main>

      {/* Footer */}
      {!isAdminView && <Footer onNavigate={handleNavigate} />}

      {/* Cart Drawer */}
      <CartDrawer
        onProceedToCheckout={() => {
          setDirectCheckoutItem(null);
          setCurrentView('checkout');
        }}
        onExploreShop={() => setCurrentView('shop')}
      />

      {/* Search Modal */}
      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        products={products}
        onSelectProduct={(product) => {
          setIsSearchOpen(false);
          handleSelectProduct(product);
        }}
        onSelectCategory={(slug) => {
          setIsSearchOpen(false);
          setSelectedCategorySlug(slug);
          setCurrentView('shop');
        }}
      />

      {/* Floating WhatsApp Action Button */}
      {!isAdminView && <WhatsAppButton />}

    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <StoreProvider>
        <CartProvider>
          <AppContent />
        </CartProvider>
      </StoreProvider>
    </AuthProvider>
  );
}
