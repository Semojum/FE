import { JobPageResponse } from '../types/auth';
import {
  ActiveJob,
  DirectoryContents,
  FilePage,
  ListQuery,
} from '../types/mypage';
import { apiRequest } from './apiClient';
import {
  buildListQuery,
  normalizeContents,
  normalizeFilePage,
  RawFilePage,
} from './FolderService';

// GET /api/users/jobs — 위치 무관 전역 조회(전체보기 S9 · 검색 S7).
// V3에서 result가 배열 → { folders, files } 객체로 바뀌었다.
export const listJobs = async (
  token: string,
  query: ListQuery = {},
): Promise<DirectoryContents> =>
  normalizeContents(
    await apiRequest(`/api/users/jobs${buildListQuery(query)}`, { token }),
  );

// GET /api/users/jobs/recent — 위치 무관 전역에서 '파일만' 최신순.
// 폴더를 내려주지 않고 정렬은 최신순 고정·필터도 없다(명세: 최근 작업 조회).
// 첫 화면 스트립(size=5)과 최근 작업 전체(S9)가 함께 쓰는 API다.
export const listRecentJobs = async (
  token: string,
  query: Pick<ListQuery, 'cursor' | 'size'> = {},
): Promise<FilePage> =>
  normalizeFilePage(
    await apiRequest<RawFilePage>(
      `/api/users/jobs/recent${buildListQuery(query)}`,
      { token },
    ),
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
