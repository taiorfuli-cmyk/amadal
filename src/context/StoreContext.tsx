import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { doc, onSnapshot, collection, query, orderBy, getDocs, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { StoreSettings, Category, Product } from '../types';
import { INITIAL_CATEGORIES } from '../services/storeService';

interface StoreContextType {
  settings: StoreSettings;
  isSettingsLoading: boolean;
  settingsError: string | null;
  categories: Category[];
  products: Product[];
  isLoading: boolean;
  refreshData: () => Promise<void>;
  retryLoadSettings: () => Promise<void>;
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Real settings start as null — NO default/mock settings are displayed
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [isSettingsLoading, setIsSettingsLoading] = useState<boolean>(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const [categories, setCategories] = useState<Category[]>(
    INITIAL_CATEGORIES.map((c, i) => ({ ...c, id: c.slug || `cat-${i}` }))
  );
  const [products, setProducts] = useState<Product[]>([]);

  // Listen to Real Store Settings from Firestore
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'settings', 'store'),
      (snapshot) => {
        if (snapshot.exists()) {
          setSettings(snapshot.data() as StoreSettings);
          setSettingsError(null);
          setIsSettingsLoading(false);
        } else {
          console.warn('Store settings document not found in Firestore.');
          setSettingsError('لم يتم العثور على إعدادات المتجر المحفوظة في قاعدة البيانات.');
          setIsSettingsLoading(false);
        }
      },
      (error) => {
        console.error('Settings listener error:', error);
        setSettingsError('تعذر الاتصال بقاعدة البيانات لتحميل إعدادات المتجر.');
        setIsSettingsLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const retryLoadSettings = useCallback(async () => {
    setIsSettingsLoading(true);
    setSettingsError(null);
    try {
      const snap = await getDoc(doc(db, 'settings', 'store'));
      if (snap.exists()) {
        setSettings(snap.data() as StoreSettings);
        setSettingsError(null);
      } else {
        setSettingsError('لم يتم العثور على إعدادات المتجر المحفوظة في قاعدة البيانات.');
      }
    } catch (err: any) {
      console.error('Retry load settings error:', err);
      setSettingsError('تعذر الاتصال بقاعدة البيانات لتحميل إعدادات المتجر.');
    } finally {
      setIsSettingsLoading(false);
    }
  }, []);

  // Listen to Categories
  useEffect(() => {
    const q = query(collection(db, 'categories'), orderBy('order', 'asc'));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
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
    return () => unsub();
  }, []);

  // Listen to Products
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'products'),
      (snapshot) => {
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
    return () => unsub();
  }, []);

  const refreshData = useCallback(async () => {
    try {
      const q = query(collection(db, 'categories'), orderBy('order', 'asc'));
      const snapshot = await getDocs(q);
      const list: Category[] = [];
      snapshot.forEach((d) => {
        const data = d.data() as Category;
        list.push({ ...data, id: d.id, slug: data.slug || d.id });
      });
      setCategories(list);
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
