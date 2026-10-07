import { AndersonSettings } from '../types';

export interface AndersonApiSettingsResponse {
  success: boolean;
  settings: {
    enabled: boolean;
    apiBaseUrl: string;
    autoSendOrders: boolean;
    lastTestedAt?: string;
    lastTestStatus?: 'success' | 'failed' | 'untested';
    lastTestMessage?: string;
    hasToken: boolean;
    maskedToken: string;
  };
  error?: string;
}

export interface AndersonTestResponse {
  success: boolean;
  message?: string;
  error?: string;
  wilayasCount?: number;
}

export interface AndersonSendOrderResponse {
  success: boolean;
  trackingNumber?: string;
  attempts?: number;
  message?: string;
  error?: string;
  alreadySent?: boolean;
  skipped?: boolean;
}

/**
 * Fetch current Anderson settings from server (token is masked for security)
 */
export async function getAndersonSettings(): Promise<AndersonApiSettingsResponse> {
  const res = await fetch('/api/anderson/settings');
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'فشل جلب إعدادات Anderson');
  }
  return res.json();
}

/**
 * Save Anderson credentials and configuration
 */
export async function saveAndersonSettings(data: {
  enabled: boolean;
  apiToken?: string;
  apiBaseUrl?: string;
  autoSendOrders?: boolean;
}): Promise<{ success: boolean; message?: string; settings?: any; error?: string }> {
  const res = await fetch('/api/anderson/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'فشل حفظ الإعدادات');
  }
  return json;
}

/**
 * Test connectivity with Anderson Delivery API using token
 */
export async function testAndersonConnection(
  apiToken?: string,
  apiBaseUrl?: string
): Promise<AndersonTestResponse> {
  const res = await fetch('/api/anderson/test-connection', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiToken, apiBaseUrl }),
  });
  const json = await res.json().catch(() => ({ success: false, error: 'استجابة غير صحيحة من الخادم' }));
  return json;
}

/**
 * Send an order to Anderson Delivery (triggers backend dispatch with auto-retry and duplicate prevention)
 */
export async function sendOrderToAnderson(
  orderId: string,
  force: boolean = false
): Promise<AndersonSendOrderResponse> {
  const res = await fetch('/api/anderson/send-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId, force }),
  });
  const json = await res.json().catch(() => ({ success: false, error: 'فشل الاتصال بالخادم' }));
  return json;
}

/**
 * Retry all orders that failed sending to Anderson
 */
export async function retryAllFailedOrders(): Promise<{ success: boolean; count?: number; message?: string; error?: string }> {
  const res = await fetch('/api/anderson/retry-all-failed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const json = await res.json();
  return json;
}
