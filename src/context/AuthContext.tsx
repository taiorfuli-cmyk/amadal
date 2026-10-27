import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, onAuthStateChanged, signOut as fbSignOut } from 'firebase/auth';
import { auth } from '../firebase';

interface AuthContextType {
  currentUser: User | null;
  isAdmin: boolean;
  adminUsername: string;
  isLoading: boolean;
  loginWithCredentials: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [adminUsername, setAdminUsername] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Monitor Firebase auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  // Verify stored session on startup
  const verifySession = useCallback(async () => {
    try {
      const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
      const storedUser = localStorage.getItem(USERNAME_STORAGE_KEY);

      if (!storedToken) {
        setIsAdmin(false);
        setAdminUsername('');
        setIsLoading(false);
        return;
      }

      // Check with backend session verification endpoint
      const res = await fetch('/api/admin/verify-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${storedToken}`,
        },
        body: JSON.stringify({ token: storedToken }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.authenticated || data.valid || data.success) {
          setIsAdmin(true);
          setAdminUsername(data.username || storedUser || 'admin');
          setIsLoading(false);
          return;
        }
      }

      // If token invalid, clear
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(USERNAME_STORAGE_KEY);
      setIsAdmin(false);
      setAdminUsername('');
    } catch (err) {
      console.warn('Session verification error:', err);
      // In case server is offline temporarily, preserve session if token exists
      const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
      const storedUser = localStorage.getItem(USERNAME_STORAGE_KEY);
      if (storedToken) {
        setIsAdmin(true);
        setAdminUsername(storedUser || 'admin');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    verifySession();
  }, [verifySession]);

  const loginWithCredentials = async (
    username: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      setIsLoading(true);
      const cleanUsername = username.trim();
      console.log(`[AuthContext] Logging in with username: "${cleanUsername}"`);

      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: cleanUsername,
          password,
        }),
      });

      const data = await res.json();
      console.log('[AuthContext] Login response:', data);

      if (data.success && data.token) {
        localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
        localStorage.setItem(USERNAME_STORAGE_KEY, data.username || cleanUsername);
        setIsAdmin(true);
        setAdminUsername(data.username || cleanUsername);
        return { success: true };
      }

      return {
        success: false,
        error: data.error || 'اسم المستخدم أو كلمة المرور غير صحيحة.',
      };
    } catch (error: any) {
      console.error('[AuthContext] Login error:', error);
      return {
        success: false,
        error: error.message || 'تعذر الاتصال بالخادم للتحقق من بيانات الدخول.',
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
      const token = localStorage.getItem(TOKEN_STORAGE_KEY);
      const cleanUser = newUsername?.trim();
      console.log('[AuthContext] Submitting update credentials:', {
        hasToken: Boolean(token),
        newUsername: cleanUser || '(not changed)',
        hasNewPassword: Boolean(newPassword),
      });

      const res = await fetch('/api/admin/update-credentials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token || ''}`,
        },
        body: JSON.stringify({
          token,
          currentPassword,
          newUsername: cleanUser || undefined,
          newPassword: newPassword ? newPassword : undefined,
        }),
      });

      const data = await res.json();
      console.log('[AuthContext] Update credentials response:', data);

      if (data.success) {
        if (data.username) {
          setAdminUsername(data.username);
          localStorage.setItem(USERNAME_STORAGE_KEY, data.username);
        }
        return { success: true };
      }

      return {
        success: false,
        error: data.error || 'فشل تحديث بيانات الدخول.',
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
    const clientUid = auth.currentUser?.uid;

    try {
      await fetch('/api/admin/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, clientUid }),
      });
    } catch {}

    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USERNAME_STORAGE_KEY);
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
