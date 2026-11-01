import * as admin from "firebase-admin";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp();
}

const DATABASE_ID = "ai-studio-2db3d1c2-f15e-4565-b59f-c0f72c86dcc6";
const db = getFirestore(DATABASE_ID);

/**
 * Pre-configured Secrets for Telegram Bot integration using Firebase Secret Manager.
 * These can be populated securely via Firebase CLI:
 *   firebase functions:secrets:set TELEGRAM_BOT_TOKEN
 *   firebase functions:secrets:set TELEGRAM_CHAT_ID
 *
 * This keeps all sensitive API tokens completely out of source code, Git, and frontend builds.
 */
export const telegramBotToken = defineSecret("TELEGRAM_BOT_TOKEN");
export const telegramChatId = defineSecret("TELEGRAM_CHAT_ID");

/**
 * Helper to escape HTML characters for Telegram HTML mode
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Format currency with thousands separators (DZD)
 */
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("ar-DZ").format(Math.round(amount));
}

/**
 * Cloud Function: onOrderCreated
 * Triggered automatically in real-time when a new order document is created in Firestore (/orders/{orderId}).
 * Dispatches a Telegram notification using Firebase Secret Manager.
 */
export const onOrderCreated = onDocumentCreated(
  {
    document: "orders/{orderId}",
    database: DATABASE_ID,
    secrets: [telegramBotToken, telegramChatId],
    retry: false,
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      logger.warn("[Telegram Notification] Order event received without snapshot data");
      return;
    }

    const orderId = event.params.orderId;
    const orderData = snapshot.data();
    if (!orderData) {
      logger.warn("[Telegram Notification] Snapshot has no data", { orderId });
      return;
    }

    // Extract actual verified fields without any PII (no customer name, phone, or address)
    const orderNumber = String(orderData.orderNumber || orderId).trim();
    const items = Array.isArray(orderData.items) ? orderData.items : [];
    const total = Number(orderData.total) || 0;

    // ─────────────────────────────────────────────────────────────
    // STEP 1: Idempotency & Deduplication Guard via Firestore Transaction
    // Prevents duplicate notifications during retries or multiple triggers.
    // Order document lifecycle and status are completely untouched.
    // ─────────────────────────────────────────────────────────────
    const notificationLockRef = db.collection("telegram_notifications").doc(orderId);

    let shouldProcess = false;
    try {
      shouldProcess = await db.runTransaction(async (transaction) => {
        const lockDoc = await transaction.get(notificationLockRef);

        if (lockDoc.exists) {
          const data = lockDoc.data();
          if (data?.status === "sent") {
            // Already sent successfully
            return false;
          }

          // If processing started recently (< 60s), another instance is actively handling it
          if (data?.status === "processing" && data?.processingAt) {
            const processingMillis = typeof data.processingAt.toMillis === "function"
              ? data.processingAt.toMillis()
              : (data.processingAt._seconds ? data.processingAt._seconds * 1000 : Date.now());
            const ageMs = Date.now() - processingMillis;
            if (ageMs < 60000) {
              return false;
            }
          }
        }

        transaction.set(
          notificationLockRef,
          {
            orderId,
            orderNumber,
            status: "processing",
            processingAt: FieldValue.serverTimestamp(),
            attempts: FieldValue.increment(1),
          },
          { merge: true }
        );

        return true;
      });
    } catch (txError: any) {
      logger.error(`[Telegram Notification] Transaction lock failed for order #${orderNumber}`, {
        error: txError?.message || String(txError),
      });
      return;
    }

    if (!shouldProcess) {
      logger.info(`[Telegram Notification] Skipped duplicate/concurrent notification for order #${orderNumber}`);
      return;
    }

    // ─────────────────────────────────────────────────────────────
    // STEP 2: Validate Secrets
    // ─────────────────────────────────────────────────────────────
    const botToken = telegramBotToken.value()?.trim();
    const chatId = telegramChatId.value()?.trim();

    if (!botToken || !chatId) {
      logger.warn(
        `[Telegram Notification] Secrets (TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID) are not configured. Notification skipped for order #${orderNumber}.`
      );
      await notificationLockRef.set(
        {
          status: "skipped_no_credentials",
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return;
    }

    // ─────────────────────────────────────────────────────────────
    // STEP 3: Build Telegram Message (Zero PII: No name, phone, or address)
    // ─────────────────────────────────────────────────────────────
    let itemsText = "";
    if (items.length > 0) {
      itemsText = items
        .map((it: any, index: number) => {
          const name = escapeHtml(String(it.name || it.productName || "منتج").trim());
          const quantity = Number(it.quantity) || 1;
          const unitPrice = Number(it.price || it.unitPrice) || 0;
          const itemTotal = quantity * unitPrice;
          const size = it.size && it.size !== "Standard" ? ` | المقاس: ${escapeHtml(it.size)}` : "";
          const color = it.color && it.color !== "Standard" ? ` | اللون: ${escapeHtml(it.color)}` : "";

          return `  ${index + 1}. <b>${name}</b>${size}${color}\n     ▫️ الكمية: <b>${quantity}</b> × ${formatCurrency(unitPrice)} د.ج = <b>${formatCurrency(itemTotal)} د.ج</b>`;
        })
        .join("\n\n");
    } else {
      itemsText = "  <i>لا توجد تفاصيل منتجات مسجلة</i>";
    }

    const message = [
      `🛍️ <b>طلب جديد من AMADAL</b>`,
      `━━━━━━━━━━━━━━━━━━`,
      `📋 <b>رقم الطلب:</b> <code>#${escapeHtml(orderNumber)}</code>`,
      ``,
      `📦 <b>المنتجات والكميات:</b>`,
      itemsText,
      `━━━━━━━━━━━━━━━━━━`,
      `💰 <b>الإجمالي النهائي:</b> <b>${formatCurrency(total)} د.ج</b>`,
    ].join("\n");

    // ─────────────────────────────────────────────────────────────
    // STEP 4: Dispatch to Telegram Bot API with Error Handling
    // ─────────────────────────────────────────────────────────────
    try {
      const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
      const response = await fetch(telegramUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      });

      const resData = (await response.json()) as any;

      if (!response.ok || !resData?.ok) {
        const errorDesc = resData?.description || `HTTP ${response.status}`;
        logger.error(`[Telegram Notification] Telegram API returned error for order #${orderNumber}`, {
          status: response.status,
          error: errorDesc,
        });

        await notificationLockRef.set(
          {
            status: "failed",
            error: errorDesc,
            failedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        return;
      }

      // Success: mark sent
      await notificationLockRef.set(
        {
          status: "sent",
          sentAt: FieldValue.serverTimestamp(),
          telegramMessageId: resData.result?.message_id,
        },
        { merge: true }
      );

      logger.info(`[Telegram Notification] Successfully dispatched notification for order #${orderNumber}`);
    } catch (error: any) {
      logger.error(`[Telegram Notification] Network exception while sending for order #${orderNumber}`, {
        error: error?.message || String(error),
      });

      await notificationLockRef.set(
        {
          status: "failed",
          error: error?.message || "Network exception",
          failedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
  }
);
