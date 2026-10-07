import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  runTransaction
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  Product,
  Category,
  Order,
  Customer,
  StoreSettings,
  HomepageConfig,
  ShippingRate,
  Coupon,
  PageContent,
  ALGERIA_WILAYAS
} from '../types';

export const DEFAULT_SETTINGS: StoreSettings = {
  storeName: 'AMADAL',
  storeDescription: 'علامة الأزياء العصرية الجزائرية — ملابس شبابية راقية بقصات وتفاصيل استثنائية.',
  logoUrl: '',
  faviconUrl: '',
  whatsappNumber: '+213550000000',
  whatsappMessageTemplate: 'مرحبًا AMADAL، أود تأكيد طلبي باسم {customerName}.',
  phone: '0550 00 00 00',
  email: 'contact@amadal.dz',
  address: 'الجزائر العاصمة، الجزائر',
  instagram: 'https://instagram.com/amadal.official',
  tiktok: 'https://tiktok.com/@amadal.official',
  facebook: 'https://facebook.com/amadal.official',
  currency: 'د.ج',
  lowStockThreshold: 3,
  announcementText: 'توصيل متوفر لجميع الـ 69 ولاية — الدفع عند الاستلام — استبدال سريع وسهل',
  showAnnouncement: true,
};

export const DEFAULT_HOMEPAGE: HomepageConfig = {
  hero: {
    title: 'NEW ERA OF CONTEMPORARY STREETWEAR',
    subtitle: 'أزياء عصرية شبابية بهندسة تصميم دقيقة وأقمشة قطنية ثقيلة تلائم ذوقك الفاخر.',
    ctaText: 'اكتشف التشكيلة الجديدة',
    ctaLink: '/shop?category=new-drop',
    imageUrl: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?q=80&w=1600&auto=format&fit=crop',
    isVisible: true,
  },
  promoBanner: {
    title: 'DROP 01 // OVERSIZED ESSENTIALS',
    subtitle: 'تصاميم مريحة بقصات حصرية وأقمشة قطن معالج 100% 280-450 GSM',
    buttonText: 'تسوق الآن',
    buttonLink: '/shop',
    imageUrl: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?q=80&w=1600&auto=format&fit=crop',
    isVisible: true,
  },
  brandSection: {
    badge: 'THE AMADAL PHILOSOPHY',
    title: 'فلسفة التصميم المعاصر',
    content: 'ولدت علامة AMADAL لترسم ملامح جديدة للأزياء الشبابية في الجزائر. نؤمن بأن البساطة قوة، والتفاصيل تصنع الفارق. ملابس صممت لتمنحك حضوراً واثقاً وأناقة هادئة تدوم مع الزمن دون مساومة على الراحة وجودة الخامات.',
    tagline: 'CONFIDENT. MINIMAL. CONTEMPORARY.',
    imageUrl: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?q=80&w=1200&auto=format&fit=crop',
    isVisible: true,
  },
  sectionsOrder: ['hero', 'categories', 'featured', 'promoBanner', 'newArrivals', 'brandSection', 'values'],
};

export const INITIAL_CATEGORIES: Omit<Category, 'id'>[] = [
  {
    name: 'تيشيرتات أوفرسايز',
    nameEn: 'T-Shirts',
    slug: 't-shirts',
    description: 'تيشيرتات قطنية ثقيلة 260-300 GSM بقصة عصرية ومريحة',
    imageUrl: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?q=80&w=800&auto=format&fit=crop',
    order: 1,
    isActive: true,
  },
  {
    name: 'هوديات فاخرة',
    nameEn: 'Hoodies',
    slug: 'hoodies',
    description: 'هوديات شتوية قطنية بقصة Boxy ثقيلة 450 GSM بدون خيوط سحب للمظهر المينيمال الفخم',
    imageUrl: 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?q=80&w=800&auto=format&fit=crop',
    order: 2,
    isActive: true,
  },
  {
    name: 'كاجول وجاكيتات تقنية',
    nameEn: 'Kagoul & Outerwear',
    slug: 'kagoul',
    description: 'جاكيتات كاجول مضادة للرياح والماء بأسلوب ستريتوير مستقبلي',
    imageUrl: 'https://images.unsplash.com/photo-1544441893-675973e31985?q=80&w=800&auto=format&fit=crop',
    order: 3,
    isActive: true,
  },
  {
    name: 'التشكيلة الجديدة New Drop',
    nameEn: 'New Drop',
    slug: 'new-drop',
    description: 'أحدث قطع الموسم محدودة الإصدار',
    imageUrl: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?q=80&w=800&auto=format&fit=crop',
    order: 4,
    isActive: true,
  },
  {
    name: 'بناطيل ستريتوير',
    nameEn: 'Pants',
    slug: 'pants',
    description: 'بناطيل كارجو وقصات واسعة بأقمشة متينة وأزرار مخفية',
    imageUrl: 'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?q=80&w=800&auto=format&fit=crop',
    order: 5,
    isActive: true,
  }
];

export const INITIAL_PRODUCTS: Omit<Product, 'id'>[] = [
  {
    name: 'هودي AMADAL بوكسي قطن ثقيل — أسود فحمي',
    slug: 'amadal-boxy-hoodie-carbon-black',
    description: 'هودي فاخر مصمم بقصة Boxy Cut عصرية بأكتاف ساقطة Dropped Shoulders مصنوع من أجود أنواع القطن الفرنسي المعالج French Terry بوزن 460 GSM. قبعة مزدوجة الطبقات ثابتة بدون حبال لإبراز الطابع المينيمال الراقي مع شريط مضلع متين على الأكمام والخصر.',
    price: 6800,
    salePrice: 5900,
    categoryId: 'hoodies',
    categoryName: 'هوديات فاخرة',
    images: [
      'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?q=80&w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1509967419530-da38b4704bc6?q=80&w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=1200&auto=format&fit=crop'
    ],
    colors: ['أسود Carbon Black', 'رمادي هيذر Heather Grey'],
    sizes: ['S', 'M', 'L', 'XL'],
    variants: [
      { id: 'v1', color: 'أسود Carbon Black', colorHex: '#18181b', size: 'S', stock: 4, sku: 'AMD-HD01-BLK-S' },
      { id: 'v2', color: 'أسود Carbon Black', colorHex: '#18181b', size: 'M', stock: 8, sku: 'AMD-HD01-BLK-M' },
      { id: 'v3', color: 'أسود Carbon Black', colorHex: '#18181b', size: 'L', stock: 6, sku: 'AMD-HD01-BLK-L' },
      { id: 'v4', color: 'أسود Carbon Black', colorHex: '#18181b', size: 'XL', stock: 2, sku: 'AMD-HD01-BLK-XL' },
      { id: 'v5', color: 'رمادي هيذر Heather Grey', colorHex: '#71717a', size: 'S', stock: 3, sku: 'AMD-HD01-GRY-S' },
      { id: 'v6', color: 'رمادي هيذر Heather Grey', colorHex: '#71717a', size: 'M', stock: 5, sku: 'AMD-HD01-GRY-M' },
      { id: 'v7', color: 'رمادي هيذر Heather Grey', colorHex: '#71717a', size: 'L', stock: 4, sku: 'AMD-HD01-GRY-L' },
      { id: 'v8', color: 'رمادي هيذر Heather Grey', colorHex: '#71717a', size: 'XL', stock: 0, sku: 'AMD-HD01-GRY-XL' },
    ],
    sku: 'AMD-HD-001',
    fit: 'Boxy / Oversized Fit',
    fabric: '100% قطن فاخر معالج French Terry 460 GSM خالي من الوبر',
    careInstructions: 'غسيل آلي بماء بارد (30 درجة مئوية) من الداخل للخارج، عدم استخدام مبيضات، تجفيف بالهواء، كوي بحرارة متوسطة من الداخل.',
    sizeGuide: [
      { size: 'S', length: '68 سم', chest: '61 سم', sleeve: '59 سم' },
      { size: 'M', length: '71 سم', chest: '64 سم', sleeve: '61 سم' },
      { size: 'L', length: '74 سم', chest: '67 سم', sleeve: '63 سم' },
      { size: 'XL', length: '77 سم', chest: '70 سم', sleeve: '65 سم' }
    ],
    modelInfo: {
      height: '183 سم',
      wearingSize: 'L',
      fitNote: 'الموديل يرتدي مقاس L لقصة أوفرسايز مميزة'
    },
    isFeatured: true,
    isNew: true,
    isBestSeller: true,
    isPublished: true,
    createdAt: new Date().toISOString(),
  },
  {
    name: 'تيشيرت AMADAL سيجنتشر أوفرسايز — أبيض ناصع',
    slug: 'amadal-signature-heavyweight-tee-white',
    description: 'تيشيرت عصري أساسي بجودة استثنائية. منسوج من خيوط القطن طويل التيلة الممشط بوزن 280 GSM، يمنحك ثباتاً مثالياً في القوام حتى بعد تكرار الغسيل. ياقة دائرية عريضة مضلعة وقصة فضفاضة مريحة تمنحك إطلالة راقية بكل سهولة.',
    price: 3900,
    salePrice: 3400,
    categoryId: 't-shirts',
    categoryName: 'تيشيرتات أوفرسايز',
    images: [
      'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?q=80&w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?q=80&w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?q=80&w=1200&auto=format&fit=crop'
    ],
    colors: ['أبيض ناصع Pure White', 'أسود Charcoal Black'],
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    variants: [
      { id: 'vt1', color: 'أبيض ناصع Pure White', colorHex: '#fafafa', size: 'S', stock: 5, sku: 'AMD-TS01-WHT-S' },
      { id: 'vt2', color: 'أبيض ناصع Pure White', colorHex: '#fafafa', size: 'M', stock: 12, sku: 'AMD-TS01-WHT-M' },
      { id: 'vt3', color: 'أبيض ناصع Pure White', colorHex: '#fafafa', size: 'L', stock: 9, sku: 'AMD-TS01-WHT-L' },
      { id: 'vt4', color: 'أبيض ناصع Pure White', colorHex: '#fafafa', size: 'XL', stock: 6, sku: 'AMD-TS01-WHT-XL' },
      { id: 'vt5', color: 'أبيض ناصع Pure White', colorHex: '#fafafa', size: 'XXL', stock: 2, sku: 'AMD-TS01-WHT-XXL' },
      { id: 'vt6', color: 'أسود Charcoal Black', colorHex: '#18181b', size: 'M', stock: 7, sku: 'AMD-TS01-BLK-M' },
      { id: 'vt7', color: 'أسود Charcoal Black', colorHex: '#18181b', size: 'L', stock: 5, sku: 'AMD-TS01-BLK-L' },
      { id: 'vt8', color: 'أسود Charcoal Black', colorHex: '#18181b', size: 'XL', stock: 0, sku: 'AMD-TS01-BLK-XL' },
    ],
    sku: 'AMD-TS-001',
    fit: 'Relaxed Oversized Fit',
    fabric: '100% قطن ممشط ثقيل 280 GSM، ملمس حريري ناعم ومقاوم للانكماش',
    careInstructions: 'غسيل يدوي أو آلي ببرنامج خفيف 30 درجة، تجنب العصر الشديد، عدم استخدام النشافة الآلية.',
    sizeGuide: [
      { size: 'S', length: '72 سم', chest: '58 سم', sleeve: '24 سم' },
      { size: 'M', length: '75 سم', chest: '61 سم', sleeve: '25 سم' },
      { size: 'L', length: '78 سم', chest: '64 سم', sleeve: '26 سم' },
      { size: 'XL', length: '80 سم', chest: '67 سم', sleeve: '27 سم' },
      { size: 'XXL', length: '82 سم', chest: '70 سم', sleeve: '28 سم' }
    ],
    modelInfo: {
      height: '179 سم',
      wearingSize: 'M',
      fitNote: 'الموديل يرتدي مقاس M لإطلالة متوازنة ومريحة'
    },
    isFeatured: true,
    isNew: true,
    isBestSeller: true,
    isPublished: true,
    createdAt: new Date().toISOString(),
  },
  {
    name: 'جاكيت كاجول AMADAL تيك وير عازل — رمادي مات',
    slug: 'amadal-technical-windbreaker-kagoul',
    description: 'جاكيت كاجول Kagoul عصري بتصميم هندسي فائق الأناقة. مصمم بنسيج تقني ثلاثي الطبقات عازل للرياح ورذاذ المطر مع بطانة مريحة تسمح بالتنفس. يتميز بجيوب كارجو مخفية بسحابات محكمة ضد الماء وياقة مرتفعة قابلة للتعديل بحبال مطاطية مخفية.',
    price: 8500,
    salePrice: 7600,
    categoryId: 'kagoul',
    categoryName: 'كاجول وجاكيتات تقنية',
    images: [
      'https://images.unsplash.com/photo-1544441893-675973e31985?q=80&w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1548883354-7622d03aca27?q=80&w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1551028719-00167b16eac5?q=80&w=1200&auto=format&fit=crop'
    ],
    colors: ['رمادي مات Slate Grey', 'أسود فحمي Phantom Black'],
    sizes: ['M', 'L', 'XL'],
    variants: [
      { id: 'vk1', color: 'رمادي مات Slate Grey', colorHex: '#64748b', size: 'M', stock: 5, sku: 'AMD-KG01-SGY-M' },
      { id: 'vk2', color: 'رمادي مات Slate Grey', colorHex: '#64748b', size: 'L', stock: 4, sku: 'AMD-KG01-SGY-L' },
      { id: 'vk3', color: 'رمادي مات Slate Grey', colorHex: '#64748b', size: 'XL', stock: 2, sku: 'AMD-KG01-SGY-XL' },
      { id: 'vk4', color: 'أسود فحمي Phantom Black', colorHex: '#09090b', size: 'M', stock: 3, sku: 'AMD-KG01-BLK-M' },
      { id: 'vk5', color: 'أسود فحمي Phantom Black', colorHex: '#09090b', size: 'L', stock: 6, sku: 'AMD-KG01-BLK-L' },
    ],
    sku: 'AMD-KG-001',
    fit: 'Contemporary Athletic Fit',
    fabric: 'قماش تقني هجين 85% نايلون عالي الكثافة + 15% إيلاستين بطبقة عزل DWR مقاومة للماء',
    careInstructions: 'تنظيف جاف أو غسيل يدوي بماء فاتر، تجنب استخدام منعم الأقمشة للحفاظ على الطبقة العازلة.',
    sizeGuide: [
      { size: 'M', length: '73 سم', chest: '62 سم', sleeve: '65 سم' },
      { size: 'L', length: '76 سم', chest: '65 سم', sleeve: '67 سم' },
      { size: 'XL', length: '79 سم', chest: '68 سم', sleeve: '69 سم' }
    ],
    modelInfo: {
      height: '185 سم',
      wearingSize: 'L',
      fitNote: 'الموديل يرتدي مقاس L'
    },
    isFeatured: true,
    isNew: true,
    isBestSeller: false,
    isPublished: true,
    createdAt: new Date().toISOString(),
  },
  {
    name: 'سويت شيرت AMADAL مينيمل كرو نيك — أزرق كحلي ليلي',
    slug: 'amadal-minimal-crewneck-midnight-navy',
    description: 'سويت شيرت بدون قبعة بقصة راقية ملائمة للارتداء اليومي أو إطلالات الطبقات Layering. شعار AMADAL منقوش بتطريز دقيق ثلاثي الأبعاد على الصدر بلون متناغم Tone-on-Tone. نسيج قطني كثيف ناعم يمنح الدفء والأناقة بدون تكتل.',
    price: 5400,
    categoryId: 'hoodies',
    categoryName: 'هوديات فاخرة',
    images: [
      'https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?q=80&w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1578587018452-892bacefd3f2?q=80&w=1200&auto=format&fit=crop'
    ],
    colors: ['أزرق كحلي Midnight Navy', 'أخضر غابي Forest Moss'],
    sizes: ['S', 'M', 'L', 'XL'],
    variants: [
      { id: 'vsw1', color: 'أزرق كحلي Midnight Navy', colorHex: '#1e293b', size: 'S', stock: 4, sku: 'AMD-CN01-NVY-S' },
      { id: 'vsw2', color: 'أزرق كحلي Midnight Navy', colorHex: '#1e293b', size: 'M', stock: 6, sku: 'AMD-CN01-NVY-M' },
      { id: 'vsw3', color: 'أزرق كحلي Midnight Navy', colorHex: '#1e293b', size: 'L', stock: 7, sku: 'AMD-CN01-NVY-L' },
      { id: 'vsw4', color: 'أزرق كحلي Midnight Navy', colorHex: '#1e293b', size: 'XL', stock: 3, sku: 'AMD-CN01-NVY-XL' },
    ],
    sku: 'AMD-CN-001',
    fit: 'Relaxed Fit',
    fabric: '100% قطن فاخر مصقول 400 GSM',
    careInstructions: 'غسيل بماء بارد، تجنب المجفف، كوي بحرارة منخفضة.',
    sizeGuide: [
      { size: 'S', length: '69 سم', chest: '59 سم', sleeve: '60 سم' },
      { size: 'M', length: '72 سم', chest: '62 سم', sleeve: '62 سم' },
      { size: 'L', length: '75 سم', chest: '65 سم', sleeve: '64 سم' },
      { size: 'XL', length: '78 سم', chest: '68 سم', sleeve: '66 سم' }
    ],
    modelInfo: {
      height: '181 سم',
      wearingSize: 'M',
      fitNote: 'الموديل يرتدي مقاس M'
    },
    isFeatured: false,
    isNew: false,
    isBestSeller: true,
    isPublished: true,
    createdAt: new Date().toISOString(),
  },
  {
    name: 'بنطال AMADAL كارجو عصري تيلورد — أسود مونوكروم',
    slug: 'amadal-tailored-cargo-pants-black',
    description: 'بنطال كارجو مصمم بقصة تجمع بين فخامة القصات المفصلة Tailored والروح الشبابية الحيوية. جيوب هندسية مستوية بدون بروز زائد، سحابات سفلية لتعديل اتساع الساق، خصر مطاطي جزئي مع حلقات حزام كلاسيكية.',
    price: 6200,
    salePrice: 5500,
    categoryId: 'pants',
    categoryName: 'بناطيل ستريتوير',
    images: [
      'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?q=80&w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1517445312882-bc9910d016b7?q=80&w=1200&auto=format&fit=crop'
    ],
    colors: ['أسود مات Deep Black'],
    sizes: ['S (30)', 'M (32)', 'L (34)', 'XL (36)'],
    variants: [
      { id: 'vp1', color: 'أسود مات Deep Black', colorHex: '#0f172a', size: 'S (30)', stock: 5, sku: 'AMD-PN01-BLK-30' },
      { id: 'vp2', color: 'أسود مات Deep Black', colorHex: '#0f172a', size: 'M (32)', stock: 8, sku: 'AMD-PN01-BLK-32' },
      { id: 'vp3', color: 'أسود مات Deep Black', colorHex: '#0f172a', size: 'L (34)', stock: 4, sku: 'AMD-PN01-BLK-34' },
      { id: 'vp4', color: 'أسود مات Deep Black', colorHex: '#0f172a', size: 'XL (36)', stock: 1, sku: 'AMD-PN01-BLK-36' },
    ],
    sku: 'AMD-PN-001',
    fit: 'Relaxed Tapered Fit',
    fabric: '97% قطن تويل متين + 3% سباندكس للمرونة وسهولة الحركة',
    careInstructions: 'غسيل آلي خفيف 30 درجة، تجنب استخدام مواد التبييض، كوي بدرجة حرارة معتدلة.',
    sizeGuide: [
      { size: 'S (30)', length: '102 سم', chest: 'الخصر: 76-80 سم', sleeve: 'الفخذ: 62 سم' },
      { size: 'M (32)', length: '104 سم', chest: 'الخصر: 81-85 سم', sleeve: 'الفخذ: 65 سم' },
      { size: 'L (34)', length: '106 سم', chest: 'الخصر: 86-90 سم', sleeve: 'الفخذ: 68 سم' },
      { size: 'XL (36)', length: '108 سم', chest: 'الخصر: 91-96 سم', sleeve: 'الفخذ: 71 سم' }
    ],
    modelInfo: {
      height: '183 سم',
      wearingSize: 'M (32)',
      fitNote: 'الموديل يرتدي مقاس M (32)'
    },
    isFeatured: true,
    isNew: true,
    isBestSeller: false,
    isPublished: true,
    createdAt: new Date().toISOString(),
  }
];

export const INITIAL_CONTENT: PageContent[] = [
  {
    id: 'about',
    slug: 'about',
    title: 'عن علامة AMADAL',
    content: `
      <h2>رؤيتنا</h2>
      <p>علامة AMADAL هي براند ملابس جزائري عصري تأسس ليمنح جيل الشباب تجربة أزياء ترقى لأعلى المعايير العالمية. نجمع بين جماليات الستريتوير المعاصر والفخامة الهادئة Minimalist Luxury، مع اهتمام فائق بجودة الخامات والأقمشة القطنية الثقيلة التي تحافظ على شكلها وقيمتها.</p>
      
      <h2>فلسفتنا في التصميم</h2>
      <p>كل قطعة في AMADAL تخضع لدراسة دقيقة في نسب القصات (Proportions) والأكتاف وحركة الجسم، لنضمن تجربة ارتداء مريحة وأنيقة في آن واحد. نبتعد عن التقليد والزخرفة الزائدة لنركز على جوهر القطعة: الخامة، القصة، والحضور الواثق.</p>
      
      <h2>صناعة موثوقة ومحلية</h2>
      <p>نعمل بشغف في الجزائر مع أمهر الحرفيين ومصانع النسيج المتخصصة لضمان جودة تصنيع تنافس الماركات الدولية، مع توفير تجربة تسوق سريعة وموثوقة ودفع آمن عند الاستلام لجميع الولايات.</p>
    `,
    updatedAt: new Date().toISOString()
  },
  {
    id: 'faq',
    slug: 'faq',
    title: 'الأسئلة الشائعة',
    content: `
      <h2>كيف أعرف مقاسي المناسب؟</h2>
      <p>تحتوي كل صفحة منتج على "جدول القياسات" الدقيق بالميليمتر والسنتيمتر (طول القطعة، عرض الصدر، طول الأكمام)، بالإضافة إلى معلومات الموديل وطبيعة القصة (مثلاً Oversized Fit أو Regular Fit). ننصحك بقياس تيشيرتك أو هوديك المفضل ومقارنته بالجدول.</p>
      
      <h2>هل الأقمشة قطنية 100%؟</h2>
      <p>نعم، نعتمد في AMADAL على القطن الطبيعي الفاخر عالي الكثافة (Heavyweight Cotton من 260 إلى 460 GSM)، مما يمنح الملابس متانة استثنائية ونعومة تدوم طويلاً.</p>
      
      <h2>ما هي طرق الدفع المتوفرة؟</h2>
      <p>طريقة الدفع الأساسية هي الدفع نقداً عند الاستلام (Cash on Delivery) بعد وصول عامل التوصيل وتسليمك الطرد.</p>
      
      <h2>كيف أستفسر عن حالة طلبي؟</h2>
      <p>يمكنك التواصل مباشرة مع فريق خدمة العملاء عبر الواتساب أو الهاتف لمتابعة حالة طلبك وتزويدك بآخر التحديثات فوراً.</p>
    `,
    updatedAt: new Date().toISOString()
  },
  {
    id: 'contact',
    slug: 'contact',
    title: 'تواصل معنا',
    content: `
      <h2>فريق خدمة عملاء AMADAL في خدمتكم</h2>
      <p>يسعدنا الرد على استفساراتكم ومساعدتكم في اختيار المقاسات ومتابعة الطلبات طوال أيام الأسبوع.</p>
      <ul>
        <li><strong>واتساب المباشر:</strong> تواصل فوري عبر الزر المخصص في الموقع</li>
        <li><strong>البريد الإلكتروني:</strong> contact@amadal.dz</li>
        <li><strong>أوقات العمل:</strong> يومياً من 09:00 صباحاً حتى 21:00 مساءً</li>
      </ul>
    `,
    updatedAt: new Date().toISOString()
  }
];

export const INITIAL_COUPONS: Omit<Coupon, 'id'>[] = [
  {
    code: 'AMADAL10',
    discountType: 'percentage',
    discountValue: 10,
    minOrder: 5000,
    usageLimit: 100,
    usageCount: 12,
    expiresAt: '2027-12-31',
    isActive: true,
  },
  {
    code: 'NEWDROP',
    discountType: 'fixed',
    discountValue: 500,
    minOrder: 8000,
    usageLimit: 50,
    usageCount: 7,
    expiresAt: '2027-12-31',
    isActive: true,
  }
];

// Seed Helper to initialize store in Firestore if empty
export async function seedInitialStoreData(force = false): Promise<void> {
  try {
    // 1. Store settings are managed exclusively by the store owner and must never be overwritten with defaults.
    const isFirstTimeStoreInit = false;

    // 2. Check or set Homepage
    const homeRef = doc(db, 'homepage', 'main');
    const homeSnap = await getDoc(homeRef);
    if (!homeSnap.exists() || force) {
      await setDoc(homeRef, DEFAULT_HOMEPAGE);
    }

    // 3. Categories
    // CRITICAL: Only seed default categories on first-ever store initialization or if explicitly forced.
    // If the admin deletes all categories, this empty state must be respected and NOT restored on refresh.
    if ((isFirstTimeStoreInit || force)) {
      const categoriesSnap = await getDocs(collection(db, 'categories'));
      if (categoriesSnap.empty || force) {
        for (const cat of INITIAL_CATEGORIES) {
          const catRef = doc(db, 'categories', cat.slug);
          await setDoc(catRef, { ...cat, id: cat.slug });
        }
      }
    }

    // 4. Products
    // CRITICAL: NEVER auto-seed or restore products if the collection is empty!
    // A store with 0 products is a completely valid state (e.g. after the admin deletes all products).
    // Only seed products if explicitly forced (force === true).
    if (force) {
      const productsSnap = await getDocs(collection(db, 'products'));
      if (productsSnap.empty) {
        for (const prod of INITIAL_PRODUCTS) {
          const prodRef = doc(db, 'products', prod.slug);
          await setDoc(prodRef, { ...prod, id: prod.slug });
        }
      }
    }

    // 5. Shipping Rates (all 69 Wilayas)
    const shippingSnap = await getDocs(collection(db, 'shipping'));
    if (shippingSnap.empty || force) {
      for (const w of ALGERIA_WILAYAS) {
        const shipRef = doc(db, 'shipping', `wilaya-${w.code}`);
        const rate: ShippingRate = {
          id: `wilaya-${w.code}`,
          wilayaCode: w.code,
          wilayaName: w.name,
          wilayaNameFr: w.nameFr,
          homePrice: w.defaultHomePrice,
          deskPrice: w.defaultDeskPrice,
          estimatedDays: w.estimatedDays,
          isActive: true,
        };
        await setDoc(shipRef, rate);
      }
    }

    // 6. Content pages
    const contentSnap = await getDocs(collection(db, 'content'));
    if (contentSnap.empty || force) {
      for (const page of INITIAL_CONTENT) {
        await setDoc(doc(db, 'content', page.id), page);
      }
    }

    // 7. Coupons
    // CRITICAL: Only seed default coupons on first-ever store initialization or if explicitly forced.
    // If the admin deletes all coupons, the coupons list must be allowed to remain completely empty.
    if ((isFirstTimeStoreInit || force)) {
      const couponsSnap = await getDocs(collection(db, 'coupons'));
      if (couponsSnap.empty || force) {
        for (const c of INITIAL_COUPONS) {
          await setDoc(doc(db, 'coupons', c.code), { ...c, id: c.code });
        }
      }
    }
  } catch (error) {
    console.error('Error seeding store data:', error);
  }
}
