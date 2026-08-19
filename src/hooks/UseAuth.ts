import { useState, useEffect, useCallback, useRef } from 'react';
import { User, UserRole } from '../types/auth';
import {
  login as apiLogin,
  logout as apiLogout,
  refresh as apiRefresh,
} from '../api/AuthService';
import { ApiError, setTokenRefresher } from '../api/apiClient';
import { decodeJwt, isExpired } from '../utils/jwt';
import { saveLastLoginId } from '../utils/lastLoginId';

// V3: 자동 로그인을 지원하지 않는다 (로그인 문서 D-3 — 기관 계정은 공유될 수 있어
// 다른 담당자의 계정으로 작업이 섞이면 안 된다). 따라서 토큰은 localStorage에
// 남기지 않고 메모리에만 보관하며, 앱을 다시 켜면 항상 로그인 화면부터 시작한다.
// 액세스 토큰 1시간 / 리프레시 12시간이므로 세션 중 재발급은 그대로 필요하다.

// 세션이 끊긴 사유 — 로그인 화면에서 안내 문구를 가르는 데 쓴다.
//  'evicted': 다른 기기에서 로그인해 이 세션이 종료됨 (AUTH4003)
//  'expired': 리프레시 토큰 만료 등 그 밖의 사유
export type SessionEndedReason = 'evicted' | 'expired';

// 토큰이 아직 살아 있는지만 확인한다.
//
// 표시용 loginId는 토큰에서 뽑지 않는다 — 운영 서버의 accessToken payload는
// { sub, iat, exp }뿐이고 sub이 loginId가 아니라 사용자 UUID다(2026-08-05 실측).
// GET /me도 없으므로, 화면에 보여줄 loginId는 로그인할 때 입력한 값을 그대로 들고 있는다.
const isTokenAlive = (token: string | null): boolean => {
  const payload = decodeJwt(token);
  return !!payload?.sub && !isExpired(payload);
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

  // 로그인한 계정의 loginId. 재발급으로 토큰이 바뀌어도 세션 내내 유지된다.
  const loginIdRef = useRef<string | null>(null);
  // 역할도 로그인 응답에서만 받는다(리프레시 응답에는 없다) — 세션 내내 들고 있는다.
  const roleRef = useRef<UserRole | undefined>(undefined);

  const applyToken = useCallback((accessToken: string) => {
    tokenRef.current = accessToken;
    setToken(accessToken);
    setUser(
      isTokenAlive(accessToken) && loginIdRef.current
        ? { loginId: loginIdRef.current, role: roleRef.current }
        : null,
    );
  }, []);

  const clearSession = useCallback((reason: SessionEndedReason | null) => {
    tokenRef.current = null;
    refreshTokenRef.current = null;
    loginIdRef.current = null;
    roleRef.current = undefined;
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
        loginIdRef.current = loginId;
        roleRef.current = res.role;
        // 다음 실행 때 로그인 화면에 미리 채워 넣는다(아이디만 — 비밀번호는 저장하지 않는다).
        saveLastLoginId(loginId);
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
        // 로그인한 적이 없으면 "세션 종료"가 아니라 그냥 미로그인 상태다.
        // 여기서 사유를 붙이면 앱을 처음 켰을 때 만료 안내가 뜬다.
        clearSession(current ? 'expired' : null);
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
