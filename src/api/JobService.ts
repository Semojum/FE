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
