import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createElement,
  createJob,
  deleteElement,
  getJobStatus,
  patchElement,
  reorderElements,
} from '../JobService';
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

describe('JobService.patchElement', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('PATCHes elementType/contents and unwraps result', async () => {
    fetchSpy.mockResolvedValue(makeJsonResponse(200, envelope(['⠟', '⠠⠍'])));

    const res = await patchElement('j1', 2, 'el-1', 'BRAILLE', ['⠟', '⠠⠍'], 'tok');

    expect(res).toEqual(['⠟', '⠠⠍']);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/api/jobs/j1/pages/2/elements/el-1`);
    expect((init as RequestInit).method).toBe('PATCH');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      elementType: 'BRAILLE',
      contents: ['⠟', '⠠⠍'],
    });
  });

  it('throws ApiError on JOB4005 (잘못된 elementType)', async () => {
    fetchSpy.mockResolvedValue(
      makeJsonResponse(
        400,
        envelope(null, {
          isSuccess: false,
          code: 'JOB4005',
          message: 'elementType은 TEXT 또는 BRAILLE만 허용됩니다.',
        }),
      ),
    );

    await expect(
      patchElement('j1', 1, 'el-1', 'BRAILLE', ['x']),
    ).rejects.toMatchObject({ code: 'JOB4005', status: 400 });
  });
});

describe('JobService 블록 추가/삭제/순서변경', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('createElement POSTs elementType/contents/afterElementId and returns the issued id', async () => {
    fetchSpy.mockResolvedValue(
      makeJsonResponse(200, envelope({ id: 'srv-9', contents: ['새 블록'] })),
    );

    const res = await createElement(
      'j1',
      2,
      'TEXT',
      ['새 블록'],
      'el-prev',
      'tok',
    );

    expect(res).toEqual({ id: 'srv-9', contents: ['새 블록'] });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/api/jobs/j1/pages/2/elements`);
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      elementType: 'TEXT',
      contents: ['새 블록'],
      afterElementId: 'el-prev',
    });
  });

  it('createElement sends afterElementId=null to insert at the top of the page', async () => {
    fetchSpy.mockResolvedValue(
      makeJsonResponse(200, envelope({ id: 'srv-1', contents: [''] })),
    );

    await createElement('j1', 1, 'BRAILLE', [''], null);
    const [, init] = fetchSpy.mock.calls[0];
    expect(JSON.parse((init as RequestInit).body as string).afterElementId).toBe(
      null,
    );
  });

  it('deleteElement DELETEs with the elementType query (없으면 서버가 500)', async () => {
    fetchSpy.mockResolvedValue(makeJsonResponse(200, envelope(null)));

    await deleteElement('j1', 3, 'el-1', 'BRAILLE', 'tok');

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(
      `${API_BASE_URL}/api/jobs/j1/pages/3/elements/el-1?elementType=BRAILLE`,
    );
    expect((init as RequestInit).method).toBe('DELETE');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok');
  });

  it('deleteElement throws JOB4004 when the element is already deleted', async () => {
    fetchSpy.mockResolvedValue(
      makeJsonResponse(
        404,
        envelope(null, {
          isSuccess: false,
          code: 'JOB4004',
          message: '존재하지 않는 요소입니다.',
        }),
      ),
    );

    await expect(
      deleteElement('j1', 1, 'gone', 'BRAILLE'),
    ).rejects.toMatchObject({ code: 'JOB4004', status: 404 });
  });

  it('reorderElements PATCHes the full ordered id list', async () => {
    const ids = ['el-3', 'el-1', 'el-2'];
    fetchSpy.mockResolvedValue(makeJsonResponse(200, envelope(ids)));

    const res = await reorderElements('j1', 1, 'BRAILLE', ids, 'tok');

    expect(res).toEqual(ids);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/api/jobs/j1/pages/1/elements/order`);
    expect((init as RequestInit).method).toBe('PATCH');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      elementType: 'BRAILLE',
      orderedElementIds: ids,
    });
  });

  it('reorderElements throws JOB4006 when the id list is not a full permutation', async () => {
    fetchSpy.mockResolvedValue(
      makeJsonResponse(
        400,
        envelope(null, {
          isSuccess: false,
          code: 'JOB4006',
          message: '순서 목록이 현재 페이지의 요소와 일치하지 않습니다.',
        }),
      ),
    );

    await expect(
      reorderElements('j1', 1, 'BRAILLE', ['el-1']),
    ).rejects.toMatchObject({ code: 'JOB4006', status: 400 });
  });
});
