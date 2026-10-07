import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import multer from 'multer';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  query,
  where,
  runTransaction,
  increment
} from 'firebase/firestore';
import fs from 'fs';
import { ALGERIA_WILAYAS } from './src/types';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase client for server-side operations
let firebaseConfig: any = {};
try {
  const configPath = path.resolve(__dirname, 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }
} catch (e) {
  console.warn('[Server] Could not read firebase-applet-config.json:', e);
}

const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

const DEFAULT_ANDERSON_BASE_URL = 'https://anderson.ecotrack.dz/';

// Helper to get Anderson settings from Firestore or env
async function getStoredAndersonSettings(): Promise<{
  enabled: boolean;
  apiToken: string;
  apiBaseUrl: string;
  autoSendOrders: boolean;
  lastTestedAt?: string;
  lastTestStatus?: 'success' | 'failed' | 'untested';
  lastTestMessage?: string;
}> {
  try {
    const docRef = doc(db, 'settings', 'anderson');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      return {
        enabled: data.enabled ?? true,
        apiToken: data.apiToken || process.env.ANDERSON_API_TOKEN || '',
        apiBaseUrl: data.apiBaseUrl || process.env.ANDERSON_API_BASE_URL || DEFAULT_ANDERSON_BASE_URL,
        autoSendOrders: data.autoSendOrders ?? true,
        lastTestedAt: data.lastTestedAt,
        lastTestStatus: data.lastTestStatus || 'untested',
        lastTestMessage: data.lastTestMessage || '',
      };
    }
  } catch (err) {
    console.warn('[Server] Error fetching Anderson settings from Firestore:', err);
  }

  return {
    enabled: true,
    apiToken: process.env.ANDERSON_API_TOKEN || '',
    apiBaseUrl: process.env.ANDERSON_API_BASE_URL || DEFAULT_ANDERSON_BASE_URL,
    autoSendOrders: true,
    lastTestStatus: 'untested',
    lastTestMessage: '',
  };
}

function maskToken(token: string): string {
  if (!token) return '';
  if (token.length <= 8) return '••••••••';
  return `••••••••${token.slice(-4)}`;
}

function cleanBaseUrl(url?: string): string {
  let cleaned = (url || DEFAULT_ANDERSON_BASE_URL).trim();
  if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
    cleaned = 'https://' + cleaned;
  }
  if (!cleaned.endsWith('/')) {
    cleaned += '/';
  }
  return cleaned;
}

// Sleep helper for exponential backoff retries
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '30mb' }));
  app.use(express.urlencoded({ limit: '30mb', extended: true }));

  // Static uploads directory serving
  const uploadsDir = path.resolve(__dirname, 'public', 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  app.use('/uploads', express.static(uploadsDir));

  // ─────────────────────────────────────────────────────────────
  // 1. GET Anderson Settings
  // ─────────────────────────────────────────────────────────────
  app.get('/api/anderson/settings', async (_req, res) => {
    try {
      const settings = await getStoredAndersonSettings();
      res.json({
        success: true,
        settings: {
          enabled: settings.enabled,
          apiBaseUrl: settings.apiBaseUrl,
          autoSendOrders: settings.autoSendOrders,
          lastTestedAt: settings.lastTestedAt,
          lastTestStatus: settings.lastTestStatus,
          lastTestMessage: settings.lastTestMessage,
          hasToken: Boolean(settings.apiToken),
          maskedToken: maskToken(settings.apiToken),
        },
      });
    } catch (err: any) {
      console.error('[API Anderson Settings Error]:', err);
      res.status(500).json({ success: false, error: err.message || 'حدث خطأ أثناء جلب الإعدادات' });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // 2. POST Save Anderson Settings
  // ─────────────────────────────────────────────────────────────
  app.post('/api/anderson/settings', async (req, res) => {
    try {
      const { enabled, apiToken, apiBaseUrl, autoSendOrders } = req.body;
      const current = await getStoredAndersonSettings();

      // If user passed a masked token or empty string, preserve current token
      let tokenToSave = current.apiToken;
      if (apiToken && !apiToken.includes('••••')) {
        tokenToSave = apiToken.trim();
      }

      const updatedSettings = {
        enabled: enabled !== undefined ? Boolean(enabled) : current.enabled,
        apiToken: tokenToSave,
        apiBaseUrl: cleanBaseUrl(apiBaseUrl || current.apiBaseUrl),
        autoSendOrders: autoSendOrders !== undefined ? Boolean(autoSendOrders) : current.autoSendOrders,
        lastTestedAt: current.lastTestedAt || null,
        lastTestStatus: current.lastTestStatus || 'untested',
        lastTestMessage: current.lastTestMessage || '',
        updatedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'settings', 'anderson'), updatedSettings, { merge: true });

      res.json({
        success: true,
        message: 'تم حفظ إعدادات ربط شركة التوصيل Anderson بنجاح',
        settings: {
          enabled: updatedSettings.enabled,
          apiBaseUrl: updatedSettings.apiBaseUrl,
          autoSendOrders: updatedSettings.autoSendOrders,
          hasToken: Boolean(updatedSettings.apiToken),
          maskedToken: maskToken(updatedSettings.apiToken),
        },
      });
    } catch (err: any) {
      console.error('[API Anderson Save Settings Error]:', err);
      res.status(500).json({ success: false, error: err.message || 'فشل حفظ الإعدادات' });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // 3. POST Test Anderson Connection
  // ─────────────────────────────────────────────────────────────
  app.post('/api/anderson/test-connection', async (req, res) => {
    try {
      const { apiToken, apiBaseUrl } = req.body;
      const current = await getStoredAndersonSettings();

      let tokenToTest = (apiToken && !apiToken.includes('••••')) ? apiToken.trim() : current.apiToken;
      if (!tokenToTest) {
        return res.status(400).json({
          success: false,
          error: 'يرجى إدخال Anderson API Token أولاً لإجراء اختبار الاتصال',
        });
      }

      const baseUrl = cleanBaseUrl(apiBaseUrl || current.apiBaseUrl);
      const testEndpoint = `${baseUrl}api/v1/get/wilayas`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      let response: Response;
      try {
        response = await fetch(testEndpoint, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${tokenToTest}`,
            'Accept': 'application/json',
          },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (response.status === 200) {
        let wilayasCount = 0;
        try {
          const data: any = await response.json();
          if (Array.isArray(data)) {
            wilayasCount = data.length;
          } else if (data && Array.isArray(data.wilayas)) {
            wilayasCount = data.wilayas.length;
          }
        } catch {
          // ignore parsing error if response is not JSON
        }

        const msg = `الاتصال بحساب Anderson Delivery ناجح ومصرح به تماماً! ${wilayasCount ? `(تم استرجاع بيانات ${wilayasCount} ولاية بنجاح)` : ''}`;

        // Update stored test status in Firestore
        await setDoc(
          doc(db, 'settings', 'anderson'),
          {
            lastTestedAt: new Date().toISOString(),
            lastTestStatus: 'success',
            lastTestMessage: msg,
          },
          { merge: true }
        );

        return res.json({
          success: true,
          message: msg,
          wilayasCount,
        });
      } else if (response.status === 401 || response.status === 403) {
        const errorMsg = 'رمز Anderson API Token غير صالح أو غير مصرح به (401/403 Unauthorized). يرجى التحقق من صحة الـ Token في حسابك لدى Anderson.';
        await setDoc(
          doc(db, 'settings', 'anderson'),
          {
            lastTestedAt: new Date().toISOString(),
            lastTestStatus: 'failed',
            lastTestMessage: errorMsg,
          },
          { merge: true }
        );

        return res.status(400).json({
          success: false,
          error: errorMsg,
        });
      } else {
        const text = await response.text().catch(() => '');
        const errorMsg = `استجابة غير متوقعة من خادم Anderson (رمز الحالة: ${response.status} ${response.statusText}): ${text.slice(0, 150)}`;
        await setDoc(
          doc(db, 'settings', 'anderson'),
          {
            lastTestedAt: new Date().toISOString(),
            lastTestStatus: 'failed',
            lastTestMessage: errorMsg,
          },
          { merge: true }
        );

        return res.status(400).json({
          success: false,
          error: errorMsg,
        });
      }
    } catch (err: any) {
      console.error('[API Anderson Test Error]:', err);
      const isTimeout = err.name === 'AbortError';
      const errorMsg = isTimeout
        ? 'انتهت مهلة الاتصال بخادم Anderson (Timeout: 12 ثانية). يرجى التحقق من الرابط والاتصال بالإنترنت.'
        : `تعذر الاتصال بخادم Anderson Delivery: ${err.message || 'خطأ في الشبكة'}`;

      await setDoc(
        doc(db, 'settings', 'anderson'),
        {
          lastTestedAt: new Date().toISOString(),
          lastTestStatus: 'failed',
          lastTestMessage: errorMsg,
        },
        { merge: true }
      ).catch(() => {});

      return res.status(500).json({
        success: false,
        error: errorMsg,
      });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // 4. POST Send Order To Anderson Delivery (Auto & Manual Trigger)
  // ─────────────────────────────────────────────────────────────
  app.post('/api/anderson/send-order', async (req, res) => {
    const { orderId, force } = req.body;

    if (!orderId) {
      return res.status(400).json({ success: false, error: 'معرف الطلب orderId مطلوب' });
    }

    try {
      // 1. Fetch order from Firestore
      const orderRef = doc(db, 'orders', orderId);
      const orderSnap = await getDoc(orderRef);

      if (!orderSnap.exists()) {
        return res.status(404).json({ success: false, error: 'الطلب غير موجود في قاعدة البيانات' });
      }

      const orderData = orderSnap.data() as any;

      // 2. Fetch Anderson settings
      const settings = await getStoredAndersonSettings();

      if (!settings.apiToken) {
        console.warn(`[Anderson Delivery] Cannot send order ${orderId}: Missing Anderson API Token.`);
        return res.status(400).json({
          success: false,
          skipped: true,
          error: 'لم يتم ضبط Anderson API Token في إعدادات المتجر.',
        });
      }

      if (!settings.enabled && !force) {
        console.log(`[Anderson Delivery] Anderson integration is disabled. Skipping order ${orderId}.`);
        return res.json({
          success: false,
          skipped: true,
          message: 'تكامل شركة التوصيل Anderson معطل في لوحة التحكم.',
        });
      }

      // 3. PREVENT DUPLICATE SHIPMENT (Idempotency Protection)
      // Check if order already has an established tracking number and status is sent
      if (orderData.andersonStatus === 'sent' && orderData.andersonTrackingNumber && !force) {
        console.log(`[Anderson Delivery] Order ${orderId} already sent. Tracking: ${orderData.andersonTrackingNumber}. Skipping.`);
        return res.json({
          success: true,
          alreadySent: true,
          trackingNumber: orderData.andersonTrackingNumber,
          message: `تم إنشاء الشحنة مسبقاً برقم التتبع: ${orderData.andersonTrackingNumber}`,
        });
      }

      // Check if another transmission is currently underway within the last 40 seconds
      if (orderData.andersonStatus === 'sending' && !force) {
        const lastAttempt = orderData.andersonLastAttemptAt ? new Date(orderData.andersonLastAttemptAt).getTime() : 0;
        const now = Date.now();
        if (now - lastAttempt < 40000) {
          console.log(`[Anderson Delivery] Order ${orderId} is currently being sent. Preventing concurrent duplicate.`);
          return res.json({
            success: true,
            pending: true,
            message: 'الطلب قيد المعالجة والإرسال حالياً لمنع إنشاء شحنة مكررة.',
          });
        }
      }

      // 4. Mark status as 'sending' in Firestore
      await updateDoc(orderRef, {
        shippingStatus: 'sending',
        shippingUpdatedAt: new Date().toISOString(),
        andersonStatus: 'sending',
        andersonLastAttemptAt: new Date().toISOString(),
      });

      // 5. Prepare Payload for Anderson EcoTrack API
      const cleanPhone = (orderData.phone || '').replace(/[^0-9]/g, '');
      const wilayaCodeNum = parseInt(String(orderData.wilayaCode).replace(/[^0-9]/g, ''), 10) || 16;
      const isStopDesk = orderData.deliveryType === 'desk';

      // Products description summary
      let productSummary = 'أزياء وملابس AMADAL';
      if (Array.isArray(orderData.items) && orderData.items.length > 0) {
        productSummary = orderData.items
          .map((i: any) => `${i.name || i.productName || 'منتج'} (${i.size || 'عادي'}${i.color ? ` - ${i.color}` : ''}) × ${i.quantity || 1}`)
          .join(' + ');
        if (productSummary.length > 250) {
          productSummary = productSummary.slice(0, 247) + '...';
        }
      }

      const shipmentPayload: Record<string, any> = {
        reference: orderData.orderNumber || orderId,
        nom_client: orderData.customerName || 'عميل AMADAL',
        telephone: cleanPhone,
        code_wilaya: wilayaCodeNum,
        commune: orderData.commune || orderData.wilaya || 'البلدية',
        adresse: isStopDesk
          ? `${orderData.address || orderData.commune || ''} (استلام من المكتب Stop Desk)`
          : (orderData.address || orderData.commune || 'توصيل للمنزل'),
        type: 1, // 1: Livraison standard
        stop_desk: isStopDesk ? 1 : 0,
        montant: Number(orderData.total) || 0,
        produit: productSummary,
        remarque: orderData.notes || (isStopDesk ? 'توصيل للمكتب - استلام ذاتي' : 'توصيل إلى المنزل'),
      };

      const baseUrl = cleanBaseUrl(settings.apiBaseUrl);
      const createOrderUrl = `${baseUrl}api/v1/create/order`;

      console.log(`[Anderson Delivery] Sending order ${orderId} (${shipmentPayload.reference}) to ${createOrderUrl}...`);

      // 6. RETRY LOOP WITH EXPONENTIAL BACKOFF (up to 3 attempts)
      const MAX_ATTEMPTS = 3;
      let attempt = 0;
      let lastErrorMessage = '';
      let trackingNumber = '';
      let success = false;

      while (attempt < MAX_ATTEMPTS && !success) {
        attempt++;
        console.log(`[Anderson Delivery] Attempt ${attempt}/${MAX_ATTEMPTS} for order ${orderId}...`);

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000);

          const response = await fetch(createOrderUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${settings.apiToken}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: JSON.stringify(shipmentPayload),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          const responseText = await response.text();
          let responseData: any = {};
          try {
            responseData = JSON.parse(responseText);
          } catch {
            responseData = { raw: responseText };
          }

          console.log(`[Anderson Delivery] Response (${response.status}):`, responseData);

          if (response.ok && responseData.success !== false) {
            // Successfully created shipment!
            trackingNumber =
              responseData.tracking ||
              responseData.tracking_number ||
              responseData.code_suivi ||
              responseData.tracking_id ||
              responseData.data?.tracking ||
              responseData.order?.tracking ||
              responseData.id ||
              (typeof responseData === 'string' ? responseData : '') ||
              `AND-${Date.now()}`;

            success = true;
            break;
          } else {
            // Check if response indicates that order reference already exists
            const combinedMsg = `${responseData.message || ''} ${responseData.error || ''} ${responseText}`.toLowerCase();
            if (combinedMsg.includes('already exist') || combinedMsg.includes('déjà exist') || combinedMsg.includes('موجود مسبقا')) {
              console.log(`[Anderson Delivery] Order reference already exists in Anderson. Handling idempotently.`);
              trackingNumber =
                responseData.tracking ||
                responseData.tracking_number ||
                responseData.code_suivi ||
                orderData.andersonTrackingNumber ||
                'مسجل مسبقاً في Anderson';
              success = true;
              break;
            }

            // Fatal client errors (401/403/422 validation): do not keep retrying
            if (response.status === 401 || response.status === 403) {
              lastErrorMessage = 'فشل المصادقة: رمز Anderson API Token غير صالح (401/403).';
              break;
            }

            lastErrorMessage = responseData.message || responseData.error || responseText.slice(0, 180) || `خطأ من الخادم (${response.status})`;

            // If temporary server error (500, 502, 503, 504), wait and retry
            if (attempt < MAX_ATTEMPTS) {
              const backoffMs = attempt === 1 ? 2500 : 5000;
              console.log(`[Anderson Delivery] Temporary error. Waiting ${backoffMs}ms before attempt ${attempt + 1}...`);
              await sleep(backoffMs);
            }
          }
        } catch (fetchErr: any) {
          const isTimeout = fetchErr.name === 'AbortError';
          lastErrorMessage = isTimeout
            ? 'انتهت مهلة استجابة خادم Anderson (Timeout)'
            : `خطأ اتصال بشبكة Anderson: ${fetchErr.message}`;

          console.warn(`[Anderson Delivery] Attempt ${attempt} failed: ${lastErrorMessage}`);

          if (attempt < MAX_ATTEMPTS) {
            const backoffMs = attempt === 1 ? 2500 : 5000;
            await sleep(backoffMs);
          }
        }
      }

      // 7. Update Firestore with final result
      const nowIso = new Date().toISOString();
      if (success) {
        const updateData: Record<string, any> = {
          shippingStatus: 'created',
          shippingTrackingNumber: trackingNumber,
          shippingUpdatedAt: nowIso,
          shippingCarrier: 'Anderson Delivery',
          andersonStatus: 'sent',
          andersonTrackingNumber: trackingNumber,
          andersonLastAttemptAt: nowIso,
          andersonAttempts: attempt,
          andersonError: null,
          updatedAt: nowIso,
        };

        // Add note to status history if available
        if (Array.isArray(orderData.statusHistory)) {
          updateData.statusHistory = [
            ...orderData.statusHistory,
            {
              status: orderData.status,
              timestamp: nowIso,
              note: `تم إرسال الطلب تلقائياً إلى Anderson Delivery (رقم الشحنة: ${trackingNumber})`,
            },
          ];
        }

        await updateDoc(orderRef, updateData);

        return res.json({
          success: true,
          trackingNumber,
          attempts: attempt,
          message: `تم إرسال الطلب بنجاح إلى شركة التوصيل Anderson (رقم الشحنة: ${trackingNumber})`,
        });
      } else {
        // Failed after all retries
        await updateDoc(orderRef, {
          shippingStatus: 'failed',
          shippingUpdatedAt: nowIso,
          shippingError: lastErrorMessage || 'تعذر إرسال الشحنة لشركة التوصيل بعد عدة محاولات',
          andersonStatus: 'failed',
          andersonError: lastErrorMessage || 'تعذر إرسال الشحنة لشركة التوصيل بعد عدة محاولات',
          andersonLastAttemptAt: nowIso,
          andersonAttempts: attempt,
          updatedAt: nowIso,
        });

        return res.status(502).json({
          success: false,
          error: lastErrorMessage || 'تعذر إرسال الشحنة لشركة التوصيل بعد استنفاد محاولات إعادة المحاولة',
          attempts: attempt,
        });
      }
    } catch (err: any) {
      console.error('[API Anderson Send Order Fatal Error]:', err);
      return res.status(500).json({
        success: false,
        error: err.message || 'حدث خطأ داخلي أثناء معالجة الطلب لشركة التوصيل',
      });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // 5. POST Retry All Failed Anderson Orders
  // ─────────────────────────────────────────────────────────────
  app.post('/api/anderson/retry-all-failed', async (_req, res) => {
    try {
      const q = query(collection(db, 'orders'), where('andersonStatus', '==', 'failed'));
      const snap = await getDocs(q);

      if (snap.empty) {
        return res.json({ success: true, count: 0, message: 'لا توجد طلبات متعثرة حالياً.' });
      }

      const orderIds: string[] = [];
      snap.forEach((d) => orderIds.push(d.id));

      console.log(`[Anderson Delivery] Retrying ${orderIds.length} failed orders...`);

      // Trigger retries in background without blocking
      (async () => {
        for (const oId of orderIds) {
          try {
            await fetch(`http://localhost:${PORT}/api/anderson/send-order`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ orderId: oId, force: true }),
            });
            await sleep(1000); // 1s throttle between orders
          } catch (e) {
            console.warn(`[Anderson Delivery] Background retry error for ${oId}:`, e);
          }
        }
      })();

      return res.json({
        success: true,
        count: orderIds.length,
        message: `تم بدء إعادة إرسال ${orderIds.length} طلب متعثر إلى Anderson Delivery في الخلفية.`,
      });
    } catch (err: any) {
      console.error('[API Anderson Retry All Error]:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // 6. GET Anderson Printable Label
  // ─────────────────────────────────────────────────────────────
  app.get('/api/anderson/label/:trackingNumber', async (req, res) => {
    try {
      const { trackingNumber } = req.params;
      const settings = await getStoredAndersonSettings();

      if (!settings.apiToken) {
        return res.status(400).send('Anderson API Token غير متوفر');
      }

      const baseUrl = cleanBaseUrl(settings.apiBaseUrl);
      const labelUrl = `${baseUrl}api/v1/get/order/label?tracking=${encodeURIComponent(trackingNumber)}`;

      const response = await fetch(labelUrl, {
        headers: {
          'Authorization': `Bearer ${settings.apiToken}`,
        },
      });

      if (!response.ok) {
        return res.status(response.status).send('تعذر استرجاع بوليصة الشحن من خادم Anderson');
      }

      const contentType = response.headers.get('content-type') || 'application/pdf';
      const buffer = await response.arrayBuffer();

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `inline; filename="anderson-label-${trackingNumber}.pdf"`);
      return res.send(Buffer.from(buffer));
    } catch (err: any) {
      console.error('[API Anderson Label Error]:', err);
      return res.status(500).send('خطأ أثناء جلب بوليصة الشحن');
    }
  });

  // ─────────────────────────────────────────────────────────────
  // 7. POST Update Delivery Shipping Status
  // ─────────────────────────────────────────────────────────────
  app.post('/api/orders/update-shipping-status', async (req, res) => {
    try {
      const { orderId, shippingStatus, trackingNumber, note } = req.body;
      if (!orderId || !shippingStatus) {
        return res.status(400).json({ success: false, error: 'معرف الطلب orderId وحالة الشحنة shippingStatus مطلوبان' });
      }

      const orderRef = doc(db, 'orders', orderId);
      const orderSnap = await getDoc(orderRef);
      if (!orderSnap.exists()) {
        return res.status(404).json({ success: false, error: 'الطلب غير موجود' });
      }

      const orderData = orderSnap.data() as any;
      const nowIso = new Date().toISOString();

      const updateData: Record<string, any> = {
        shippingStatus,
        shippingUpdatedAt: nowIso,
        updatedAt: nowIso,
      };

      if (trackingNumber) {
        updateData.shippingTrackingNumber = trackingNumber;
        updateData.andersonTrackingNumber = trackingNumber;
      }

      // If becoming delivered, record deliveredAt
      if (shippingStatus === 'delivered' && !orderData.deliveredAt) {
        updateData.deliveredAt = nowIso;
      }

      // Sync andersonStatus if applicable
      if (shippingStatus === 'delivered') {
        updateData.andersonStatus = 'sent';
      } else if (shippingStatus === 'failed') {
        updateData.andersonStatus = 'failed';
      } else if (shippingStatus === 'sending') {
        updateData.andersonStatus = 'sending';
      }

      if (note && Array.isArray(orderData.statusHistory)) {
        updateData.statusHistory = [
          ...orderData.statusHistory,
          {
            status: orderData.status,
            shippingStatus,
            timestamp: nowIso,
            note: note || `تحديث حالة شحنة شركة التوصيل إلى: ${shippingStatus}`,
          },
        ];
      }

      await updateDoc(orderRef, updateData);

      return res.json({
        success: true,
        message: 'تم تحديث حالة شحنة شركة التوصيل بنجاح',
        order: { ...orderData, ...updateData },
      });
    } catch (err: any) {
      console.error('[API Update Shipping Status Error]:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // 8. POST Toggle Order Archive (Manual Archive / Unarchive)
  // ─────────────────────────────────────────────────────────────
  app.post('/api/orders/toggle-archive', async (req, res) => {
    try {
      const { orderId, isArchived } = req.body;
      if (!orderId || isArchived === undefined) {
        return res.status(400).json({ success: false, error: 'بيانات غير مكتملة' });
      }

      const orderRef = doc(db, 'orders', orderId);
      const orderSnap = await getDoc(orderRef);
      if (!orderSnap.exists()) {
        return res.status(404).json({ success: false, error: 'الطلب غير موجود' });
      }

      const nowIso = new Date().toISOString();
      const updateData: Record<string, any> = {
        isArchived: Boolean(isArchived),
        archivedAt: isArchived ? nowIso : null,
        updatedAt: nowIso,
      };

      await updateDoc(orderRef, updateData);

      return res.json({
        success: true,
        message: isArchived ? 'تم نقل الطلب إلى قسم الطلبات المؤرشفة بنجاح' : 'تمت استعادة الطلب إلى قسم الطلبات النشطة بنجاح',
      });
    } catch (err: any) {
      console.error('[API Toggle Archive Error]:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Helper to extract main image URL from product images array
  function getMainImageUrl(images: any): string {
    if (!Array.isArray(images) || images.length === 0) return '';
    const first = images[0];
    if (typeof first === 'string') return first;
    const main = images.find((img: any) => img && img.isMain);
    return main?.url || first?.url || '';
  }

  // ─────────────────────────────────────────────────────────────
  // 9. POST Validate Coupon (Secure Backend Validation)
  // ─────────────────────────────────────────────────────────────
  app.post('/api/coupons/validate', async (req, res) => {
    try {
      const { couponCode, items } = req.body;
      if (!couponCode || typeof couponCode !== 'string' || !couponCode.trim()) {
        return res.status(400).json({ success: false, error: 'يرجى إدخال رمز القسيمة.' });
      }

      const normCode = couponCode.trim().toUpperCase();
      const couponRef = doc(db, 'coupons', normCode);
      const couponSnap = await getDoc(couponRef);

      if (!couponSnap.exists() || !couponSnap.data()?.isActive) {
        return res.status(400).json({ success: false, error: 'رمز القسيمة غير صالح أو منتهي الصلاحية.' });
      }

      const cData = couponSnap.data();
      const todayStr = new Date().toISOString().split('T')[0];

      if (cData.startDate && todayStr < cData.startDate) {
        return res.status(400).json({ success: false, error: `هذا الكوبون غير متاح بعد (يبدأ في ${cData.startDate}).` });
      }

      if (cData.expiresAt && todayStr > cData.expiresAt) {
        return res.status(400).json({ success: false, error: 'انتهت صلاحية هذا الكوبون.' });
      }

      const currentUsage = typeof cData.usageCount === 'number' ? cData.usageCount : 0;
      if (typeof cData.usageLimit === 'number' && currentUsage >= cData.usageLimit) {
        return res.status(400).json({ success: false, error: 'انتهت مرات استخدام هذا الكوبون.' });
      }

      // Calculate authentic subtotal directly from Firestore products
      let verifiedSubtotal = 0;
      if (Array.isArray(items) && items.length > 0) {
        for (const item of items) {
          const pid = String(item.productId || item.id || '').trim();
          const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
          if (pid) {
            const pSnap = await getDoc(doc(db, 'products', pid));
            if (pSnap.exists()) {
              const pData = pSnap.data();
              let price = Number(pData.price) || 0;
              if (typeof pData.salePrice === 'number' && pData.salePrice > 0 && pData.salePrice < price) {
                price = pData.salePrice;
              }
              verifiedSubtotal += price * qty;
            }
          }
        }
      }

      if (cData.minOrder && verifiedSubtotal > 0 && verifiedSubtotal < cData.minOrder) {
        return res.status(400).json({
          success: false,
          error: `الحد الأدنى لتطبيق هذا الخصم هو ${cData.minOrder} د.ج (المجموع الحالي: ${verifiedSubtotal} د.ج).`,
        });
      }

      let discountAmount = 0;
      if (cData.discountType === 'percentage') {
        discountAmount = Math.round((verifiedSubtotal * (Number(cData.discountValue) || 0)) / 100);
      } else {
        discountAmount = Math.max(0, Number(cData.discountValue) || 0);
      }
      if (verifiedSubtotal > 0) {
        discountAmount = Math.min(discountAmount, verifiedSubtotal);
      }

      return res.json({
        success: true,
        coupon: {
          code: cData.code,
          discountType: cData.discountType,
          discountValue: cData.discountValue,
          discountAmount,
        },
      });
    } catch (err: any) {
      console.error('[API Coupon Validate Error]:', err);
      return res.status(500).json({ success: false, error: 'حدث خطأ أثناء فحص الكوبون.' });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // 10. POST Create Order (Secure Backend Order Placement)
  // Verifies real product prices, stock, shipping, & coupons inside Firestore transaction
  // Completely prevents client-side price tampering (e.g. 0 DZD via DevTools)
  // ─────────────────────────────────────────────────────────────
  app.post('/api/orders/create', async (req, res) => {
    try {
      const {
        items,
        customerName,
        phone,
        wilayaCode,
        commune,
        address,
        deliveryType,
        notes,
        couponCode,
        source,
        idempotencyKey,
      } = req.body;

      // 1. Input Validations
      if (!customerName || typeof customerName !== 'string' || !customerName.trim()) {
        return res.status(400).json({ success: false, error: 'يرجى إدخال الاسم الكامل.' });
      }

      if (!phone || typeof phone !== 'string') {
        return res.status(400).json({ success: false, error: 'يرجى إدخال رقم هاتف صالح.' });
      }
      const cleanPhone = phone.replace(/[^0-9]/g, '');
      if (cleanPhone.length < 9 || cleanPhone.length > 15) {
        return res.status(400).json({
          success: false,
          error: 'يرجى إدخال رقم هاتف صالح (مثال: 0550123456).',
        });
      }

      if (!wilayaCode || typeof wilayaCode !== 'string') {
        return res.status(400).json({ success: false, error: 'يرجى تحديد ولاية التوصيل.' });
      }
      const cleanWilayaCode = wilayaCode.trim().padStart(2, '0');
      const wilayaInfo = ALGERIA_WILAYAS.find((w) => w.code === cleanWilayaCode);
      if (!wilayaInfo) {
        return res.status(400).json({ success: false, error: 'الولاية المحددة غير صالحة.' });
      }

      if (!commune || typeof commune !== 'string' || !commune.trim()) {
        return res.status(400).json({ success: false, error: 'يرجى تحديد البلدية.' });
      }

      if (!address || typeof address !== 'string' || !address.trim()) {
        return res.status(400).json({ success: false, error: 'يرجى كتابة عنوان التوصيل بالتفصيل.' });
      }

      const validDeliveryType: 'home' | 'desk' = deliveryType === 'desk' ? 'desk' : 'home';

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, error: 'لا توجد منتجات في الطلب.' });
      }

      // Extract ONLY product identifiers and quantities — completely discard any client-submitted prices!
      const sanitizedItemRequests = items.map((it: any) => ({
        productId: String(it.productId || it.id || '').trim(),
        size: String(it.size || 'Standard').trim(),
        color: String(it.color || 'Standard').trim(),
        quantity: Math.max(1, Math.floor(Number(it.quantity) || 1)),
      }));

      if (sanitizedItemRequests.some((it) => !it.productId)) {
        return res.status(400).json({ success: false, error: 'أحد المنتجات المحددة غير صالح.' });
      }

      const cleanIdempotencyKey =
        typeof idempotencyKey === 'string' && idempotencyKey.trim()
          ? idempotencyKey.trim().substring(0, 80)
          : `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      const orderId = `order_${cleanIdempotencyKey}`;
      const orderNumber = `AMD-${Math.floor(100000 + Math.random() * 900000)}`;
      const uniqueProductIds = Array.from(new Set(sanitizedItemRequests.map((i) => i.productId)));

      // Execute Atomic Transaction
      const committedOrder = await runTransaction(db, async (transaction) => {
        const orderRef = doc(db, 'orders', orderId);

        // STEP 0: Idempotency check inside transaction
        const existingSnap = await transaction.get(orderRef);
        if (existingSnap.exists()) {
          console.log(`[Idempotency Backend] Order ${orderId} already exists. Returning existing order.`);
          return existingSnap.data();
        }

        // STEP 1: Verify real shipping rate in Firestore
        let shippingCost = validDeliveryType === 'home' ? wilayaInfo.defaultHomePrice : wilayaInfo.defaultDeskPrice;
        const shippingRef = doc(db, 'shipping', `wilaya-${cleanWilayaCode}`);
        const shippingSnap = await transaction.get(shippingRef);
        if (shippingSnap.exists()) {
          const sData = shippingSnap.data();
          if (validDeliveryType === 'desk' && sData.isDeskAvailable === false) {
            throw new Error(`التوصيل إلى المكتب (Stop Desk) غير متوفر في ولاية ${wilayaInfo.name}. يرجى اختيار التوصيل إلى المنزل.`);
          }
          if (validDeliveryType === 'home' && typeof sData.homePrice === 'number') {
            shippingCost = sData.homePrice;
          } else if (validDeliveryType === 'desk' && typeof sData.deskPrice === 'number') {
            shippingCost = sData.deskPrice;
          }
        }

        // STEP 2: Read all product docs in Firestore
        const productSnapMap = new Map<string, { ref: any; data: any }>();
        for (const pid of uniqueProductIds) {
          const productRef = doc(db, 'products', pid);
          const snap = await transaction.get(productRef);
          if (!snap.exists()) {
            throw new Error('المنتج المطلوب غير موجود أو تم حذفه.');
          }
          productSnapMap.set(pid, { ref: productRef, data: snap.data() });
        }

        // STEP 3: Read coupon doc if couponCode provided
        let couponRef: any = null;
        let couponSnap: any = null;
        const normCouponCode =
          typeof couponCode === 'string' && couponCode.trim()
            ? couponCode.trim().toUpperCase()
            : '';
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
            throw new Error('انتهت مرات استخدام هذا الكوبون.');
          }
        }

        // STEP 4: Process inventory & verify authentic prices from Firestore
        const updatedVariantsMap = new Map<string, any[]>();
        for (const [pid, entry] of productSnapMap.entries()) {
          const clonedVariants = (entry.data.variants || []).map((v: any) => ({ ...v }));
          updatedVariantsMap.set(pid, clonedVariants);
        }

        const verifiedOrderItems: any[] = [];
        let verifiedSubtotal = 0;

        for (const itemReq of sanitizedItemRequests) {
          const productEntry = productSnapMap.get(itemReq.productId);
          if (!productEntry) {
            throw new Error('المنتج غير موجود.');
          }
          const pData = productEntry.data;
          if (pData.isPublished === false) {
            throw new Error(`المنتج (${pData.name || itemReq.productId}) غير متاح حالياً.`);
          }

          const currentVariants = updatedVariantsMap.get(itemReq.productId)!;
          let vIdx = currentVariants.findIndex((v: any) => {
            const matchSize = (v.size || '').trim().toLowerCase() === itemReq.size.toLowerCase();
            if (itemReq.color && v.color && itemReq.color !== 'Standard') {
              return matchSize && v.color.trim().toLowerCase() === itemReq.color.toLowerCase();
            }
            return matchSize;
          });

          if (vIdx === -1 && currentVariants.length > 0) {
            vIdx = currentVariants.findIndex((v: any) =>
              (v.size || '').trim().toLowerCase() === itemReq.size.toLowerCase()
            );
          }

          if (vIdx === -1 && currentVariants.length > 0) {
            throw new Error(`المقاس (${itemReq.size}) غير متوفر لمنتج "${pData.name || 'المنتج'}".`);
          }

          let targetVariant = vIdx !== -1 ? currentVariants[vIdx] : null;
          if (targetVariant) {
            const currentStock = Number(targetVariant.stock) || 0;
            if (currentStock < itemReq.quantity) {
              if (currentStock <= 0) {
                throw new Error(`نفد مخزون مقاس (${itemReq.size}) من منتج "${pData.name}".`);
              } else {
                throw new Error(
                  `الكمية المتاحة من مقاس (${itemReq.size}) لمنتج "${pData.name}" هي ${currentStock} قطع فقط.`
                );
              }
            }
            targetVariant.stock = Math.max(0, currentStock - itemReq.quantity);
          }

          // AUTHENTIC PRICE CALCULATION FROM BACKEND
          let verifiedUnitPrice = 0;
          const basePrice = Number(pData.price) || 0;
          if (typeof pData.salePrice === 'number' && pData.salePrice > 0 && pData.salePrice < basePrice) {
            verifiedUnitPrice = pData.salePrice;
          } else if (basePrice > 0) {
            verifiedUnitPrice = basePrice;
          } else {
            throw new Error(`سعر المنتج "${pData.name || itemReq.productId}" غير محدد بشكل صحيح.`);
          }

          const itemTotal = verifiedUnitPrice * itemReq.quantity;
          verifiedSubtotal += itemTotal;

          const mainImage = getMainImageUrl(pData.images);

          verifiedOrderItems.push({
            productId: itemReq.productId,
            name: pData.name || 'منتج',
            productName: pData.name || 'منتج',
            price: verifiedUnitPrice,
            unitPrice: verifiedUnitPrice,
            color: targetVariant?.color || itemReq.color || 'Standard',
            size: targetVariant?.size || itemReq.size || 'Standard',
            quantity: itemReq.quantity,
            image: mainImage,
            productImage: mainImage,
          });
        }

        // STEP 5: Validate and apply coupon discount against authentic subtotal
        let discountAmount = 0;
        if (couponSnap && couponSnap.exists()) {
          const cData = couponSnap.data();
          if (cData.minOrder && verifiedSubtotal < cData.minOrder) {
            throw new Error(
              `الحد الأدنى لتطبيق كود الخصم هو ${cData.minOrder} د.ج (المجموع الحالي: ${verifiedSubtotal} د.ج).`
            );
          }
          if (cData.discountType === 'percentage') {
            discountAmount = Math.round((verifiedSubtotal * (Number(cData.discountValue) || 0)) / 100);
          } else {
            discountAmount = Math.max(0, Number(cData.discountValue) || 0);
          }
          discountAmount = Math.min(discountAmount, verifiedSubtotal);
        }

        const verifiedGrandTotal = Math.max(0, verifiedSubtotal - discountAmount) + shippingCost;

        // STEP 6: Execute Atomic Writes inside Transaction
        for (const [pid, updatedVariants] of updatedVariantsMap.entries()) {
          const pRef = productSnapMap.get(pid)!.ref;
          transaction.update(pRef, {
            variants: updatedVariants,
            updatedAt: new Date().toISOString(),
          });
        }

        if (couponRef && couponSnap && couponSnap.exists()) {
          const currentUsage =
            typeof couponSnap.data()?.usageCount === 'number' ? couponSnap.data()?.usageCount : 0;
          transaction.update(couponRef, {
            usageCount: currentUsage + 1,
          });
        }

        const nowIso = new Date().toISOString();
        const orderPayload: Record<string, any> = {
          id: orderId,
          orderId: orderId,
          orderNumber: orderNumber,
          idempotencyKey: cleanIdempotencyKey,
          customerName: customerName.trim(),
          phone: cleanPhone,
          wilaya: wilayaInfo.name,
          wilayaCode: cleanWilayaCode,
          commune: commune.trim(),
          address: address.trim(),
          notes: (notes || '').trim(),
          deliveryType: validDeliveryType,
          items: verifiedOrderItems,
          subtotal: verifiedSubtotal,
          shippingCost: shippingCost,
          discount: discountAmount,
          total: verifiedGrandTotal,
          status: 'new',
          source: source === 'instant_buy' ? 'instant_buy' : 'cart',
          inventoryDeducted: true,
          stockRestored: false,
          shippingStatus: 'not_sent',
          shippingTrackingNumber: null,
          shippingUpdatedAt: nowIso,
          deliveredAt: null,
          isArchived: false,
          andersonStatus: 'pending',
          andersonTrackingNumber: null,
          andersonAttempts: 0,
          statusHistory: [
            {
              status: 'new',
              timestamp: nowIso,
              note:
                source === 'instant_buy'
                  ? 'طلب شراء فوري جديد (تم تأكيد الأسعار والمخزون بأمان عبر الخادم)'
                  : 'طلب جديد عبر السلة (تم تأكيد الأسعار والمخزون بأمان عبر الخادم)',
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

      // STEP 7: Post-Commit Background Tasks (Non-blocking)
      // 1. Customer profile upsert
      try {
        const customerDocId = `cust_${cleanPhone}`;
        const customerRef = doc(db, 'customers', customerDocId);
        const customerSnap = await getDoc(customerRef);
        if (customerSnap.exists()) {
          await updateDoc(customerRef, {
            name: customerName.trim(),
            wilaya: wilayaInfo.name,
            totalOrders: increment(1),
            totalSpent: increment(committedOrder.total),
            lastOrderDate: new Date().toISOString(),
            lastOrderId: committedOrder.id,
          });
        } else {
          await setDoc(customerRef, {
            id: customerDocId,
            name: customerName.trim(),
            phone: cleanPhone,
            wilaya: wilayaInfo.name,
            totalOrders: 1,
            totalSpent: committedOrder.total,
            lastOrderDate: new Date().toISOString(),
            lastOrderId: committedOrder.id,
          });
        }
      } catch (custErr) {
        console.warn('[Server] Customer profile update notice (non-fatal):', custErr);
      }

      // 2. Anderson Delivery auto-dispatch check
      try {
        const andersonSettings = await getStoredAndersonSettings();
        if (andersonSettings.enabled && andersonSettings.autoSendOrders && andersonSettings.apiToken) {
          const selfUrl = `http://localhost:${process.env.PORT || 3000}/api/anderson/send-order`;
          fetch(selfUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId: committedOrder.id }),
          }).catch((err) => {
            console.warn('[Server] Anderson auto-dispatch notice (non-fatal):', err);
          });
        }
      } catch (andErr) {
        console.warn('[Server] Anderson check notice (non-fatal):', andErr);
      }

      return res.status(200).json({
        success: true,
        order: committedOrder,
      });
    } catch (err: any) {
      console.error('[API Order Create Error]:', err);
      return res.status(400).json({
        success: false,
        error: err.message || 'حدث خطأ أثناء معالجة وحفظ الطلب. يرجى المحاولة مرة أخرى.',
      });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // 11. POST Save Storage File (Categories / Media upload)
  // Supports both multipart/form-data (FormData) and application/json (Base64)
  // ─────────────────────────────────────────────────────────────
  const storageUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max
  }).single('file');

  app.post('/api/storage/upload', (req, res) => {
    storageUpload(req, res, async (multerErr) => {
      if (multerErr) {
        console.error('[Storage API Multer Error]:', multerErr);
        return res.status(400).json({ success: false, error: 'حجم الملف يتجاوز الحد المسموح به (25 ميغابايت).' });
      }

      try {
        const folder = (req.body?.folder || 'general').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
        const subfolder = (req.body?.subfolder || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
        let fileName = (req.body?.fileName || '').trim().replace(/[^a-zA-Z0-9_.-]/g, '_');

        let fileBuffer: Buffer | null = null;

        if (req.file) {
          fileBuffer = req.file.buffer;
          if (!fileName) {
            const rawExt = path.extname(req.file.originalname) || '.jpg';
            fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}${rawExt}`;
          }
        } else if (req.body?.fileBase64) {
          const base64Data = req.body.fileBase64.replace(/^data:[^;]+;base64,/, '');
          fileBuffer = Buffer.from(base64Data, 'base64');
        }

        if (!fileBuffer || !fileName) {
          return res.status(400).json({ success: false, error: 'بيانات الملف غير مكتملة أو الملف مفقود.' });
        }

        const cleanFolder = folder || 'general';
        const cleanSub = subfolder || '';
        const cleanFileName = fileName;

        const targetDir = cleanSub ? path.join(uploadsDir, cleanFolder, cleanSub) : path.join(uploadsDir, cleanFolder);
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }

        const filePathOnDisk = path.join(targetDir, cleanFileName);
        fs.writeFileSync(filePathOnDisk, fileBuffer);

        const relativeUrl = cleanSub
          ? `/uploads/${cleanFolder}/${cleanSub}/${cleanFileName}`
          : `/uploads/${cleanFolder}/${cleanFileName}`;

        const storagePath = cleanSub
          ? `${cleanFolder}/${cleanSub}/${cleanFileName}`
          : `${cleanFolder}/${cleanFileName}`;

        return res.json({
          success: true,
          url: relativeUrl,
          path: storagePath,
          name: cleanFileName,
        });
      } catch (err: any) {
        console.error('[Storage API Upload Error]:', err);
        return res.status(500).json({ success: false, error: err.message || 'فشل حفظ الملف على الخادم' });
      }
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 10. POST Delete Storage File
  // ─────────────────────────────────────────────────────────────
  app.post('/api/storage/delete', async (req, res) => {
    try {
      const { pathOrUrl } = req.body;
      if (!pathOrUrl || typeof pathOrUrl !== 'string') {
        return res.json({ success: true });
      }

      const relative = pathOrUrl.replace(/^\/uploads\//, '').replace(/^uploads\//, '');
      const normalized = path.normalize(relative);
      if (normalized.startsWith('..')) {
        return res.status(400).json({ success: false, error: 'مسار غير صالح' });
      }

      const fullPath = path.join(uploadsDir, normalized);
      if (fs.existsSync(fullPath)) {
        try {
          fs.unlinkSync(fullPath);
        } catch {}
      }

      return res.json({ success: true });
    } catch (err: any) {
      console.warn('[Storage API Delete Error]:', err);
      return res.json({ success: false });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // Vite Integration (Dev Middleware / Prod Static Files)
  // ─────────────────────────────────────────────────────────────
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[AMADAL Store Server] Running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[Server Fatal Startup Error]:', err);
  process.exit(1);
});
