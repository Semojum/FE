import {
  LoginResponse,
  OAuthExchangeRequest,
  OAuthProvider,
  RefreshResponse,
  SignupResponse,
} from '../types/auth';
import { mockBackend } from './MockBackend';
import { USE_MOCK_API } from './featureFlags';
import { apiRequest } from './apiClient';

export type { OAuthProvider } from '../types/auth';

// POST /api/auth/signup — 가입 성공 시 { email, name } 반환 (토큰 없음)
export const signup = (
  email: string,
  password: string,
  name: string,
): Promise<SignupResponse> => {
  if (USE_MOCK_API) return mockBackend.signup(email, password, name);
  return apiRequest<SignupResponse>('/api/auth/signup', {
    method: 'POST',
    body: { email, name, password },
  });
};

// POST /api/auth/login — { accessToken, refreshToken } 반환
export const login = (
  email: string,
  password: string,
): Promise<LoginResponse> => {
  if (USE_MOCK_API) return mockBackend.login(email, password);
  return apiRequest<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  });
};

// POST /api/auth/logout — Authorization 헤더 + body{refreshToken}. result는 null.
export const logout = (
  token: string,
  refreshToken: string,
): Promise<null> => {
  if (USE_MOCK_API) return mockBackend.logout();
  return apiRequest<null>('/api/auth/logout', {
    method: 'POST',
    token,
    body: { refreshToken },
  });
};

// POST /api/auth/refresh — Authorization 헤더 + body{refreshToken}. { accessToken } 반환.
export const refresh = (
  token: string | null,
  refreshToken: string,
): Promise<RefreshResponse> => {
  if (USE_MOCK_API) return mockBackend.refresh(refreshToken);
  return apiRequest<RefreshResponse>('/api/auth/refresh', {
    method: 'POST',
    token,
    body: { refreshToken },
  });
};

// POST /api/auth/{kakao|google} — 클라이언트가 받은 code를 토큰으로 교환.
// 소셜 로그인은 외부 provider를 거치므로 mock 분기 없이 항상 실 API를 호출한다.
export const exchangeOAuthCode = (
  provider: OAuthProvider,
  body: OAuthExchangeRequest,
): Promise<LoginResponse> =>
  apiRequest<LoginResponse>(`/api/auth/${provider}`, {
    method: 'POST',
    body: { ...body },
  });
