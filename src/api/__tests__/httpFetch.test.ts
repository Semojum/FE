import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { httpFetch } from '../httpFetch';
import { setClientOs } from '../../utils/clientOs';

// 데스크톱(Tauri) 경로에서 쓰는 플러그인 fetch — 어느 쪽으로 나갔는지 보려고 가로챈다.
const pluginFetch = vi.fn(() => Promise.resolve(new Response('{}')));
vi.mock('@tauri-apps/plugin-http', () => ({
  fetch: (...args: unknown[]) => pluginFetch(...(args as [])),
}));

// isTauri()는 window.__TAURI_INTERNALS__ 유무로 판단한다.
const asDesktop = () => {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
};

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
  pluginFetch.mockClear();
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
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

// 파일 업로드는 데스크톱에서도 웹뷰 fetch로 나가야 한다. 플러그인은 본문을 숫자
// 배열 + JSON으로 바꿔 IPC에 태우느라 큰 파일에서 화면이 멈춘다(2026-08-25 QA).
describe('httpFetch · 파일 업로드 경로', () => {
  it('데스크톱에서 FormData 본문은 웹뷰 fetch로 보낸다', async () => {
    asDesktop();
    const body = new FormData();
    body.append('file', new Blob(['x']), 'a.pdf');

    await httpFetch('/api/jobs', { method: 'POST', body });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(pluginFetch).not.toHaveBeenCalled();
  });

  it('데스크톱에서 본문 없는 요청은 플러그인 fetch로 보낸다', async () => {
    asDesktop();

    await httpFetch('/api/users/jobs');

    expect(pluginFetch).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('웹뷰 fetch가 막히면 플러그인 경로로 한 번 더 시도한다', async () => {
    asDesktop();
    fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const body = new FormData();
    body.append('file', new Blob(['x']), 'a.pdf');

    await httpFetch('/api/jobs', { method: 'POST', body });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(pluginFetch).toHaveBeenCalledTimes(1);
  });
});

// tauri-plugin-http의 abort는 요청 rid 취소뿐이라, 응답을 받은 뒤 abort()가 불리면
// "The resource id N is invalid" 거부가 처리되지 않은 채 뜬다(언마운트 정리마다).
// 플러그인에는 요청이 진행 중일 때만 abort가 전달돼야 한다.
describe('httpFetch · 데스크톱 abort 전달', () => {
  const signalPassed = () =>
    (
      pluginFetch.mock.calls[pluginFetch.mock.calls.length - 1] as unknown as [
        string,
        RequestInit,
      ]
    )[1].signal as AbortSignal;

  it('응답이 온 뒤의 abort는 플러그인에 전달하지 않고 본문만 취소한다', async () => {
    asDesktop();
    const cancel = vi.fn(() => Promise.resolve());
    pluginFetch.mockImplementationOnce(() =>
      Promise.resolve({ ok: true, body: { cancel } } as unknown as Response),
    );
    const controller = new AbortController();
    await httpFetch('/api/public/notices', { signal: controller.signal });

    controller.abort();
    expect(signalPassed().aborted).toBe(false);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('요청 중의 abort는 플러그인에 그대로 전달한다', async () => {
    asDesktop();
    let release!: (r: Response) => void;
    pluginFetch.mockImplementationOnce(
      () => new Promise<Response>((r) => (release = r)),
    );
    const controller = new AbortController();
    const pending = httpFetch('/api/jobs/1/events', {
      signal: controller.signal,
    });
    await Promise.resolve();

    controller.abort();
    expect(signalPassed().aborted).toBe(true);
    release(ok());
    await pending;
  });

  it('이미 abort된 signal이면 시작부터 abort 상태로 넘긴다', async () => {
    asDesktop();
    const controller = new AbortController();
    controller.abort();
    await httpFetch('/api/x', { signal: controller.signal });
    expect(signalPassed().aborted).toBe(true);
  });
});
