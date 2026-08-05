import { LoginResponse, RefreshResponse } from '../types/auth';
import { apiRequest } from './apiClient';

// V3 인증 — 회원가입·이메일 중복확인·소셜 로그인(카카오/구글)은 전부 제거되었다.
// 계정은 운영자가 관리자 API로 발급하며, 사용자는 loginId/PW로 로그인만 한다.

// POST /api/auth/login — { accessToken, refreshToken } 반환.
// 성공하면 그 계정의 기존 활성 세션이 서버에서 전부 revoke된다(중복 로그인 금지).
// 실패: AUTH4001(아이디·비밀번호 불일치) / AUTH4004(비활성 계정).
export const login = (
  loginId: string,
  password: string,
): Promise<LoginResponse> =>
  apiRequest<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: { loginId, password },
  });

// POST /api/auth/logout — 인증 헤더 없이 본문의 refreshToken만으로 revoke한다.
export const logout = (refreshToken: string): Promise<null> =>
  apiRequest<null>('/api/auth/logout', {
    method: 'POST',
    body: { refreshToken },
  });

// POST /api/auth/refresh — 인증 헤더 없이 refreshToken으로 accessToken(1시간)만 재발급.
// 다른 곳에서 로그인해 밀려난 세션은 여기서 AUTH4003으로 거부된다.
export const refresh = (refreshToken: string): Promise<RefreshResponse> =>
  apiRequest<RefreshResponse>('/api/auth/refresh', {
    method: 'POST',
    body: { refreshToken },
  });
