import { StoreThemeColors, ElementColorConfig } from '../types';

/**
 * الألوان الافتراضية المعتمدة لعلامة AMADAL
 * كل عنصر يمتلك خيارين فقط: textColor و bgColor بصيغة HEX القياسية (#RRGGBB)
 */
export const DEFAULT_THEME_COLORS: StoreThemeColors = {
  // 1. العناصر العامة (General Elements)
  mainStore: {
    textColor: '#171717',
    bgColor: '#ffffff',
  },
  homepage: {
    textColor: '#171717',
    bgColor: '#ffffff',
  },
  header: {
    textColor: '#ffffff',
    bgColor: '#0a0a0a',
  },
  footer: {
    textColor: '#e5e5e5',
    bgColor: '#0a0a0a',
  },
  navbar: {
    textColor: '#171717',
    bgColor: '#ffffff',
  },

  // 2. عناصر المنتجات (Product Elements)
  productCard: {
    textColor: '#171717',
    bgColor: '#ffffff',
  },
  productName: {
    textColor: '#0a0a0a',
    bgColor: '#ffffff',
  },
  productPrice: {
    textColor: '#0a0a0a',
    bgColor: '#ffffff',
  },
  productsSection: {
    textColor: '#171717',
    bgColor: '#fcfcfc',
  },
  productModal: {
    textColor: '#171717',
    bgColor: '#ffffff',
  },

  // 3. التصنيفات (Categories)
  categoryCard: {
    textColor: '#ffffff',
    bgColor: '#171717',
  },
  categoryName: {
    textColor: '#171717',
    bgColor: '#ffffff',
  },
  categoriesSection: {
    textColor: '#171717',
    bgColor: '#ffffff',
  },

  // 4. الأزرار (Buttons)
  buttonsGeneral: {
    textColor: '#ffffff',
    bgColor: '#0a0a0a',
  },
  btnBuyNow: {
    textColor: '#0a0a0a',
    bgColor: '#ffffff',
  },
  btnAddToCart: {
    textColor: '#ffffff',
    bgColor: '#0a0a0a',
  },
  btnConfirmOrder: {
    textColor: '#ffffff',
    bgColor: '#0a0a0a',
  },
  btnContinueShopping: {
    textColor: '#ffffff',
    bgColor: '#171717',
  },
  btnActions: {
    textColor: '#171717',
    bgColor: '#f5f5f5',
  },

  // 5. سلة التسوق والطلبات (Cart & Orders)
  cartDrawer: {
    textColor: '#171717',
    bgColor: '#ffffff',
  },
  checkoutPage: {
    textColor: '#171717',
    bgColor: '#f9fafb',
  },
  customerInputs: {
    textColor: '#0a0a0a',
    bgColor: '#f9fafb',
  },
  orderSummary: {
    textColor: '#171717',
    bgColor: '#ffffff',
  },

  // 6. النوافذ الإضافية (Modals & Alerts)
  modals: {
    textColor: '#171717',
    bgColor: '#ffffff',
  },
  alerts: {
    textColor: '#991b1b',
    bgColor: '#fef2f2',
  },
  confirmModals: {
    textColor: '#171717',
    bgColor: '#ffffff',
  },
  statusBanners: {
    textColor: '#065f46',
    bgColor: '#ecfdf5',
  },
};

export interface ThemeElementMeta {
  key: keyof StoreThemeColors;
  label: string;
  description: string;
}

export interface ThemeCategoryGroup {
  id: string;
  title: string;
  description: string;
  elements: ThemeElementMeta[];
}

export const THEME_CATEGORY_GROUPS: ThemeCategoryGroup[] = [
  {
    id: 'general',
    title: 'العناصر العامة',
    description: 'خلفية وهوية المتجر الرئيسية، الترويسة، القائمة وشريط التنقل',
    elements: [
      {
        key: 'mainStore',
        label: 'خلفية المتجر الرئيسية',
        description: 'لون الخلفية الشامل والنص العام لصفحات المتجر',
      },
      {
        key: 'homepage',
        label: 'الصفحة الرئيسية',
        description: 'منطقة المحتوى والبانرات في الصفحة الرئيسية',
      },
      {
        key: 'header',
        label: 'الهيدر (Header)',
        description: 'شريط الإعلانات والترويسة العلوية في أعلى الموقع',
      },
      {
        key: 'footer',
        label: 'الفوتر (Footer)',
        description: 'تذييل المتجر في أسفل الصفحات وبيانات التواصل',
      },
      {
        key: 'navbar',
        label: 'شريط التنقل',
        description: 'شريط القائمة الرئيسية والروابط وأيقونات التنقل',
      },
    ],
  },
  {
    id: 'products',
    title: 'عناصر المنتجات',
    description: 'بطاقات المنتجات المعروضة، الأسعار، العناوين ونوافذ التفاصيل',
    elements: [
      {
        key: 'productCard',
        label: 'بطاقات المنتجات',
        description: 'بطاقة عرض المنتج المصغرة في الشبكة وقوائم المنتجات',
      },
      {
        key: 'productName',
        label: 'أسماء المنتجات',
        description: 'عناوين وأسماء المنتجات المعروضة في البطاقات والصفحات',
      },
      {
        key: 'productPrice',
        label: 'الأسعار',
        description: 'أسعار المنتجات المعروضة وتنسيق العملة',
      },
      {
        key: 'productsSection',
        label: 'نافذة / منطقة عرض المنتجات',
        description: 'قسم وشبكة استعراض المنتجات في الصفحة والمتجر',
      },
      {
        key: 'productModal',
        label: 'نافذة تفاصيل المنتج',
        description: 'صفحة ونافذة معاينة المنتج واختيار المقاس واللون',
      },
    ],
  },
  {
    id: 'categories',
    title: 'التصنيفات',
    description: 'أقسام وتصنيفات المتجر وأزرار الفلترة والتنقل',
    elements: [
      {
        key: 'categoryCard',
        label: 'نافذة / بطاقات التصنيفات',
        description: 'بطاقات وأزرار التصنيفات المعروضة في الواجهة',
      },
      {
        key: 'categoryName',
        label: 'أسماء التصنيفات',
        description: 'النصوص التوضيحية لأسماء الأقسام والتصنيفات',
      },
      {
        key: 'categoriesSection',
        label: 'منطقة عرض التصنيفات',
        description: 'القسم المخصص لعرض شبكة الأقسام والتصنيفات',
      },
    ],
  },
  {
    id: 'buttons',
    title: 'الأزرار',
    description: 'جميع أزرار الشراء الفوري، الإضافة للسلة وتأكيد الطلب',
    elements: [
      {
        key: 'buttonsGeneral',
        label: 'جميع أزرار المتجر',
        description: 'النمط العام المعتمد للأزرار في كامل المتجر',
      },
      {
        key: 'btnBuyNow',
        label: 'زر الشراء الآن',
        description: 'زر الشراء الفوري المباشر (الدفع عند الاستلام)',
      },
      {
        key: 'btnAddToCart',
        label: 'زر إضافة إلى السلة',
        description: 'زر إضافة المنتج لحقيبة التسوق',
      },
      {
        key: 'btnConfirmOrder',
        label: 'زر تأكيد الطلب',
        description: 'الزر النهائي لإرسال الطلب في صفحة الدفع',
      },
      {
        key: 'btnContinueShopping',
        label: 'أزرار متابعة التسوق',
        description: 'أزرار العودة للمتجر واستكمال التسوق',
      },
      {
        key: 'btnActions',
        label: 'أزرار الإجراءات الأخرى',
        description: 'أزرار الفلترة، المشاركة، والبحث والإجراءات الإضافية',
      },
    ],
  },
  {
    id: 'cart_orders',
    title: 'سلة التسوق والطلبات',
    description: 'نافذة حقيبة التسوق، حقول بيانات العميل وملخص الحساب',
    elements: [
      {
        key: 'cartDrawer',
        label: 'نافذة سلة التسوق',
        description: 'النافذة المنزلقة لحقيبة التسوق والمنتجات المضافة',
      },
      {
        key: 'checkoutPage',
        label: 'صفحة إتمام الطلب',
        description: 'حاوية صفحة الدفع وإنهاء عملية الشراء',
      },
      {
        key: 'customerInputs',
        label: 'حقول إدخال بيانات العميل',
        description: 'حقول الاسم، رقم الهاتف، الولاية والعنوان بالتفصيل',
      },
      {
        key: 'orderSummary',
        label: 'ملخص الطلب',
        description: 'صندوق ملخص المنتجات، تكلفة الشحن، والخصومات',
      },
    ],
  },
  {
    id: 'modals_alerts',
    title: 'النوافذ الإضافية',
    description: 'النوافذ المنبثقة، التنبيهات، رسائل النجاح وتأكيد العمليات',
    elements: [
      {
        key: 'modals',
        label: 'النوافذ المنبثقة (Modals)',
        description: 'نوافذ البحث، دليل المقاسات والنوافذ الحوارية',
      },
      {
        key: 'alerts',
        label: 'رسائل التنبيه',
        description: 'تنبيهات نفاذ المخزون والتحذيرات الهامة',
      },
      {
        key: 'confirmModals',
        label: 'نوافذ التأكيد',
        description: 'نوافذ تأكيد الخطوات والإجراءات الحساسة',
      },
      {
        key: 'statusBanners',
        label: 'نوافذ النجاح والخطأ',
        description: 'رسائل تأكيد الطلب، نجاح العمليات وإشعارات النظام',
      },
    ],
  },
];

/**
 * Mapping of theme keys to CSS custom properties
 */
const CSS_VARIABLE_MAP: Record<keyof StoreThemeColors, { text: string; bg: string }> = {
  mainStore: { text: '--amadal-main-store-text', bg: '--amadal-main-store-bg' },
  homepage: { text: '--amadal-homepage-text', bg: '--amadal-homepage-bg' },
  header: { text: '--amadal-header-text', bg: '--amadal-header-bg' },
  footer: { text: '--amadal-footer-text', bg: '--amadal-footer-bg' },
  navbar: { text: '--amadal-navbar-text', bg: '--amadal-navbar-bg' },

  productCard: { text: '--amadal-prodcard-text', bg: '--amadal-prodcard-bg' },
  productName: { text: '--amadal-prodname-text', bg: '--amadal-prodname-bg' },
  productPrice: { text: '--amadal-prodprice-text', bg: '--amadal-prodprice-bg' },
  productsSection: { text: '--amadal-prods-section-text', bg: '--amadal-prods-section-bg' },
  productModal: { text: '--amadal-prodmodal-text', bg: '--amadal-prodmodal-bg' },

  categoryCard: { text: '--amadal-catcard-text', bg: '--amadal-catcard-bg' },
  categoryName: { text: '--amadal-catname-text', bg: '--amadal-catname-bg' },
  categoriesSection: { text: '--amadal-cats-section-text', bg: '--amadal-cats-section-bg' },

  buttonsGeneral: { text: '--amadal-btngen-text', bg: '--amadal-btngen-bg' },
  btnBuyNow: { text: '--amadal-btnbuynow-text', bg: '--amadal-btnbuynow-bg' },
  btnAddToCart: { text: '--amadal-btnaddcart-text', bg: '--amadal-btnaddcart-bg' },
  btnConfirmOrder: { text: '--amadal-btnconfirm-text', bg: '--amadal-btnconfirm-bg' },
  btnContinueShopping: { text: '--amadal-btncont-text', bg: '--amadal-btncont-bg' },
  btnActions: { text: '--amadal-btnactions-text', bg: '--amadal-btnactions-bg' },

  cartDrawer: { text: '--amadal-cartdrawer-text', bg: '--amadal-cartdrawer-bg' },
  checkoutPage: { text: '--amadal-checkout-text', bg: '--amadal-checkout-bg' },
  customerInputs: { text: '--amadal-inputs-text', bg: '--amadal-inputs-bg' },
  orderSummary: { text: '--amadal-ordersummary-text', bg: '--amadal-ordersummary-bg' },

  modals: { text: '--amadal-modals-text', bg: '--amadal-modals-bg' },
  alerts: { text: '--amadal-alerts-text', bg: '--amadal-alerts-bg' },
  confirmModals: { text: '--amadal-confirm-text', bg: '--amadal-confirm-bg' },
  statusBanners: { text: '--amadal-status-text', bg: '--amadal-status-bg' },
};

/**
 * Validates and sanitizes a hex color string
 */
export function sanitizeHexColor(val: string, fallback: string): string {
  if (!val || typeof val !== 'string') return fallback;
  const clean = val.trim();
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(clean)) {
    return clean;
  }
  return fallback;
}

/**
 * Merges partial theme colors with defaults to ensure complete config
 */
export function resolveThemeColors(custom?: Partial<StoreThemeColors> | null): StoreThemeColors {
  if (!custom) return { ...DEFAULT_THEME_COLORS };

  const result = { ...DEFAULT_THEME_COLORS };
  const keys = Object.keys(DEFAULT_THEME_COLORS) as Array<keyof StoreThemeColors>;

  for (const k of keys) {
    if (custom[k]) {
      result[k] = {
        textColor: sanitizeHexColor(custom[k]?.textColor, DEFAULT_THEME_COLORS[k].textColor),
        bgColor: sanitizeHexColor(custom[k]?.bgColor, DEFAULT_THEME_COLORS[k].bgColor),
      };
    }
  }

  return result;
}

/**
 * Injects CSS variables onto document.documentElement to immediately apply theme across the app
 */
export function applyThemeToCssVariables(theme?: Partial<StoreThemeColors> | null): void {
  if (typeof document === 'undefined') return;

  const resolved = resolveThemeColors(theme);
  const root = document.documentElement;

  for (const [key, mapping] of Object.entries(CSS_VARIABLE_MAP) as Array<[keyof StoreThemeColors, { text: string; bg: string }]>) {
    const elementConfig = resolved[key];
    if (elementConfig) {
      root.style.setProperty(mapping.text, elementConfig.textColor);
      root.style.setProperty(mapping.bg, elementConfig.bgColor);
    }
  }
}
