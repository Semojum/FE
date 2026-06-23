import { JobPageResponse, JobSummary } from '../types/auth';
import { apiRequest } from './apiClient';

// GET /api/users/jobs — 내 작업 목록 (startedAt 내림차순)
export const listJobs = (token: string): Promise<JobSummary[]> =>
  apiRequest<JobSummary[]>('/api/users/jobs', { token });

// GET /api/users/jobs/{jobId}/pages/{pageNo} — 페이지별 변환 결과
// 아직 처리 전인 페이지는 JOB4001(404)을 반환한다.
export const getJobPage = (
  token: string,
  jobId: string,
  pageNo: number,
): Promise<JobPageResponse> =>
  apiRequest<JobPageResponse>(`/api/users/jobs/${jobId}/pages/${pageNo}`, {
    token,
  });
