import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  ShoppingBag,
  Search,
  Menu,
  X,
  User,
  ChevronDown,
  ArrowLeft,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { AmadalLogo } from './AmadalLogo';
import { useCart } from '../context/CartContext';
import { useStore } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';

interface NavbarProps {
  currentView: string;
  setCurrentView: (view: string, params?: any) => void;
  onOpenSearch: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  setCurrentView,
  onOpenSearch,
}) => {
  const { totalItemsCount, openDrawer } = useCart();
  const { settings, categories } = useStore();
  const { isAdmin } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [mobileCategoriesExpanded, setMobileCategoriesExpanded] = useState(true);

  const activeCategories = categories.filter((c) => c.isActive !== false);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [mobileMenuOpen]);

  // Handle ESC key press to close menu
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  const handleNav = (view: string, params?: any) => {
    setCurrentView(view, params);
    setMobileMenuOpen(false);
    setCategoriesOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-neutral-200/80 transition-all">
      {/* Announcement Bar */}
      {settings.showAnnouncement && settings.announcementText && (
        <div className="bg-neutral-950 text-white text-xs py-2 px-4 text-center font-medium tracking-wide flex items-center justify-center gap-2">
          <span>{settings.announcementText}</span>
        </div>
      )}

      {/* Main Navbar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-18 sm:h-20">
          
          {/* Mobile Menu Button (Hamburger) */}
          <div className="flex items-center md:hidden">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-2 -mr-2 text-neutral-800 hover:text-black focus:outline-none rounded-lg active:bg-neutral-100 transition-colors"
              aria-label="فتح القائمة الرئيسية"
              aria-expanded={mobileMenuOpen}
            >
              <Menu className="w-6 h-6" />
            </button>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center space-x-7 space-x-reverse text-sm font-medium text-neutral-700">
            <button
              onClick={() => handleNav('home')}
              className={`transition-colors py-1 hover:text-black ${
                currentView === 'home' ? 'text-black font-semibold border-b-2 border-black' : ''
              }`}
            >
              الرئيسية
            </button>

            <button
              onClick={() => handleNav('shop')}
              className={`transition-colors py-1 hover:text-black ${
                currentView === 'shop' ? 'text-black font-semibold border-b-2 border-black' : ''
              }`}
            >
              جميع المنتجات
            </button>

            {/* Categories Dropdown */}
            <div className="relative group">
              <button
                className="flex items-center gap-1.5 py-1 hover:text-black transition-colors"
                onMouseEnter={() => setCategoriesOpen(true)}
              >
                <span>التصنيفات</span>
                <ChevronDown className="w-3.5 h-3.5 text-neutral-400 group-hover:rotate-180 transition-transform duration-200" />
              </button>

              <div
                onMouseLeave={() => setCategoriesOpen(false)}
                className="absolute right-0 top-full pt-2 w-56 hidden group-hover:block z-50"
              >
                <div className="bg-white rounded-xl shadow-xl border border-neutral-100 py-2.5 overflow-hidden">
                  {activeCategories.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => handleNav('shop', { category: cat.slug })}
                      className="w-full text-right px-4 py-2.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 hover:text-black transition-colors flex items-center justify-between"
                    >
                      <span>{cat.name}</span>
                      {cat.nameEn && (
                        <span className="text-[10px] text-neutral-400 font-mono" dir="ltr">
                          {cat.nameEn}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={() => handleNav('content', { pageId: 'about' })}
              className={`transition-colors py-1 hover:text-black ${
                currentView === 'content' ? 'text-black font-semibold border-b-2 border-black' : ''
              }`}
            >
              عن AMADAL
            </button>
          </nav>

          {/* Brand Logo - Centered or Prominent */}
          <div className="flex-1 md:flex-initial flex justify-center md:justify-start">
            <button
              onClick={() => handleNav('home')}
              className="flex items-center focus:outline-none transition-transform active:scale-95"
            >
              <AmadalLogo
                variant="dark"
                size="md"
                customLogoUrl={settings.logoUrl}
              />
            </button>
          </div>

          {/* Actions / Right Tools */}
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Search */}
            <button
              onClick={onOpenSearch}
              className="p-2 text-neutral-700 hover:text-black hover:bg-neutral-100 rounded-full transition-colors"
              title="بحث في المتجر"
            >
              <Search className="w-5 h-5" />
            </button>

            {/* Shopping Cart Button */}
            <button
              onClick={openDrawer}
              className="relative p-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-900 rounded-full transition-all active:scale-95"
              aria-label="حقيبة التسوق"
            >
              <ShoppingBag className="w-5 h-5" />
              {totalItemsCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-black text-white text-[11px] font-bold w-5 h-5 rounded-full flex items-center justify-center shadow-md animate-pulse">
                  {totalItemsCount}
                </span>
              )}
            </button>

            {/* Admin Dashboard Portal Link */}
            <button
              onClick={() => handleNav('admin')}
              className={`p-2 rounded-full transition-colors ${
                isAdmin
                  ? 'bg-neutral-900 text-white hover:bg-neutral-800'
                  : 'text-neutral-500 hover:text-black hover:bg-neutral-100'
              }`}
              title={isAdmin ? 'لوحة التحكم (مسجل كمسؤول)' : 'دخول الإدارة'}
            >
              <User className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer Menu - Rendered via Portal at document.body level */}
      {typeof document !== 'undefined' &&
        createPortal(
          mobileMenuOpen ? (
            <div className="fixed inset-0 z-[9998] md:hidden" role="dialog" aria-modal="true">
              {/* Full-screen Backdrop Overlay */}
              <div
                className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 animate-in fade-in"
                onClick={() => setMobileMenuOpen(false)}
                aria-hidden="true"
              />

              {/* Sidebar Container: Fixed from right, full viewport height */}
              <aside className="fixed inset-y-0 right-0 w-[300px] max-w-[85vw] sm:w-[350px] h-full bg-white z-[9999] shadow-2xl flex flex-col justify-between overflow-y-auto transform transition-transform duration-300 ease-out animate-in slide-in-from-right">
                {/* Drawer Header */}
                <div className="p-5 border-b border-neutral-100 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur-sm z-10">
                  <AmadalLogo size="sm" customLogoUrl={settings.logoUrl} />
                  <button
                    onClick={() => setMobileMenuOpen(false)}
                    className="p-2 text-neutral-400 hover:text-neutral-900 rounded-full hover:bg-neutral-100 transition-colors"
                    aria-label="إغلاق القائمة"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                {/* Navigation Links */}
                <div className="py-4 px-5 flex flex-col gap-1 text-sm font-medium flex-1">
                  <button
                    onClick={() => handleNav('home')}
                    className="w-full text-right py-3 px-3 rounded-xl text-neutral-900 hover:bg-neutral-50 font-bold flex items-center justify-between transition-colors"
                  >
                    <span>الرئيسية</span>
                    <ArrowLeft className="w-4 h-4 text-neutral-400" />
                  </button>

                  <button
                    onClick={() => handleNav('shop')}
                    className="w-full text-right py-3 px-3 rounded-xl text-neutral-900 hover:bg-neutral-50 font-bold flex items-center justify-between transition-colors"
                  >
                    <span>جميع المنتجات</span>
                    <ArrowLeft className="w-4 h-4 text-neutral-400" />
                  </button>

                  {/* Categories Section */}
                  <div className="my-2 border-y border-neutral-100 py-2">
                    <button
                      onClick={() => setMobileCategoriesExpanded(!mobileCategoriesExpanded)}
                      className="w-full text-right py-2 px-3 text-xs uppercase tracking-wider text-neutral-400 font-bold flex items-center justify-between"
                    >
                      <span>التصنيفات ({activeCategories.length})</span>
                      <ChevronDown
                        className={`w-4 h-4 text-neutral-400 transition-transform duration-200 ${
                          mobileCategoriesExpanded ? 'rotate-180' : ''
                        }`}
                      />
                    </button>

                    {mobileCategoriesExpanded && (
                      <div className="space-y-1 pt-1 pr-2">
                        {activeCategories.map((cat) => (
                          <button
                            key={cat.id}
                            onClick={() => handleNav('shop', { category: cat.slug })}
                            className="w-full text-right py-2 px-3 rounded-lg text-xs font-semibold text-neutral-700 hover:text-black hover:bg-neutral-50 flex items-center justify-between transition-colors"
                          >
                            <span>{cat.name}</span>
                            {cat.nameEn && (
                              <span className="text-[10px] text-neutral-400 font-mono" dir="ltr">
                                {cat.nameEn}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => handleNav('content', { pageId: 'about' })}
                    className="w-full text-right py-2.5 px-3 rounded-xl text-neutral-700 hover:text-black hover:bg-neutral-50 flex items-center justify-between transition-colors"
                  >
                    <span>عن علامة AMADAL</span>
                    <ArrowLeft className="w-3.5 h-3.5 text-neutral-300" />
                  </button>

                  <button
                    onClick={() => handleNav('content', { pageId: 'faq' })}
                    className="w-full text-right py-2.5 px-3 rounded-xl text-neutral-700 hover:text-black hover:bg-neutral-50 flex items-center justify-between transition-colors"
                  >
                    <span>الأسئلة الشائعة</span>
                    <ArrowLeft className="w-3.5 h-3.5 text-neutral-300" />
                  </button>
                </div>

                {/* Drawer Footer */}
                <div className="p-5 border-t border-neutral-100 bg-neutral-50/60 space-y-2.5 sticky bottom-0">
                  <button
                    onClick={() => handleNav('admin')}
                    className="w-full py-2.5 px-4 bg-white border border-neutral-200 hover:border-black text-neutral-900 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all"
                  >
                    <User className="w-4 h-4" />
                    <span>لوحة التحكم (الإدارة)</span>
                  </button>

                  {settings.whatsappNumber && (
                    <a
                      href={`https://wa.me/${settings.whatsappNumber.replace(/[^0-9]/g, '')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full py-2.5 px-4 bg-neutral-950 hover:bg-black text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all"
                    >
                      <span>تواصل معنا عبر واتساب</span>
                    </a>
                  )}
                </div>
              </aside>
            </div>
          ) : null,
          document.body
        )}
    </header>
  );
};
