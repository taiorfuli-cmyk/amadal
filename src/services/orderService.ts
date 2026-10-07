import {
  doc,
  runTransaction,
  getDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  Order,
  OrderItem,
  Product,
  ProductVariant,
  ALGERIA_WILAYAS,
} from '../types';
import { getMainImageUrl } from './storageService';

export interface CreateOrderItemInput {
  productId: string;
  size?: string;
  color?: string;
  quantity: number;
}

export interface CreateOrderParams {
  items: CreateOrderItemInput[];
  customerName: string;
  phone: string;
  wilayaCode: string;
  commune: string;
  address: string;
  deliveryType: 'home' | 'desk';
  notes?: string;
  couponCode?: string;
  source?: 'instant_buy' | 'cart';
  idempotencyKey: string;
}

/**
 * Generate a cryptographically robust and unique Idempotency Key for an order attempt.
 */
export function generateOrderIdempotencyKey(): string {
  const timestamp = Date.now();
  const randomPart = Math.random().toString(36).substring(2, 10);
  const cryptoPart =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().substring(0, 8)
      : Math.random().toString(36).substring(2, 8);
  return `amd_${timestamp}_${randomPart}_${cryptoPart}`;
}

/**
 * Atomically create an order and update inventory in Firestore using `runTransaction`.
 * Guarantees ACID properties:
 * 1. Checks idempotency: if an order with this idempotency key exists, returns it directly.
 * 2. Reads all product documents and verifies real-time variant stock.
 * 3. Reads coupon if provided and validates constraints.
 * 4. Deducts stock in memory.
 * 5. Commits writes atomically: updates product variants, updates coupon usage, and creates the order document.
 * If concurrent users purchase simultaneously, Firestore transaction locks & retries prevent race conditions.
 * If any error occurs (e.g. out of stock), the transaction aborts with NO stock loss and NO orphan order.
 */
export async function createOrderWithTransaction(
  params: CreateOrderParams
): Promise<Order> {
  // 1. Sanitize & Validate input
  const customerName = params.customerName.trim();
  if (!customerName || customerName.length < 2) {
    throw new Error('يرجى إدخال الاسم الكامل (حرفين على الأقل).');
  }

  const cleanPhone = params.phone.replace(/[^0-9]/g, '');
  if (cleanPhone.length < 9 || cleanPhone.length > 15) {
    throw new Error('يرجى إدخال رقم هاتف صالح (مثال: 0550123456).');
  }

  const cleanWilayaCode = params.wilayaCode.trim().padStart(2, '0');
  const wilayaInfo = ALGERIA_WILAYAS.find((w) => w.code === cleanWilayaCode);
  if (!wilayaInfo) {
    throw new Error('الولاية المحددة غير صالحة.');
  }

  const commune = params.commune.trim();
  if (!commune) {
    throw new Error('يرجى تحديد البلدية.');
  }

  const address = params.address.trim();
  if (!address || address.length < 3) {
    throw new Error('يرجى كتابة عنوان التوصيل بالتفصيل.');
  }

  if (!Array.isArray(params.items) || params.items.length === 0) {
    throw new Error('لا توجد منتجات في الطلب.');
  }

  const sanitizedItems: CreateOrderItemInput[] = params.items.map((it) => ({
    productId: String(it.productId).trim(),
    size: String(it.size || 'Standard').trim(),
    color: String(it.color || 'Standard').trim(),
    quantity: Math.max(1, Math.floor(Number(it.quantity) || 1)),
  }));

  if (sanitizedItems.some((it) => !it.productId)) {
    throw new Error('أحد المنتجات المحددة غير صالح.');
  }

  const cleanIdempotencyKey = (
    params.idempotencyKey?.trim() || generateOrderIdempotencyKey()
  ).substring(0, 80);

  const orderId = `order_${cleanIdempotencyKey}`;
  const orderNumber = `AMD-${Math.floor(100000 + Math.random() * 900000)}`;
  const uniqueProductIds = Array.from(new Set(sanitizedItems.map((i) => i.productId)));

  // Execute Atomic Transaction
  return await runTransaction(db, async (transaction) => {
    const orderRef = doc(db, 'orders', orderId);

    // ─────────────────────────────────────────────────────────────
    // STEP 0: Idempotency Check inside Transaction
    // ─────────────────────────────────────────────────────────────
    const existingOrderSnap = await transaction.get(orderRef);
    if (existingOrderSnap.exists()) {
      console.warn(
        `[Idempotency] Order ${orderId} already exists in Firestore. Returning committed order.`
      );
      return existingOrderSnap.data() as Order;
    }

    // ─────────────────────────────────────────────────────────────
    // STEP 1: Verify Real Shipping Rate in Firestore
    // ─────────────────────────────────────────────────────────────
    let shippingCost =
      params.deliveryType === 'desk'
        ? wilayaInfo.defaultDeskPrice
        : wilayaInfo.defaultHomePrice;

    const shippingRef = doc(db, 'shipping', `wilaya-${cleanWilayaCode}`);
    const shippingSnap = await transaction.get(shippingRef);
    if (shippingSnap.exists()) {
      const sData = shippingSnap.data();
      if (params.deliveryType === 'desk' && sData.isDeskAvailable === false) {
        throw new Error(
          `التوصيل إلى المكتب (Stop Desk) غير متوفر في ولاية ${wilayaInfo.name}. يرجى اختيار التوصيل إلى المنزل.`
        );
      }
      if (params.deliveryType === 'home' && typeof sData.homePrice === 'number') {
        shippingCost = sData.homePrice;
      } else if (params.deliveryType === 'desk' && typeof sData.deskPrice === 'number') {
        shippingCost = sData.deskPrice;
      }
    }

    // ─────────────────────────────────────────────────────────────
    // STEP 2: Read All Product Documents inside Transaction
    // ─────────────────────────────────────────────────────────────
    const productSnapMap = new Map<string, { ref: ReturnType<typeof doc>; data: Product }>();
    for (const pid of uniqueProductIds) {
      const productRef = doc(db, 'products', pid);
      const snap = await transaction.get(productRef);
      if (!snap.exists()) {
        throw new Error('المنتج المطلوب غير موجود أو تم حذفه من المتجر.');
      }
      productSnapMap.set(pid, { ref: productRef, data: snap.data() as Product });
    }

    // ─────────────────────────────────────────────────────────────
    // STEP 3: Read Coupon Document inside Transaction (if provided)
    // ─────────────────────────────────────────────────────────────
    let couponRef: ReturnType<typeof doc> | null = null;
    let couponSnap: any = null;
    const normCouponCode = (params.couponCode || '').trim().toUpperCase();

    if (normCouponCode) {
      couponRef = doc(db, 'coupons', normCouponCode);
      couponSnap = await transaction.get(couponRef);
      if (!couponSnap.exists() || !couponSnap.data()?.isActive) {
        throw new Error('كود الخصم غير متاح حالياً أو تم تعطيله.');
      }
      const cData = couponSnap.data();
      const todayStr = new Date().toISOString().split('T')[0];
      if (cData.startDate && todayStr < cData.startDate) {
        throw new Error(`كود الخصم غير متاح بعد (يبدأ في ${cData.startDate}).`);
      }
      if (cData.expiresAt && todayStr > cData.expiresAt) {
        throw new Error('انتهت صلاحية كود الخصم.');
      }
      const currentUsage = typeof cData.usageCount === 'number' ? cData.usageCount : 0;
      if (typeof cData.usageLimit === 'number' && currentUsage >= cData.usageLimit) {
        throw new Error('تم استنفاد الحد الأقصى لاستخدام هذا الكوبون.');
      }
    }

    // ─────────────────────────────────────────────────────────────
    // STEP 4: Inventory Verification & Atomic Stock Deduction
    // ─────────────────────────────────────────────────────────────
    const updatedVariantsMap = new Map<string, ProductVariant[]>();
    for (const [pid, entry] of productSnapMap.entries()) {
      const clonedVariants = (entry.data.variants || []).map((v) => ({ ...v }));
      updatedVariantsMap.set(pid, clonedVariants);
    }

    const verifiedOrderItems: OrderItem[] = [];
    let verifiedSubtotal = 0;

    for (const itemReq of sanitizedItems) {
      const productEntry = productSnapMap.get(itemReq.productId);
      if (!productEntry) {
        throw new Error('المنتج غير موجود.');
      }
      const pData = productEntry.data;
      if (pData.isPublished === false) {
        throw new Error(`المنتج (${pData.name || itemReq.productId}) غير متاح حالياً.`);
      }

      const currentVariants = updatedVariantsMap.get(itemReq.productId)!;
      let vIdx = currentVariants.findIndex((v) => {
        const matchSize = (v.size || '').trim().toLowerCase() === (itemReq.size || '').toLowerCase();
        if (itemReq.color && v.color && itemReq.color !== 'Standard') {
          return matchSize && v.color.trim().toLowerCase() === itemReq.color.toLowerCase();
        }
        return matchSize;
      });

      if (vIdx === -1 && currentVariants.length > 0) {
        vIdx = currentVariants.findIndex(
          (v) => (v.size || '').trim().toLowerCase() === (itemReq.size || '').toLowerCase()
        );
      }

      if (vIdx === -1 && currentVariants.length > 0) {
        throw new Error(`المقاس (${itemReq.size}) غير متوفر لمنتج "${pData.name}".`);
      }

      const targetVariant = vIdx !== -1 ? currentVariants[vIdx] : null;
      if (targetVariant) {
        const currentStock = Number(targetVariant.stock) || 0;
        if (currentStock < itemReq.quantity) {
          if (currentStock <= 0) {
            throw new Error(
              `عذراً، نفد مخزون مقاس (${itemReq.size}) من منتج "${pData.name}" أثناء إتمام الطلب.`
            );
          } else {
            throw new Error(
              `الكمية المتبقية من مقاس (${itemReq.size}) لمنتج "${pData.name}" هي ${currentStock} قطع فقط.`
            );
          }
        }
        // Deduct inventory atomically
        targetVariant.stock = Math.max(0, currentStock - itemReq.quantity);
      }

      // Authentic unit price from database document
      let verifiedUnitPrice = 0;
      const basePrice = Number(pData.price) || 0;
      if (
        typeof pData.salePrice === 'number' &&
        pData.salePrice > 0 &&
        pData.salePrice < basePrice
      ) {
        verifiedUnitPrice = pData.salePrice;
      } else if (basePrice > 0) {
        verifiedUnitPrice = basePrice;
      } else {
        throw new Error(`سعر المنتج "${pData.name}" غير محدد بشكل صحيح.`);
      }

      const itemTotal = verifiedUnitPrice * itemReq.quantity;
      verifiedSubtotal += itemTotal;

      const mainImg = getMainImageUrl(pData.images) || '';

      verifiedOrderItems.push({
        productId: itemReq.productId,
        name: pData.name,
        productName: pData.name,
        price: verifiedUnitPrice,
        unitPrice: verifiedUnitPrice,
        color: targetVariant?.color || itemReq.color || 'Standard',
        size: targetVariant?.size || itemReq.size || 'Standard',
        quantity: itemReq.quantity,
        image: mainImg,
        productImage: mainImg,
      });
    }

    // ─────────────────────────────────────────────────────────────
    // STEP 5: Coupon Discount Computation
    // ─────────────────────────────────────────────────────────────
    let discountAmount = 0;
    if (couponSnap && couponSnap.exists()) {
      const cData = couponSnap.data();
      if (cData.minOrder && verifiedSubtotal < cData.minOrder) {
        throw new Error(
          `الحد الأدنى لتطبيق كود الخصم هو ${cData.minOrder} د.ج (المجموع الحالي: ${verifiedSubtotal} د.ج).`
        );
      }
      if (cData.discountType === 'percentage') {
        discountAmount = Math.round(
          (verifiedSubtotal * (Number(cData.discountValue) || 0)) / 100
        );
      } else {
        discountAmount = Math.max(0, Number(cData.discountValue) || 0);
      }
      discountAmount = Math.min(discountAmount, verifiedSubtotal);
    }

    const verifiedGrandTotal =
      Math.max(0, verifiedSubtotal - discountAmount) + shippingCost;

    // ─────────────────────────────────────────────────────────────
    // STEP 6: Execute Atomic Writes in Transaction
    // ─────────────────────────────────────────────────────────────
    const nowIso = new Date().toISOString();

    // 1. Update products stock
    for (const [pid, updatedVariants] of updatedVariantsMap.entries()) {
      const pRef = productSnapMap.get(pid)!.ref;
      transaction.update(pRef, {
        variants: updatedVariants,
        updatedAt: nowIso,
      });
    }

    // 2. Increment coupon usage
    if (couponRef && couponSnap && couponSnap.exists()) {
      const currentUsage =
        typeof couponSnap.data()?.usageCount === 'number'
          ? couponSnap.data()?.usageCount
          : 0;
      transaction.update(couponRef, {
        usageCount: currentUsage + 1,
      });
    }

    // 3. Create Order document
    const orderPayload: Order = {
      id: orderId,
      orderNumber,
      idempotencyKey: cleanIdempotencyKey,
      customerName,
      phone: cleanPhone,
      wilaya: wilayaInfo.name,
      wilayaCode: cleanWilayaCode,
      commune,
      address,
      notes: (params.notes || '').trim(),
      deliveryType: params.deliveryType,
      items: verifiedOrderItems,
      subtotal: verifiedSubtotal,
      shippingCost,
      discount: discountAmount,
      total: verifiedGrandTotal,
      status: 'new',
      statusHistory: [
        {
          status: 'new',
          timestamp: nowIso,
          note:
            params.source === 'instant_buy'
              ? 'طلب شراء فوري جديد (تم تأكيد العملية والمخزون بمعاملة ذرية runTransaction)'
              : 'طلب جديد عبر السلة (تم تأكيد العملية والمخزون بمعاملة ذرية runTransaction)',
        },
      ],
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    if (normCouponCode && discountAmount > 0) {
      orderPayload.couponCode = normCouponCode;
    }

    transaction.set(orderRef, orderPayload);

    return orderPayload;
  });
}

/**
 * Unified Order Submission with Server API priority and automatic Firestore runTransaction fallback.
 * Guarantees zero downtime, end-to-end idempotency, and atomic inventory updates.
 */
export async function submitOrderSafely(params: CreateOrderParams): Promise<Order> {
  // First attempt: Secure Backend route with atomic runTransaction
  try {
    const response = await fetch('/api/orders/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (response.ok) {
      const data = await response.json();
      if (data?.success && data?.order) {
        return data.order as Order;
      }
      if (data?.error) {
        throw new Error(data.error);
      }
    } else {
      const errorData = await response.json().catch(() => null);
      if (errorData?.error) {
        throw new Error(errorData.error);
      }
    }
  } catch (err: any) {
    // If it's a validation or stock error explicitly thrown by the server, do not fallback
    const errMsg = err?.message || '';
    if (
      errMsg.includes('نفد مخزون') ||
      errMsg.includes('الكمية المتاحة') ||
      errMsg.includes('الكمية المتبقية') ||
      errMsg.includes('كود الخصم') ||
      errMsg.includes('غير صالح') ||
      errMsg.includes('يرجى')
    ) {
      throw err;
    }
    console.warn('[Order Submission] Backend API unreachable or error, falling back to direct Firestore runTransaction:', err);
  }

  // Fallback: Direct Firestore Atomic runTransaction
  return await createOrderWithTransaction(params);
}
