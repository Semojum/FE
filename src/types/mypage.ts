// 마이페이지(V3 디렉토리) 응답 타입.
// 조회 3경로가 모두 { folders, files } 형태로 통일돼 있어 화면은 같은 방식으로 그린다.
//  - GET /api/folders/contents            → 최상위 폴더 + 루트 파일 (S1)
//  - GET /api/folders/{folderId}/contents → 그 폴더 안 (S2)
//  - GET /api/users/jobs                  → 위치 무관 전역 (S9 · 검색)

import { JobMode } from './apiTypes';

export type JobStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

// 변환 중이라 이동·이름변경·삭제·다운로드가 막히는 상태 (BE도 JOB4010으로 검증한다)
export const isInProgress = (status: JobStatus): boolean =>
  status === 'PENDING' || status === 'IN_PROGRESS';

export interface FolderSummary {
  folderId: string;
  name: string;
  isFavorite: boolean;
  createdAt: string;
  // 전역 조회(GET /api/users/jobs)에서만 내려온다 — 같은 이름의 폴더를 구분하는 용도.
  folderPath?: string | null;
}

// GET /api/folders/tree — children 재귀(최대 5단계)
export interface FolderTreeNode extends FolderSummary {
  children: FolderTreeNode[];
}

export interface FileCard {
  jobId: string;
  mode: JobMode;
  status: JobStatus;
  originalFileName: string;
  thumbnailUrl: string | null;
  // 카드에 그대로 출력하는 날짜 문자열 — 서버(KST)가 계산해 내려준다.
  displayDate: string;
  totalPages: number;
  lastEditedPage: number | null;
  isFavorite: boolean;
  folderId: string | null;
  folderPath: string | null;
  // 목록 응답에는 없지만 상태 폴링(GET /api/jobs/{id}/status)으로 채워 넣는 진행률.
  progress?: number;
}

export interface FilePage {
  items: FileCard[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface DirectoryContents {
  folders: FolderSummary[];
  files: FilePage;
}

// 목록 조회 공통 쿼리 — 세 경로가 같은 파라미터를 받는다.
export interface ListQuery {
  search?: string;
  status?: JobStatus[];
  mode?: JobMode[];
  favorite?: boolean;
  sort?: 'latest' | 'oldest';
  cursor?: string | null;
  size?: number;
}

// GET /api/trash
export interface TrashItem {
  type: 'FOLDER' | 'JOB';
  id: string;
  name: string;
  // 폴더면 함께 삭제된 작업 수, JOB이면 null
  itemCount: number | null;
  deletedAt: string;
  // 완전 삭제 예정 시각 (deletedAt + 30일) — D-day 표기용
  expiresAt: string;
}

// GET /api/users/jobs/active — 재시작 복구 전용 형식 (목록 카드와 다르다)
export interface ActiveJob {
  jobId: string;
  mode: JobMode;
  status: JobStatus;
  totalPages: number;
  originalFileName: string;
  progress: number;
  lastModifiedAt: string;
  // 페이지 일괄 저장 전에는 null — FE는 1페이지로 폴백한다.
  lastEditedPage: number | null;
}

// 폴더 제한값 (API 명세 "폴더 생성" 콜아웃)
export const FOLDER_LIMITS = {
  nameMaxLength: 50,
  maxDepth: 5,
  maxCount: 200,
} as const;

// 파일 보관 상한 (마이페이지 D-2) — 초과 시 오래된 순으로 자동 삭제됨을 알린다.
export const FILE_STORAGE_LIMIT = 1000;

// 목록 페이지 크기 (기획: 30개씩 추가 로딩)
export const PAGE_SIZE = 30;
