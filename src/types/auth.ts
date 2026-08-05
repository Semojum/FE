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

// 작업을 복원할 때 필요한 최소 정보. 마이페이지 카드(FileCard)와 재시작 복구
// 목록(ActiveJob) 양쪽에서 만들어 넘긴다.
export interface JobRef {
  jobId: string;
  mode: JobMode; // 'a' | 'b' | 'c'
  totalPages: number;
  thumbnailUrl?: string | null;
  // 복원 후 이동할 페이지. 없으면 1페이지.
  startPage?: number | null;
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
  // 업로드 시 선택한 쪽번호 삽입 여부 — 에디터 격자를 26줄 전체로 그릴지,
  // 본문 25줄 + 마지막 줄 쪽번호로 그릴지 판단하는 기준.
  insertPageNumber?: boolean;
  result: StreamPageResult;
  original?: JobPageOriginal;
}

// 마이페이지에서 불러온 작업을 앱 내부 상태로 복원한 형태.
// 서버는 페이지별로 결과를 내려주므로 클라이언트에서 페이지들을 합쳐 구성한다.
export interface JobDetail {
  jobId: string; // 페이지 일괄 저장(PUT) 대상 식별용
  mode: ConversionTab;
  totalPages: number;
  // 복원 직후 이동할 페이지(재시작 복구의 lastEditedPage). 없으면 1페이지.
  startPage?: number;
  // 업로드 시 쪽번호 삽입을 선택했는지 — 결과 렌더링 격자 기준
  insertPageNumber?: boolean;
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
