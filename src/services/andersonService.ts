import { AndersonSettings } from '../types';
import { apiFetch } from '../utils/apiConfig';

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
  const res = await apiFetch<AndersonApiSettingsResponse>('/api/anderson/settings', {
    method: 'GET',
  });
  if (!res.ok || !res.data) {
    throw new Error(res.error || 'فشل جلب إعدادات Anderson');
  }
  return res.data;
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
  const res = await apiFetch('/api/anderson/settings', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok || !res.data) {
    throw new Error(res.error || 'فشل حفظ الإعدادات');
  }
  return res.data;
}

/**
 * Test connectivity with Anderson Delivery API using token
 */
export async function testAndersonConnection(
  apiToken?: string,
  apiBaseUrl?: string
): Promise<AndersonTestResponse> {
  const res = await apiFetch<AndersonTestResponse>('/api/anderson/test-connection', {
    method: 'POST',
    body: JSON.stringify({ apiToken, apiBaseUrl }),
  });
  if (!res.ok || !res.data) {
    return { success: false, error: res.error || 'استجابة غير صحيحة من الخادم' };
  }
  return res.data;
}

/**
 * Send an order to Anderson Delivery (triggers backend dispatch with auto-retry and duplicate prevention)
 */
export async function sendOrderToAnderson(
  orderId: string,
  force: boolean = false
): Promise<AndersonSendOrderResponse> {
  const res = await apiFetch<AndersonSendOrderResponse>('/api/anderson/send-order', {
    method: 'POST',
    body: JSON.stringify({ orderId, force }),
  });
  if (!res.ok || !res.data) {
    return { success: false, error: res.error || 'فشل الاتصال بالخادم' };
  }
  return res.data;
}

/**
 * Retry all orders that failed sending to Anderson
 */
export async function retryAllFailedOrders(): Promise<{ success: boolean; count?: number; message?: string; error?: string }> {
  const res = await apiFetch<{ success: boolean; count?: number; message?: string; error?: string }>(
    '/api/anderson/retry-all-failed',
    {
      method: 'POST',
    }
  );
  if (!res.ok || !res.data) {
    return { success: false, error: res.error || 'فشل إعادة المحاولة' };
  }
  return res.data;
}
