import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, onAuthStateChanged, signOut as fbSignOut } from 'firebase/auth';
import { auth } from '../firebase';
import { apiFetch } from '../utils/apiConfig';

interface AuthContextType {
  currentUser: User | null;
  isAdmin: boolean;
  adminUsername: string;
  isLoading: boolean;
  setupRequired: boolean;
  setupInitialAdmin: (username: string, password: string, confirmPassword: string) => Promise<{ success: boolean; error?: string }>;
  loginWithCredentials: (username: string, password: string) => Promise<{ success: boolean; error?: string; setupRequired?: boolean }>;
  updateCredentials: (
    currentPassword: string,
    newUsername?: string,
    newPassword?: string
  ) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_STORAGE_KEY = 'amadal_admin_token';
const USERNAME_STORAGE_KEY = 'amadal_admin_username';
const CSRF_STORAGE_KEY = 'amadal_csrf_token';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [adminUsername, setAdminUsername] = useState<string>('');
  const [setupRequired, setSetupRequired] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Monitor Firebase auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  // Check setup status
  const checkSetupStatus = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/setup-status', { skipAuth: true });
      if (res.ok && res.data) {
        const needsSetup = res.data.setupRequired === true || (res.data.initialized === false && res.data.hasAdmin === false);
        setSetupRequired(needsSetup);
        return needsSetup;
      }
    } catch {}
    return false;
  }, []);

  // Verify stored session on startup (Server is the definitive authority)
  const verifySession = useCallback(async () => {
    try {
      // First check setup status
      const needsSetup = await checkSetupStatus();
      if (needsSetup) {
        setIsAdmin(false);
        setAdminUsername('');
        setIsLoading(false);
        return;
      }

      const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
      const storedUser = localStorage.getItem(USERNAME_STORAGE_KEY);

      if (!storedToken) {
        setIsAdmin(false);
        setAdminUsername('');
        setIsLoading(false);
        return;
      }

      // Check with backend session verification endpoint
      const res = await apiFetch('/api/admin/verify-session', {
        method: 'POST',
        body: JSON.stringify({ token: storedToken }),
      });

      if (res.ok && res.data && (res.data.authenticated || res.data.valid)) {
        setIsAdmin(true);
        setAdminUsername(res.data.username || storedUser || 'admin');
        setIsLoading(false);
        return;
      }

      // If backend rejected token or token expired
      if (res.status === 401 || (res.data && res.data.valid === false)) {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        localStorage.removeItem(USERNAME_STORAGE_KEY);
        localStorage.removeItem(CSRF_STORAGE_KEY);
        setIsAdmin(false);
        setAdminUsername('');
      } else {
        setIsAdmin(false);
        setAdminUsername('');
      }
    } catch (err) {
      console.warn('[AuthContext] Session verification failed to reach server:', err);
      setIsAdmin(false);
      setAdminUsername('');
    } finally {
      setIsLoading(false);
    }
  }, [checkSetupStatus]);

  useEffect(() => {
    verifySession();
  }, [verifySession]);

  const setupInitialAdmin = async (
    username: string,
    password: string,
    confirmPassword: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      setIsLoading(true);
      const res = await apiFetch('/api/admin/initial-setup', {
        method: 'POST',
        skipAuth: true,
        body: JSON.stringify({
          username: username.trim(),
          password,
          confirmPassword,
        }),
      });

      if (res.ok && res.data?.success && res.data.token) {
        localStorage.setItem(TOKEN_STORAGE_KEY, res.data.token);
        localStorage.setItem(USERNAME_STORAGE_KEY, res.data.username || username.trim());
        if (res.data.csrfToken) {
          localStorage.setItem(CSRF_STORAGE_KEY, res.data.csrfToken);
        }
        setIsAdmin(true);
        setAdminUsername(res.data.username || username.trim());
        setSetupRequired(false);
        return { success: true };
      }

      return {
        success: false,
        error: res.error || res.data?.error || 'فشل إعداد الحساب الإداري الأولي.',
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'حدث خطأ أثناء إعداد الحساب.' };
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithCredentials = async (
    username: string,
    password: string
  ): Promise<{ success: boolean; error?: string; setupRequired?: boolean }> => {
    try {
      setIsLoading(true);
      const cleanUsername = username.trim();

      const res = await apiFetch('/api/admin/login', {
        method: 'POST',
        skipAuth: true,
        body: JSON.stringify({
          username: cleanUsername,
          password,
        }),
      });

      if (res.data?.setupRequired) {
        setSetupRequired(true);
        return {
          success: false,
          setupRequired: true,
          error: res.data.error || 'لم تتم تهيئة حساب المدير بعد. يرجى إتمام الإعداد الأولي.',
        };
      }

      if (res.ok && res.data?.success && res.data.token) {
        localStorage.setItem(TOKEN_STORAGE_KEY, res.data.token);
        localStorage.setItem(USERNAME_STORAGE_KEY, res.data.username || cleanUsername);
        if (res.data.csrfToken) {
          localStorage.setItem(CSRF_STORAGE_KEY, res.data.csrfToken);
        }
        setIsAdmin(true);
        setAdminUsername(res.data.username || cleanUsername);
        return { success: true };
      }

      return {
        success: false,
        error: res.error || res.data?.error || 'اسم المستخدم أو كلمة المرور غير صحيحة.',
      };
    } catch (error: any) {
      console.error('[AuthContext] Login error:', error);
      return {
        success: false,
        error: error.message || 'حدث خطأ أثناء تسجيل الدخول.',
      };
    } finally {
      setIsLoading(false);
    }
  };

  const updateCredentials = async (
    currentPassword: string,
    newUsername?: string,
    newPassword?: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const cleanUser = newUsername?.trim();

      const res = await apiFetch('/api/admin/update-credentials', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword,
          newUsername: cleanUser || undefined,
          newPassword: newPassword ? newPassword : undefined,
        }),
      });

      if (res.ok && res.data?.success) {
        if (res.data.username) {
          setAdminUsername(res.data.username);
          localStorage.setItem(USERNAME_STORAGE_KEY, res.data.username);
        }
        return { success: true };
      }

      return {
        success: false,
        error: res.error || res.data?.error || 'فشل تحديث بيانات الدخول. يرجى التأكد من كلمة المرور الحالية.',
      };
    } catch (error: any) {
      console.error('[AuthContext] Update credentials error:', error);
      return {
        success: false,
        error: error.message || 'حدث خطأ أثناء تحديث بيانات الدخول.',
      };
    }
  };

  const logout = async () => {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);

    try {
      await apiFetch('/api/admin/logout', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });
    } catch {}

    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USERNAME_STORAGE_KEY);
    localStorage.removeItem(CSRF_STORAGE_KEY);
    setIsAdmin(false);
    setAdminUsername('');

    try {
      await fbSignOut(auth);
    } catch {}
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isAdmin,
        adminUsername,
        isLoading,
        setupRequired,
        setupInitialAdmin,
        loginWithCredentials,
        updateCredentials,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
