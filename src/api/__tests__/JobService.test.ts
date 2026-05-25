import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createJob, getJobStatus } from '../JobService';
import { API_BASE_URL } from '../apiClient';

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

const makeTextResponse = (status: number, body: string): Response =>
  new Response(body, {
    status,
    headers: { 'content-type': 'text/html' },
  });

describe('JobService.createJob', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('POSTs multipart formdata to /api/jobs and unwraps result', async () => {
    fetchSpy.mockResolvedValue(
      makeJsonResponse(
        200,
        envelope({ jobId: 'j1', mode: 'a', totalPages: 5, status: 'PENDING' }),
      ),
    );

    const file = new File(['hi'], 'test.txt', { type: 'text/plain' });
    const res = await createJob(file, 'a', 'tok-123');

    expect(res).toEqual({
      jobId: 'j1',
      mode: 'a',
      totalPages: 5,
      status: 'PENDING',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/api/jobs`);
    expect((init as RequestInit).method).toBe('POST');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok-123');
    const body = (init as RequestInit).body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('mode')).toBe('a');
    expect((body.get('file') as File).name).toBe('test.txt');
  });

  it('throws ApiError on isSuccess=false envelope', async () => {
    fetchSpy.mockResolvedValue(
      makeJsonResponse(
        400,
        envelope(null, {
          isSuccess: false,
          code: 'JOB4002',
          message: '잘못된 파일 형식',
        }),
      ),
    );

    const file = new File(['x'], 'x.pdf', { type: 'application/pdf' });
    await expect(createJob(file, 'c')).rejects.toMatchObject({
      code: 'JOB4002',
      status: 400,
    });
  });

  it('throws when response is not JSON (SPA fallback HTML)', async () => {
    fetchSpy.mockResolvedValue(
      makeTextResponse(200, '<!DOCTYPE html><html>bad</html>'),
    );

    const file = new File(['x'], 'x.png', { type: 'image/png' });
    await expect(createJob(file, 'a')).rejects.toThrow(/JSON/);
  });

  it('propagates network error', async () => {
    fetchSpy.mockRejectedValue(new TypeError('Network error'));
    const file = new File(['x'], 'x.txt');
    await expect(createJob(file, 'a')).rejects.toThrow('Network error');
  });
});

describe('JobService.getJobStatus', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('GETs /api/jobs/{id}/status and unwraps result', async () => {
    fetchSpy.mockResolvedValue(
      makeJsonResponse(
        200,
        envelope({
          jobId: 'j1',
          totalPages: 5,
          completedPages: 3,
          pendingPages: 1,
          runningPages: 1,
          overallStatus: 'IN_PROGRESS',
          pages: { 'page:1': 'COMPLETED' },
        }),
      ),
    );

    const res = await getJobStatus('j1', 'tok');
    expect(res.overallStatus).toBe('IN_PROGRESS');
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/api/jobs/j1/status`);
  });
});
