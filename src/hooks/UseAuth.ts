import { useState, useEffect, useCallback, useRef } from 'react';
import { User } from '../types/auth';
import {
  login as apiLogin,
  logout as apiLogout,
  refresh as apiRefresh,
} from '../api/AuthService';
import { ApiError, setTokenRefresher } from '../api/apiClient';
import { decodeJwt, isExpired } from '../utils/jwt';

// V3: 자동 로그인을 지원하지 않는다 (로그인 문서 D-3 — 기관 계정은 공유될 수 있어
// 다른 담당자의 계정으로 작업이 섞이면 안 된다). 따라서 토큰은 localStorage에
// 남기지 않고 메모리에만 보관하며, 앱을 다시 켜면 항상 로그인 화면부터 시작한다.
// 액세스 토큰 1시간 / 리프레시 12시간이므로 세션 중 재발급은 그대로 필요하다.

// 세션이 끊긴 사유 — 로그인 화면에서 안내 문구를 가르는 데 쓴다.
//  'evicted': 다른 기기에서 로그인해 이 세션이 종료됨 (AUTH4003)
//  'expired': 리프레시 토큰 만료 등 그 밖의 사유
export type SessionEndedReason = 'evicted' | 'expired';

// accessToken(JWT) payload에서 사용자 정보를 복원. 명세에 GET /me가 없으므로
// 표시용 사용자 정보는 토큰을 디코드해서 얻는다. V3의 식별자는 loginId다.
const userFromToken = (token: string | null): User | null => {
  const payload = decodeJwt(token);
  if (!payload?.sub || isExpired(payload)) return null;
  const loginId =
    typeof payload.loginId === 'string' ? payload.loginId : payload.sub;
  return { loginId };
};

export const useAuth = () => {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [sessionEndedReason, setSessionEndedReason] =
    useState<SessionEndedReason | null>(null);

  // 리프레시 토큰은 화면에 쓰이지 않으므로 렌더를 유발하지 않는 ref로 보관한다.
  const refreshTokenRef = useRef<string | null>(null);
  // apiClient의 리프레셔 콜백에서 최신 accessToken을 읽기 위한 미러.
  const tokenRef = useRef<string | null>(null);

  const applyToken = useCallback((accessToken: string) => {
    tokenRef.current = accessToken;
    setToken(accessToken);
    setUser(userFromToken(accessToken));
  }, []);

  const clearSession = useCallback((reason: SessionEndedReason | null) => {
    tokenRef.current = null;
    refreshTokenRef.current = null;
    setToken(null);
    setUser(null);
    setSessionEndedReason(reason);
  }, []);

  const login = useCallback(
    async (loginId: string, password: string) => {
      setIsLoading(true);
      try {
        const res = await apiLogin(loginId, password);
        refreshTokenRef.current = res.refreshToken;
        setSessionEndedReason(null);
        applyToken(res.accessToken);
      } finally {
        setIsLoading(false);
      }
    },
    [applyToken],
  );

  // refreshToken으로 accessToken을 재발급한다. 성공 시 새 accessToken, 실패 시 null.
  // 401 발생 시 apiClient가 방금 실패한 토큰(failedToken)과 함께 호출한다(요청당 1회).
  const refreshSession = useCallback(
    async (failedToken?: string | null): Promise<string | null> => {
      const current = tokenRef.current;
      // 보관 중인 토큰이 방금 실패한 토큰과 "다르면" 이미 다른 요청이 재발급한 것이므로 그대로 사용.
      if (current && failedToken != null && current !== failedToken) {
        return current;
      }

      const refreshToken = refreshTokenRef.current;
      if (!refreshToken) {
        clearSession('expired');
        return null;
      }
      try {
        const res = await apiRefresh(refreshToken);
        applyToken(res.accessToken);
        return res.accessToken;
      } catch (err) {
        // AUTH4003 = 밀려난 세션(다른 곳에서 로그인) 또는 리프레시 토큰 만료·무효.
        // 중복 로그인 금지 정책상 전자가 대부분이므로 안내 문구를 구분해 보여준다.
        const evicted = err instanceof ApiError && err.code === 'AUTH4003';
        clearSession(evicted ? 'evicted' : 'expired');
        return null;
      }
    },
    [applyToken, clearSession],
  );

  // apiClient가 401 시 호출할 리프레시 함수를 등록한다.
  useEffect(() => {
    setTokenRefresher(refreshSession);
    return () => setTokenRefresher(null);
  }, [refreshSession]);

  // 서버 로그아웃(리프레시 토큰 revoke) 후 로컬 세션을 정리한다.
  // 명세상 이미 발급된 accessToken은 만료 전까지 유효하므로 로컬 삭제가 핵심이다.
  const logout = useCallback(async () => {
    const refreshToken = refreshTokenRef.current;
    try {
      if (refreshToken) await apiLogout(refreshToken);
    } catch {
      // 서버 로그아웃 실패해도 로컬 세션은 반드시 정리한다.
    }
    clearSession(null);
  }, [clearSession]);

  // 로그인 화면에서 세션 종료 안내를 닫을 때 호출한다.
  const acknowledgeSessionEnded = useCallback(
    () => setSessionEndedReason(null),
    [],
  );

  return {
    token,
    user,
    isLoading,
    isAuthenticated: !!user,
    sessionEndedReason,
    acknowledgeSessionEnded,
    login,
    logout,
    refreshSession,
  };
};
