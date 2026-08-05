import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { listActiveJobs, listJobs, getJobPage } from '../HistoryService';
import { API_BASE_URL } from '../apiClient';
import type { DirectoryContents } from '../../types/mypage';

const envelope = (
  result: unknown,
  overrides: Record<string, unknown> = {},
) => ({
  isSuccess: true,
  code: 'COMMON2000',
  message: '성공입니다.',
  result,
  ...overrides,
});

const makeJsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

// V3: result가 배열 → { folders, files } 객체로 바뀌었다.
const sampleContents: DirectoryContents = {
  folders: [
    {
      folderId: 'e102a515-5b7e-4a12-9baf-8547189374be',
      name: '1학기',
      isFavorite: false,
      createdAt: '2026-08-05T10:49:17',
    },
  ],
  files: {
    items: [
      {
        jobId: 'job_260622213353_8465c6cfcb',
        mode: 'a',
        status: 'COMPLETED',
        originalFileName: '교과서.pdf',
        thumbnailUrl: null,
        displayDate: '7. 28.',
        totalPages: 5,
        lastEditedPage: 3,
        isFavorite: false,
        folderId: null,
        folderPath: null,
      },
    ],
    nextCursor: null,
    hasMore: false,
  },
};

describe('HistoryService', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('listJobs GETs /api/users/jobs with Bearer and unwraps { folders, files }', async () => {
    fetchSpy.mockResolvedValue(makeJsonResponse(200, envelope(sampleContents)));
    const res = await listJobs('tok');
    expect(res).toEqual(sampleContents);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/api/users/jobs`);
    expect((init as RequestInit).method ?? 'GET').toBe('GET');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok');
  });

  it('listJobs serializes search · sort · cursor · 복수 status/mode', async () => {
    fetchSpy.mockResolvedValue(makeJsonResponse(200, envelope(sampleContents)));
    await listJobs('tok', {
      search: '수학',
      status: ['COMPLETED', 'FAILED'],
      mode: ['a', 'b'],
      favorite: true,
      sort: 'oldest',
      cursor: 'MjAyNi0=',
      size: 30,
    });

    const url = new URL(fetchSpy.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/api/users/jobs');
    expect(url.searchParams.get('search')).toBe('수학');
    expect(url.searchParams.getAll('status')).toEqual(['COMPLETED', 'FAILED']);
    expect(url.searchParams.getAll('mode')).toEqual(['a', 'b']);
    expect(url.searchParams.get('favorite')).toBe('true');
    expect(url.searchParams.get('sort')).toBe('oldest');
    expect(url.searchParams.get('cursor')).toBe('MjAyNi0=');
    expect(url.searchParams.get('size')).toBe('30');
  });

  it('listActiveJobs GETs /api/users/jobs/active for restart recovery', async () => {
    fetchSpy.mockResolvedValue(
      makeJsonResponse(
        200,
        envelope([
          {
            jobId: 'job_1',
            mode: 'a',
            status: 'IN_PROGRESS',
            totalPages: 12,
            originalFileName: '확통.pdf',
            progress: 58,
            lastModifiedAt: '2026-08-02T10:25:33',
            lastEditedPage: 10,
          },
        ]),
      ),
    );

    const res = await listActiveJobs('tok');
    expect(res[0].lastEditedPage).toBe(10);
    expect(fetchSpy.mock.calls[0][0]).toBe(
      `${API_BASE_URL}/api/users/jobs/active`,
    );
  });

  it('getJobPage GETs /api/users/jobs/{id}/pages/{n} and unwraps result', async () => {
    const page = {
      jobId: 'j1',
      mode: 'b',
      status: 'COMPLETED',
      totalPages: 1,
      failedPages: [],
      originalFileName: 'x.txt',
      startedAt: '2026-06-02T23:31:55',
      finishedAt: null,
      pageNo: 1,
      result: {
        text_list: [],
        braille_text_list: [],
        quality_report: {
          ocr_confidence_avg: 0,
          line_overflow_rate: 0,
          critical_errors: [],
          review_flags: [],
        },
      },
    };
    fetchSpy.mockResolvedValue(makeJsonResponse(200, envelope(page)));
    const res = await getJobPage('tok', 'j1', 1);
    expect(res.pageNo).toBe(1);
    expect(fetchSpy.mock.calls[0][0]).toBe(
      `${API_BASE_URL}/api/users/jobs/j1/pages/1`,
    );
  });

  it('getJobPage throws ApiError on JOB4001 (page not ready)', async () => {
    fetchSpy.mockResolvedValue(
      makeJsonResponse(
        404,
        envelope(null, {
          isSuccess: false,
          code: 'JOB4001',
          message: '존재하지 않는 작업입니다.',
        }),
      ),
    );
    await expect(getJobPage('tok', 'j1', 9)).rejects.toMatchObject({
      code: 'JOB4001',
      status: 404,
    });
  });

  it('listJobs throws ApiError on 401', async () => {
    fetchSpy.mockResolvedValue(
      makeJsonResponse(
        401,
        envelope(null, {
          isSuccess: false,
          code: 'COMMON4001',
          message: '인증이 필요합니다.',
        }),
      ),
    );
    await expect(listJobs('bad')).rejects.toMatchObject({ status: 401 });
  });
});
