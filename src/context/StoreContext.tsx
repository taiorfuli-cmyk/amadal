import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { doc, onSnapshot, collection, query, orderBy, getDocs, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { StoreSettings, Category, Product, StoreThemeColors } from '../types';
import { INITIAL_CATEGORIES } from '../services/storeService';
import { applyThemeToCssVariables, resolveThemeColors } from '../utils/themeConfig';

interface StoreContextType {
  settings: StoreSettings;
  isSettingsLoading: boolean;
  settingsError: string | null;
  categories: Category[];
  products: Product[];
  isLoading: boolean;
  previewThemeColors: StoreThemeColors | null;
  setPreviewThemeColors: (colors: StoreThemeColors | null) => void;
  refreshData: () => Promise<void>;
  retryLoadSettings: () => Promise<void>;
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Real settings start as null — NO default/mock settings are displayed
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [isSettingsLoading, setIsSettingsLoading] = useState<boolean>(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [previewThemeColors, setPreviewThemeColors] = useState<StoreThemeColors | null>(null);

  // Apply theme to CSS custom properties dynamically on root
  useEffect(() => {
    const activeTheme = previewThemeColors || settings?.themeColors || null;
    applyThemeToCssVariables(activeTheme);
  }, [settings?.themeColors, previewThemeColors]);

  const [categories, setCategories] = useState<Category[]>(
    INITIAL_CATEGORIES.map((c, i) => ({ ...c, id: c.slug || `cat-${i}` }))
  );
  const [products, setProducts] = useState<Product[]>([]);

  // Load Store Settings via Secure Server API with Firestore fallback
  useEffect(() => {
    let isMounted = true;
    const fetchSettings = async () => {
      try {
        const res = await fetch('/api/settings/public');
        if (res.ok) {
          const data = await res.json();
          if (data?.success && data?.settings && isMounted) {
            setSettings(data.settings);
            setSettingsError(null);
            setIsSettingsLoading(false);
            return;
          }
        }
      } catch (e) {
        // Fallback to Firestore listener
      }
    };
    fetchSettings();

    const unsub = onSnapshot(
      doc(db, 'settings', 'store'),
      (snapshot) => {
        if (!isMounted) return;
        if (snapshot.exists()) {
          setSettings(snapshot.data() as StoreSettings);
          setSettingsError(null);
          setIsSettingsLoading(false);
        } else {
          setSettingsError('لم يتم العثور على إعدادات المتجر.');
          setIsSettingsLoading(false);
        }
      },
      (error) => {
        if (!isMounted) return;
        console.warn('Settings listener notice:', error);
        setIsSettingsLoading(false);
      }
    );
    return () => {
      isMounted = false;
      unsub();
    };
  }, []);

  const retryLoadSettings = useCallback(async () => {
    setIsSettingsLoading(true);
    setSettingsError(null);
    try {
      const res = await fetch('/api/settings/public');
      if (res.ok) {
        const data = await res.json();
        if (data?.success && data?.settings) {
          setSettings(data.settings);
          setSettingsError(null);
          setIsSettingsLoading(false);
          return;
        }
      }
      const snap = await getDoc(doc(db, 'settings', 'store'));
      if (snap.exists()) {
        setSettings(snap.data() as StoreSettings);
        setSettingsError(null);
      } else {
        setSettingsError('لم يتم العثور على إعدادات المتجر المحفوظة.');
      }
    } catch (err: any) {
      console.error('Retry load settings error:', err);
      setSettingsError('تعذر الاتصال بالخادم لتحميل إعدادات المتجر.');
    } finally {
      setIsSettingsLoading(false);
    }
  }, []);

  // Load Categories via Server API with Live Firestore sync
  useEffect(() => {
    let isMounted = true;
    const fetchCategories = async () => {
      try {
        const res = await fetch('/api/categories');
        if (res.ok) {
          const data = await res.json();
          if (data?.success && Array.isArray(data.categories) && isMounted) {
            setCategories(data.categories);
          }
        }
      } catch {}
    };
    fetchCategories();

    const q = query(collection(db, 'categories'), orderBy('order', 'asc'));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        if (!isMounted) return;
        const list: Category[] = [];
        snapshot.forEach((d) => {
          const data = d.data() as Category;
          list.push({ ...data, id: d.id, slug: data.slug || d.id });
        });
        setCategories(list);
      },
      (error) => {
        console.warn('Categories listener notice:', error);
      }
    );
    return () => {
      isMounted = false;
      unsub();
    };
  }, []);

  // Load Products via Server API with Live Firestore sync
  useEffect(() => {
    let isMounted = true;
    const fetchProducts = async () => {
      try {
        const res = await fetch('/api/products');
        if (res.ok) {
          const data = await res.json();
          if (data?.success && Array.isArray(data.products) && isMounted) {
            setProducts(data.products);
          }
        }
      } catch {}
    };
    fetchProducts();

    const unsub = onSnapshot(
      collection(db, 'products'),
      (snapshot) => {
        if (!isMounted) return;
        const list: Product[] = [];
        snapshot.forEach((d) => {
          list.push({ ...(d.data() as Product), id: d.id });
        });
        setProducts(list);
      },
      (error) => {
        console.warn('Products listener notice:', error);
      }
    );
    return () => {
      isMounted = false;
      unsub();
    };
  }, []);

  const refreshData = useCallback(async () => {
    try {
      const [prodRes, catRes] = await Promise.allSettled([
        fetch('/api/products').then((r) => r.json()),
        fetch('/api/categories').then((r) => r.json()),
      ]);

      if (prodRes.status === 'fulfilled' && prodRes.value?.success && Array.isArray(prodRes.value.products)) {
        setProducts(prodRes.value.products);
      }
      if (catRes.status === 'fulfilled' && catRes.value?.success && Array.isArray(catRes.value.categories)) {
        setCategories(catRes.value.categories);
      }
    } catch (e) {
      console.warn('Manual refreshData notice:', e);
    }
  }, []);

  return (
    <StoreContext.Provider
      value={{
        settings: settings as StoreSettings,
        isSettingsLoading,
        settingsError,
        categories,
        products,
        isLoading: isSettingsLoading,
        previewThemeColors,
        setPreviewThemeColors,
        refreshData,
        retryLoadSettings,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
};

export const useStore = () => {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error('useStore must be used within a StoreProvider');
  }
  return context;
};
