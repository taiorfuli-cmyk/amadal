/**
 * Dynamic API Base URL & Robust Fetch Client
 * Supports Relative Paths, Environment Variables, Credentials, and Detailed Error Handling.
 */

const TOKEN_STORAGE_KEY = 'amadal_admin_token';

/**
 * Returns the configured API base URL.
 * Defaults to empty string so all requests use relative paths (e.g., /api/admin/login),
 * which natively works across local dev, preview iframes, and live Cloud Run production URLs.
 */
export const getApiBaseUrl = (): string => {
  const envUrl = (import.meta as any).env?.VITE_API_BASE_URL;
  if (typeof envUrl === 'string' && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '');
  }
  return '';
};

/**
 * Formats an API endpoint path with the base URL.
 * Example: getApiUrl('/api/admin/login') -> '/api/admin/login' (or 'https://domain.com/api/admin/login')
 */
export const getApiUrl = (endpoint: string): string => {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const base = getApiBaseUrl();
  return `${base}${cleanEndpoint}`;
};

export interface ApiFetchOptions extends RequestInit {
  skipAuth?: boolean;
}

const CSRF_STORAGE_KEY = 'amadal_csrf_token';

export function getCsrfToken(): string | null {
  if (typeof document !== 'undefined') {
    const match = document.cookie.match(/(?:^|;\s*)amadal_csrf_token=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
    return localStorage.getItem(CSRF_STORAGE_KEY);
  }
  return null;
}

export function setCsrfToken(token: string): void {
  if (typeof window !== 'undefined' && token) {
    localStorage.setItem(CSRF_STORAGE_KEY, token);
  }
}

/**
 * Enhanced fetch wrapper with:
 * - Dynamic relative or absolute base URL
 * - credentials: 'include' for cross-site cookie and session support
 * - Automatic Authorization header injection
 * - Automatic CSRF Protection header injection
 * - Comprehensive error parsing with detailed Arabic error messages
 */
export interface ApiFetchResponse<T = any> {
  ok: boolean;
  status: number;
  data?: T | null;
  error?: string;
  json: () => Promise<any>;
  text: () => Promise<string>;
}

export async function apiFetch<T = any>(
  endpoint: string,
  options: ApiFetchOptions = {}
): Promise<ApiFetchResponse<T>> {
  const url = getApiUrl(endpoint);
  const token = typeof window !== 'undefined' ? localStorage.getItem(TOKEN_STORAGE_KEY) : null;
  const csrf = getCsrfToken();

  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  if (token && !options.skipAuth && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('X-Admin-Token', token);
  }

  // Inject CSRF protection token on state-changing requests
  const method = (options.method || 'GET').toUpperCase();
  if (csrf && !headers.has('X-CSRF-Token') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    headers.set('X-CSRF-Token', csrf);
  }

  try {
    const res = await fetch(url, {
      ...options,
      headers,
      credentials: 'include', // Guarantees cookies & credentials are transmitted across origins
    });

    // Read raw text first to guarantee that HTML error pages never throw syntax errors
    const rawText = await res.text();
    let data: any = null;
    let isJson = false;

    if (rawText && rawText.trim()) {
      try {
        data = JSON.parse(rawText);
        isJson = true;
      } catch {
        data = null;
      }
    }

    if (!res.ok) {
      let detailedError = data?.error || (data?.message && typeof data.message === 'string' && !data.message.includes('<') ? data.message : '');

      if (!detailedError) {
        if (res.status === 401) {
          detailedError = 'اسم المستخدم أو كلمة المرور غير صحيحة (401 Unauthorized).';
        } else if (res.status === 403) {
          detailedError = 'غير مصرح لك بالوصول (403 Forbidden).';
        } else if (res.status === 404) {
          detailedError = `المسار المطلوب غير موجود في الخادم (404 Not Found: ${endpoint}).`;
        } else if (res.status >= 500) {
          detailedError = `خطأ داخلي في الخادم (${res.status} Server Error).`;
        } else {
          detailedError = `فشل الطلب مع رمز الحالة ${res.status}.`;
        }
      }

      console.warn(`[apiFetch Error] ${options.method || 'GET'} ${url} returned ${res.status}:`, detailedError);
      return {
        ok: false,
        status: res.status,
        data,
        error: detailedError,
        json: async () => data,
        text: async () => rawText,
      };
    }

    if (!isJson) {
      console.warn(`[apiFetch Warning] ${url} returned non-JSON content:`, rawText.substring(0, 100));
      return {
        ok: false,
        status: res.status,
        data: null,
        error: 'استجاب الخادم بصفحة ويب HTML بدلاً من استجابة JSON برمجية.',
        json: async () => null,
        text: async () => rawText,
      };
    }

    if (data?.csrfToken && typeof data.csrfToken === 'string') {
      setCsrfToken(data.csrfToken);
    }

    return {
      ok: true,
      status: res.status,
      data,
      json: async () => data,
      text: async () => rawText,
    };
  } catch (err: any) {
    console.error(`[apiFetch Network Failure] ${options.method || 'GET'} ${url}:`, err);
    return {
      ok: false,
      status: 0,
      data: null,
      error: 'تعذر الاتصال بالخادم. يرجى التحقق من اتصالك بالإنترنت.',
      json: async () => null,
      text: async () => '',
    };
  }
}
