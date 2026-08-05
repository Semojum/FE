// src/api/JobService.ts
import {
  CreateJobResponse,
  JobMode,
  JobStatusResponse,
} from '../types/apiTypes';
import {
  apiRequest,
  apiRequestBinary,
  API_BASE_URL,
  BinaryResponse,
} from './apiClient';

// 다른 모듈(UseJobStream, 테스트 등)이 기존 경로로 import하던 것을 유지하기 위해 재노출.
export { API_BASE_URL };

// 명세 elementType: a(text_list)=TEXT, b/c(braille_text_list)=BRAILLE
export type ElementType = 'TEXT' | 'BRAILLE';

// POST /api/jobs (multipart) — Authorization 필요.
// insertPageNumber: 점자 판면 마지막 줄에 쪽번호를 넣을지. 업로드 시점에 확정된다(2026-08-04).
export const createJob = async (
  file: File,
  mode: JobMode,
  token?: string | null,
  insertPageNumber = false,
): Promise<CreateJobResponse> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('mode', mode);
  formData.append('insertPageNumber', String(insertPageNumber));

  return apiRequest<CreateJobResponse>('/api/jobs', {
    method: 'POST',
    body: formData,
    token,
  });
};

// GET /api/jobs/{jobId}/status — SSE의 폴링 대체/보조용
export const getJobStatus = (
  jobId: string,
  token?: string | null,
): Promise<JobStatusResponse> =>
  apiRequest<JobStatusResponse>(`/api/jobs/${jobId}/status`, { token });

// ─── 편집 저장 (V3: 페이지 단위 일괄 저장) ─────────────────────────────

// 배열이 그 페이지의 최종 상태 전체다. 배열 순서 = 최종 reading_order이고,
// 배열에 없는 기존 요소는 서버가 삭제 처리한다. elementId가 null이면 신규 블록.
export interface PageElementInput {
  elementId: string | null;
  contents: string[];
  type?: string;
}

export interface SavePageResult {
  savedCount: number;
  // 요청 배열과 같은 순서로 확정된 element id — 배열 위치로 신규 블록의 정식 id를 매핑한다.
  elementIds: string[];
  editLogged: { edited: number; added: number; deleted: number };
}

// PUT /api/jobs/{jobId}/pages/{pageNo}/elements
// V2의 요소 PATCH/POST/DELETE/order 4종을 이 하나가 대체한다.
export const savePageElements = (
  jobId: string,
  pageNo: number,
  elementType: ElementType,
  elements: PageElementInput[],
  token?: string | null,
): Promise<SavePageResult> =>
  apiRequest<SavePageResult>(`/api/jobs/${jobId}/pages/${pageNo}/elements`, {
    method: 'PUT',
    token,
    body: { elementType, elements },
  });

// PATCH /api/jobs/{jobId}/pages/{pageNo}/elements/{elementId}/draft
// selectedIdx: 0부터의 draft 인덱스. -1이면 선택 해제하고 AI 원본(original)으로 되돌린다.
export const selectDraft = (
  jobId: string,
  pageNo: number,
  elementId: string,
  elementType: ElementType,
  selectedIdx: number,
  token?: string | null,
): Promise<{ elementId: string; selectedIdx: number; contents: string[] }> =>
  apiRequest(`/api/jobs/${jobId}/pages/${pageNo}/elements/${elementId}/draft`, {
    method: 'PATCH',
    token,
    body: { elementType, selectedIdx },
  });

// ─── 목록 조작 ────────────────────────────────────────────────────────

// PATCH /api/jobs/{jobId} — 파일 이름 변경. 파일당 이름은 하나뿐(2026-08-03 팀 결정).
// 변환 중(PENDING·IN_PROGRESS)이면 409 JOB4010.
export const renameJob = (
  jobId: string,
  fileName: string,
  token: string,
): Promise<{ jobId: string; fileName: string }> =>
  apiRequest(`/api/jobs/${jobId}`, {
    method: 'PATCH',
    token,
    body: { fileName },
  });

// POST /api/jobs/move — 벌크(1개여도 길이 1 배열). 전체 성공 또는 전체 롤백.
// targetFolderId가 null이면 루트(전체)로 이동.
export const moveJobs = (
  jobIds: string[],
  targetFolderId: string | null,
  token: string,
): Promise<{ movedCount: number; targetFolderId: string | null }> =>
  apiRequest('/api/jobs/move', {
    method: 'POST',
    token,
    body: { jobIds, targetFolderId },
  });

// POST /api/jobs/trash — 휴지통으로 일괄 이동(soft delete, 30일 보관).
// DELETE가 아닌 이유: 배열 본문을 받는 벌크라 POST로 통일했다(명세).
export const trashJobs = (
  jobIds: string[],
  token: string,
): Promise<{ trashedCount: number }> =>
  apiRequest('/api/jobs/trash', {
    method: 'POST',
    token,
    body: { jobIds },
  });

// PATCH /api/jobs/{jobId}/favorite — 현재 값의 반대로 전환.
// 카드 날짜(lastModifiedAt)는 갱신되지 않는다.
export const toggleJobFavorite = (
  jobId: string,
  token: string,
): Promise<{ jobId: string; isFavorite: boolean }> =>
  apiRequest(`/api/jobs/${jobId}/favorite`, { method: 'PATCH', token });

// ─── 산출물 ──────────────────────────────────────────────────────────

// POST /api/jobs/{jobId}/download — 전체 페이지를 reading_order대로 병합한 파일.
// 모드 b/c → .brf, 모드 a → .txt. 수정 이력이 있으면 서버가 AI 조판을 재처리한다(수 초).
// 응답은 바이너리 스트림 + Content-Disposition(RFC 5987 한글 파일명).
export const downloadJobResult = (
  jobId: string,
  fileName: string | undefined,
  token: string,
): Promise<BinaryResponse> =>
  apiRequestBinary(`/api/jobs/${jobId}/download`, {
    method: 'POST',
    token,
    body: fileName ? { fileName } : {},
  });

export interface SendToBrailleResult {
  newJobId: string;
  // 덮어쓰기로 보관된 기존 Job (없으면 null)
  archivedJobId: string | null;
  totalPages: number;
}

// POST /api/jobs/{jobId}/send-to-braille — 모드 a 교정 결과를 병합해 모드 b Job 생성.
// 기존 연결 문서가 있으면 overwrite 없이 호출 시 409 JOB4011 → 확인 모달 후 재호출.
export const sendToBraille = (
  jobId: string,
  overwrite: boolean,
  token: string,
): Promise<SendToBrailleResult> =>
  apiRequest(`/api/jobs/${jobId}/send-to-braille`, {
    method: 'POST',
    token,
    body: { overwrite },
  });
