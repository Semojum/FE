import {
  LoginResponse,
  OAuthExchangeRequest,
  OAuthProvider,
  RefreshResponse,
  SignupResponse,
} from '../types/auth';
import { apiRequest } from './apiClient';

export type { OAuthProvider } from '../types/auth';

// POST /api/auth/signup — 가입 성공 시 { email, name } 반환 (토큰 없음)
export const signup = (
  email: string,
  password: string,
  name: string,
): Promise<SignupResponse> =>
  apiRequest<SignupResponse>('/api/auth/signup', {
    method: 'POST',
    body: { email, name, password },
  });

// POST /api/auth/login — { accessToken, refreshToken } 반환
export const login = (
  email: string,
  password: string,
): Promise<LoginResponse> =>
  apiRequest<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  });

// POST /api/auth/logout — Authorization 헤더 + body{refreshToken}. result는 null.
export const logout = (token: string, refreshToken: string): Promise<null> =>
  apiRequest<null>('/api/auth/logout', {
    method: 'POST',
    token,
    body: { refreshToken },
  });

// POST /api/auth/refresh — Authorization 헤더 + body{refreshToken}. { accessToken } 반환.
export const refresh = (
  token: string | null,
  refreshToken: string,
): Promise<RefreshResponse> =>
  apiRequest<RefreshResponse>('/api/auth/refresh', {
    method: 'POST',
    token,
    body: { refreshToken },
  });

// POST /api/auth/{kakao|google} — 클라이언트가 받은 code를 토큰으로 교환.
export const exchangeOAuthCode = (
  provider: OAuthProvider,
  body: OAuthExchangeRequest,
): Promise<LoginResponse> =>
  apiRequest<LoginResponse>(`/api/auth/${provider}`, {
    method: 'POST',
    body: { ...body },
  });
