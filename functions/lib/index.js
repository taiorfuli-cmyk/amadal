"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.onOrderCreated = exports.telegramChatId = exports.telegramBotToken = void 0;
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-admin/firestore");
const params_1 = require("firebase-functions/params");
const firestore_2 = require("firebase-functions/v2/firestore");
const firebase_functions_1 = require("firebase-functions");
// Initialize Firebase Admin SDK
if (!admin.apps.length) {
    admin.initializeApp();
}
const DATABASE_ID = "ai-studio-2db3d1c2-f15e-4565-b59f-c0f72c86dcc6";
const db = (0, firestore_1.getFirestore)(DATABASE_ID);
/**
 * Pre-configured Secrets for Telegram Bot integration using Firebase Secret Manager.
 * These can be populated securely via Firebase CLI:
 *   firebase functions:secrets:set TELEGRAM_BOT_TOKEN
 *   firebase functions:secrets:set TELEGRAM_CHAT_ID
 *
 * This keeps all sensitive API tokens completely out of source code, Git, and frontend builds.
 */
exports.telegramBotToken = (0, params_1.defineSecret)("TELEGRAM_BOT_TOKEN");
exports.telegramChatId = (0, params_1.defineSecret)("TELEGRAM_CHAT_ID");
/**
 * Helper to escape HTML characters for Telegram HTML mode
 */
function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}
/**
 * Format currency with thousands separators (DZD)
 */
function formatCurrency(amount) {
    return new Intl.NumberFormat("ar-DZ").format(Math.round(amount));
}
/**
 * Cloud Function: onOrderCreated
 * Triggered automatically in real-time when a new order document is created in Firestore (/orders/{orderId}).
 * Dispatches a Telegram notification using Firebase Secret Manager.
 */
exports.onOrderCreated = (0, firestore_2.onDocumentCreated)({
    document: "orders/{orderId}",
    database: DATABASE_ID,
    secrets: [exports.telegramBotToken, exports.telegramChatId],
    retry: false,
}, async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
        firebase_functions_1.logger.warn("[Telegram Notification] Order event received without snapshot data");
        return;
    }
    const orderId = event.params.orderId;
    const orderData = snapshot.data();
    if (!orderData) {
        firebase_functions_1.logger.warn("[Telegram Notification] Snapshot has no data", { orderId });
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
            transaction.set(notificationLockRef, {
                orderId,
                orderNumber,
                status: "processing",
                processingAt: firestore_1.FieldValue.serverTimestamp(),
                attempts: firestore_1.FieldValue.increment(1),
            }, { merge: true });
            return true;
        });
    }
    catch (txError) {
        firebase_functions_1.logger.error(`[Telegram Notification] Transaction lock failed for order #${orderNumber}`, {
            error: txError?.message || String(txError),
        });
        return;
    }
    if (!shouldProcess) {
        firebase_functions_1.logger.info(`[Telegram Notification] Skipped duplicate/concurrent notification for order #${orderNumber}`);
        return;
    }
    // ─────────────────────────────────────────────────────────────
    // STEP 2: Validate Secrets
    // ─────────────────────────────────────────────────────────────
    const botToken = exports.telegramBotToken.value()?.trim();
    const chatId = exports.telegramChatId.value()?.trim();
    if (!botToken || !chatId) {
        firebase_functions_1.logger.warn(`[Telegram Notification] Secrets (TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID) are not configured. Notification skipped for order #${orderNumber}.`);
        await notificationLockRef.set({
            status: "skipped_no_credentials",
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true });
        return;
    }
    // ─────────────────────────────────────────────────────────────
    // STEP 3: Build Telegram Message (Zero PII: No name, phone, or address)
    // ─────────────────────────────────────────────────────────────
    let itemsText = "";
    if (items.length > 0) {
        itemsText = items
            .map((it, index) => {
            const name = escapeHtml(String(it.name || it.productName || "منتج").trim());
            const quantity = Number(it.quantity) || 1;
            const unitPrice = Number(it.price || it.unitPrice) || 0;
            const itemTotal = quantity * unitPrice;
            const size = it.size && it.size !== "Standard" ? ` | المقاس: ${escapeHtml(it.size)}` : "";
            const color = it.color && it.color !== "Standard" ? ` | اللون: ${escapeHtml(it.color)}` : "";
            return `  ${index + 1}. <b>${name}</b>${size}${color}\n     ▫️ الكمية: <b>${quantity}</b> × ${formatCurrency(unitPrice)} د.ج = <b>${formatCurrency(itemTotal)} د.ج</b>`;
        })
            .join("\n\n");
    }
    else {
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
        const resData = (await response.json());
        if (!response.ok || !resData?.ok) {
            const errorDesc = resData?.description || `HTTP ${response.status}`;
            firebase_functions_1.logger.error(`[Telegram Notification] Telegram API returned error for order #${orderNumber}`, {
                status: response.status,
                error: errorDesc,
            });
            await notificationLockRef.set({
                status: "failed",
                error: errorDesc,
                failedAt: firestore_1.FieldValue.serverTimestamp(),
            }, { merge: true });
            return;
        }
        // Success: mark sent
        await notificationLockRef.set({
            status: "sent",
            sentAt: firestore_1.FieldValue.serverTimestamp(),
            telegramMessageId: resData.result?.message_id,
        }, { merge: true });
        firebase_functions_1.logger.info(`[Telegram Notification] Successfully dispatched notification for order #${orderNumber}`);
    }
    catch (error) {
        firebase_functions_1.logger.error(`[Telegram Notification] Network exception while sending for order #${orderNumber}`, {
            error: error?.message || String(error),
        });
        await notificationLockRef.set({
            status: "failed",
            error: error?.message || "Network exception",
            failedAt: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true });
    }
});
//# sourceMappingURL=index.js.map