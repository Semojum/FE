import { useState, useEffect, useCallback } from 'react';
import { User } from '../types/auth';
import {
  login as apiLogin,
  signup as apiSignup,
  me as apiMe,
  logout as apiLogout,
} from '../api/AuthService';

const TOKEN_KEY = 'braillemate-token';

export const useAuth = () => {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(TOKEN_KEY),
  );
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(!!token);

  // 페이지 진입 시 저장된 토큰으로 사용자 복구
  useEffect(() => {
    if (!token) {
      setUser(null);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    apiMe(token)
      .then((u) => {
        if (!cancelled) setUser(u);
      })
      .catch(() => {
        if (cancelled) return;
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiLogin(email, password);
    localStorage.setItem(TOKEN_KEY, res.token);
    setUser(res.user);
    setToken(res.token);
  }, []);

  const signup = useCallback(
    async (email: string, password: string, name: string) => {
      const res = await apiSignup(email, password, name);
      localStorage.setItem(TOKEN_KEY, res.token);
      setUser(res.user);
      setToken(res.token);
    },
    [],
  );

  const logout = useCallback(async () => {
    if (token) {
      try {
        await apiLogout(token);
      } catch (err) {
        // 서버 호출이 실패해도 클라이언트 세션은 항상 정리. 디버깅을 위해 로그만 남김.
        console.warn('Logout API call failed; clearing local session anyway:', err);
      }
    }
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setToken(null);
  }, [token]);

  return {
    token,
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    signup,
    logout,
  };
};
