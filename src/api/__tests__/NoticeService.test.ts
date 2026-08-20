import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { listPublicNotices } from '../NoticeService';
import { API_BASE_URL } from '../apiClient';

// 로그인 화면 공지는 인증 없이 부르는 유일한 조회다. 서버에 아직 없는 경로라
// (2026-08-19 실측 404) "못 불러옴"을 오류가 아니라 null로 다뤄, 로그인 화면이
// 빈 상자나 오류 문구 없이 예전 모습 그대로 뜨게 한다.

const notice = {
  id: 'n1',
  title: '8/20 새벽 서버 점검 안내',
  body: '02:00~03:00 점검으로 서비스가 잠시 중단됩니다.',
  startsOn: '2026-08-18',
  endsOn: '2026-08-21',
  createdAt: '2026-08-18T05:35:00Z',
};

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const ok = (result: unknown) =>
  jsonResponse(200, {
    isSuccess: true,
    code: 'COMMON2000',
    message: '성공입니다.',
    result,
  });

const fail = (status: number, code: string) =>
  jsonResponse(status, { isSuccess: false, code, message: '실패' });

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch');
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => vi.restoreAllMocks());

describe('listPublicNotices', () => {
  it('인증 헤더 없이 공개 경로를 부른다', async () => {
    fetchSpy.mockImplementation(() => Promise.resolve(ok([notice])));

    const list = await listPublicNotices();

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_BASE_URL}/api/public/notices`);
    expect(
      (init.headers as Record<string, string>).Authorization,
    ).toBeUndefined();
    expect(list).toEqual([notice]);
  });

  it('목록이 { items } 로 와도 흡수한다', async () => {
    fetchSpy.mockImplementation(() => Promise.resolve(ok({ items: [notice] })));
    expect(await listPublicNotices()).toEqual([notice]);
  });

  it('아직 배포되지 않은 경로(404)는 조용히 null — 로그인 화면을 어지럽히지 않는다', async () => {
    fetchSpy.mockImplementation(() => Promise.resolve(fail(404, 'COMMON4004')));

    expect(await listPublicNotices()).toBeNull();
    // apiClient는 실패한 호출을 '[API] …'로 남긴다(원인 추적용). 여기서 보는 것은
    // 공지 조회가 제 몫의 경고('[공지] …')를 내지 않는다는 것이다.
    expect(console.warn).not.toHaveBeenCalledWith(
      expect.stringContaining('[공지]'),
      expect.anything(),
    );
  });

  it('인증을 요구하도록 붙어 있어도(401) 로그인 전에는 쓸 수 없으니 null', async () => {
    fetchSpy.mockImplementation(() => Promise.resolve(fail(401, 'COMMON4001')));

    expect(await listPublicNotices()).toBeNull();
    // apiClient는 실패한 호출을 '[API] …'로 남긴다(원인 추적용). 여기서 보는 것은
    // 공지 조회가 제 몫의 경고('[공지] …')를 내지 않는다는 것이다.
    expect(console.warn).not.toHaveBeenCalledWith(
      expect.stringContaining('[공지]'),
      expect.anything(),
    );
  });

  it('그 밖의 오류는 null을 주되 원인은 콘솔에 남긴다', async () => {
    fetchSpy.mockImplementation(() => Promise.reject(new Error('offline')));

    expect(await listPublicNotices()).toBeNull();
    expect(console.warn).toHaveBeenCalled();
  });
});
