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
// footerText: 페이지행에 넣을 꼬리말(묵자, ≤200자). 역시 업로드 시점에 확정된다(2026-08-07).
export const createJob = async (
  file: File,
  mode: JobMode,
  token?: string | null,
  insertPageNumber = false,
  footerText?: string | null,
): Promise<CreateJobResponse> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('mode', mode);
  formData.append('insertPageNumber', String(insertPageNumber));
  // 선택 항목이라 빈 값은 보내지 않는다 — 미전송 시 서버가 footer_text를 null로 기록한다.
  const footer = footerText?.trim();
  if (footer) formData.append('footerText', footer);

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
// 배열에 없는 기존 요소는 서버가 삭제 처리한다. id가 null이면 신규 블록.
// 키 이름은 반드시 `id`다 — `elementId`로 보내면 서버가 전부 신규로 보고 id를 새로 발급한다.
export interface PageElementInput {
  id: string | null;
  contents: string[];
}

// 저장 응답은 id 매핑용 최소 정보만 담는다(요소 상세는 페이지 조회 API 담당).
export interface SavedElement {
  id: string;
  contents: string[];
}

// PUT /api/jobs/{jobId}/pages/{pageNo}/elements
// V2의 요소 PATCH/POST/DELETE/order 4종을 이 하나가 대체한다.
// 편집 대상(text_list / braille_text_list)은 서버가 mode로 판정하므로 body에 elementType이 없다.
export const savePageElements = (
  jobId: string,
  pageNo: number,
  elements: PageElementInput[],
  token?: string | null,
): Promise<SavedElement[]> =>
  apiRequest<SavedElement[]>(`/api/jobs/${jobId}/pages/${pageNo}/elements`, {
    method: 'PUT',
    token,
    body: { elements },
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
// 모드 b/c → .brf(braille-assist 조판), 모드 a → .txt(BE 병합).
// 조판이 로컬 연산이라 "수정 시 재처리" 분기가 없다 — 항상 DB의 현재 편집본으로 즉시 생성된다.
// 그래서 FE는 호출 전에 페이지 일괄 저장(PUT)을 먼저 끝내야 한다(미저장 편집분은 빠진다).
// 응답은 바이너리 스트림 + Content-Disposition(RFC 5987 한글 파일명).
// 에러: 404 JOB4001 / 409 JOB4010(변환 중) / 400 JOB4012(변환 결과 없음).
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

// 점역으로 보내기(`POST /api/jobs/{jobId}/send-to-braille`)는 BE에서 만들지 않기로 했다.
// FE가 교정된 전체 페이지를 합쳐 모드 b Job으로 재업로드한다 — `utils/mergePages` 참고.
