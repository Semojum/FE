import {
  BoundingBox,
  ConversionTab,
  ImageResolution,
  OriginalTextBlock,
  TranslationBlock,
} from './index';
import { JobMode, StreamPageResult } from './apiTypes';

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

// GET /api/users/jobs 응답 (result 배열 항목) — 작업 생성 시 자동 적재된다.
export interface JobSummary {
  jobId: string;
  mode: JobMode; // 'a' | 'b' | 'c'
  status: string; // PENDING | IN_PROGRESS | COMPLETED
  totalPages: number;
  failedPages: number[];
  originalFileName: string;
  thumbnailUrl?: string;
  startedAt: string; // ISO 8601 (LocalDateTime)
  finishedAt: string | null;
}

// GET /api/users/jobs/{jobId}/pages/{pageNo} 응답 (result).
// 내부 result는 SSE page_done의 result와 동일한 구조.
export interface JobPageResponse {
  jobId: string;
  mode: JobMode;
  status: string;
  totalPages: number;
  failedPages: number[];
  originalFileName: string;
  startedAt: string;
  finishedAt: string | null;
  pageNo: number;
  result: StreamPageResult;
}

// 마이페이지에서 불러온 작업을 앱 내부 상태로 복원한 형태.
// 서버는 페이지별로 결과를 내려주므로 클라이언트에서 페이지들을 합쳐 구성한다.
export interface JobDetail {
  mode: ConversionTab;
  totalPages: number;
  blocksByPage: Record<number, TranslationBlock[]>;
  bboxDataByPage: Record<number, BoundingBox[]>;
  originalTextsByPage: Record<number, OriginalTextBlock[]>;
  imgResolution: ImageResolution;
  // 입력 미리보기용 썸네일(이미지 모드 a/c). 서버는 원본 파일을 보관하지 않는다.
  thumbnailUrl?: string;
}
