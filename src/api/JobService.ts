// src/api/JobService.ts
import {
  CreateJobResponse,
  JobMode,
  JobStatusResponse,
} from '../types/apiTypes';
import { apiRequest, API_BASE_URL } from './apiClient';

// 다른 모듈(UseJobStream, 테스트 등)이 기존 경로로 import하던 것을 유지하기 위해 재노출.
export { API_BASE_URL };

// POST /api/jobs (multipart) — Authorization 필요
export const createJob = async (
  file: File,
  mode: JobMode,
  token?: string | null,
): Promise<CreateJobResponse> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('mode', mode);

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

// PATCH /api/jobs/{jobId}/pages/{pageNo}/elements/{elementId} — 요소 편집 저장.
// 모드별 수정 대상: a(text_list)=TEXT, b/c(braille_text_list)=BRAILLE.
// 현재값(contents)만 교체되며 AI 원본과 수정 이력은 서버가 보존한다.
export type ElementType = 'TEXT' | 'BRAILLE';

export const patchElement = (
  jobId: string,
  pageNo: number,
  elementId: string,
  elementType: ElementType,
  contents: string[],
  token?: string | null,
): Promise<string[]> =>
  apiRequest<string[]>(
    `/api/jobs/${jobId}/pages/${pageNo}/elements/${elementId}`,
    {
      method: 'PATCH',
      token,
      body: { elementType, contents },
    },
  );

// POST /api/jobs/{jobId}/pages/{pageNo}/elements — 블록 추가.
// afterElementId 뒤에 삽입되며 null이면 페이지 맨 앞. 요소 ID는 서버가 발급하고
// (응답 result.id) 읽기 순서는 삽입 후 서버가 1..N으로 재번호한다.
export interface CreatedElement {
  id: string;
  contents: string[];
}

export const createElement = (
  jobId: string,
  pageNo: number,
  elementType: ElementType,
  contents: string[],
  afterElementId: string | null,
  token?: string | null,
): Promise<CreatedElement> =>
  apiRequest<CreatedElement>(`/api/jobs/${jobId}/pages/${pageNo}/elements`, {
    method: 'POST',
    token,
    body: { elementType, contents, afterElementId },
  });

// DELETE /api/jobs/{jobId}/pages/{pageNo}/elements/{elementId}?elementType=... — 블록 삭제.
// soft-delete이며 남은 블록의 순서는 서버가 재번호한다. 이미 삭제된 요소는 JOB4004.
// (elementType 쿼리를 빼면 실서버가 500을 주므로 항상 붙인다.)
export const deleteElement = (
  jobId: string,
  pageNo: number,
  elementId: string,
  elementType: ElementType,
  token?: string | null,
): Promise<null> =>
  apiRequest<null>(
    `/api/jobs/${jobId}/pages/${pageNo}/elements/${elementId}?elementType=${elementType}`,
    { method: 'DELETE', token },
  );

// PATCH /api/jobs/{jobId}/pages/{pageNo}/elements/order — 블록 순서변경.
// orderedElementIds는 그 페이지의 "살아있는 요소 전체의 순열"이어야 한다.
// 누락/중복/미지의 ID가 있으면 JOB4006.
export const reorderElements = (
  jobId: string,
  pageNo: number,
  elementType: ElementType,
  orderedElementIds: string[],
  token?: string | null,
): Promise<string[]> =>
  apiRequest<string[]>(
    `/api/jobs/${jobId}/pages/${pageNo}/elements/order`,
    {
      method: 'PATCH',
      token,
      body: { elementType, orderedElementIds },
    },
  );
