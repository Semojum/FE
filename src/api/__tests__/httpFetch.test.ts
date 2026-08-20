import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { httpFetch } from '../httpFetch';
import { setClientOs } from '../../utils/clientOs';

// 데스크톱 앱의 요청은 네이티브에서 나가 UA에 OS가 없다 — 접속 환경을 알리려면
// FE가 X-Client-Os를 직접 실어야 한다(명세 2026-08-20). 다만 presigned URL에는
// 붙이면 안 된다(서명 검증·CORS preflight).

const ok = () => new Response('{}', { status: 200 });
let fetchSpy: ReturnType<typeof vi.spyOn>;

const headersOf = () => {
  const [, init] = fetchSpy.mock.calls.at(-1) as [string, RequestInit];
  return (init?.headers ?? {}) as Record<string, string>;
};

beforeEach(() => {
  fetchSpy = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(() => Promise.resolve(ok()));
});

afterEach(() => {
  vi.restoreAllMocks();
  setClientOs(null);
});

describe('httpFetch · X-Client-Os', () => {
  it('우리 API 요청에는 붙인다 (상대 경로 · api.semojum.app)', async () => {
    setClientOs('Windows 11');

    await httpFetch('/api/users/jobs', { headers: { Accept: 'x' } });
    expect(headersOf()['X-Client-Os']).toBe('Windows 11');
    // 원래 헤더는 그대로 둔다.
    expect(headersOf().Accept).toBe('x');

    await httpFetch('https://api.semojum.app/api/users/jobs');
    expect(headersOf()['X-Client-Os']).toBe('Windows 11');
  });

  it('presigned URL에는 붙이지 않는다', async () => {
    setClientOs('Windows 11');
    await httpFetch('https://bucket.s3.ap-northeast-2.amazonaws.com/a.pdf?sig');
    expect(headersOf()['X-Client-Os']).toBeUndefined();
  });

  it('OS를 모르면 아무것도 붙이지 않는다', async () => {
    await httpFetch('/api/users/jobs');
    expect(headersOf()['X-Client-Os']).toBeUndefined();
  });
});
