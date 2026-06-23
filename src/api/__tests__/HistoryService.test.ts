import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { listJobs, getJobPage } from '../HistoryService';
import { API_BASE_URL } from '../apiClient';
import type { JobSummary } from '../../types/auth';

const envelope = (result: unknown, overrides: Record<string, unknown> = {}) => ({
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

const sampleJob: JobSummary = {
  jobId: 'job_260622213353_8465c6cfcb',
  mode: 'a',
  status: 'COMPLETED',
  totalPages: 5,
  failedPages: [],
  originalFileName: '교과서.pdf',
  startedAt: '2026-06-02T23:31:55',
  finishedAt: '2026-06-02T23:45:00',
};

describe('HistoryService', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('listJobs GETs /api/users/jobs with Bearer and unwraps the array', async () => {
    fetchSpy.mockResolvedValue(makeJsonResponse(200, envelope([sampleJob])));
    const res = await listJobs('tok');
    expect(res).toEqual([sampleJob]);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/api/users/jobs`);
    expect((init as RequestInit).method ?? 'GET').toBe('GET');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok');
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
