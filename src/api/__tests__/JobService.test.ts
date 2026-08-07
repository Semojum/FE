import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createJob,
  getJobStatus,
  moveJobs,
  renameJob,
  savePageElements,
  selectDraft,
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
    // 선택 항목이므로 빈 값일 때는 필드 자체를 보내지 않는다.
    expect(body.get('footerText')).toBeNull();
  });

  it('createJob sends trimmed footerText only when it has content', async () => {
    fetchSpy.mockResolvedValue(
      makeJsonResponse(
        200,
        envelope({
          jobId: 'j2',
          mode: 'b',
          totalPages: 3,
          status: 'PENDING',
          insertPageNumber: true,
          footerText: '수학 익힘책 1',
        }),
      ),
    );

    const file = new File(['hi'], 'book.hwp');
    await createJob(file, 'b', 'tok-123', true, '  수학 익힘책 1  ');

    const body = (fetchSpy.mock.calls[0][1] as RequestInit).body as FormData;
    expect(body.get('insertPageNumber')).toBe('true');
    expect(body.get('footerText')).toBe('수학 익힘책 1');
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
        envelope([
          { id: 'el-1', contents: ['⠟'] },
          { id: 'el-new-8f2a', contents: ['새 블록'] },
        ]),
      ),
    );

    const res = await savePageElements(
      'j1',
      2,
      [
        { id: 'el-1', contents: ['⠟'] },
        { id: null, contents: ['새 블록'] },
      ],
      'tok',
    );

    // 신규 블록의 정식 id는 요청 배열과 같은 순서로 돌아온다.
    expect(res.map((e) => e.id)).toEqual(['el-1', 'el-new-8f2a']);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/api/jobs/j1/pages/2/elements`);
    expect((init as RequestInit).method).toBe('PUT');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok');
    // 키는 elementId가 아니라 id다 — elementId로 보내면 서버가 전부 신규로 취급한다.
    // elementType은 명세에서 제거됐다(편집 대상은 서버가 mode로 판정).
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      elements: [
        { id: 'el-1', contents: ['⠟'] },
        { id: null, contents: ['새 블록'] },
      ],
    });
  });

  it('throws ApiError on JOB4004 (모르는 요소 id)', async () => {
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
      savePageElements('j1', 1, [{ id: 'el-gone', contents: ['x'] }]),
    ).rejects.toMatchObject({ code: 'JOB4004', status: 404 });
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

// 점역으로 보내기는 전용 API 없이 FE가 병합해 재업로드한다 — utils/__tests__/mergePages.test.ts 참고.
