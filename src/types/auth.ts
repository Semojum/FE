import {
  BoundingBox,
  ConversionTab,
  ImageResolution,
  OriginalTextBlock,
  TranslationBlock,
} from './index';
import { JobMode, StreamPageResult } from './apiTypes';

// V3: 계정은 운영자가 발급한다. 사용자가 만들 수 있는 정보(이메일·이름)가 없고
// 화면에 노출하는 식별자는 loginId 하나뿐이다.
export interface User {
  loginId: string;
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

// 페이지 응답의 원본 입력 정보.
//  - 점역(b): type 'text', lines에 원본 텍스트 줄 목록 (url은 null)
//  - 이미지(a/c): type 'image', url에 원본 이미지 (lines는 null)
export interface JobPageOriginal {
  type: string;
  url: string | null;
  lines: string[] | null;
}

// GET /api/users/jobs/{jobId}/pages/{pageNo} 응답 (result).
// 내부 result는 SSE page_done의 result와 동일한 구조.
// original은 원본 입력(점역 모드는 text_list가 비고 여기로 내려온다).
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
  original?: JobPageOriginal;
}

// 마이페이지에서 불러온 작업을 앱 내부 상태로 복원한 형태.
// 서버는 페이지별로 결과를 내려주므로 클라이언트에서 페이지들을 합쳐 구성한다.
export interface JobDetail {
  jobId: string; // 요소 편집(PATCH) 저장 대상 식별용
  mode: ConversionTab;
  totalPages: number;
  // 변환에 실패한 페이지 번호 — 복원 시 해당 페이지에 실패 안내를 띄운다.
  failedPages: number[];
  blocksByPage: Record<number, TranslationBlock[]>;
  bboxDataByPage: Record<number, BoundingBox[]>;
  originalTextsByPage: Record<number, OriginalTextBlock[]>;
  imgResolution: ImageResolution;
  // 입력 미리보기용 썸네일(이미지 모드 a/c). 서버는 원본 파일을 보관하지 않는다.
  thumbnailUrl?: string;
  // 페이지별 원본 입력(명세 #11 original). 이미지 모드(a/c)는 페이지별 PDF URL이 들어와
  // 페이지 전환 시 왼쪽 미리보기를 해당 페이지 원본으로 교체하는 데 쓴다.
  originalByPage?: Record<number, JobPageOriginal>;
}
