import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createJob,
  getJobStatus,
  moveJobs,
  renameJob,
  savePageElements,
  selectDraft,
  sendToBraille,
  toggleJobFavorite,
  trashJobs,
} from '../JobService';
import { API_BASE_URL } from '../apiClient';

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
    expect(body.get('insertPageNumber')).toBe('false');
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

describe('JobService.savePageElements (V3 페이지 일괄 저장)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('PUTs the whole page as the final state', async () => {
    fetchSpy.mockResolvedValue(
      makeJsonResponse(
        200,
        envelope({
          savedCount: 2,
          elementIds: ['el-1', 'el-new-8f2a'],
          editLogged: { edited: 1, added: 1, deleted: 0 },
        }),
      ),
    );

    const res = await savePageElements(
      'j1',
      2,
      'BRAILLE',
      [
        { elementId: 'el-1', contents: ['⠟'] },
        { elementId: null, contents: ['새 블록'] },
      ],
      'tok',
    );

    // 신규 블록의 정식 id는 요청 배열과 같은 순서로 돌아온다.
    expect(res.elementIds).toEqual(['el-1', 'el-new-8f2a']);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/api/jobs/j1/pages/2/elements`);
    expect((init as RequestInit).method).toBe('PUT');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      elementType: 'BRAILLE',
      elements: [
        { elementId: 'el-1', contents: ['⠟'] },
        { elementId: null, contents: ['새 블록'] },
      ],
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
      savePageElements('j1', 1, 'BRAILLE', [
        { elementId: 'el-1', contents: ['x'] },
      ]),
    ).rejects.toMatchObject({ code: 'JOB4005', status: 400 });
  });
});

describe('JobService.selectDraft', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('PATCHes the draft index', async () => {
    fetchSpy.mockResolvedValue(
      makeJsonResponse(
        200,
        envelope({ elementId: 'el-2', selectedIdx: 1, contents: ['후보'] }),
      ),
    );

    const res = await selectDraft('j1', 1, 'el-2', 'BRAILLE', 1, 'tok');

    expect(res.selectedIdx).toBe(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/api/jobs/j1/pages/1/elements/el-2/draft`);
    expect((init as RequestInit).method).toBe('PATCH');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      elementType: 'BRAILLE',
      selectedIdx: 1,
    });
  });

  it('sends selectedIdx=-1 to swap back to the AI original', async () => {
    fetchSpy.mockResolvedValue(
      makeJsonResponse(
        200,
        envelope({ elementId: 'el-2', selectedIdx: -1, contents: ['원본'] }),
      ),
    );

    await selectDraft('j1', 1, 'el-2', 'TEXT', -1);
    const [, init] = fetchSpy.mock.calls[0];
    expect(JSON.parse((init as RequestInit).body as string).selectedIdx).toBe(
      -1,
    );
  });
});

describe('JobService 목록 조작 (이동 · 삭제 · 이름 · 즐겨찾기)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('moveJobs POSTs the id array (1개여도 길이 1)', async () => {
    fetchSpy.mockResolvedValue(
      makeJsonResponse(200, envelope({ movedCount: 1, targetFolderId: 'f1' })),
    );

    await moveJobs(['job_1'], 'f1', 'tok');

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/api/jobs/move`);
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      jobIds: ['job_1'],
      targetFolderId: 'f1',
    });
  });

  it('moveJobs sends targetFolderId=null to move to the root', async () => {
    fetchSpy.mockResolvedValue(
      makeJsonResponse(200, envelope({ movedCount: 2, targetFolderId: null })),
    );
    await moveJobs(['a', 'b'], null, 'tok');
    const [, init] = fetchSpy.mock.calls[0];
    expect(
      JSON.parse((init as RequestInit).body as string).targetFolderId,
    ).toBe(null);
  });

  it('moveJobs throws JOB4010 when the batch contains a converting job', async () => {
    fetchSpy.mockResolvedValue(
      makeJsonResponse(
        409,
        envelope(null, {
          isSuccess: false,
          code: 'JOB4010',
          message: '변환 중인 작업입니다.',
        }),
      ),
    );
    await expect(moveJobs(['a'], null, 'tok')).rejects.toMatchObject({
      code: 'JOB4010',
      status: 409,
    });
  });

  it('trashJobs POSTs to /api/jobs/trash (DELETE가 아니다)', async () => {
    fetchSpy.mockResolvedValue(
      makeJsonResponse(200, envelope({ trashedCount: 1 })),
    );

    await trashJobs(['job_1'], 'tok');

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/api/jobs/trash`);
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      jobIds: ['job_1'],
    });
  });

  it('renameJob PATCHes fileName', async () => {
    fetchSpy.mockResolvedValue(
      makeJsonResponse(200, envelope({ jobId: 'j1', fileName: '새이름.pdf' })),
    );

    await renameJob('j1', '새이름.pdf', 'tok');

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/api/jobs/j1`);
    expect((init as RequestInit).method).toBe('PATCH');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      fileName: '새이름.pdf',
    });
  });

  it('toggleJobFavorite PATCHes without a body', async () => {
    fetchSpy.mockResolvedValue(
      makeJsonResponse(200, envelope({ jobId: 'j1', isFavorite: true })),
    );

    const res = await toggleJobFavorite('j1', 'tok');

    expect(res.isFavorite).toBe(true);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/api/jobs/j1/favorite`);
    expect((init as RequestInit).method).toBe('PATCH');
  });
});

describe('JobService.sendToBraille', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('POSTs overwrite=false first', async () => {
    fetchSpy.mockResolvedValue(
      makeJsonResponse(
        200,
        envelope({ newJobId: 'job_new', archivedJobId: null, totalPages: 8 }),
      ),
    );

    const res = await sendToBraille('job_a', false, 'tok');

    expect(res.newJobId).toBe('job_new');
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/api/jobs/job_a/send-to-braille`);
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      overwrite: false,
    });
  });

  it('throws JOB4011 when a linked document already exists', async () => {
    fetchSpy.mockResolvedValue(
      makeJsonResponse(
        409,
        envelope(null, {
          isSuccess: false,
          code: 'JOB4011',
          message: '기존 연결 문서가 있습니다.',
        }),
      ),
    );

    await expect(sendToBraille('job_a', false, 'tok')).rejects.toMatchObject({
      code: 'JOB4011',
      status: 409,
    });
  });
});
