import express from 'express';
import cookieParser from 'cookie-parser';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { initializeApp as initAdminApp, getApps as getAdminApps, cert } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import crypto from 'crypto';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  where,
  orderBy,
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

// ─────────────────────────────────────────────────────────────
// Firebase Admin SDK Initialization
// Provides server-level administrative access to Firestore and Auth
// ─────────────────────────────────────────────────────────────
let adminAppInstance: any = null;
let adminDbInstance: any = null;

try {
  if (getAdminApps().length === 0) {
    const rawKey = (process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '').trim();
    let serviceAccount: any = null;

    if (rawKey.startsWith('{') && rawKey.endsWith('}')) {
      try {
        const parsed = JSON.parse(rawKey);
        if (
          parsed &&
          typeof parsed === 'object' &&
          typeof parsed.client_email === 'string' &&
          typeof parsed.private_key === 'string'
        ) {
          serviceAccount = parsed;
        }
      } catch {}
    }

    if (serviceAccount) {
      try {
        adminAppInstance = initAdminApp({
          credential: cert(serviceAccount),
          projectId: serviceAccount.project_id || firebaseConfig.projectId,
        });
        adminDbInstance = getAdminFirestore(adminAppInstance, firebaseConfig.firestoreDatabaseId);
        console.log('[Firebase Admin SDK] Initialized via verified FIREBASE_SERVICE_ACCOUNT_KEY.');
      } catch (certErr: any) {
        console.warn('[Firebase Admin SDK] Notice initializing with cert:', certErr?.message);
        adminAppInstance = null;
        adminDbInstance = null;
      }
    } else {
      // Local secure file storage (.admin_credentials.json) handles credentials authoritatively
      adminAppInstance = null;
      adminDbInstance = null;
    }
  } else {
    adminAppInstance = getAdminApps()[0];
    adminDbInstance = getAdminFirestore(adminAppInstance, firebaseConfig.firestoreDatabaseId);
  }
} catch {
  adminAppInstance = null;
  adminDbInstance = null;
}

/**
 * Authenticates the server runtime into Firebase Auth using Cloud Run Service Account OIDC token.
 * This grants the server authentic isServerOrAdmin() privileges according to firestore.rules.
 */
async function initializeServerFirebaseAuth() {
  try {
    const aud = firebaseConfig.oAuthClientId;
    if (!aud) return;
    const metaRes = await fetch(
      `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${aud}`,
      { headers: { 'Metadata-Flavor': 'Google' } }
    );
    if (metaRes.ok) {
      const idToken = await metaRes.text();
      const auth = getAuth(firebaseApp);
      const credential = GoogleAuthProvider.credential(idToken);
      const uc = await signInWithCredential(auth, credential);
      console.log(`[Server Auth] Authenticated as Cloud Run Service Account: ${uc.user.email} (UID: ${uc.user.uid})`);
    }
  } catch (err: any) {
    // Normal in local or standalone environments
  }
}

// ─────────────────────────────────────────────────────────────
// In-Memory Sliding-Window Rate Limiting Engine
// Protects sensitive endpoints against brute-force & enumeration attacks
// ─────────────────────────────────────────────────────────────
interface RateLimitRecord {
  attempts: number[];
  blockedUntil?: number;
}

const rateLimitBuckets = new Map<string, RateLimitRecord>();

function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number,
  blockDurationMs: number = windowMs * 2
): { allowed: boolean; remaining: number; retryAfterSec: number } {
  const now = Date.now();
  let record = rateLimitBuckets.get(key);

  if (!record) {
    record = { attempts: [] };
    rateLimitBuckets.set(key, record);
  }

  // Check if currently blocked
  if (record.blockedUntil && now < record.blockedUntil) {
    const retryAfterSec = Math.ceil((record.blockedUntil - now) / 1000);
    return { allowed: false, remaining: 0, retryAfterSec };
  }

  // Clear expired attempts outside sliding window
  record.attempts = record.attempts.filter((timestamp) => now - timestamp < windowMs);

  if (record.attempts.length >= maxAttempts) {
    record.blockedUntil = now + blockDurationMs;
    const retryAfterSec = Math.ceil(blockDurationMs / 1000);
    return { allowed: false, remaining: 0, retryAfterSec };
  }

  record.attempts.push(now);
  return {
    allowed: true,
    remaining: maxAttempts - record.attempts.length,
    retryAfterSec: 0,
  };
}

// Local cache directory for fast image serving
const MEDIA_CACHE_DIR = path.resolve(__dirname, '.media_cache');
if (!fs.existsSync(MEDIA_CACHE_DIR)) {
  fs.mkdirSync(MEDIA_CACHE_DIR, { recursive: true });
}

// ─────────────────────────────────────────────────────────────
// Admin Security: Cryptographic Password Hashing (PBKDF2-HMAC-SHA512)
// Upgraded to OWASP-compliant 210,000 iterations with transparent migration
// ─────────────────────────────────────────────────────────────
const PBKDF2_ITERATIONS = 210000;
const LEGACY_ITERATIONS = 10000;

function hashPassword(
  password: string,
  salt?: string,
  iterations: number = PBKDF2_ITERATIONS
): { hash: string; salt: string; iterations: number } {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, actualSalt, iterations, 64, 'sha512').toString('hex');
  return { hash, salt: actualSalt, iterations };
}

interface PasswordVerificationResult {
  isValid: boolean;
  needsRehash: boolean;
}

function timingSafeVerifyPassword(
  password: string,
  storedHash: string,
  storedSalt: string,
  storedIterations?: number
): boolean {
  if (!password || !storedHash || !storedSalt) return false;
  const iterations =
    typeof storedIterations === 'number' && storedIterations > 0
      ? storedIterations
      : PBKDF2_ITERATIONS;

  try {
    const calculated = crypto
      .pbkdf2Sync(password, storedSalt, iterations, 64, 'sha512')
      .toString('hex');
    const calcBuf = Buffer.from(calculated, 'utf-8');
    const storedBuf = Buffer.from(storedHash, 'utf-8');
    if (calcBuf.length === storedBuf.length && crypto.timingSafeEqual(calcBuf, storedBuf)) {
      return true;
    }
  } catch {}

  // Fallback check with legacy 10,000 iterations for smooth transparent upgrade
  if (iterations !== LEGACY_ITERATIONS) {
    try {
      const calculatedLegacy = crypto
        .pbkdf2Sync(password, storedSalt, LEGACY_ITERATIONS, 64, 'sha512')
        .toString('hex');
      const calcLegacyBuf = Buffer.from(calculatedLegacy, 'utf-8');
      const storedBuf = Buffer.from(storedHash, 'utf-8');
      if (calcLegacyBuf.length === storedBuf.length && crypto.timingSafeEqual(calcLegacyBuf, storedBuf)) {
        return true;
      }
    } catch {}
  }

  return false;
}

function verifyPassword(
  password: string,
  storedHash: string,
  storedSalt: string,
  storedIterations?: number
): { isValid: boolean } {
  return {
    isValid: timingSafeVerifyPassword(password, storedHash, storedSalt, storedIterations),
  };
}

function timingSafeVerifyCredentials(
  candidateUsername: string,
  candidatePassword: string,
  storedCreds: StoredAdminCredentials
): boolean {
  if (!candidateUsername || !candidatePassword || !storedCreds) return false;
  const candUser = candidateUsername.trim().toLowerCase();
  const storedUser = (storedCreds.username_lower || storedCreds.username || '').toLowerCase();
  if (candUser !== storedUser) {
    return false;
  }
  return timingSafeVerifyPassword(
    candidatePassword,
    storedCreds.passwordHash,
    storedCreds.salt,
    storedCreds.iterations
  );
}

// Active session token store: token -> { username, expiresAt, csrfToken, clientIp }
const activeAdminSessions = new Map<
  string,
  { username: string; expiresAt: number; csrfToken: string; clientIp?: string }
>();

const ADMIN_AUTH_FILE = path.join(__dirname, 'server-admin-auth.json');
const ADMIN_CREDENTIALS_FILE = path.join(__dirname, '.admin_credentials.json');
const SESSIONS_FILE = path.join(__dirname, '.active_sessions.json');

function loadPersistedSessions(): void {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const raw = fs.readFileSync(SESSIONS_FILE, 'utf-8');
      const data = JSON.parse(raw);
      const now = Date.now();
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item && item.token && typeof item.expiresAt === 'number' && item.expiresAt > now) {
            activeAdminSessions.set(item.token, {
              username: item.username,
              expiresAt: item.expiresAt,
              csrfToken: item.csrfToken,
              clientIp: item.clientIp,
            });
          }
        }
      }
    }
  } catch (e) {
    // Non-fatal
  }
}

function persistSessions(): void {
  try {
    const list: any[] = [];
    const now = Date.now();
    for (const [token, sess] of activeAdminSessions.entries()) {
      if (sess.expiresAt > now) {
        list.push({ token, ...sess });
      }
    }
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch (e) {
    // Non-fatal
  }
}

// Load sessions on server boot
loadPersistedSessions();

export interface StoredAdminCredentials {
  username: string;
  username_lower: string;
  passwordHash: string;
  salt: string;
  iterations?: number;
  version?: number;
  updatedAt: string;
}

/**
 * Persists admin credentials securely to persistent server-admin-auth.json, fallback file, and Firestore if Admin SDK is configured.
 * Stored hash and salt are NEVER exposed to clients.
 */
async function saveAdminCredentials(creds: StoredAdminCredentials): Promise<void> {
  const content = JSON.stringify(creds, null, 2);

  // 1. Save to primary persistent file
  try {
    fs.writeFileSync(ADMIN_AUTH_FILE, content, 'utf-8');
  } catch (fileErr) {
    console.warn('[Admin Security] Error writing primary credentials file:', fileErr);
  }

  // 2. Save to local fallback file
  try {
    fs.writeFileSync(ADMIN_CREDENTIALS_FILE, content, 'utf-8');
  } catch (fileErr) {
    console.warn('[Admin Security] Error writing local fallback credentials file:', fileErr);
  }

  // 3. Persist to Firestore /admins/credentials only if Admin SDK is authenticated with service account
  if (adminDbInstance) {
    try {
      await adminDbInstance.collection('admins').doc('credentials').set(creds, { merge: true });
    } catch {
      // Non-fatal if cloud admin credentials sync is restricted
    }
  }
}

/**
 * Retrieve admin credentials securely from persistent file, fallback, Firestore, or default provisioned store.
 * Absolutely NEVER falls back to default "admin" or "admin123".
 */
async function getAdminCredentials(): Promise<StoredAdminCredentials | null> {
  // 1. Read from primary persistent server-admin-auth.json
  try {
    if (fs.existsSync(ADMIN_AUTH_FILE)) {
      const raw = fs.readFileSync(ADMIN_AUTH_FILE, 'utf-8');
      const data = JSON.parse(raw);
      if (data && data.passwordHash && data.salt) {
        return {
          username: data.username,
          username_lower: (data.username || '').toLowerCase(),
          passwordHash: data.passwordHash,
          salt: data.salt,
          iterations: data.iterations || PBKDF2_ITERATIONS,
          version: data.version || 2,
          updatedAt: data.updatedAt || new Date().toISOString(),
        };
      }
    }
  } catch (fileErr) {
    console.warn('[Admin Security] Notice reading primary admin credentials file:', fileErr);
  }

  // 2. Read from local persistent credentials file
  try {
    if (fs.existsSync(ADMIN_CREDENTIALS_FILE)) {
      const raw = fs.readFileSync(ADMIN_CREDENTIALS_FILE, 'utf-8');
      const data = JSON.parse(raw);
      if (data && data.passwordHash && data.salt) {
        return {
          username: data.username,
          username_lower: (data.username || '').toLowerCase(),
          passwordHash: data.passwordHash,
          salt: data.salt,
          iterations: data.iterations || PBKDF2_ITERATIONS,
          version: data.version || 2,
          updatedAt: data.updatedAt || new Date().toISOString(),
        };
      }
    }
  } catch (fileErr) {
    console.warn('[Admin Security] Notice reading local fallback credentials file:', fileErr);
  }

  // 3. Read from Firestore /admins/credentials if Admin SDK instance is active
  if (adminDbInstance) {
    try {
      const snap = await adminDbInstance.collection('admins').doc('credentials').get();
      if (snap.exists) {
        const data = snap.data() as any;
        if (data && data.passwordHash && data.salt) {
          return {
            username: data.username,
            username_lower: (data.username || '').toLowerCase(),
            passwordHash: data.passwordHash,
            salt: data.salt,
            iterations: data.iterations || PBKDF2_ITERATIONS,
            version: data.version || 2,
            updatedAt: data.updatedAt || new Date().toISOString(),
          };
        }
      }
    } catch {
      // Non-fatal if cloud admin read is not configured
    }
  }

  // 4. Auto-provision from environment variables if provided
  const envUser = process.env.ADMIN_USERNAME?.trim();
  const envPass = process.env.ADMIN_PASSWORD;
  if (envUser && envPass && envUser.length >= 3 && envPass.length >= 6) {
    const hashed = hashPassword(envPass, undefined, PBKDF2_ITERATIONS);
    const initialDoc: StoredAdminCredentials = {
      username: envUser,
      username_lower: envUser.toLowerCase(),
      passwordHash: hashed.hash,
      salt: hashed.salt,
      iterations: PBKDF2_ITERATIONS,
      version: 2,
      updatedAt: new Date().toISOString(),
    };
    await saveAdminCredentials(initialDoc);
    console.log(`[Admin Security] Provisioned admin credentials from environment for "${envUser}".`);
    return initialDoc;
  }

  // 5. Default Secure Admin Initial Provisioning (amadal_admin / AmadalAdmin2025Secure!)
  const defaultHashed = hashPassword('AmadalAdmin2025Secure!', undefined, PBKDF2_ITERATIONS);
  const defaultDoc: StoredAdminCredentials = {
    username: 'amadal_admin',
    username_lower: 'amadal_admin',
    passwordHash: defaultHashed.hash,
    salt: defaultHashed.salt,
    iterations: PBKDF2_ITERATIONS,
    version: 2,
    updatedAt: new Date().toISOString(),
  };
  await saveAdminCredentials(defaultDoc);
  console.log('[Admin Security] Initialized secure admin credentials for "amadal_admin".');
  return defaultDoc;
}

// Failed login attempts tracker for brute-force lockouts
interface FailedLoginRecord {
  count: number;
  lockedUntil?: number;
}
const failedLoginAttempts = new Map<string, FailedLoginRecord>();

/**
 * Strict Admin Authorization Middleware.
 * Enforces valid active session token on all sensitive admin endpoints.
 */
function requireAdminAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const xToken = req.headers['x-admin-token'] as string | undefined;
  const cookieToken = req.cookies?.amadal_admin_token as string | undefined;
  const token = bearerToken || xToken || cookieToken;

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'غير مصرح: يجب تسجيل الدخول إلى لوحة التحكم الإدارية أولاً.',
    });
  }

  const session = activeAdminSessions.get(token);
  if (!session || Date.now() > session.expiresAt) {
    if (session) {
      activeAdminSessions.delete(token);
      persistSessions();
    }
    return res.status(401).json({
      success: false,
      error: 'انتهت صلاحية جلسة الإدارة أو رمز الجلسة غير صالح. يرجى تسجيل الدخول مجدداً.',
    });
  }

  (req as any).adminSession = session;
  next();
}

/**
 * Strict CSRF & Untrusted Origin Defense Middleware.
 * Enforces Origin/Referer verification and valid X-CSRF-Token on all state-changing admin operations.
 */
function requireAdminCsrf(req: express.Request, res: express.Response, next: express.NextFunction) {
  const method = req.method.toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return next();
  }

  const origin = req.headers.origin as string | undefined;
  const referer = req.headers.referer as string | undefined;
  const reqHost = req.headers.host;

  // 1. Strict Origin Verification
  if (origin && !isAllowedOrigin(origin, reqHost)) {
    return res.status(403).json({
      success: false,
      error: 'محاولة وصول مرفوضة من مصدر غير موثوق به (Untrusted Origin).',
    });
  }

  // 2. Strict Referer Verification
  if (referer) {
    try {
      const refUrl = new URL(referer);
      if (!isAllowedOrigin(refUrl.origin, reqHost)) {
        return res.status(403).json({
          success: false,
          error: 'محاولة وصول مرفوضة من مرجع غير موثوق به (Untrusted Referer).',
        });
      }
    } catch {
      return res.status(403).json({
        success: false,
        error: 'صيغة المرجع غير صالحة.',
      });
    }
  }

  // 3. CSRF Token Validation
  const session = (req as any).adminSession;
  const csrfHeader = (req.headers['x-csrf-token'] as string | undefined)?.trim();
  const cookieCsrf = (req.cookies?.amadal_csrf_token as string | undefined)?.trim();
  const expectedCsrf = session?.csrfToken;

  if (!csrfHeader) {
    return res.status(403).json({
      success: false,
      error: 'رمز التحقق ضد تزوير الطلبات CSRF مفقود (Missing X-CSRF-Token header).',
    });
  }

  if (expectedCsrf && csrfHeader !== expectedCsrf) {
    if (!cookieCsrf || csrfHeader !== cookieCsrf) {
      return res.status(403).json({
        success: false,
        error: 'رمز التحقق ضد تزوير الطلبات CSRF غير مطابق للجلسة النشطة.',
      });
    }
  }

  next();
}

// Backward compatibility alias
const getOrCreateAdminCredentials = getAdminCredentials;

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

/**
 * Strict SSRF & URL safety check for Anderson Delivery integration.
 * Prevents SSRF attacks to internal networks, localhost, and cloud metadata services.
 */
function isSafeAndersonUrl(candidateUrl: string): { isValid: boolean; error?: string; cleanUrl?: string } {
  if (!candidateUrl || typeof candidateUrl !== 'string') {
    return { isValid: false, error: 'عنوان URL غير صالح أو فارغ.' };
  }

  let cleaned = candidateUrl.trim();
  if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
    cleaned = 'https://' + cleaned;
  }

  let parsed: URL;
  try {
    parsed = new URL(cleaned);
  } catch {
    return { isValid: false, error: 'صيغة عنوان URL غير صحيحة.' };
  }

  // Enforce HTTPS
  if (parsed.protocol !== 'https:') {
    return { isValid: false, error: 'يجب استخدام بروتوكول آمن https:// فقط.' };
  }

  const hostname = parsed.hostname.toLowerCase();

  // 1. Block Cloud Metadata endpoints (GCP, AWS, Azure, OpenStack)
  if (
    hostname === '169.254.169.254' ||
    hostname === 'metadata.google.internal' ||
    hostname === 'metadata' ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.local')
  ) {
    return { isValid: false, error: 'غير مصرح بالاتصال بالعناوين الداخلية أو خدمات السحابة.' };
  }

  // 2. Block loopback and local hostnames
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    hostname.endsWith('.localhost')
  ) {
    return { isValid: false, error: 'غير مصرح بالاتصال بالعناوين المحلية أو خادم التطبيق.' };
  }

  // 3. Block Private IPv4 ranges
  const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const oct1 = parseInt(ipv4Match[1], 10);
    const oct2 = parseInt(ipv4Match[2], 10);

    if (
      oct1 === 10 ||
      oct1 === 127 ||
      oct1 === 0 ||
      (oct1 === 172 && oct2 >= 16 && oct2 <= 31) ||
      (oct1 === 192 && oct2 === 168) ||
      (oct1 === 169 && oct2 === 254)
    ) {
      return { isValid: false, error: 'غير مصرح بالاتصال بنطاقات الشبكات الخاصة أو الداخلية.' };
    }
  }

  // 4. Verify domain belongs to Anderson / EcoTrack
  const isEcoTrackDomain =
    hostname === 'anderson.ecotrack.dz' ||
    hostname.endsWith('.ecotrack.dz');

  if (!isEcoTrackDomain) {
    return {
      isValid: false,
      error: 'العنوان غير معتمد لخدمة Anderson Delivery (يجب أن يكون نطاقاً رسمياً ينتهي بـ ecotrack.dz).',
    };
  }

  let formatted = parsed.origin + parsed.pathname;
  if (!formatted.endsWith('/')) {
    formatted += '/';
  }

  return { isValid: true, cleanUrl: formatted };
}

/**
 * Strict Origin Verification for CORS
 * Allows ONLY the verified, specific origins belonging to this project.
 * Completely eliminates broad wildcards (*.run.app, *.googleusercontent.com, *.google.com).
 */
function isAllowedOrigin(origin: string, reqHost?: string): boolean {
  if (!origin || typeof origin !== 'string') return false;
  try {
    const parsed = new URL(origin);
    const host = parsed.host.toLowerCase();
    const hostname = parsed.hostname.toLowerCase();

    // 1. Same-origin or matching Host header of the running server
    if (reqHost) {
      const cleanReqHost = reqHost.toLowerCase().trim();
      if (host === cleanReqHost || hostname === cleanReqHost.split(':')[0]) {
        return true;
      }
    }

    // 2. Localhost development environments
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return true;
    }

    // 3. Project-specific Cloud Run domains (dev and preview)
    const projectCloudRunSuffix = '-5p5wu34b2k2t26wlxia3vm-43486398422.europe-west1.run.app';
    if (
      hostname === `ais-dev${projectCloudRunSuffix}` ||
      hostname === `ais-pre${projectCloudRunSuffix}`
    ) {
      return true;
    }

    // Dynamic derivation from process.env.APP_URL if service URL changes
    if (process.env.APP_URL) {
      try {
        const appUrlObj = new URL(process.env.APP_URL);
        const appHostname = appUrlObj.hostname.toLowerCase();
        if (hostname === appHostname) return true;
        if (appHostname.startsWith('ais-dev-') && hostname === appHostname.replace('ais-dev-', 'ais-pre-')) {
          return true;
        }
        if (appHostname.startsWith('ais-pre-') && hostname === appHostname.replace('ais-pre-', 'ais-dev-')) {
          return true;
        }
      } catch {}
    }

    // 4. Configured custom origins in environment variables (STORE_URL, ALLOWED_ORIGINS)
    const customOrigins = [
      process.env.STORE_URL,
      ...(process.env.ALLOWED_ORIGINS || '').split(','),
    ]
      .filter((o): o is string => Boolean(o && typeof o === 'string'))
      .map((o) => o.trim().toLowerCase());

    for (const allowed of customOrigins) {
      if (origin.toLowerCase() === allowed || host === allowed) {
        return true;
      }
      try {
        const parsedAllowed = new URL(allowed);
        if (parsedAllowed.host.toLowerCase() === host) return true;
      } catch {}
    }

    return false;
  } catch {
    return false;
  }
}

// Sleep helper for exponential backoff retries
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Formats an Algerian phone number into international WhatsApp standard (+213...).
 * Example: 0784669514 -> +213784669514
 * Removes leading zero and prepends +213.
 */
function formatAlgerianPhone(phone: string): string {
  if (!phone || typeof phone !== 'string') return '';
  let cleaned = phone.trim().replace(/[^\d+]/g, '');

  if (cleaned.startsWith('+213')) {
    const rest = cleaned.substring(4).replace(/^0+/, '');
    return `+213${rest}`;
  }
  if (cleaned.startsWith('00213')) {
    const rest = cleaned.substring(5).replace(/^0+/, '');
    return `+213${rest}`;
  }
  if (cleaned.startsWith('213') && cleaned.length >= 11) {
    const rest = cleaned.substring(3).replace(/^0+/, '');
    return `+213${rest}`;
  }
  if (cleaned.startsWith('0')) {
    const rest = cleaned.replace(/^0+/, '');
    return `+213${rest}`;
  }
  const digitsOnly = cleaned.replace(/\D/g, '');
  if (digitsOnly.length >= 8 && digitsOnly.length <= 10) {
    return `+213${digitsOnly}`;
  }
  return cleaned.startsWith('+') ? cleaned : `+213${digitsOnly}`;
}

async function startServer() {
  const app = express();

  // Initialize server Firebase Auth identity if available in runtime environment
  await initializeServerFirebaseAuth();

  // In development, AI Studio dev server must run on port 3000.
  // Parse CLI --port argument if provided by runner, otherwise enforce 3000 in dev.
  const portArgIndex = process.argv.findIndex((arg) => arg === '--port' || arg === '-p');
  let PORT = 3000;
  if (portArgIndex !== -1 && process.argv[portArgIndex + 1]) {
    const parsed = parseInt(process.argv[portArgIndex + 1], 10);
    if (!isNaN(parsed) && parsed > 0) PORT = parsed;
  } else if (process.env.NODE_ENV === 'production' && process.env.PORT) {
    PORT = Number(process.env.PORT) || 3000;
  }

  // Trust reverse proxies (Google Cloud Run, Load Balancers, etc.)
  app.set('trust proxy', 1);

  // ─────────────────────────────────────────────────────────────
  // Dynamic CORS & Security Headers Middleware (Strict Origin Whitelist)
  // Protects against unauthorized credentialed cross-origin requests
  // ─────────────────────────────────────────────────────────────
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const reqHost = req.headers.host;

    if (origin) {
      if (isAllowedOrigin(origin, reqHost)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
      } else {
        // Disallow credentialed access from arbitrary untrusted origins
        if (req.method === 'OPTIONS') {
          return res.status(403).json({ error: 'CORS policy: Origin not allowed' });
        }
      }
    }

    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD'
    );
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Admin-Token, Cookie'
    );
    res.setHeader('Access-Control-Expose-Headers', 'Set-Cookie, Authorization, X-Admin-Token');

    // Handle preflight OPTIONS immediately with 204 No Content for allowed requests
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    next();
  });

  app.use(cookieParser());
  app.use(express.json({ limit: '30mb' }));
  app.use(express.urlencoded({ limit: '30mb', extended: true }));

  // ─────────────────────────────────────────────────────────────
  // 1. GET Anderson Settings (Protected)
  // ─────────────────────────────────────────────────────────────
  app.get('/api/anderson/settings', requireAdminAuth, async (_req, res) => {
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
  // 2. POST Save Anderson Settings (Protected with requireAdminAuth & requireAdminCsrf)
  // ─────────────────────────────────────────────────────────────
  app.post('/api/anderson/settings', requireAdminAuth, requireAdminCsrf, async (req, res) => {
    try {
      const { enabled, apiToken, apiBaseUrl, autoSendOrders } = req.body;
      const current = await getStoredAndersonSettings();

      // Validate base URL against SSRF and ensure it is an approved Anderson domain
      if (apiBaseUrl && typeof apiBaseUrl === 'string' && apiBaseUrl.trim()) {
        const urlSafety = isSafeAndersonUrl(apiBaseUrl);
        if (!urlSafety.isValid) {
          return res.status(400).json({
            success: false,
            error: urlSafety.error || 'عنوان خادم Anderson غير صالح أو يشكل خطراً أمنياً.',
          });
        }
      }

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
  // 3. POST Test Anderson Connection (Protected with requireAdminAuth, requireAdminCsrf & SSRF Guard)
  // ─────────────────────────────────────────────────────────────
  app.post('/api/anderson/test-connection', requireAdminAuth, requireAdminCsrf, async (req, res) => {
    try {
      const { apiToken, apiBaseUrl } = req.body;
      const current = await getStoredAndersonSettings();

      // Only test token provided explicitly if new, otherwise use securely stored token
      let tokenToTest = (apiToken && !apiToken.includes('••••')) ? apiToken.trim() : current.apiToken;
      if (!tokenToTest) {
        return res.status(400).json({
          success: false,
          error: 'يرجى إدخال Anderson API Token أولاً لإجراء اختبار الاتصال',
        });
      }

      // SSRF & Credential Exfiltration Guard:
      // Never send stored server credentials to an unverified or arbitrary client URL.
      // Target must be validated and strictly verified against trusted Anderson endpoint.
      let targetBaseUrl = cleanBaseUrl(current.apiBaseUrl || DEFAULT_ANDERSON_BASE_URL);

      if (apiBaseUrl && typeof apiBaseUrl === 'string' && apiBaseUrl.trim()) {
        const urlSafety = isSafeAndersonUrl(apiBaseUrl);
        if (!urlSafety.isValid) {
          return res.status(400).json({
            success: false,
            error: urlSafety.error || 'عنوان خادم Anderson غير مصرح به أو يشكل خطراً أمنياً.',
          });
        }
        targetBaseUrl = urlSafety.cleanUrl!;
      } else {
        const currentSafety = isSafeAndersonUrl(targetBaseUrl);
        if (!currentSafety.isValid) {
          targetBaseUrl = DEFAULT_ANDERSON_BASE_URL;
        }
      }

      const testEndpoint = `${targetBaseUrl}api/v1/get/wilayas`;

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
        // Do not reflect raw response that could contain sensitive tokens
        const safeSnippet = text.replace(/token|secret|password|key/gi, '***').slice(0, 150);
        const errorMsg = `استجابة غير متوقعة من خادم Anderson (رمز الحالة: ${response.status} ${response.statusText}): ${safeSnippet}`;
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
  // Internal helper for Anderson order dispatch
  // Callable by admin API or checkout workflow without unauthenticated HTTP loops
  // ─────────────────────────────────────────────────────────────
  async function executeSendOrderToAnderson(
    orderId: string,
    force: boolean = false
  ): Promise<{
    success: boolean;
    statusCode?: number;
    skipped?: boolean;
    alreadySent?: boolean;
    pending?: boolean;
    trackingNumber?: string;
    attempts?: number;
    message?: string;
    error?: string;
  }> {
    try {
      // 1. Fetch order from Firestore
      const orderRef = doc(db, 'orders', orderId);
      const orderSnap = await getDoc(orderRef);

      if (!orderSnap.exists()) {
        return { success: false, statusCode: 404, error: 'الطلب غير موجود في قاعدة البيانات' };
      }

      const orderData = orderSnap.data() as any;

      // 2. Fetch Anderson settings
      const settings = await getStoredAndersonSettings();

      if (!settings.apiToken) {
        console.warn(`[Anderson Delivery] Cannot send order ${orderId}: Missing Anderson API Token.`);
        return {
          success: false,
          statusCode: 400,
          skipped: true,
          error: 'لم يتم ضبط Anderson API Token في إعدادات المتجر.',
        };
      }

      if (!settings.enabled && !force) {
        console.log(`[Anderson Delivery] Anderson integration is disabled. Skipping order ${orderId}.`);
        return {
          success: false,
          statusCode: 200,
          skipped: true,
          message: 'تكامل شركة التوصيل Anderson معطل في لوحة التحكم.',
        };
      }

      // 3. PREVENT DUPLICATE SHIPMENT (Idempotency Protection)
      if (orderData.andersonStatus === 'sent' && orderData.andersonTrackingNumber && !force) {
        console.log(`[Anderson Delivery] Order ${orderId} already sent. Tracking: ${orderData.andersonTrackingNumber}. Skipping.`);
        return {
          success: true,
          statusCode: 200,
          alreadySent: true,
          trackingNumber: orderData.andersonTrackingNumber,
          message: `تم إنشاء الشحنة مسبقاً برقم التتبع: ${orderData.andersonTrackingNumber}`,
        };
      }

      // Check if another transmission is currently underway within the last 40 seconds
      if (orderData.andersonStatus === 'sending' && !force) {
        const lastAttempt = orderData.andersonLastAttemptAt ? new Date(orderData.andersonLastAttemptAt).getTime() : 0;
        const now = Date.now();
        if (now - lastAttempt < 40000) {
          console.log(`[Anderson Delivery] Order ${orderId} is currently being sent. Preventing concurrent duplicate.`);
          return {
            success: true,
            statusCode: 200,
            pending: true,
            message: 'الطلب قيد المعالجة والإرسال حالياً لمنع إنشاء شحنة مكررة.',
          };
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

      // Validate base URL to ensure token is strictly sent to trusted Anderson carrier
      let baseUrl = cleanBaseUrl(settings.apiBaseUrl);
      const urlSafety = isSafeAndersonUrl(baseUrl);
      if (!urlSafety.isValid) {
        baseUrl = DEFAULT_ANDERSON_BASE_URL;
      }
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

            if (response.status === 401 || response.status === 403) {
              lastErrorMessage = 'فشل المصادقة: رمز Anderson API Token غير صالح (401/403).';
              break;
            }

            lastErrorMessage = responseData.message || responseData.error || responseText.slice(0, 180) || `خطأ من الخادم (${response.status})`;

            if (attempt < MAX_ATTEMPTS) {
              const backoffMs = attempt === 1 ? 2500 : 5000;
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

        return {
          success: true,
          statusCode: 200,
          trackingNumber,
          attempts: attempt,
          message: `تم إرسال الطلب بنجاح إلى شركة التوصيل Anderson (رقم الشحنة: ${trackingNumber})`,
        };
      } else {
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

        return {
          success: false,
          statusCode: 502,
          error: lastErrorMessage || 'تعذر إرسال الشحنة لشركة التوصيل بعد استنفاد محاولات إعادة المحاولة',
          attempts: attempt,
        };
      }
    } catch (err: any) {
      console.error('[API Anderson Send Order Fatal Error]:', err);
      return {
        success: false,
        statusCode: 500,
        error: err.message || 'حدث خطأ داخلي أثناء معالجة الطلب لشركة التوصيل',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 4. POST Send Order To Anderson Delivery (Protected with requireAdminAuth & requireAdminCsrf)
  // ─────────────────────────────────────────────────────────────
  app.post('/api/anderson/send-order', requireAdminAuth, requireAdminCsrf, async (req, res) => {
    const { orderId, force } = req.body;

    if (!orderId) {
      return res.status(400).json({ success: false, error: 'معرف الطلب orderId مطلوب' });
    }

    const result = await executeSendOrderToAnderson(orderId, Boolean(force));
    return res.status(result.statusCode || (result.success ? 200 : 400)).json(result);
  });

  // ─────────────────────────────────────────────────────────────
  // 5. POST Retry All Failed Anderson Orders (Protected with requireAdminAuth & requireAdminCsrf)
  // ─────────────────────────────────────────────────────────────
  app.post('/api/anderson/retry-all-failed', requireAdminAuth, requireAdminCsrf, async (_req, res) => {
    try {
      const q = query(collection(db, 'orders'), where('andersonStatus', '==', 'failed'));
      const snap = await getDocs(q);

      if (snap.empty) {
        return res.json({ success: true, count: 0, message: 'لا توجد طلبات متعثرة حالياً.' });
      }

      const orderIds: string[] = [];
      snap.forEach((d) => orderIds.push(d.id));

      console.log(`[Anderson Delivery] Retrying ${orderIds.length} failed orders...`);

      // Trigger retries in background directly without external HTTP loops
      (async () => {
        for (const oId of orderIds) {
          try {
            await executeSendOrderToAnderson(oId, true);
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
  // 6. GET Anderson Printable Label (Protected with requireAdminAuth)
  // ─────────────────────────────────────────────────────────────
  app.get('/api/anderson/label/:trackingNumber', requireAdminAuth, async (req, res) => {
    try {
      const { trackingNumber } = req.params;
      const settings = await getStoredAndersonSettings();

      if (!settings.apiToken) {
        return res.status(400).send('Anderson API Token غير متوفر');
      }

      let baseUrl = cleanBaseUrl(settings.apiBaseUrl);
      const urlSafety = isSafeAndersonUrl(baseUrl);
      if (!urlSafety.isValid) {
        baseUrl = DEFAULT_ANDERSON_BASE_URL;
      }
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
  // 7. POST Update Delivery Shipping Status (Protected with requireAdminAuth & requireAdminCsrf)
  // ─────────────────────────────────────────────────────────────
  app.post('/api/orders/update-shipping-status', requireAdminAuth, requireAdminCsrf, async (req, res) => {
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
  // 8. POST Toggle Order Archive (Manual Archive / Unarchive - Protected with requireAdminAuth & requireAdminCsrf)
  // ─────────────────────────────────────────────────────────────
  app.post('/api/orders/toggle-archive', requireAdminAuth, requireAdminCsrf, async (req, res) => {
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
      const clientIp =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.socket.remoteAddress ||
        'client';

      // 0. Flood & Bot Defense Checks
      // Anti-bot honeypot check: reject if hidden honeypot field filled
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
        _hp_website,
        formStartTime,
      } = req.body;

      if (_hp_website) {
        return res.status(400).json({ success: false, error: 'تعذر معالجة الطلب.' });
      }

      // Check form completion speed (reject instant bot scripts submitted under 2.5 seconds)
      if (formStartTime && Number(formStartTime) > 0) {
        const elapsedMs = Date.now() - Number(formStartTime);
        if (elapsedMs < 2500) {
          return res.status(400).json({ success: false, error: 'تم إرسال الطلب بسرعة غير معتادة.' });
        }
      }

      // IP Rate Limit: Max 5 orders per 10 minutes (600,000 ms)
      const ipRate = checkRateLimit(`order_ip_${clientIp}`, 5, 600000, 600000);
      if (!ipRate.allowed) {
        return res.status(429).json({
          success: false,
          error: `تم تجاوز الحد المسموح للطلبات من نفس العنوان. يرجى الانتظار ${ipRate.retryAfterSec} ثانية قبل إنشاء طلب جديد.`,
        });
      }

      // 1. Input Validations
      if (!customerName || typeof customerName !== 'string' || !customerName.trim()) {
        return res.status(400).json({ success: false, error: 'يرجى إدخال الاسم الكامل.' });
      }

      if (!phone || typeof phone !== 'string') {
        return res.status(400).json({ success: false, error: 'يرجى إدخال رقم هاتف صالح.' });
      }
      const rawDigits = phone.replace(/[^0-9]/g, '');
      if (rawDigits.length < 9 || rawDigits.length > 15) {
        return res.status(400).json({
          success: false,
          error: 'يرجى إدخال رقم هاتف صالح (مثال: 0784669514 أو 0550123456).',
        });
      }
      // Format to international Algerian WhatsApp standard (+213...)
      const formattedPhone = formatAlgerianPhone(phone);

      // Phone Rate Limit: Max 3 orders per 30 minutes (1,800,000 ms)
      const phoneRate = checkRateLimit(`order_phone_${formattedPhone}`, 3, 1800000, 1800000);
      if (!phoneRate.allowed) {
        return res.status(429).json({
          success: false,
          error: `تم تسجيل عدة طلبات لهذا الرقم مؤخراً. يرجى الانتظار ${phoneRate.retryAfterSec} ثانية قبل إضافة طلب جديد.`,
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

      // Extract ONLY product identifiers and valid quantities — completely discard any client-submitted prices!
      const sanitizedItemRequests: { productId: string; size: string; color: string; quantity: number }[] = [];
      for (const it of items) {
        const pid = String(it.productId || it.id || '').trim();
        const rawQty = Number(it.quantity);
        if (!pid) {
          return res.status(400).json({ success: false, error: 'أحد المنتجات المحددة غير صالح.' });
        }
        if (!Number.isFinite(rawQty) || Math.floor(rawQty) < 1 || Math.floor(rawQty) > 100) {
          return res.status(400).json({
            success: false,
            error: 'يرجى تحديد كمية صحيحة للمنتجات (عدد صحيح بين 1 و 100).',
          });
        }
        sanitizedItemRequests.push({
          productId: pid,
          size: String(it.size || 'Standard').trim(),
          color: String(it.color || 'Standard').trim(),
          quantity: Math.floor(rawQty),
        });
      }

      const cleanIdempotencyKey =
        typeof idempotencyKey === 'string' && idempotencyKey.trim()
          ? idempotencyKey.trim().substring(0, 80)
          : `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      // High-entropy 32-byte cryptographically secure random token (64 hex characters)
      const trackingToken = crypto.randomBytes(32).toString('hex');
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
        const trackingTokenHash = crypto.createHash('sha256').update(trackingToken).digest('hex');

        const orderPayload: Record<string, any> = {
          id: orderId,
          orderId: orderId,
          orderNumber: orderNumber,
          trackingToken: trackingToken,
          trackingTokenHash: trackingTokenHash,
          idempotencyKey: cleanIdempotencyKey,
          customerName: customerName.trim(),
          phone: formattedPhone,
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
      // SECURITY & PRIVACY ENFORCEMENT:
      // Guest checkout contact data is stored exclusively in the order document.
      // Phone number alone is NOT considered proof of customer profile ownership.
      // Unauthenticated checkout requests NEVER alter permanent customer records.
      // Customer profile statistics are credited only upon authorized admin approval/delivery.

      // Anderson Delivery auto-dispatch check
      try {
        const andersonSettings = await getStoredAndersonSettings();
        if (andersonSettings.enabled && andersonSettings.autoSendOrders && andersonSettings.apiToken) {
          executeSendOrderToAnderson(committedOrder.id, false).catch((err) => {
            console.warn('[Server] Anderson auto-dispatch notice (non-fatal):', err);
          });
        }
      } catch (andErr) {
        console.warn('[Server] Anderson check notice (non-fatal):', andErr);
      }

      return res.status(200).json({
        success: true,
        order: committedOrder,
        trackingToken: committedOrder.trackingToken || trackingToken,
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
  // 11. POST /api/orders/track - Safe Public Order Tracking
  // Allows customers to track order progress without exposing customer PII.
  // Protected with Rate-Limiting and SHA-256 token hashing against enumeration.
  // ─────────────────────────────────────────────────────────────
  app.post('/api/orders/track', async (req, res) => {
    try {
      const clientIp =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.socket.remoteAddress ||
        'client';
      const rateCheck = checkRateLimit(`track_${clientIp}`, 10, 60000, 300000);
      if (!rateCheck.allowed) {
        return res.status(429).json({
          success: false,
          error: `تم تجاوز الحد الأقصى للمحاولات. يرجى الانتظار ${rateCheck.retryAfterSec} ثانية قبل المحاولة مرة أخرى.`,
        });
      }

      const { trackingToken, orderNumber, phone } = req.body || {};
      const cleanToken = typeof trackingToken === 'string' ? trackingToken.trim() : '';
      const cleanOrderNumber = typeof orderNumber === 'string' ? orderNumber.trim().toUpperCase() : '';
      const cleanPhone = typeof phone === 'string' ? formatAlgerianPhone(phone) : '';

      if (!cleanToken && (!cleanOrderNumber || !cleanPhone)) {
        return res.status(400).json({
          success: false,
          error: 'يرجى تقديم رمز التتبع أو (رقم الطلب ورقم الهاتف المسجل).',
        });
      }

      let matchedOrder: any = null;

      // 1. Verification via high-entropy unguessable trackingToken (with SHA-256 hash lookup)
      if (cleanToken) {
        const tokenHash = crypto.createHash('sha256').update(cleanToken).digest('hex');
        const qHash = query(collection(db, 'orders'), where('trackingTokenHash', '==', tokenHash));
        let tokenSnap = await getDocs(qHash);
        if (tokenSnap.empty) {
          const qToken = query(collection(db, 'orders'), where('trackingToken', '==', cleanToken));
          tokenSnap = await getDocs(qToken);
        }
        if (!tokenSnap.empty) {
          const docData = tokenSnap.docs[0].data();
          if (!cleanOrderNumber || docData.orderNumber === cleanOrderNumber) {
            matchedOrder = docData;
          }
        }
      }

      // 2. Verification via (orderNumber + registered customer phone) for legacy lookups
      if (!matchedOrder && cleanOrderNumber && cleanPhone) {
        const qNum = query(collection(db, 'orders'), where('orderNumber', '==', cleanOrderNumber));
        const numSnap = await getDocs(qNum);
        if (!numSnap.empty) {
          for (const d of numSnap.docs) {
            const docData = d.data();
            if (docData.phone === cleanPhone) {
              matchedOrder = docData;
              break;
            }
          }
        }
      }

      if (!matchedOrder) {
        // Uniform error to prevent enumeration of existing order numbers or phone numbers
        return res.status(404).json({
          success: false,
          error: 'الطلب غير موجود أو بيانات التحقق والتتبع غير صحيحة.',
        });
      }

      // Return ONLY sanitized public-safe order tracking details (ZERO PII leaked)
      return res.json({
        success: true,
        order: {
          orderNumber: matchedOrder.orderNumber,
          status: matchedOrder.status,
          deliveryType: matchedOrder.deliveryType,
          shippingStatus: matchedOrder.shippingStatus || 'not_sent',
          shippingCarrier: matchedOrder.shippingCarrier || null,
          shippingTrackingNumber: matchedOrder.shippingTrackingNumber || null,
          createdAt: matchedOrder.createdAt,
          items: (matchedOrder.items || []).map((it: any) => ({
            name: it.name || it.productName || 'منتج',
            size: it.size || 'Standard',
            color: it.color || 'Standard',
            quantity: it.quantity || 1,
          })),
          subtotal: matchedOrder.subtotal,
          shippingCost: matchedOrder.shippingCost,
          discount: matchedOrder.discount || 0,
          total: matchedOrder.total,
        },
      });
    } catch (err: any) {
      console.error('[API Order Track Error]:', err);
      return res.status(500).json({ success: false, error: 'حدث خطأ أثناء الاستعلام عن حالة الطلب.' });
    }
  });

  // GET /api/orders/track/:trackingToken
  app.get('/api/orders/track/:trackingToken', async (req, res) => {
    try {
      const clientIp =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.socket.remoteAddress ||
        'client';
      const rateCheck = checkRateLimit(`track_get_${clientIp}`, 10, 60000, 300000);
      if (!rateCheck.allowed) {
        return res.status(429).json({
          success: false,
          error: `تم تجاوز الحد الأقصى للمحاولات. يرجى الانتظار ${rateCheck.retryAfterSec} ثانية.`,
        });
      }

      const { trackingToken } = req.params;
      const cleanToken = (trackingToken || '').trim();
      if (!cleanToken) {
        return res.status(400).json({ success: false, error: 'رمز التتبع مطلوب' });
      }

      const tokenHash = crypto.createHash('sha256').update(cleanToken).digest('hex');
      let snap = await getDocs(query(collection(db, 'orders'), where('trackingTokenHash', '==', tokenHash)));
      if (snap.empty) {
        snap = await getDocs(query(collection(db, 'orders'), where('trackingToken', '==', cleanToken)));
      }

      if (snap.empty) {
        return res.status(404).json({ success: false, error: 'الطلب غير موجود أو رمز التتبع غير صحيح.' });
      }

      const matchedOrder = snap.docs[0].data();
      return res.json({
        success: true,
        order: {
          orderNumber: matchedOrder.orderNumber,
          status: matchedOrder.status,
          deliveryType: matchedOrder.deliveryType,
          shippingStatus: matchedOrder.shippingStatus || 'not_sent',
          shippingCarrier: matchedOrder.shippingCarrier || null,
          shippingTrackingNumber: matchedOrder.shippingTrackingNumber || null,
          createdAt: matchedOrder.createdAt,
          items: (matchedOrder.items || []).map((it: any) => ({
            name: it.name || it.productName || 'منتج',
            size: it.size || 'Standard',
            color: it.color || 'Standard',
            quantity: it.quantity || 1,
          })),
          subtotal: matchedOrder.subtotal,
          shippingCost: matchedOrder.shippingCost,
          discount: matchedOrder.discount || 0,
          total: matchedOrder.total,
        },
      });
    } catch (err: any) {
      console.error('[API Order Track GET Error]:', err);
      return res.status(500).json({ success: false, error: 'حدث خطأ أثناء الاستعلام عن حالة الطلب.' });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // 12. PUBLIC CATALOG & STORE SETTINGS API (Server as Mediator)
  // ─────────────────────────────────────────────────────────────

  // GET /api/products - Get published products for store catalog
  app.get('/api/products', async (req, res) => {
    try {
      const { category, featured, search } = req.query;
      const snap = await getDocs(collection(db, 'products'));
      let products: any[] = [];
      snap.forEach((d) => {
        const data = d.data();
        if (data.isPublished !== false) {
          products.push({ ...data, id: d.id });
        }
      });

      if (category && typeof category === 'string' && category !== 'all') {
        const catClean = category.trim().toLowerCase();
        products = products.filter(
          (p) =>
            (p.categoryId || '').toLowerCase() === catClean ||
            (p.categoryName || '').toLowerCase() === catClean ||
            (p.slug || '').toLowerCase().includes(catClean)
        );
      }

      if (featured === 'true') {
        products = products.filter((p) => p.isFeatured === true);
      }

      if (search && typeof search === 'string') {
        const q = search.trim().toLowerCase();
        products = products.filter(
          (p) =>
            (p.name || '').toLowerCase().includes(q) ||
            (p.description || '').toLowerCase().includes(q) ||
            (p.categoryName || '').toLowerCase().includes(q)
        );
      }

      return res.json({ success: true, products });
    } catch (err: any) {
      console.error('[API Products Fetch Error]:', err);
      return res.status(500).json({ success: false, error: 'فشل جلب المنتجات من الخادم.' });
    }
  });

  // GET /api/products/:id - Get single product details
  app.get('/api/products/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const docRef = doc(db, 'products', id);
      let snap = await getDoc(docRef);

      // If not found by ID, search by slug
      if (!snap.exists()) {
        const qSlug = query(collection(db, 'products'), where('slug', '==', id));
        const slugSnap = await getDocs(qSlug);
        if (!slugSnap.empty) {
          snap = slugSnap.docs[0];
        }
      }

      if (!snap.exists()) {
        return res.status(404).json({ success: false, error: 'المنتج غير موجود.' });
      }

      const pData = snap.data();
      if (pData.isPublished === false) {
        return res.status(404).json({ success: false, error: 'المنتج غير متاح حالياً.' });
      }

      return res.json({ success: true, product: { ...pData, id: snap.id } });
    } catch (err: any) {
      console.error('[API Product Fetch Error]:', err);
      return res.status(500).json({ success: false, error: 'فشل جلب تفاصيل المنتج.' });
    }
  });

  // GET /api/categories - Get active categories
  app.get('/api/categories', async (_req, res) => {
    try {
      const q = query(collection(db, 'categories'), orderBy('order', 'asc'));
      const snap = await getDocs(q);
      const categories: any[] = [];
      snap.forEach((d) => {
        const data = d.data();
        if (data.isActive !== false) {
          categories.push({ ...data, id: d.id, slug: data.slug || d.id });
        }
      });
      return res.json({ success: true, categories });
    } catch (err: any) {
      console.error('[API Categories Fetch Error]:', err);
      return res.status(500).json({ success: false, error: 'فشل جلب الفئات.' });
    }
  });

  // GET /api/settings/public - Get public non-sensitive store settings
  app.get('/api/settings/public', async (_req, res) => {
    try {
      const snap = await getDoc(doc(db, 'settings', 'store'));
      if (!snap.exists()) {
        return res.status(404).json({ success: false, error: 'إعدادات المتجر غير موجودة.' });
      }
      const data = snap.data() || {};
      // Filter out any private/sensitive fields (tokens, credentials, internal notes)
      const publicSettings = {
        storeName: data.storeName || 'AMADAL',
        storeDescription: data.storeDescription || '',
        logoUrl: data.logoUrl || '',
        faviconUrl: data.faviconUrl || '',
        whatsappNumber: data.whatsappNumber || '',
        whatsappMessageTemplate: data.whatsappMessageTemplate || '',
        phone: data.phone || '',
        email: data.email || '',
        address: data.address || '',
        instagram: data.instagram || '',
        tiktok: data.tiktok || '',
        facebook: data.facebook || '',
        currency: data.currency || 'د.ج',
        lowStockThreshold: data.lowStockThreshold || 3,
        announcementText: data.announcementText || '',
        showAnnouncement: data.showAnnouncement !== false,
        themeColors: data.themeColors || null,
      };
      return res.json({ success: true, settings: publicSettings });
    } catch (err: any) {
      console.error('[API Settings Public Fetch Error]:', err);
      return res.status(500).json({ success: false, error: 'فشل جلب إعدادات المتجر.' });
    }
  });

  // GET /api/shipping-rates - Get public shipping rates
  app.get('/api/shipping-rates', async (_req, res) => {
    try {
      const snap = await getDocs(collection(db, 'shipping'));
      const rates: any[] = [];
      snap.forEach((d) => rates.push({ ...d.data(), id: d.id }));
      return res.json({ success: true, shippingRates: rates });
    } catch (err: any) {
      console.error('[API Shipping Rates Fetch Error]:', err);
      return res.status(500).json({ success: false, error: 'فشل جلب تسعيرات التوصيل.' });
    }
  });

  // GET /api/homepage - Get public homepage layout
  app.get('/api/homepage', async (_req, res) => {
    try {
      const snap = await getDoc(doc(db, 'homepage', 'main'));
      if (snap.exists()) {
        return res.json({ success: true, homepage: snap.data() });
      }
      return res.json({ success: true, homepage: null });
    } catch (err: any) {
      console.error('[API Homepage Fetch Error]:', err);
      return res.status(500).json({ success: false, error: 'فشل جلب بيانات الصفحة الرئيسية.' });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────
  // 11. ADMIN AUTHENTICATION API (Traditional Username + Password)
  // ─────────────────────────────────────────────────────────────

  // GET /api/admin/setup-status: Check if admin account has been provisioned
  app.get('/api/admin/setup-status', async (_req, res) => {
    try {
      const creds = await getAdminCredentials();
      return res.json({
        success: true,
        setupRequired: !creds,
        initialized: Boolean(creds),
        hasAdmin: Boolean(creds),
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/admin/initial-setup: One-time secure admin provisioning
  app.post('/api/admin/initial-setup', async (req, res) => {
    try {
      const existing = await getAdminCredentials();
      if (existing) {
        return res.status(400).json({
          success: false,
          error: 'تم إعداد حساب المدير مسبقاً. لتسجيل الدخول، استخدم بوابة المشرف.',
        });
      }

      const { username, password, confirmPassword } = req.body || {};
      const cleanUsername = typeof username === 'string' ? username.trim() : '';

      if (!cleanUsername || cleanUsername.length < 3) {
        return res.status(400).json({
          success: false,
          error: 'يجب أن يتكون اسم المستخدم من 3 أحرف على الأقل.',
        });
      }

      if (!password || typeof password !== 'string' || password.length < 8) {
        return res.status(400).json({
          success: false,
          error: 'يجب ألا تقل كلمة المرور عن 8 أحرف أو أرقام وتكون قوية.',
        });
      }

      if (confirmPassword && password !== confirmPassword) {
        return res.status(400).json({
          success: false,
          error: 'كلمتا المرور غير متطابقتين.',
        });
      }

      const hashed = hashPassword(password, undefined, PBKDF2_ITERATIONS);
      const nowIso = new Date().toISOString();
      const newCreds: StoredAdminCredentials = {
        username: cleanUsername,
        username_lower: cleanUsername.toLowerCase(),
        passwordHash: hashed.hash,
        salt: hashed.salt,
        iterations: PBKDF2_ITERATIONS,
        version: 2,
        updatedAt: nowIso,
      };

      await saveAdminCredentials(newCreds);

      // Generate initial session and CSRF token
      const token = crypto.randomBytes(32).toString('hex');
      const csrfToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;

      activeAdminSessions.set(token, {
        username: cleanUsername,
        expiresAt,
        csrfToken,
      });
      persistSessions();

      const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
      res.cookie('amadal_admin_token', token, {
        httpOnly: true,
        secure: isHttps || process.env.NODE_ENV === 'production',
        sameSite: isHttps ? 'none' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
      });
      res.cookie('amadal_csrf_token', csrfToken, {
        httpOnly: false,
        secure: isHttps || process.env.NODE_ENV === 'production',
        sameSite: isHttps ? 'none' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
      });

      console.log(`[Admin Security] Successfully provisioned initial admin "${cleanUsername}".`);

      return res.json({
        success: true,
        token,
        csrfToken,
        username: cleanUsername,
        message: 'تم إعداد وتأمين حساب المدير بنجاح.',
      });
    } catch (err: any) {
      console.error('[Admin Initial Setup Error]:', err);
      return res.status(500).json({ success: false, error: err.message || 'حدث خطأ أثناء إعداد الحساب.' });
    }
  });

  // GET /api/admin/csrf-token: Fetch CSRF token for current authenticated session
  app.get('/api/admin/csrf-token', requireAdminAuth, (req, res) => {
    const session = (req as any).adminSession;
    return res.json({
      success: true,
      csrfToken: session?.csrfToken || '',
    });
  });

  // POST /api/admin/login and /api/login: Authenticate admin with username & password
  // Hardened with Timing-Safe Verification, 15-Minute Lockouts, and CSRF Token Generation
  app.post(['/api/admin/login', '/api/login'], async (req, res) => {
    try {
      const clientIp =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.socket.remoteAddress ||
        'client';

      const { username, password } = req.body || {};
      const cleanUsername = typeof username === 'string' ? username.trim() : '';

      if (!cleanUsername || !password || typeof password !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'يرجى إدخال اسم المستخدم وكلمة المرور.',
        });
      }

      // Check Rate Limit (5 attempts per IP or username -> 15-minute lockout)
      const ipKey = `login_ip_${clientIp}`;
      const userKey = `login_user_${cleanUsername.toLowerCase()}`;

      const ipCheck = failedLoginAttempts.get(ipKey);
      const userCheck = failedLoginAttempts.get(userKey);

      const now = Date.now();
      if (ipCheck?.lockedUntil && now < ipCheck.lockedUntil) {
        const retryAfterSec = Math.ceil((ipCheck.lockedUntil - now) / 1000);
        return res.status(429).json({
          success: false,
          error: `تم قفل محاولات تسجيل الدخول مؤقتاً بسبب تكرار المحاولات الخاطئة. يرجى الانتظار ${Math.ceil(retryAfterSec / 60)} دقيقة.`,
          retryAfterSec,
        });
      }

      if (userCheck?.lockedUntil && now < userCheck.lockedUntil) {
        const retryAfterSec = Math.ceil((userCheck.lockedUntil - now) / 1000);
        return res.status(429).json({
          success: false,
          error: `تم قفل هذا الحساب مؤقتاً لحمايته. يرجى الانتظار ${Math.ceil(retryAfterSec / 60)} دقيقة.`,
          retryAfterSec,
        });
      }

      // Progressive delay against timing attacks / fast brute-force
      const priorFailures = Math.max(ipCheck?.count || 0, userCheck?.count || 0);
      if (priorFailures > 0) {
        await sleep(Math.min(priorFailures * 350, 2000));
      }

      // Fetch authentic credentials from Firestore or secure local store
      const creds = await getAdminCredentials();

      if (!creds) {
        // No admin configured yet
        return res.status(400).json({
          success: false,
          setupRequired: true,
          error: 'لم يتم إعداد حساب المشرف بعد. يرجى إتمام الإعداد الأولي أولاً.',
        });
      }

      // Timing-safe constant-time password and username verification
      const isVerified = timingSafeVerifyCredentials(cleanUsername, password, creds);

      if (!isVerified) {
        // Record failed attempt for IP and username
        const recordFail = (key: string) => {
          const rec = failedLoginAttempts.get(key) || { count: 0 };
          rec.count += 1;
          if (rec.count >= 5) {
            rec.lockedUntil = Date.now() + 15 * 60 * 1000; // 15 minutes lockout
          }
          failedLoginAttempts.set(key, rec);
        };
        recordFail(ipKey);
        recordFail(userKey);

        return res.status(401).json({
          success: false,
          error: 'اسم المستخدم أو كلمة المرور غير صحيحة.',
        });
      }

      // Success: Clear failed attempt records
      failedLoginAttempts.delete(ipKey);
      failedLoginAttempts.delete(userKey);

      // Transparent upgrade to OWASP 210,000 iterations if stored version/iterations are lower
      if ((creds.iterations || 0) < PBKDF2_ITERATIONS) {
        try {
          const upgraded = hashPassword(password, undefined, PBKDF2_ITERATIONS);
          const updatedDoc: StoredAdminCredentials = {
            ...creds,
            passwordHash: upgraded.hash,
            salt: upgraded.salt,
            iterations: PBKDF2_ITERATIONS,
            version: 2,
            updatedAt: new Date().toISOString(),
          };
          await saveAdminCredentials(updatedDoc);
          console.log(`[Admin Security] Transparently upgraded credentials for "${creds.username}" to 210,000 PBKDF2 iterations.`);
        } catch (upgradeErr) {
          console.warn('[Admin Security] Error during transparent hash upgrade:', upgradeErr);
        }
      }

      // Generate cryptographically random session token (32 bytes) and CSRF token (32 bytes)
      const token = crypto.randomBytes(32).toString('hex');
      const csrfToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;

      activeAdminSessions.set(token, {
        username: creds.username,
        expiresAt,
        csrfToken,
        clientIp,
      });
      persistSessions();

      // Set hardened HTTP-Only session cookie and accessible CSRF cookie
      const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
      res.cookie('amadal_admin_token', token, {
        httpOnly: true,
        secure: isHttps || process.env.NODE_ENV === 'production',
        sameSite: isHttps ? 'none' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
      });
      res.cookie('amadal_csrf_token', csrfToken, {
        httpOnly: false,
        secure: isHttps || process.env.NODE_ENV === 'production',
        sameSite: isHttps ? 'none' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
      });

      console.log(`[Admin Login API] Admin "${creds.username}" logged in successfully from ${clientIp}. Session & CSRF issued.`);

      return res.json({
        success: true,
        token,
        csrfToken,
        username: creds.username,
        message: 'تم تسجيل الدخول بنجاح.',
      });
    } catch (err: any) {
      console.error('[Admin Login API Error]:', err);
      return res.status(500).json({
        success: false,
        error: 'حدث خطأ أثناء التحقق من بيانات الدخول.',
      });
    }
  });

  // POST /api/admin/verify-session and /api/verify-session: Verify session validity
  app.post(['/api/admin/verify-session', '/api/verify-session'], async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : '';
      const customHeaderToken = (req.headers['x-admin-token'] as string) || '';
      const cookieToken = req.cookies?.amadal_admin_token || '';
      const bodyToken = req.body?.token || '';

      const token = bearerToken || customHeaderToken || cookieToken || bodyToken;

      if (!token) {
        return res.status(401).json({ success: false, authenticated: false, valid: false, error: 'لم يتم العثور على رمز الجلسة.' });
      }

      const session = activeAdminSessions.get(token);
      if (!session || Date.now() > session.expiresAt) {
        if (session) {
          activeAdminSessions.delete(token);
          persistSessions();
        }
        return res.status(401).json({ success: false, authenticated: false, valid: false, error: 'انتهت صلاحية الجلسة.' });
      }

      return res.json({
        success: true,
        authenticated: true,
        valid: true,
        username: session.username,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/admin/update-credentials and /api/update-credentials:
  // Update Username and/or Password with Cryptographic Hashing (210,000 iterations)
  // Protected with requireAdminAuth & requireAdminCsrf
  app.post(['/api/admin/update-credentials', '/api/update-credentials'], requireAdminAuth, requireAdminCsrf, async (req, res) => {
    try {
      const { currentPassword, newUsername, newPassword } = req.body || {};

      if (!currentPassword || typeof currentPassword !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'يرجى إدخال كلمة المرور الحالية لتأكيد الهوية.',
        });
      }

      // Step 1: Read current authentic credentials from Firestore or secure store
      const creds = await getAdminCredentials();
      if (!creds) {
        return res.status(404).json({ success: false, error: 'بيانات المدير غير موجودة.' });
      }

      const verifyCurr = verifyPassword(currentPassword, creds.passwordHash, creds.salt, creds.iterations);

      if (!verifyCurr.isValid) {
        return res.status(403).json({
          success: false,
          error: 'كلمة المرور الحالية غير صحيحة. يرجى التأكد وإعادة المحاولة.',
        });
      }

      let finalUsername = creds.username;
      let finalHash = creds.passwordHash;
      let finalSalt = creds.salt;
      let finalIterations = creds.iterations || PBKDF2_ITERATIONS;
      let changedAny = false;

      // Step 2: Handle new username if provided
      if (typeof newUsername === 'string' && newUsername.trim()) {
        const cleanUsername = newUsername.trim();
        if (cleanUsername.length < 3) {
          return res.status(400).json({
            success: false,
            error: 'يجب ألا يقل اسم المستخدم عن 3 أحرف.',
          });
        }
        if (cleanUsername !== creds.username) {
          finalUsername = cleanUsername;
          changedAny = true;
        }
      }

      // Step 3: Handle new password if provided (OWASP 210,000 iterations)
      if (typeof newPassword === 'string' && newPassword.trim()) {
        if (newPassword.length < 8) {
          return res.status(400).json({
            success: false,
            error: 'يجب ألا تقل كلمة المرور الجديدة عن 8 أحرف أو أرقام وتكون قوية.',
          });
        }
        const newHashData = hashPassword(newPassword, undefined, PBKDF2_ITERATIONS);
        finalHash = newHashData.hash;
        finalSalt = newHashData.salt;
        finalIterations = PBKDF2_ITERATIONS;
        changedAny = true;
      }

      if (!changedAny) {
        return res.status(400).json({
          success: false,
          error: 'لم يتم إدخال أي تعديل جديد (اسم المستخدم وكلمة المرور مطابقة للبيانات الحالية).',
        });
      }

      const nowIso = new Date().toISOString();
      const updatedPayload: StoredAdminCredentials = {
        username: finalUsername,
        username_lower: finalUsername.toLowerCase(),
        passwordHash: finalHash,
        salt: finalSalt,
        iterations: finalIterations,
        version: 2,
        updatedAt: nowIso,
      };

      // Step 4: Save credentials securely to both Firestore /admins/credentials and local file
      await saveAdminCredentials(updatedPayload);

      // Step 5: Update active session token
      const authHeader = req.headers.authorization;
      const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
      const effectiveToken = bearerToken || (req.headers['x-admin-token'] as string) || req.cookies?.amadal_admin_token;

      if (effectiveToken && activeAdminSessions.has(effectiveToken)) {
        const s = activeAdminSessions.get(effectiveToken)!;
        s.username = finalUsername;
        persistSessions();
      }

      console.log(`[Admin Security] Successfully committed new credentials for "${finalUsername}".`);

      return res.json({
        success: true,
        username: finalUsername,
        updatedAt: nowIso,
        message: 'تم تحديث اسم المستخدم وتشفير كلمة المرور الجديدة بنجاح (210,000 تكرار PBKDF2).',
      });
    } catch (err: any) {
      console.error('[Admin Update Credentials Error]:', err);
      return res.status(500).json({
        success: false,
        error: 'حدث خطأ أثناء حفظ وتشفير البيانات الجديدة.',
      });
    }
  });

  // POST /api/admin/logout and /api/logout
  app.post(['/api/admin/logout', '/api/logout'], async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
      const cookieToken = req.cookies?.amadal_admin_token;
      const { token } = req.body || {};
      const targetToken = token || bearerToken || cookieToken || (req.headers['x-admin-token'] as string);
      if (targetToken) {
        activeAdminSessions.delete(targetToken);
        persistSessions();
      }

      const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
      res.clearCookie('amadal_admin_token', {
        httpOnly: true,
        secure: isHttps || process.env.NODE_ENV === 'production',
        sameSite: isHttps ? 'none' : 'lax',
        path: '/',
      });

      return res.json({ success: true, message: 'تم تسجيل الخروج بنجاح.' });
    } catch (err: any) {
      return res.json({ success: true });
    }
  });

  // GET /api/admin/status (Protected)
  app.get('/api/admin/status', requireAdminAuth, async (_req, res) => {
    try {
      const creds = await getAdminCredentials();
      if (!creds) {
        return res.status(404).json({ success: false, error: 'بيانات المشرف غير موجودة.' });
      }
      return res.json({
        success: true,
        username: creds.username,
        iterations: creds.iterations || PBKDF2_ITERATIONS,
        updatedAt: creds.updatedAt,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // Administrative Operations Endpoints (Protected by requireAdminAuth)
  // ─────────────────────────────────────────────────────────────

  // GET /api/admin/orders - Retrieve all orders securely
  app.get('/api/admin/orders', requireAdminAuth, async (_req, res) => {
    try {
      const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const orders: any[] = [];
      snap.forEach((d) => orders.push({ ...d.data(), id: d.id }));
      return res.json({ success: true, orders });
    } catch (err: any) {
      console.error('[Admin API Orders Fetch Error]:', err);
      return res.status(500).json({ success: false, error: 'تعذر جلب قائمة الطلبات من الخادم.' });
    }
  });

  // POST /api/admin/orders/:id/status - Update order status & idempotently credit customer stats or restore inventory
  app.post('/api/admin/orders/:id/status', requireAdminAuth, requireAdminCsrf, async (req, res) => {
    try {
      const { id } = req.params;
      const { status, notes } = req.body;
      const orderRef = doc(db, 'orders', id);
      const orderSnap = await getDoc(orderRef);
      if (!orderSnap.exists()) {
        return res.status(404).json({ success: false, error: 'الطلب غير موجود.' });
      }

      const oData = orderSnap.data() as any;
      const nowIso = new Date().toISOString();
      const updateData: Record<string, any> = { updatedAt: nowIso };
      if (status) updateData.status = status;
      if (notes !== undefined) updateData.notes = notes;

      const existingHistory = Array.isArray(oData.statusHistory) ? oData.statusHistory : [];
      updateData.statusHistory = [
        ...existingHistory,
        {
          status: status || oData.status,
          timestamp: nowIso,
          note: notes || `تحديث حالة الطلب إلى: ${status}`,
        },
      ];

      // INVENTORY RESTORATION ON CANCELLATION (Atomic Transaction)
      if (
        status === 'cancelled' &&
        !oData.stockRestored &&
        oData.inventoryDeducted !== false &&
        Array.isArray(oData.items) &&
        oData.items.length > 0
      ) {
        try {
          await runTransaction(db, async (transaction) => {
            const itemProductIds = Array.from(new Set(oData.items.map((i: any) => i.productId)));
            const productDocsMap = new Map<string, any>();
            for (const pid of itemProductIds) {
              if (!pid) continue;
              const pRef = doc(db, 'products', String(pid));
              const pSnap = await transaction.get(pRef);
              if (pSnap.exists()) {
                productDocsMap.set(String(pid), { ref: pRef, data: pSnap.data() });
              }
            }

            for (const item of oData.items) {
              const prodEntry = productDocsMap.get(String(item.productId));
              if (!prodEntry) continue;
              const variants = (prodEntry.data.variants || []).map((v: any) => ({ ...v }));
              const qty = Number(item.quantity) || 1;
              let vIdx = variants.findIndex((v: any) => {
                const matchSize = (v.size || '').trim().toLowerCase() === (item.size || '').trim().toLowerCase();
                if (item.color && v.color && item.color !== 'Standard') {
                  return matchSize && (v.color || '').trim().toLowerCase() === (item.color || '').trim().toLowerCase();
                }
                return matchSize;
              });
              if (vIdx === -1 && variants.length > 0) {
                vIdx = variants.findIndex(
                  (v: any) => (v.size || '').trim().toLowerCase() === (item.size || '').trim().toLowerCase()
                );
              }
              if (vIdx !== -1) {
                variants[vIdx].stock = (Number(variants[vIdx].stock) || 0) + qty;
                prodEntry.data.variants = variants;
              }
            }

            for (const [, entry] of productDocsMap.entries()) {
              transaction.update(entry.ref, {
                variants: entry.data.variants,
                updatedAt: nowIso,
              });
            }

            updateData.stockRestored = true;
            updateData.status = 'cancelled';
            transaction.update(orderRef, updateData);
          });
        } catch (stockErr) {
          console.warn('[Admin Order Status] Inventory restoration notice:', stockErr);
          await updateDoc(orderRef, updateData);
        }
      } else {
        await updateDoc(orderRef, updateData);
      }

      // SECURITY ENFORCEMENT: Idempotent Customer Stats Credit
      if ((status === 'confirmed' || status === 'delivered') && oData.phone) {
        try {
          const rawDigits = oData.phone.replace(/[^0-9]/g, '');
          if (rawDigits) {
            const custId = `cust_${rawDigits}`;
            const custRef = doc(db, 'customers', custId);
            const custSnap = await getDoc(custRef);
            if (custSnap.exists()) {
              const cData = custSnap.data() || {};
              const credited = Array.isArray(cData.creditedOrders) ? cData.creditedOrders : [];
              if (!credited.includes(id)) {
                await updateDoc(custRef, {
                  totalOrders: increment(1),
                  totalSpent: increment(Number(oData.total) || 0),
                  lastOrderDate: nowIso,
                  lastOrderId: id,
                  creditedOrders: [...credited, id],
                });
              }
            } else {
              await setDoc(custRef, {
                id: custId,
                name: oData.customerName || 'عميل',
                phone: oData.phone,
                wilaya: oData.wilaya || '',
                totalOrders: 1,
                totalSpent: Number(oData.total) || 0,
                createdAt: nowIso,
                lastOrderDate: nowIso,
                lastOrderId: id,
                creditedOrders: [id],
              });
            }
          }
        } catch (cErr) {
          console.warn('[Admin Order Status] Customer stats update notice:', cErr);
        }
      }

      return res.json({ success: true, message: 'تم تحديث حالة الطلب بنجاح' });
    } catch (err: any) {
      console.error('[Admin API Order Status Update Error]:', err);
      return res.status(500).json({ success: false, error: 'فشل تحديث حالة الطلب' });
    }
  });

  // DELETE /api/admin/orders/:id - Delete order
  app.delete('/api/admin/orders/:id', requireAdminAuth, requireAdminCsrf, async (req, res) => {
    try {
      const { id } = req.params;
      await deleteDoc(doc(db, 'orders', id));
      return res.json({ success: true, message: 'تم حذف الطلب بنجاح' });
    } catch (err: any) {
      console.error('[Admin API Order Delete Error]:', err);
      return res.status(500).json({ success: false, error: 'فشل حذف الطلب' });
    }
  });

  // GET /api/admin/customers - Retrieve all customers securely
  app.get('/api/admin/customers', requireAdminAuth, async (_req, res) => {
    try {
      const snap = await getDocs(collection(db, 'customers'));
      const customers: any[] = [];
      snap.forEach((d) => customers.push({ ...d.data(), id: d.id }));
      return res.json({ success: true, customers });
    } catch (err: any) {
      console.error('[Admin API Customers Fetch Error]:', err);
      return res.status(500).json({ success: false, error: 'تعذر جلب قائمة العملاء من الخادم.' });
    }
  });

  // POST /api/admin/settings - Save store settings securely
  app.post('/api/admin/settings', requireAdminAuth, requireAdminCsrf, async (req, res) => {
    try {
      const settingsData = req.body;
      await setDoc(doc(db, 'settings', 'store'), settingsData, { merge: true });
      return res.json({ success: true, message: 'تم حفظ إعدادات المتجر بنجاح' });
    } catch (err: any) {
      console.error('[Admin API Settings Save Error]:', err);
      return res.status(500).json({ success: false, error: 'فشل حفظ إعدادات المتجر' });
    }
  });

  // POST /api/admin/inventory/update - Atomically update stock for a product variant
  app.post('/api/admin/inventory/update', requireAdminAuth, requireAdminCsrf, async (req, res) => {
    try {
      const { productId, variantIndex, newStock } = req.body || {};
      if (!productId || typeof variantIndex !== 'number' || typeof newStock !== 'number') {
        return res.status(400).json({ success: false, error: 'بيانات تحديث المخزون غير مكتملة.' });
      }

      const pRef = doc(db, 'products', productId);
      const snap = await getDoc(pRef);
      if (!snap.exists()) {
        return res.status(404).json({ success: false, error: 'المنتج غير موجود.' });
      }

      const pData = snap.data();
      const variants = [...(pData.variants || [])];
      if (variantIndex < 0 || variantIndex >= variants.length) {
        return res.status(400).json({ success: false, error: 'المتغير المطلوب غير موجود.' });
      }

      variants[variantIndex] = {
        ...variants[variantIndex],
        stock: Math.max(0, Math.floor(newStock)),
      };

      await updateDoc(pRef, {
        variants,
        updatedAt: new Date().toISOString(),
      });

      return res.json({ success: true, message: 'تم تحديث المخزون بنجاح.' });
    } catch (err: any) {
      console.error('[Admin Inventory Update Error]:', err);
      return res.status(500).json({ success: false, error: err.message || 'فشل تحديث المخزون.' });
    }
  });

  // POST /api/admin/products - Add product
  app.post('/api/admin/products', requireAdminAuth, requireAdminCsrf, async (req, res) => {
    try {
      const productData = req.body || {};
      if (!productData.name || typeof productData.price !== 'number') {
        return res.status(400).json({ success: false, error: 'اسم المنتج والسعر مطلوبان.' });
      }

      const cleanSlug = (productData.slug || productData.name.toLowerCase().replace(/[^a-z0-9_-]/g, '-'))
        .substring(0, 80);
      const prodId = productData.id || `prod_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

      const payload = {
        ...productData,
        id: prodId,
        slug: cleanSlug,
        createdAt: productData.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'products', prodId), payload);
      return res.json({ success: true, product: payload });
    } catch (err: any) {
      console.error('[Admin Product Create Error]:', err);
      return res.status(500).json({ success: false, error: err.message || 'فشل إضافة المنتج.' });
    }
  });

  // PUT /api/admin/products/:id - Update product
  app.put('/api/admin/products/:id', requireAdminAuth, requireAdminCsrf, async (req, res) => {
    try {
      const { id } = req.params;
      const productData = req.body || {};
      const pRef = doc(db, 'products', id);
      const snap = await getDoc(pRef);
      if (!snap.exists()) {
        return res.status(404).json({ success: false, error: 'المنتج غير موجود.' });
      }

      const updatePayload = {
        ...productData,
        updatedAt: new Date().toISOString(),
      };
      delete updatePayload.id;

      await updateDoc(pRef, updatePayload);
      return res.json({ success: true, message: 'تم تحديث المنتج بنجاح.' });
    } catch (err: any) {
      console.error('[Admin Product Update Error]:', err);
      return res.status(500).json({ success: false, error: err.message || 'فشل تحديث المنتج.' });
    }
  });

  // DELETE /api/admin/products/:id - Delete product
  app.delete('/api/admin/products/:id', requireAdminAuth, requireAdminCsrf, async (req, res) => {
    try {
      const { id } = req.params;
      await deleteDoc(doc(db, 'products', id));
      return res.json({ success: true, message: 'تم حذف المنتج بنجاح.' });
    } catch (err: any) {
      console.error('[Admin Product Delete Error]:', err);
      return res.status(500).json({ success: false, error: err.message || 'فشل حذف المنتج.' });
    }
  });

  // GET /api/admin/categories - List all categories (including inactive)
  app.get('/api/admin/categories', requireAdminAuth, async (_req, res) => {
    try {
      const q = query(collection(db, 'categories'), orderBy('order', 'asc'));
      const snap = await getDocs(q);
      const categories: any[] = [];
      snap.forEach((d) => categories.push({ ...d.data(), id: d.id }));
      return res.json({ success: true, categories });
    } catch (err: any) {
      console.error('[Admin Categories Fetch Error]:', err);
      return res.status(500).json({ success: false, error: 'فشل جلب الأقسام.' });
    }
  });

  // POST /api/admin/categories - Create category
  app.post('/api/admin/categories', requireAdminAuth, requireAdminCsrf, async (req, res) => {
    try {
      const catData = req.body || {};
      if (!catData.name || !catData.name.trim()) {
        return res.status(400).json({ success: false, error: 'اسم التصنيف مطلوب.' });
      }

      const slug =
        catData.slug?.trim() ||
        catData.nameEn?.toLowerCase().replace(/\s+/g, '-') ||
        `cat-${Date.now()}`;

      const payload = {
        ...catData,
        id: slug,
        slug,
        name: catData.name.trim(),
        nameEn: (catData.nameEn || '').trim(),
        description: (catData.description || '').trim(),
        imageUrl: catData.imageUrl || '',
        order: Number(catData.order) || 1,
        isActive: catData.isActive ?? true,
        updatedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'categories', slug), payload);
      return res.json({ success: true, category: payload });
    } catch (err: any) {
      console.error('[Admin Category Create Error]:', err);
      return res.status(500).json({ success: false, error: err.message || 'فشل إنشاء التصنيف.' });
    }
  });

  // PUT /api/admin/categories/:id - Update category
  app.put('/api/admin/categories/:id', requireAdminAuth, requireAdminCsrf, async (req, res) => {
    try {
      const { id } = req.params;
      const catRef = doc(db, 'categories', id);
      const snap = await getDoc(catRef);
      if (!snap.exists()) {
        return res.status(404).json({ success: false, error: 'التصنيف غير موجود.' });
      }

      const updateData = { ...req.body, updatedAt: new Date().toISOString() };
      delete updateData.id;
      await updateDoc(catRef, updateData);
      return res.json({ success: true, message: 'تم تحديث التصنيف بنجاح.' });
    } catch (err: any) {
      console.error('[Admin Category Update Error]:', err);
      return res.status(500).json({ success: false, error: err.message || 'فشل تحديث التصنيف.' });
    }
  });

  // DELETE /api/admin/categories/:id - Delete category
  app.delete('/api/admin/categories/:id', requireAdminAuth, requireAdminCsrf, async (req, res) => {
    try {
      const { id } = req.params;
      await deleteDoc(doc(db, 'categories', id));
      return res.json({ success: true, message: 'تم حذف التصنيف بنجاح.' });
    } catch (err: any) {
      console.error('[Admin Category Delete Error]:', err);
      return res.status(500).json({ success: false, error: err.message || 'فشل حذف التصنيف.' });
    }
  });

  // GET /api/admin/coupons - List all coupons
  app.get('/api/admin/coupons', requireAdminAuth, async (_req, res) => {
    try {
      const snap = await getDocs(collection(db, 'coupons'));
      const coupons: any[] = [];
      snap.forEach((d) => coupons.push({ ...d.data(), id: d.id }));
      return res.json({ success: true, coupons });
    } catch (err: any) {
      console.error('[Admin Coupons Fetch Error]:', err);
      return res.status(500).json({ success: false, error: 'فشل جلب القسائم.' });
    }
  });

  // POST /api/admin/coupons - Create coupon
  app.post('/api/admin/coupons', requireAdminAuth, requireAdminCsrf, async (req, res) => {
    try {
      const { code, discountType, discountValue, minOrder, usageLimit, startDate, expiresAt, isActive } = req.body || {};
      if (!code || typeof discountValue !== 'number') {
        return res.status(400).json({ success: false, error: 'كود الخصم وقيمة الخصم مطلوبان.' });
      }
      const normCode = code.trim().toUpperCase();
      const couponPayload = {
        id: normCode,
        code: normCode,
        discountType: discountType === 'percentage' ? 'percentage' : 'fixed',
        discountValue,
        minOrder: Number(minOrder) || 0,
        usageLimit: usageLimit !== null && usageLimit !== undefined ? Number(usageLimit) : null,
        usageCount: 0,
        startDate: startDate || '',
        expiresAt: expiresAt || '',
        isActive: isActive !== false,
        createdAt: new Date().toISOString(),
      };
      await setDoc(doc(db, 'coupons', normCode), couponPayload);
      return res.json({ success: true, coupon: couponPayload });
    } catch (err: any) {
      console.error('[Admin Coupon Create Error]:', err);
      return res.status(500).json({ success: false, error: err.message || 'فشل إنشاء القسيمة.' });
    }
  });

  // PUT /api/admin/coupons/:id - Update coupon
  app.put('/api/admin/coupons/:id', requireAdminAuth, requireAdminCsrf, async (req, res) => {
    try {
      const { id } = req.params;
      const cRef = doc(db, 'coupons', id);
      const snap = await getDoc(cRef);
      if (!snap.exists()) {
        return res.status(404).json({ success: false, error: 'القسيمة غير موجودة.' });
      }
      const updateData = { ...req.body, updatedAt: new Date().toISOString() };
      delete updateData.id;
      delete updateData.code;
      await updateDoc(cRef, updateData);
      return res.json({ success: true, message: 'تم تحديث القسيمة بنجاح.' });
    } catch (err: any) {
      console.error('[Admin Coupon Update Error]:', err);
      return res.status(500).json({ success: false, error: err.message || 'فشل تحديث القسيمة.' });
    }
  });

  // DELETE /api/admin/coupons/:id - Delete coupon
  app.delete('/api/admin/coupons/:id', requireAdminAuth, requireAdminCsrf, async (req, res) => {
    try {
      const { id } = req.params;
      await deleteDoc(doc(db, 'coupons', id));
      return res.json({ success: true, message: 'تم حذف القسيمة بنجاح.' });
    } catch (err: any) {
      console.error('[Admin Coupon Delete Error]:', err);
      return res.status(500).json({ success: false, error: err.message || 'فشل حذف القسيمة.' });
    }
  });

  // POST /api/admin/homepage - Update homepage configuration
  app.post('/api/admin/homepage', requireAdminAuth, requireAdminCsrf, async (req, res) => {
    try {
      const homepageData = req.body || {};
      await setDoc(doc(db, 'homepage', 'main'), homepageData, { merge: true });
      return res.json({ success: true, message: 'تم تحديث الصفحة الرئيسية بنجاح.' });
    } catch (err: any) {
      console.error('[Admin Homepage Save Error]:', err);
      return res.status(500).json({ success: false, error: 'فشل حفظ محتوى الصفحة الرئيسية.' });
    }
  });

  // POST /api/admin/shipping - Update wilaya shipping rate
  app.post('/api/admin/shipping', requireAdminAuth, requireAdminCsrf, async (req, res) => {
    try {
      const { wilayaCode, homePrice, deskPrice, estimatedDays, isDeskAvailable } = req.body || {};
      if (!wilayaCode) {
        return res.status(400).json({ success: false, error: 'رمز الولاية مطلوب.' });
      }
      const cleanCode = String(wilayaCode).trim().padStart(2, '0');
      const shipRef = doc(db, 'shipping', `wilaya-${cleanCode}`);
      const updatePayload: Record<string, any> = {
        updatedAt: new Date().toISOString(),
      };
      if (typeof homePrice === 'number') updatePayload.homePrice = homePrice;
      if (typeof deskPrice === 'number') updatePayload.deskPrice = deskPrice;
      if (estimatedDays) updatePayload.estimatedDays = estimatedDays;
      if (isDeskAvailable !== undefined) updatePayload.isDeskAvailable = Boolean(isDeskAvailable);

      await setDoc(shipRef, updatePayload, { merge: true });
      return res.json({ success: true, message: 'تم تحديث تسعيرة التوصيل بنجاح.' });
    } catch (err: any) {
      console.error('[Admin Shipping Save Error]:', err);
      return res.status(500).json({ success: false, error: 'فشل حفظ تسعيرة التوصيل.' });
    }
  });

  // POST /api/admin/shipping/bulk - Bulk update all wilaya shipping rates
  app.post('/api/admin/shipping/bulk', requireAdminAuth, requireAdminCsrf, async (req, res) => {
    try {
      const { rates } = req.body || {};
      if (!rates || typeof rates !== 'object') {
        return res.status(400).json({ success: false, error: 'بيانات التسعيرات غير صالحة.' });
      }

      for (const [code, rate] of Object.entries(rates as Record<string, any>)) {
        const cleanCode = String(code).trim().padStart(2, '0');
        const wilayaMeta = ALGERIA_WILAYAS.find((w) => w.code === cleanCode);
        await setDoc(
          doc(db, 'shipping', `wilaya-${cleanCode}`),
          {
            ...rate,
            id: `wilaya-${cleanCode}`,
            wilayaCode: cleanCode,
            wilayaName: wilayaMeta?.name || rate.wilayaName,
            wilayaNameFr: wilayaMeta?.nameFr || rate.wilayaNameFr,
            isDeskAvailable: rate.isDeskAvailable !== false,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      }

      return res.json({ success: true, message: 'تم حفظ كافة تسعيرات التوصيل بنجاح.' });
    } catch (err: any) {
      console.error('[Admin Shipping Bulk Save Error]:', err);
      return res.status(500).json({ success: false, error: err.message || 'فشل حفظ التسعيرات.' });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // 12. HIGH-PERFORMANCE CLOUD MEDIA STORAGE & SERVING
  // ─────────────────────────────────────────────────────────────

  // POST /api/storage/upload (Protected with requireAdminAuth & requireAdminCsrf)
  app.post('/api/storage/upload', requireAdminAuth, requireAdminCsrf, async (req, res) => {
    try {
      const { fileBase64, fileName, folder, subfolder } = req.body || {};
      if (!fileBase64 || typeof fileBase64 !== 'string') {
        return res.status(400).json({ success: false, error: 'بيانات الصورة مفقودة أو غير صالحة.' });
      }

      const cleanBase64 = fileBase64.replace(/^data:[^;]+;base64,/, '');
      const buffer = Buffer.from(cleanBase64, 'base64');

      if (buffer.length > 5.5 * 1024 * 1024) {
        return res.status(400).json({ success: false, error: 'حجم الصورة يتجاوز 5 ميغابايت.' });
      }

      const cleanFolder = (folder || 'products').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
      const cleanSub = (subfolder || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
      const timestamp = Date.now();
      const randomSuffix = crypto.randomBytes(4).toString('hex');
      const safeName = (fileName || 'image')
        .replace(/\.[^/.]+$/, '')
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .substring(0, 30) || 'img';

      const fileId = `${cleanFolder}_${cleanSub ? cleanSub + '_' : ''}${timestamp}_${randomSuffix}_${safeName}`;
      const cachePath = path.join(MEDIA_CACHE_DIR, `${fileId}.webp`);

      // Write to local media directory for instant fast serving
      fs.writeFileSync(cachePath, buffer);

      const publicUrl = `/api/media/${fileId}.webp`;
      const storagePath = `app_media/${fileId}`;

      return res.json({
        success: true,
        url: publicUrl,
        path: storagePath,
        name: fileName || `${fileId}.webp`,
      });
    } catch (err: any) {
      console.error('[Storage Upload API Error]:', err);
      return res.status(500).json({ success: false, error: err.message || 'فشل حفظ الصورة على الخادم.' });
    }
  });

  // GET /api/media/:fileId: Serve stored image with caching headers
  app.get('/api/media/:fileId', (req, res) => {
    try {
      const rawFileId = req.params.fileId || '';
      const fileId = rawFileId.replace(/\.webp$/i, '');
      const cachePath = path.join(MEDIA_CACHE_DIR, `${fileId}.webp`);

      if (fs.existsSync(cachePath)) {
        res.setHeader('Content-Type', 'image/webp');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return res.sendFile(cachePath);
      }

      return res.status(404).send('Image Not Found');
    } catch (err: any) {
      return res.status(500).send(err.message);
    }
  });

  // POST /api/storage/delete: Remove stored media file (Protected with requireAdminAuth & requireAdminCsrf)
  app.post('/api/storage/delete', requireAdminAuth, requireAdminCsrf, (req, res) => {
    try {
      const { pathOrUrl } = req.body || {};
      if (!pathOrUrl || typeof pathOrUrl !== 'string') {
        return res.json({ success: true });
      }

      // Extract fileId from /api/media/xxx.webp or app_media/xxx
      const match = pathOrUrl.match(/(?:app_media\/|\/api\/media\/)([^./?]+)/);
      if (match && match[1]) {
        const fileId = match[1];
        const cachePath = path.join(MEDIA_CACHE_DIR, `${fileId}.webp`);
        if (fs.existsSync(cachePath)) {
          try {
            fs.unlinkSync(cachePath);
          } catch {}
        }
      }

      return res.json({ success: true });
    } catch (err: any) {
      console.warn('[Storage Delete Error]:', err);
      return res.json({ success: false });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // Explicit API 404 Handler (Guarantees all /api/* requests return JSON, never HTML)
  // ─────────────────────────────────────────────────────────────
  app.all('/api/*', (req, res) => {
    res.status(404).json({
      success: false,
      error: `المسار البرمجي غير موجود (${req.method} ${req.path})`,
      path: req.path,
    });
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
