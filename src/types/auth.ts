import {
  BoundingBox,
  ConversionTab,
  ImageResolution,
  OriginalTextBlock,
  TranslationBlock,
} from './index';

export interface User {
  id: string;
  email: string;
  name: string;
}

// POST /api/auth/signup 응답 (result) — 토큰을 발급하지 않는다.
export interface SignupResponse {
  email: string;
  name: string;
}

// POST /api/auth/login 응답 (result)
export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
}

// POST /api/auth/refresh 응답 (result) — accessToken만 재발급
export interface RefreshResponse {
  accessToken: string;
}

export type OAuthProvider = 'kakao' | 'google';

// POST /api/auth/{kakao|google} 요청 본문.
// 클라이언트가 OAuth2(+PKCE) 플로우로 받은 code를 BE에 넘겨 토큰으로 교환한다.
// kakao는 PKCE를 쓰지 않으므로 codeVerifier는 빈 문자열로 보낸다.
export interface OAuthExchangeRequest {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}

export interface JobSummary {
  id: string;
  title: string;
  mode: ConversionTab;
  fileName: string;
  createdAt: string; // ISO 8601
}

export interface JobDetail extends JobSummary {
  totalPages: number;
  blocksByPage: Record<number, TranslationBlock[]>;
  bboxDataByPage: Record<number, BoundingBox[]>;
  originalTextsByPage: Record<number, OriginalTextBlock[]>;
  imgResolution: ImageResolution;
}

export interface SaveJobInput {
  title: string;
  mode: ConversionTab;
  fileName: string;
  totalPages: number;
  blocksByPage: Record<number, TranslationBlock[]>;
  bboxDataByPage: Record<number, BoundingBox[]>;
  originalTextsByPage: Record<number, OriginalTextBlock[]>;
  imgResolution: ImageResolution;
}
