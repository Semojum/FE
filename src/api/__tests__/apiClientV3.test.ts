import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ApiError,
  apiRequest,
  apiRequestBinary,
  filenameFromDisposition,
} from '../apiClient';
import { toUserMessage, errorCode } from '../errorMessages';

const makeResponse = (
  status: number,
  body: BodyInit,
  headers: Record<string, string>,
): Response => new Response(body, { status, headers });

describe('apiClient — 프록시 응답 방어 (명세 "업로드 용량 처리")', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('Cloudflare가 끊은 413(HTML)을 JOB4009로 변환한다', async () => {
    fetchSpy.mockResolvedValue(
      makeResponse(413, '<html>Payload Too Large</html>', {
        'content-type': 'text/html',
      }),
    );
    await expect(
      apiRequest('/api/jobs', { method: 'POST' }),
    ).rejects.toMatchObject({ code: 'JOB4009', status: 413 });
  });

  it('서버가 준 JSON 413(JOB4009)은 엔벨로프 경로로 처리한다', async () => {
    fetchSpy.mockResolvedValue(
      makeResponse(
        413,
        JSON.stringify({
          isSuccess: false,
          code: 'JOB4009',
          message: '업로드 파일이 100MB를 초과했습니다.',
        }),
        { 'content-type': 'application/json' },
      ),
    );
    await expect(
      apiRequest('/api/jobs', { method: 'POST' }),
    ).rejects.toMatchObject({ code: 'JOB4009', status: 413 });
  });

  it('502 게이트웨이 오류도 JSON 파싱 전에 걸러낸다', async () => {
    fetchSpy.mockResolvedValue(
      makeResponse(502, '<html>Bad Gateway</html>', {
        'content-type': 'text/html',
      }),
    );
    let err: ApiError | null = null;
    try {
      await apiRequest('/api/users/jobs');
    } catch (e) {
      err = e as ApiError;
    }
    expect(errorCode(err)).toBe('COMMON5000');
    expect(err?.status).toBe(502);
  });
});

describe('filenameFromDisposition', () => {
  it('RFC 5987 한글 파일명을 디코드한다', () => {
    expect(
      filenameFromDisposition(
        "attachment; filename*=UTF-8''%ED%99%95%ED%86%B5.brf",
      ),
    ).toBe('확통.brf');
  });

  it('filename="..." 폴백', () => {
    expect(filenameFromDisposition('attachment; filename="result.txt"')).toBe(
      'result.txt',
    );
  });

  it('헤더가 없으면 null', () => {
    expect(filenameFromDisposition(null)).toBeNull();
  });
});

describe('apiRequestBinary', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('성공 시 Blob과 서버가 준 파일명을 함께 돌려준다', async () => {
    fetchSpy.mockResolvedValue(
      makeResponse(200, '⠟⠈⠿', {
        'content-type': 'application/octet-stream',
        'content-disposition':
          "attachment; filename*=UTF-8''%ED%99%95%ED%86%B5.brf",
      }),
    );
    const res = await apiRequestBinary('/api/jobs/j1/download', {
      method: 'POST',
      token: 'tok',
    });
    expect(res.fileName).toBe('확통.brf');
    expect(res.blob.size).toBeGreaterThan(0);
  });

  it('실패는 JSON 엔벨로프로 오므로 ApiError로 던진다', async () => {
    fetchSpy.mockResolvedValue(
      makeResponse(
        409,
        JSON.stringify({
          isSuccess: false,
          code: 'JOB4010',
          message: '변환이 끝나지 않았습니다.',
        }),
        { 'content-type': 'application/json' },
      ),
    );
    await expect(
      apiRequestBinary('/api/jobs/j1/download', { method: 'POST' }),
    ).rejects.toMatchObject({ code: 'JOB4010', status: 409 });
  });
});

describe('toUserMessage', () => {
  it('V3 신규 코드를 화면 문구로 옮긴다', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeResponse(
        400,
        JSON.stringify({
          isSuccess: false,
          code: 'JOB4007',
          message: 'hwp parse failed',
        }),
        { 'content-type': 'application/json' },
      ),
    );
    const err = await apiRequest('/api/jobs', { method: 'POST' }).catch(
      (e) => e,
    );
    expect(toUserMessage(err)).toContain('HWPX');
    spy.mockRestore();
  });

  it('모르는 코드는 서버 message를 그대로 쓴다', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeResponse(
        400,
        JSON.stringify({
          isSuccess: false,
          code: 'UNKNOWN9999',
          message: '서버가 준 문구',
        }),
        { 'content-type': 'application/json' },
      ),
    );
    const err = await apiRequest('/api/x').catch((e) => e);
    expect(toUserMessage(err)).toBe('서버가 준 문구');
    spy.mockRestore();
  });
});
