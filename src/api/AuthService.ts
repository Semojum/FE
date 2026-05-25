import { LoginResponse, SignupResponse } from '../types/auth';
import { mockBackend } from './MockBackend';
import { USE_MOCK_API } from './featureFlags';
import { apiRequest, API_BASE_URL } from './apiClient';

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

export type OAuthProvider = 'kakao' | 'google';

// 소셜 로그인은 브라우저가 직접 이동 → 완료 후
// {FE_URL}/oauth2/callback?accessToken=...&refreshToken=... 로 리다이렉트된다.
export const getOAuthUrl = (provider: OAuthProvider): string =>
  `${API_BASE_URL}/oauth2/authorization/${provider}`;
