import { JobPageResponse } from '../types/auth';
import { ActiveJob, DirectoryContents, ListQuery } from '../types/mypage';
import { apiRequest } from './apiClient';
import { buildListQuery, normalizeContents } from './FolderService';

// GET /api/users/jobs — 위치 무관 전역 조회(전체보기 S9 · 검색 S7).
// V3에서 result가 배열 → { folders, files } 객체로 바뀌었다.
export const listJobs = async (
  token: string,
  query: ListQuery = {},
): Promise<DirectoryContents> =>
  normalizeContents(
    await apiRequest(`/api/users/jobs${buildListQuery(query)}`, { token }),
  );

// GET /api/users/jobs/active — 진행 중(PENDING·IN_PROGRESS) 작업만 lastModifiedAt 최신순.
// 앱 재시작·네트워크 재연결 시 이 목록으로 SSE를 다시 붙이고 마지막 작업으로 복구한다.
export const listActiveJobs = (token: string): Promise<ActiveJob[]> =>
  apiRequest<ActiveJob[]>('/api/users/jobs/active', { token });

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
