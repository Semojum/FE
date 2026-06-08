import { useState, useEffect, useCallback } from 'react';
import { User } from '../types/auth';
import {
  login as apiLogin,
  logout as apiLogout,
  refresh as apiRefresh,
  signup as apiSignup,
} from '../api/AuthService';
import { decodeJwt, isExpired } from '../utils/jwt';

const TOKEN_KEY = 'braillemate-token'; // accessToken
const REFRESH_KEY = 'braillemate-refresh-token';

// accessToken(JWT) payload에서 사용자 정보를 복원. 명세에 GET /me가 없으므로
// 표시용 사용자 정보는 토큰을 디코드해서 얻는다.
const userFromToken = (token: string | null): User | null => {
  const payload = decodeJwt(token);
  if (!payload?.sub || isExpired(payload)) return null;
  return {
    id: payload.sub,
    email: payload.email ?? '',
    name: payload.name ?? '',
  };
};

export const useAuth = () => {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(TOKEN_KEY),
  );
  const [user, setUser] = useState<User | null>(() =>
    userFromToken(localStorage.getItem(TOKEN_KEY)),
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // 저장된 토큰으로 세션 복구 (만료/손상 시 정리)
  useEffect(() => {
    if (!token) {
      setUser(null);
      return;
    }
    const restored = userFromToken(token);
    if (restored) {
      setUser(restored);
    } else {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_KEY);
      setToken(null);
      setUser(null);
    }
  }, [token]);

  // accessToken/refreshToken을 저장하고 사용자 상태를 갱신
  const loginWithTokens = useCallback(
    (accessToken: string, refreshToken?: string | null) => {
      localStorage.setItem(TOKEN_KEY, accessToken);
      if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
      setUser(userFromToken(accessToken));
      setToken(accessToken);
    },
    [],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      setIsLoading(true);
      try {
        const res = await apiLogin(email, password);
        loginWithTokens(res.accessToken, res.refreshToken);
      } finally {
        setIsLoading(false);
      }
    },
    [loginWithTokens],
  );

  // 명세상 회원가입은 토큰을 발급하지 않으므로, 가입 직후 로그인해 토큰을 받는다.
  const signup = useCallback(
    async (email: string, password: string, name: string) => {
      setIsLoading(true);
      try {
        await apiSignup(email, password, name);
        const res = await apiLogin(email, password);
        loginWithTokens(res.accessToken, res.refreshToken);
      } finally {
        setIsLoading(false);
      }
    },
    [loginWithTokens],
  );

  // refreshToken으로 accessToken을 재발급한다. 성공 시 새 accessToken 반환, 실패 시 null.
  const refreshSession = useCallback(async (): Promise<string | null> => {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    if (!refreshToken) return null;
    try {
      const res = await apiRefresh(token, refreshToken);
      localStorage.setItem(TOKEN_KEY, res.accessToken);
      setUser(userFromToken(res.accessToken));
      setToken(res.accessToken);
      return res.accessToken;
    } catch {
      return null;
    }
  }, [token]);

  // 서버 로그아웃을 호출한 뒤 로컬 세션을 정리한다.
  // (명세상 로그아웃 후에도 accessToken은 만료 전까지 유효하므로 로컬 삭제가 핵심)
  const logout = useCallback(async () => {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    try {
      if (token) await apiLogout(token, refreshToken ?? '');
    } catch {
      // 서버 로그아웃 실패해도 로컬 세션은 반드시 정리한다.
    }
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
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
    loginWithTokens,
    refreshSession,
  };
};
