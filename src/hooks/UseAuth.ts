import { useState, useEffect, useCallback } from 'react';
import { User } from '../types/auth';
import {
  login as apiLogin,
  logout as apiLogout,
  refresh as apiRefresh,
  signup as apiSignup,
} from '../api/AuthService';
import { setTokenRefresher } from '../api/apiClient';
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
  // 자동 로그인(부트스트랩) 진행 여부. 유효한 accessToken이 이미 있으면 대기 불필요,
  // 만료/부재 + refreshToken 보유 시에는 재발급이 끝날 때까지 true.
  const [isInitializing, setIsInitializing] = useState<boolean>(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (userFromToken(stored)) return false;
    return !!localStorage.getItem(REFRESH_KEY);
  });

  // 마운트 시 1회: 저장된 토큰으로 세션을 복구한다. accessToken이 없거나 만료됐어도
  // refreshToken이 있으면 재발급을 시도해 자동 로그인한다. (웹/데스크톱 공통)
  useEffect(() => {
    let cancelled = false;

    const clearSession = () => {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_KEY);
      if (cancelled) return;
      setToken(null);
      setUser(null);
    };

    const bootstrap = async () => {
      const storedToken = localStorage.getItem(TOKEN_KEY);
      const restored = userFromToken(storedToken);
      if (restored) {
        if (!cancelled) {
          setToken(storedToken);
          setUser(restored);
        }
        return;
      }

      // accessToken이 없거나 만료 — refreshToken으로 재발급(자동 로그인) 시도
      const refreshToken = localStorage.getItem(REFRESH_KEY);
      if (refreshToken) {
        try {
          const res = await apiRefresh(storedToken, refreshToken);
          if (!cancelled) {
            localStorage.setItem(TOKEN_KEY, res.accessToken);
            setToken(res.accessToken);
            setUser(userFromToken(res.accessToken));
          }
          return;
        } catch {
          // 재발급 실패 — 아래에서 세션 정리 후 로그인 요구
        }
      }
      clearSession();
    };

    bootstrap().finally(() => {
      if (!cancelled) setIsInitializing(false);
    });

    return () => {
      cancelled = true;
    };
    // 마운트 시 1회만 실행한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const clearSession = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    setUser(null);
    setToken(null);
  }, []);

  // refreshToken으로 accessToken을 재발급한다. 성공 시 새 accessToken 반환, 실패 시 null.
  // 401 발생 시 apiClient가 방금 실패한 토큰(failedToken)과 함께 호출한다(요청당 1회).
  // 재발급 불가 시 세션을 정리해 로그인 화면으로 보낸다.
  const refreshSession = useCallback(
    async (failedToken?: string | null): Promise<string | null> => {
      const stored = localStorage.getItem(TOKEN_KEY);
      // 저장된 토큰이 방금 실패한 토큰과 "다르면" 이미 다른 요청이 재발급한 것이므로 그대로 사용.
      // (로컬 만료 추정 isExpired에 기대지 않는다 — exp가 없거나 서버 시계와 어긋날 수 있음)
      if (stored && failedToken != null && stored !== failedToken) {
        setToken(stored);
        setUser(userFromToken(stored));
        return stored;
      }

      const refreshToken = localStorage.getItem(REFRESH_KEY);
      if (!refreshToken) {
        clearSession();
        return null;
      }
      try {
        const res = await apiRefresh(stored, refreshToken);
        localStorage.setItem(TOKEN_KEY, res.accessToken);
        setUser(userFromToken(res.accessToken));
        setToken(res.accessToken);
        return res.accessToken;
      } catch {
        // refreshToken까지 만료/무효 — 세션 종료 후 로그인 요구
        clearSession();
        return null;
      }
    },
    [clearSession],
  );

  // apiClient가 401 시 호출할 리프레시 함수를 등록한다.
  useEffect(() => {
    setTokenRefresher(refreshSession);
    return () => setTokenRefresher(null);
  }, [refreshSession]);

  // 서버 로그아웃을 호출한 뒤 로컬 세션을 정리한다.
  // (명세상 로그아웃 후에도 accessToken은 만료 전까지 유효하므로 로컬 삭제가 핵심)
  const logout = useCallback(async () => {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    try {
      if (token) await apiLogout(token, refreshToken ?? '');
    } catch {
      // 서버 로그아웃 실패해도 로컬 세션은 반드시 정리한다.
    }
    clearSession();
  }, [token, clearSession]);

  return {
    token,
    user,
    isLoading,
    isInitializing,
    isAuthenticated: !!user,
    login,
    signup,
    logout,
    loginWithTokens,
    refreshSession,
  };
};
