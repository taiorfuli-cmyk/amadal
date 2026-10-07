import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck,
  Truck,
  Building2,
  CheckCircle,
  Tag,
  ArrowRight,
  AlertCircle,
  ShoppingBag,
  Loader2,
} from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useStore } from '../context/StoreContext';
import { ALGERIA_WILAYAS, WilayaInfo, Order, OrderItem, Product } from '../types';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import confetti from 'canvas-confetti';
import { getMainImageUrl } from '../services/storageService';
import { submitOrderSafely, generateOrderIdempotencyKey } from '../services/orderService';

interface CheckoutPageProps {
  directItem?: import('../types').CartItem | null;
  onBackToShop: () => void;
  onOrderSuccess: (order: Order) => void;
}

export const CheckoutPage: React.FC<CheckoutPageProps> = ({
  directItem,
  onBackToShop,
  onOrderSuccess,
}) => {
  const { items: cartItems, subtotal: cartSubtotal, clearCart } = useCart();
  const { settings } = useStore();

  const isDirectBuy = Boolean(directItem);
  const items = isDirectBuy && directItem ? [directItem] : cartItems;
  const initialSubtotal = isDirectBuy && directItem
    ? directItem.price * directItem.quantity
    : cartSubtotal;

  // Form State
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedWilayaCode, setSelectedWilayaCode] = useState('16'); // Default Alger (16)
  const [commune, setCommune] = useState('');
  const [address, setAddress] = useState('');
  const [deliveryType, setDeliveryType] = useState<'home' | 'desk'>('home');
  const [notes, setNotes] = useState('');

  // Coupon state
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    discountAmount: number;
  } | null>(null);
  const [couponError, setCouponError] = useState('');
  const [isVerifyingCoupon, setIsVerifyingCoupon] = useState(false);

  // Shipping rate state
  const [shippingRatesMap, setShippingRatesMap] = useState<
    Record<string, { home: number; desk: number; days: string; isDeskAvailable: boolean }>
  >({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOrderCompleted, setIsOrderCompleted] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Submit concurrency lock & Idempotency tracking refs
  const isSubmittingRef = useRef(false);
  const isOrderCompletedRef = useRef(false);

  // Stable session Idempotency key for this checkout attempt
  // Kept constant across re-renders, rapid clicks, network disconnects & retries
  const [checkoutSessionId] = useState<string>(() => generateOrderIdempotencyKey());

  // Fetch live shipping rates from Firestore
  useEffect(() => {
    const fetchShipping = async () => {
      try {
        const snap = await getDocs(collection(db, 'shipping'));
        if (!snap.empty) {
          const map: Record<
            string,
            { home: number; desk: number; days: string; isDeskAvailable: boolean }
          > = {};
          snap.forEach((d) => {
            const data = d.data();
            map[data.wilayaCode] = {
              home: data.homePrice,
              desk: data.deskPrice,
              days: data.estimatedDays,
              isDeskAvailable: data.isDeskAvailable !== undefined ? data.isDeskAvailable : true,
            };
          });
          setShippingRatesMap(map);
        }
      } catch (err) {
        console.warn('Using default Algeria wilaya shipping rates:', err);
      }
    };
    fetchShipping();
  }, []);

  const selectedWilaya: WilayaInfo =
    ALGERIA_WILAYAS.find((w) => w.code === selectedWilayaCode) ||
    ALGERIA_WILAYAS.find((w) => w.code === '16') ||
    ALGERIA_WILAYAS[0];

  // Check if stop desk delivery is available for current wilaya
  const isDeskAvailableForWilaya = shippingRatesMap[selectedWilayaCode]?.isDeskAvailable !== false;

  // Auto-switch to home delivery if desk delivery is not available for the selected wilaya
  useEffect(() => {
    const isDeskAvailable = shippingRatesMap[selectedWilayaCode]?.isDeskAvailable !== false;
    if (!isDeskAvailable && deliveryType === 'desk') {
      setDeliveryType('home');
    }
  }, [selectedWilayaCode, shippingRatesMap, deliveryType]);

  // Calculate live shipping cost
  const customRate = shippingRatesMap[selectedWilayaCode];
  const shippingCost = customRate
    ? (deliveryType === 'home' ? customRate.home : customRate.desk)
    : (deliveryType === 'home' ? selectedWilaya.defaultHomePrice : selectedWilaya.defaultDeskPrice);

  const subtotal = initialSubtotal;
  const discountAmount = appliedCoupon ? appliedCoupon.discountAmount : 0;
  const grandTotal = Math.max(0, subtotal - discountAmount) + shippingCost;

  // Verify and Apply Coupon via Secure Backend API
  const handleApplyCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponCode.trim()) return;

    setCouponError('');
    setIsVerifyingCoupon(true);

    try {
      const res = await fetch('/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          couponCode: couponCode.trim(),
          items: items.map((it) => ({
            productId: it.productId,
            quantity: it.quantity,
          })),
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        setCouponError(data?.error || 'رمز القسيمة غير صالح أو منتهي الصلاحية');
        return;
      }

      setAppliedCoupon({
        code: data.coupon.code,
        discountAmount: Number(data.coupon.discountAmount) || 0,
      });
      setCouponCode('');
    } catch (err: any) {
      console.error('[Coupon Verification Error]:', err);
      setCouponError('حدث خطأ أثناء فحص الكوبون. يرجى المحاولة مرة أخرى.');
    } finally {
      setIsVerifyingCoupon(false);
    }
  };

  // Submit Order
  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    // Immediate synchronous lock against rapid double-clicks and repeated submissions
    if (isSubmittingRef.current || isOrderCompletedRef.current) {
      console.warn('[Idempotency] Blocked duplicate submission attempt in-flight.');
      return;
    }

    if (items.length === 0) {
      setErrorMessage('لا توجد منتجات لإتمام الطلب.');
      return;
    }

    if (!customerName.trim()) {
      setErrorMessage('يرجى إدخال الاسم الكامل.');
      return;
    }

    // Algerian phone validation (starts with 05, 06, or 07 and 10 digits)
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 9) {
      setErrorMessage('يرجى إدخال رقم هاتف صالح (مثال: 0550123456).');
      return;
    }

    if (!commune.trim()) {
      setErrorMessage('يرجى تحديد البلدية.');
      return;
    }

    if (!address.trim()) {
      setErrorMessage('يرجى كتابة عنوان التوصيل بالتفصيل.');
      return;
    }

    // Direct pre-check against Firestore for desk delivery availability to prevent bypass
    if (deliveryType === 'desk') {
      try {
        const shippingDocRef = doc(db, 'shipping', `wilaya-${selectedWilayaCode}`);
        const shippingDocSnap = await getDoc(shippingDocRef);
        if (shippingDocSnap.exists()) {
          const shippingData = shippingDocSnap.data();
          if (shippingData.isDeskAvailable === false) {
            setErrorMessage(
              `عذراً، التوصيل إلى المكتب (Stop Desk) غير متوفر حالياً في ولاية ${selectedWilaya.name}. يرجى اختيار التوصيل إلى المنزل أو تغيير الولاية.`
            );
            setDeliveryType('home');
            return;
          }
        }
      } catch (err) {
        console.warn('Error verifying shipping rate:', err);
      }
    }

    // Synchronously lock submission
    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      // Create order with ACID Atomic Transaction and Idempotency protection
      const committedOrder: Order = await submitOrderSafely({
        items: items.map((it) => ({
          productId: it.productId,
          size: it.size || 'Standard',
          color: it.color || 'Standard',
          quantity: Math.max(1, it.quantity || 1),
        })),
        customerName: customerName.trim(),
        phone: cleanPhone,
        wilayaCode: selectedWilayaCode,
        commune: commune.trim(),
        address: address.trim(),
        deliveryType,
        notes: notes.trim(),
        couponCode: appliedCoupon?.code || '',
        source: isDirectBuy ? 'instant_buy' : 'cart',
        idempotencyKey: checkoutSessionId,
      });

      // Mark order as completed permanently for this checkout session
      isOrderCompletedRef.current = true;
      setIsOrderCompleted(true);

      // Celebration effect
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#000000', '#d4af37', '#ffffff'],
        });
      } catch (err) {
        // Safe fallback
      }

      // Only clear the cart if the order was submitted through the Cart flow!
      if (!isDirectBuy) {
        clearCart();
      }

      // Proceed to order confirmation
      onOrderSuccess(committedOrder);
    } catch (error: any) {
      console.error('Failed to submit order:', error);
      if (!isOrderCompletedRef.current) {
        isSubmittingRef.current = false;
        setIsSubmitting(false);
      }
      setErrorMessage(
        error?.message ||
        'حدث خطأ غير متوقع أثناء إرسال الطلب. يرجى المحاولة مرة أخرى أو الاتصال بخدمة العملاء.'
      );
    } finally {
      if (!isOrderCompletedRef.current) {
        isSubmittingRef.current = false;
        setIsSubmitting(false);
      }
    }
  };

  if (items.length === 0) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center">
        <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center mx-auto text-neutral-400 mb-4">
          <ShoppingBag className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-neutral-900 mb-2">حقيبة التسوق فارغة</h2>
        <p className="text-xs text-neutral-500 mb-6">
          يرجى إضافة قطع إلى حقيبة التسوق قبل المتابعة لإتمام الطلب.
        </p>
        <button
          onClick={onBackToShop}
          className="px-6 py-3 bg-neutral-950 text-white rounded-xl text-xs font-bold hover:bg-black transition-colors"
        >
          العودة للمتجر واختيار المنتجات
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      
      {/* Top Breadcrumb */}
      <button
        onClick={onBackToShop}
        className="inline-flex items-center gap-1.5 text-xs font-bold text-neutral-600 hover:text-black mb-8"
      >
        <ArrowRight className="w-4 h-4" />
        <span>متابعة التسوق</span>
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
        
        {/* Left / Checkout Form (7 Cols) */}
        <div className="lg:col-span-7">
          <div className="bg-white rounded-2xl p-6 sm:p-8 border border-neutral-150 shadow-sm space-y-6">
            <div>
              <span className="text-xs font-mono font-bold text-neutral-400 uppercase tracking-widest">
                FAST CHECKOUT // الدفع عند الاستلام
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-neutral-900 mt-1">
                {isDirectBuy ? 'تأكيد الشراء الفوري' : 'بيانات التوصيل والاستلام'}
              </h2>
              <p className="text-xs text-neutral-500 mt-1">
                املأ البيانات بالأسفل ليصلك الطرد إلى باب منزلك مع الدفع نقداً عند المعاينة والاستلام.
              </p>
            </div>

            {isDirectBuy && (
              <div className="p-3 bg-neutral-950 text-white rounded-xl text-xs flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-white text-black text-[10px] font-extrabold rounded-md">
                    شراء فوري مباشر
                  </span>
                  <span className="line-clamp-1">{items[0]?.productName}</span>
                </div>
                <button
                  type="button"
                  onClick={onBackToShop}
                  className="text-neutral-400 hover:text-white underline text-[11px] shrink-0"
                >
                  الرجوع للمنتج
                </button>
              </div>
            )}

            {errorMessage && (
              <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmitOrder} className="space-y-4">
              <fieldset disabled={isSubmitting || isOrderCompleted} className="space-y-4 disabled:opacity-85">
              
              {/* Customer Name */}
              <div>
                <label className="block text-xs font-bold text-neutral-900 mb-1.5">
                  الاسم الكامل (Nom & Prénom) *
                </label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="مثال: أمين بن علي"
                  className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-xs sm:text-sm font-medium focus:outline-none focus:border-black transition-colors"
                />
              </div>

              {/* Phone Number */}
              <div>
                <label className="block text-xs font-bold text-neutral-900 mb-1.5">
                  رقم الهاتف (Numéro de téléphone) *
                </label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="05 / 06 / 07 XX XX XX XX"
                  className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-xs sm:text-sm font-mono focus:outline-none focus:border-black transition-colors"
                  dir="ltr"
                />
                <span className="text-[11px] text-neutral-400 mt-1 block">
                  سيتصل بك موظف التوصيل على هذا الرقم لتسليمك الطرد.
                </span>
              </div>

              {/* Wilaya & Commune */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-neutral-900 mb-1.5">
                    الولاية (Wilaya) *
                  </label>
                  <select
                    value={selectedWilayaCode}
                    onChange={(e) => {
                      const newCode = e.target.value;
                      setSelectedWilayaCode(newCode);
                      const isDeskAvailable = shippingRatesMap[newCode]?.isDeskAvailable !== false;
                      if (!isDeskAvailable && deliveryType === 'desk') {
                        setDeliveryType('home');
                      }
                    }}
                    className="w-full px-3 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-xs sm:text-sm font-medium focus:outline-none focus:border-black transition-colors"
                  >
                    {ALGERIA_WILAYAS.map((w) => (
                      <option key={w.code} value={w.code}>
                        {w.code} - {w.name} ({w.nameFr})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-900 mb-1.5">
                    البلدية (Commune) *
                  </label>
                  <input
                    type="text"
                    required
                    value={commune}
                    onChange={(e) => setCommune(e.target.value)}
                    placeholder="مثال: باب الزوار / الحامة / بئر مراد رايس"
                    className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-xs sm:text-sm font-medium focus:outline-none focus:border-black transition-colors"
                  />
                </div>
              </div>

              {/* Detailed Address */}
              <div>
                <label className="block text-xs font-bold text-neutral-900 mb-1.5">
                  العنوان بالتفصيل (Adresse exacte) *
                </label>
                <input
                  type="text"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="الحي، رقم العمارة أو الشارع، أو نقطة علام معروفة"
                  className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-xs sm:text-sm font-medium focus:outline-none focus:border-black transition-colors"
                />
              </div>

              {/* Delivery Type Option */}
              <div>
                <label className="block text-xs font-bold text-neutral-900 mb-2">
                  نوع التوصيل (Mode de livraison)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Home Delivery - Always Available for all 69 Wilayas */}
                  <div
                    onClick={() => setDeliveryType('home')}
                    className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                      deliveryType === 'home'
                        ? 'border-black bg-neutral-950 text-white shadow-sm'
                        : 'border-neutral-200 bg-neutral-50 text-neutral-800 hover:border-neutral-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs">توصيل لباب المنزل (Domicile)</span>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            deliveryType === 'home'
                              ? 'bg-emerald-400/20 text-emerald-300'
                              : 'bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          متاح دائماً
                        </span>
                        <Truck className="w-4 h-4" />
                      </div>
                    </div>
                    <p className={`text-[11px] ${deliveryType === 'home' ? 'text-neutral-300' : 'text-neutral-500'}`}>
                      يصلك عامل التوصيل لعنوانك مباشرة ({customRate?.home || selectedWilaya.defaultHomePrice} د.ج)
                    </p>
                  </div>

                  {/* Stop Desk Delivery - Conditional based on Wilaya availability */}
                  {isDeskAvailableForWilaya ? (
                    <div
                      onClick={() => setDeliveryType('desk')}
                      className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                        deliveryType === 'desk'
                          ? 'border-black bg-neutral-950 text-white shadow-sm'
                          : 'border-neutral-200 bg-neutral-50 text-neutral-800 hover:border-neutral-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-xs">استلام من المكتب (Stop Desk)</span>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              deliveryType === 'desk'
                                ? 'bg-emerald-400/20 text-emerald-300'
                                : 'bg-emerald-50 text-emerald-700'
                            }`}
                          >
                            متوفر ✓
                          </span>
                          <Building2 className="w-4 h-4" />
                        </div>
                      </div>
                      <p className={`text-[11px] ${deliveryType === 'desk' ? 'text-neutral-300' : 'text-neutral-500'}`}>
                        تستلم بنفسك من أقرب مكتب شحن بتكلفة أقل ({customRate?.desk || selectedWilaya.defaultDeskPrice} د.ج)
                      </p>
                    </div>
                  ) : (
                    <div
                      className="p-3.5 rounded-xl border-2 border-dashed border-neutral-200 bg-neutral-100/80 text-neutral-400 cursor-not-allowed select-none transition-all"
                      title={`التوصيل إلى المكتب غير متوفر في ولاية ${selectedWilaya.name}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-xs text-neutral-500 line-through">
                          استلام من المكتب (Stop Desk)
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-200">
                          غير متوفر ✕
                        </span>
                      </div>
                      <p className="text-[11px] text-neutral-500 mt-1">
                        التوصيل إلى المكتب غير متاح حالياً في ولاية <strong>{selectedWilaya.name}</strong>. يرجى اختيار التوصيل للمنزل.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Order Notes */}
              <div>
                <label className="block text-xs font-bold text-neutral-900 mb-1.5">
                  ملاحظات إضافية للتوصيل (اختياري)
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="مثال: يرجى التوصيل بعد الساعة الثانية ظهراً..."
                  className="w-full px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium focus:outline-none focus:border-black transition-colors"
                />
              </div>

              {/* Payment Guarantee Notice */}
              <div className="p-4 bg-neutral-100 rounded-xl flex items-center gap-3 text-xs text-neutral-700">
                <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <span className="font-bold text-neutral-900 block">طريقة الدفع: الدفع عند الاستلام 100%</span>
                  <span className="text-[11px] text-neutral-500">
                    لا تطلب أي بطاقة بنكية؛ ادفع نقداً لعامل التوصيل عند استلام الطرد.
                  </span>
                </div>
              </div>
              </fieldset>

              {/* Submit CTA */}
              <button
                type="submit"
                disabled={isSubmitting || isOrderCompleted}
                className="w-full py-4 px-6 bg-neutral-950 hover:bg-black text-white text-sm font-bold rounded-xl shadow-xl shadow-black/15 transition-all active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed disabled:pointer-events-none select-none"
              >
                {isSubmitting ? (
                  <div className="flex items-center justify-center gap-2.5">
                    <Loader2 className="w-5 h-5 animate-spin text-white" />
                    <span>جاري تأكيد وتسجيل الطلب بأمان...</span>
                  </div>
                ) : isOrderCompleted ? (
                  <div className="flex items-center justify-center gap-2">
                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                    <span>تم تسجيل طلبك بنجاح</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2">
                    <span>تأكيد الطلب الآن (الدفع عند الاستلام)</span>
                    <CheckCircle className="w-4 h-4" />
                  </div>
                )}
              </button>

            </form>
          </div>
        </div>

        {/* Right / Order Summary (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-2xl p-6 border border-neutral-150 shadow-sm space-y-6">
            <h3 className="font-bold text-sm text-neutral-900 pb-3 border-b border-neutral-100 flex items-center justify-between">
              <span>{isDirectBuy ? 'تفاصيل المنتج المختار' : 'ملخص حقيبة التسوق'}</span>
              <span className="text-xs font-normal text-neutral-500">
                ({items.length} {items.length === 1 ? 'منتج' : 'منتجات'})
              </span>
            </h3>

            {/* Items list */}
            <div className="divide-y divide-neutral-100 max-h-80 overflow-y-auto pr-1">
              {items.map((item) => (
                <div key={item.id} className="py-3 flex items-center gap-3">
                  <div className="w-14 h-16 rounded-lg bg-neutral-100 p-1 flex items-center justify-center shrink-0 overflow-hidden border border-neutral-200/60">
                    <img
                      src={item.image}
                      alt={item.productName}
                      className="w-full h-full object-contain object-center"
                    />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-xs font-bold text-neutral-900 line-clamp-1">{item.productName}</h4>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-neutral-500">
                      <span>المقاس: {item.size}</span>
                      <span>•</span>
                      <span>اللون: {item.color}</span>
                      <span>•</span>
                      <span>الكمية: {item.quantity}</span>
                    </div>
                  </div>
                  <div className="text-left font-bold text-xs font-mono text-neutral-950">
                    {(item.price * item.quantity).toLocaleString()} {settings.currency || 'د.ج'}
                  </div>
                </div>
              ))}
            </div>

            {/* Coupon Code Section */}
            <div className="pt-2 border-t border-neutral-100">
              <form onSubmit={handleApplyCoupon} className="flex gap-2">
                <input
                  type="text"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value)}
                  placeholder="رمز الكوبون أو الخصم"
                  className="flex-1 px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs uppercase font-mono tracking-wider focus:outline-none focus:border-black"
                />
                <button
                  type="submit"
                  disabled={isVerifyingCoupon || !couponCode.trim()}
                  className="px-4 py-2 bg-neutral-900 text-white rounded-xl text-xs font-bold hover:bg-black transition-colors disabled:opacity-50"
                >
                  {isVerifyingCoupon ? 'فحص...' : 'تطبيق'}
                </button>
              </form>

              {couponError && (
                <p className="text-[11px] text-red-600 mt-1.5">{couponError}</p>
              )}

              {appliedCoupon && (
                <div className="mt-2 p-2 bg-emerald-50 rounded-lg flex items-center justify-between text-xs text-emerald-800">
                  <div className="flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5" />
                    <span>تم تطبيق الكوبون <strong>{appliedCoupon.code}</strong></span>
                  </div>
                  <span className="font-mono font-bold">-{appliedCoupon.discountAmount} د.ج</span>
                </div>
              )}
            </div>

            {/* Totals Breakdown */}
            <div className="pt-4 border-t border-neutral-100 space-y-2.5 text-xs text-neutral-600">
              <div className="flex justify-between items-center">
                <span>المجموع الفرعي:</span>
                <span className="font-mono font-bold text-neutral-900">{subtotal.toLocaleString()} {settings.currency || 'د.ج'}</span>
              </div>

              <div className="flex justify-between items-center">
                <span>تكلفة التوصيل ({selectedWilaya.name}):</span>
                <span className="font-mono font-bold text-neutral-900">{shippingCost.toLocaleString()} {settings.currency || 'د.ج'}</span>
              </div>

              {appliedCoupon && (
                <div className="flex justify-between items-center text-emerald-700">
                  <span>الخصم المطبق:</span>
                  <span className="font-mono font-bold">-{appliedCoupon.discountAmount.toLocaleString()} {settings.currency || 'د.ج'}</span>
                </div>
              )}

              <div className="pt-3 border-t border-neutral-150 flex justify-between items-center text-sm font-black text-neutral-950">
                <span>الإجمالي النهائي للدفع:</span>
                <span className="font-mono text-base">{grandTotal.toLocaleString()} {settings.currency || 'د.ج'}</span>
              </div>
            </div>

            <div className="text-[11px] text-neutral-400 text-center leading-relaxed">
              الدفع نقداً عند استلام الشحنة من موظف التوصيل.
            </div>
          </div>
        </div>

      </div>

    </div>
  );
};
