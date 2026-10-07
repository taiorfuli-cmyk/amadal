export interface ProductVariant {
  id: string;
  color: string;
  colorHex?: string;
  size: 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL' | string;
  stock: number;
  sku?: string;
}

export interface SizeMeasurement {
  size: string;
  length: string; // الطول
  chest: string;  // عرض الصدر
  sleeve: string; // طول الكم
}

export interface ProductImage {
  id?: string;
  url: string;
  path?: string;
  isMain: boolean;
  order: number;
  name?: string;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  salePrice?: number;
  categoryId: string;
  categoryName?: string;
  images: (string | ProductImage)[];
  colors: string[];
  sizes: string[];
  variants: ProductVariant[];
  sku?: string;
  fit: string; // e.g., 'Oversized Fit' | 'Boxy Cut' | 'Relaxed Fit' | 'Regular Fit'
  fabric: string; // e.g., '100% قطن فاخر معالج 280 GSM'
  careInstructions?: string;
  sizeGuide?: SizeMeasurement[];
  modelInfo?: {
    height?: string;
    wearingSize?: string;
    fitNote?: string;
  };
  isFeatured: boolean;
  isNew: boolean;
  isBestSeller: boolean;
  isPublished: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface Category {
  id: string;
  name: string;
  nameEn?: string;
  slug: string;
  description?: string;
  imageUrl?: string;
  order: number;
  isActive: boolean;
}

export interface CartItem {
  id: string;
  productId: string;
  productName: string;
  price: number;
  image: string;
  color: string;
  size: string;
  quantity: number;
  maxStock: number;
}

export interface OrderItem {
  productId: string;
  name: string;
  productName?: string;
  price: number;
  unitPrice?: number;
  color: string;
  size: string;
  quantity: number;
  image: string;
  productImage?: string;
}

export type AmadalOrderStatus = 
  | 'new'          // جديد
  | 'confirmed'    // مؤكد
  | 'preparing'    // قيد التحضير
  | 'shipped'      // تم الشحن
  | 'completed'    // مكتمل
  | 'cancelled'    // ملغى
  | 'returned';    // مرتجع

export type OrderStatus = AmadalOrderStatus | 'processing' | 'delivered';

export type DeliveryShippingStatus =
  | 'not_sent'          // لم يتم الإرسال
  | 'sending'           // قيد الإرسال
  | 'created'           // تم إنشاء الشحنة
  | 'at_hub'            // في محطة الانطلاق
  | 'in_transit'        // قيد المعالجة
  | 'at_delivery_hub'   // في محطة التوصيل
  | 'out_for_delivery'  // خرج للتوصيل
  | 'delivered'         // تم التسليم
  | 'delivery_pending'  // التوصيل معلق
  | 'returning'         // في طريق العودة
  | 'returned'          // تم الإرجاع
  | 'failed';           // فشل الإرسال

export interface Order {
  id: string;
  orderNumber: string; // e.g. AMD-94812
  idempotencyKey?: string;
  customerName: string;
  phone: string;
  wilaya: string;
  wilayaCode: string;
  commune: string;
  address: string;
  notes?: string;
  deliveryType: 'home' | 'desk';
  items: OrderItem[];
  subtotal: number;
  shippingCost: number;
  discount: number;
  couponCode?: string;
  total: number;

  // 1. حالة طلب AMADAL المستقلة
  status: OrderStatus;
  statusHistory?: {
    status: string;
    timestamp: string;
    note?: string;
  }[];

  // 2. حالة شحنة شركة التوصيل المستقلة
  shippingStatus?: DeliveryShippingStatus;
  shippingTrackingNumber?: string;
  shippingUpdatedAt?: string;
  shippingCarrier?: string;
  shippingError?: string;

  // 3. أرشفة الطلبات المكتملة بناءً على تاريخ التسليم في Firestore
  deliveredAt?: string;
  isArchived?: boolean;
  archivedAt?: string;

  inventoryDeducted?: boolean;
  stockRestored?: boolean;
  source?: 'instant_buy' | 'cart';

  // Anderson Delivery EcoTrack Integration (Backwards compatibility)
  andersonStatus?: 'pending' | 'sending' | 'sent' | 'failed';
  andersonTrackingNumber?: string;
  andersonError?: string;
  andersonLastAttemptAt?: string;
  andersonAttempts?: number;
  createdAt: string;
  updatedAt?: string;
}

export interface AndersonSettings {
  enabled: boolean;
  apiToken: string;
  apiBaseUrl?: string;
  autoSendOrders: boolean;
  lastTestedAt?: string;
  lastTestStatus?: 'success' | 'failed' | 'untested';
  lastTestMessage?: string;
  hasToken?: boolean;
  maskedToken?: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  wilaya: string;
  totalOrders: number;
  totalSpent: number;
  lastOrderDate: string;
  lastOrderId?: string;
}

export interface ShippingRate {
  id: string;
  wilayaCode: string;
  wilayaName: string;
  wilayaNameFr?: string;
  homePrice: number;
  deskPrice: number;
  estimatedDays: string;
  isActive: boolean;
  isDeskAvailable?: boolean;
}

export interface Coupon {
  id: string;
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  minOrder?: number;
  usageLimit?: number | null;
  usageCount: number;
  startDate?: string;
  expiresAt?: string;
  isActive: boolean;
}

export interface StoreSettings {
  storeName: string;
  storeDescription: string;
  logoUrl?: string;
  faviconUrl?: string;
  whatsappNumber: string;
  whatsappMessageTemplate: string;
  phone: string;
  email: string;
  address: string;
  instagram: string;
  tiktok: string;
  facebook: string;
  currency: string;
  lowStockThreshold: number;
  orderArchiveDurationHours?: number;
  announcementText: string;
  showAnnouncement: boolean;
}

export interface HomepageConfig {
  hero: {
    title: string;
    subtitle: string;
    ctaText: string;
    ctaLink: string;
    imageUrl: string;
    isVisible: boolean;
  };
  promoBanner: {
    title: string;
    subtitle: string;
    buttonText: string;
    buttonLink: string;
    imageUrl?: string;
    isVisible: boolean;
  };
  brandSection: {
    badge: string;
    title: string;
    content: string;
    tagline: string;
    imageUrl: string;
    isVisible: boolean;
  };
  sectionsOrder: string[];
}

export interface PageContent {
  id: string;
  slug: string;
  title: string;
  content: string;
  updatedAt: string;
}

export interface WilayaInfo {
  code: string;
  name: string;
  nameFr: string;
  defaultHomePrice: number;
  defaultDeskPrice: number;
  estimatedDays: string;
}

export const ALGERIA_WILAYAS: WilayaInfo[] = [
  { code: '01', name: 'أدرار', nameFr: 'Adrar', defaultHomePrice: 900, defaultDeskPrice: 650, estimatedDays: '3-5 أيام' },
  { code: '02', name: 'الشلف', nameFr: 'Chlef', defaultHomePrice: 600, defaultDeskPrice: 400, estimatedDays: '1-2 أيام' },
  { code: '03', name: 'الأغواط', nameFr: 'Laghouat', defaultHomePrice: 750, defaultDeskPrice: 500, estimatedDays: '2-3 أيام' },
  { code: '04', name: 'أم البواقي', nameFr: 'Oum El Bouaghi', defaultHomePrice: 650, defaultDeskPrice: 450, estimatedDays: '2-3 أيام' },
  { code: '05', name: 'باتنة', nameFr: 'Batna', defaultHomePrice: 650, defaultDeskPrice: 450, estimatedDays: '1-2 أيام' },
  { code: '06', name: 'بجاية', nameFr: 'Béjaïa', defaultHomePrice: 600, defaultDeskPrice: 400, estimatedDays: '1-2 أيام' },
  { code: '07', name: 'بسكرة', nameFr: 'Biskra', defaultHomePrice: 700, defaultDeskPrice: 500, estimatedDays: '2-3 أيام' },
  { code: '08', name: 'بشار', nameFr: 'Béchar', defaultHomePrice: 900, defaultDeskPrice: 650, estimatedDays: '3-4 أيام' },
  { code: '09', name: 'البليدة', nameFr: 'Blida', defaultHomePrice: 500, defaultDeskPrice: 350, estimatedDays: '24-48 ساعة' },
  { code: '10', name: 'البويرة', nameFr: 'Bouira', defaultHomePrice: 550, defaultDeskPrice: 350, estimatedDays: '24-48 ساعة' },
  { code: '11', name: 'تمنراست', nameFr: 'Tamanrasset', defaultHomePrice: 1200, defaultDeskPrice: 900, estimatedDays: '4-7 أيام' },
  { code: '12', name: 'تبسة', nameFr: 'Tébessa', defaultHomePrice: 700, defaultDeskPrice: 500, estimatedDays: '2-3 أيام' },
  { code: '13', name: 'تلمسان', nameFr: 'Tlemcen', defaultHomePrice: 650, defaultDeskPrice: 450, estimatedDays: '2-3 أيام' },
  { code: '14', name: 'تيارت', nameFr: 'Tiaret', defaultHomePrice: 650, defaultDeskPrice: 450, estimatedDays: '2-3 أيام' },
  { code: '15', name: 'تيزي وزو', nameFr: 'Tizi Ouzou', defaultHomePrice: 550, defaultDeskPrice: 350, estimatedDays: '24-48 ساعة' },
  { code: '16', name: 'الجزائر العاصمة', nameFr: 'Alger', defaultHomePrice: 400, defaultDeskPrice: 250, estimatedDays: '24-48 ساعة' },
  { code: '17', name: 'الجلفة', nameFr: 'Djelfa', defaultHomePrice: 700, defaultDeskPrice: 500, estimatedDays: '2-3 أيام' },
  { code: '18', name: 'جيجل', nameFr: 'Jijel', defaultHomePrice: 650, defaultDeskPrice: 450, estimatedDays: '2-3 أيام' },
  { code: '19', name: 'سطيف', nameFr: 'Sétif', defaultHomePrice: 600, defaultDeskPrice: 400, estimatedDays: '1-2 أيام' },
  { code: '20', name: 'سعيدة', nameFr: 'Saïda', defaultHomePrice: 700, defaultDeskPrice: 500, estimatedDays: '2-3 أيام' },
  { code: '21', name: 'سكيكدة', nameFr: 'Skikda', defaultHomePrice: 650, defaultDeskPrice: 450, estimatedDays: '2-3 أيام' },
  { code: '22', name: 'سيدي بلعباس', nameFr: 'Sidi Bel Abbès', defaultHomePrice: 650, defaultDeskPrice: 450, estimatedDays: '2-3 أيام' },
  { code: '23', name: 'عنابة', nameFr: 'Annaba', defaultHomePrice: 650, defaultDeskPrice: 450, estimatedDays: '2-3 أيام' },
  { code: '24', name: 'قالمة', nameFr: 'Guelma', defaultHomePrice: 650, defaultDeskPrice: 450, estimatedDays: '2-3 أيام' },
  { code: '25', name: 'قسنطينة', nameFr: 'Constantine', defaultHomePrice: 600, defaultDeskPrice: 400, estimatedDays: '1-2 أيام' },
  { code: '26', name: 'المدية', nameFr: 'Médéa', defaultHomePrice: 550, defaultDeskPrice: 350, estimatedDays: '24-48 ساعة' },
  { code: '27', name: 'مستغانم', nameFr: 'Mostaganem', defaultHomePrice: 600, defaultDeskPrice: 400, estimatedDays: '1-2 أيام' },
  { code: '28', name: 'المسيلة', nameFr: "M'Sila", defaultHomePrice: 650, defaultDeskPrice: 450, estimatedDays: '2-3 أيام' },
  { code: '29', name: 'معسكر', nameFr: 'Mascara', defaultHomePrice: 650, defaultDeskPrice: 450, estimatedDays: '2-3 أيام' },
  { code: '30', name: 'ورقلة', nameFr: 'Ouargla', defaultHomePrice: 800, defaultDeskPrice: 600, estimatedDays: '2-4 أيام' },
  { code: '31', name: 'وهران', nameFr: 'Oran', defaultHomePrice: 550, defaultDeskPrice: 350, estimatedDays: '1-2 أيام' },
  { code: '32', name: 'البيض', nameFr: 'El Bayadh', defaultHomePrice: 800, defaultDeskPrice: 600, estimatedDays: '3-4 أيام' },
  { code: '33', name: 'إليزي', nameFr: 'Illizi', defaultHomePrice: 1300, defaultDeskPrice: 950, estimatedDays: '4-7 أيام' },
  { code: '34', name: 'برج بوعريريج', nameFr: 'Bordj Bou Arreridj', defaultHomePrice: 600, defaultDeskPrice: 400, estimatedDays: '1-2 أيام' },
  { code: '35', name: 'بومرداس', nameFr: 'Boumerdès', defaultHomePrice: 450, defaultDeskPrice: 300, estimatedDays: '24-48 ساعة' },
  { code: '36', name: 'الطارف', nameFr: 'El Tarf', defaultHomePrice: 700, defaultDeskPrice: 500, estimatedDays: '2-3 أيام' },
  { code: '37', name: 'تندوف', nameFr: 'Tindouf', defaultHomePrice: 1200, defaultDeskPrice: 900, estimatedDays: '4-7 أيام' },
  { code: '38', name: 'تيسمسيلت', nameFr: 'Tissemsilt', defaultHomePrice: 650, defaultDeskPrice: 450, estimatedDays: '2-3 أيام' },
  { code: '39', name: 'الوادي', nameFr: 'El Oued', defaultHomePrice: 800, defaultDeskPrice: 600, estimatedDays: '2-3 أيام' },
  { code: '40', name: 'خنشلة', nameFr: 'Khenchela', defaultHomePrice: 700, defaultDeskPrice: 500, estimatedDays: '2-3 أيام' },
  { code: '41', name: 'سوق أهراس', nameFr: 'Souk Ahras', defaultHomePrice: 700, defaultDeskPrice: 500, estimatedDays: '2-3 أيام' },
  { code: '42', name: 'تيبازة', nameFr: 'Tipaza', defaultHomePrice: 500, defaultDeskPrice: 350, estimatedDays: '24-48 ساعة' },
  { code: '43', name: 'ميلة', nameFr: 'Mila', defaultHomePrice: 650, defaultDeskPrice: 450, estimatedDays: '2-3 أيام' },
  { code: '44', name: 'عين الدفلى', nameFr: 'Aïn Defla', defaultHomePrice: 600, defaultDeskPrice: 400, estimatedDays: '1-2 أيام' },
  { code: '45', name: 'النعامة', nameFr: 'Naâma', defaultHomePrice: 850, defaultDeskPrice: 600, estimatedDays: '3-4 أيام' },
  { code: '46', name: 'عين تموشنت', nameFr: 'Aïn Témouchent', defaultHomePrice: 650, defaultDeskPrice: 450, estimatedDays: '2-3 أيام' },
  { code: '47', name: 'غرداية', nameFr: 'Ghardaïa', defaultHomePrice: 800, defaultDeskPrice: 600, estimatedDays: '2-3 أيام' },
  { code: '48', name: 'غليزان', nameFr: 'Relizane', defaultHomePrice: 600, defaultDeskPrice: 400, estimatedDays: '1-2 أيام' },
  { code: '49', name: 'تيميمون', nameFr: 'Timimoun', defaultHomePrice: 950, defaultDeskPrice: 700, estimatedDays: '3-5 أيام' },
  { code: '50', name: 'برج باجي مختار', nameFr: 'Bordj Badji Mokhtar', defaultHomePrice: 1500, defaultDeskPrice: 1200, estimatedDays: '5-8 أيام' },
  { code: '51', name: 'أولاد جلال', nameFr: 'Ouled Djellal', defaultHomePrice: 750, defaultDeskPrice: 550, estimatedDays: '2-3 أيام' },
  { code: '52', name: 'بني عباس', nameFr: 'Béni Abbès', defaultHomePrice: 950, defaultDeskPrice: 700, estimatedDays: '3-5 أيام' },
  { code: '53', name: 'عين صالح', nameFr: 'In Salah', defaultHomePrice: 1100, defaultDeskPrice: 850, estimatedDays: '3-5 أيام' },
  { code: '54', name: 'عين قزام', nameFr: 'In Guezzam', defaultHomePrice: 1500, defaultDeskPrice: 1200, estimatedDays: '5-8 أيام' },
  { code: '55', name: 'تقرت', nameFr: 'Touggourt', defaultHomePrice: 800, defaultDeskPrice: 600, estimatedDays: '2-4 أيام' },
  { code: '56', name: 'جانت', nameFr: 'Djanet', defaultHomePrice: 1400, defaultDeskPrice: 1100, estimatedDays: '5-8 أيام' },
  { code: '57', name: 'المغير', nameFr: "El M'Ghair", defaultHomePrice: 800, defaultDeskPrice: 600, estimatedDays: '2-3 أيام' },
  { code: '58', name: 'المنيعة', nameFr: 'El Meniaa', defaultHomePrice: 900, defaultDeskPrice: 650, estimatedDays: '3-4 أيام' },
  { code: '59', name: 'أفلو', nameFr: 'Aflou', defaultHomePrice: 750, defaultDeskPrice: 500, estimatedDays: '2-3 أيام' },
  { code: '60', name: 'بريكة', nameFr: 'Barika', defaultHomePrice: 650, defaultDeskPrice: 450, estimatedDays: '1-2 أيام' },
  { code: '61', name: 'القنطرة', nameFr: 'El Kantara', defaultHomePrice: 700, defaultDeskPrice: 500, estimatedDays: '2-3 أيام' },
  { code: '62', name: 'بئر العاتر', nameFr: 'Bir El Ater', defaultHomePrice: 700, defaultDeskPrice: 500, estimatedDays: '2-3 أيام' },
  { code: '63', name: 'العريشة', nameFr: 'El Aricha', defaultHomePrice: 650, defaultDeskPrice: 450, estimatedDays: '2-3 أيام' },
  { code: '64', name: 'قصر الشلالة', nameFr: 'Ksar Chellala', defaultHomePrice: 650, defaultDeskPrice: 450, estimatedDays: '2-3 أيام' },
  { code: '65', name: 'عين وسارة', nameFr: 'Aïn Oussera', defaultHomePrice: 700, defaultDeskPrice: 500, estimatedDays: '2-3 أيام' },
  { code: '66', name: 'مسعد', nameFr: 'Messaad', defaultHomePrice: 700, defaultDeskPrice: 500, estimatedDays: '2-3 أيام' },
  { code: '67', name: 'قصر البخاري', nameFr: 'Ksar El Boukhari', defaultHomePrice: 550, defaultDeskPrice: 350, estimatedDays: '24-48 ساعة' },
  { code: '68', name: 'بوسعادة', nameFr: 'Bou Saâda', defaultHomePrice: 650, defaultDeskPrice: 450, estimatedDays: '2-3 أيام' },
  { code: '69', name: 'الأبيض سيدي الشيخ', nameFr: 'El Abiodh Sidi Cheikh', defaultHomePrice: 800, defaultDeskPrice: 600, estimatedDays: '3-4 أيام' },
];
