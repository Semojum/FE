import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 현장 진단 로그.
//
// 프로덕션 웹뷰의 console.error는 아무도 못 본다 — 잡히지 않은 오류를 파일로 남겨
// "재현이 안 되는" 현장 제보의 단서로 쓴다. 여기서는 파일 쓰기(plugin-fs)를 가로채
// 어떤 줄이 어떤 파일로 나가는지와 홍수 방지 장치를 검증한다.

const writeTextFile = vi.fn(() => Promise.resolve());
const readDir = vi.fn(() => Promise.resolve([] as { name: string }[]));
const remove = vi.fn(() => Promise.resolve());
const mkdir = vi.fn(() => Promise.resolve());
vi.mock('@tauri-apps/plugin-fs', () => ({
  writeTextFile: (...a: unknown[]) => writeTextFile(...(a as [])),
  readDir: (...a: unknown[]) => readDir(...(a as [])),
  remove: (...a: unknown[]) => remove(...(a as [])),
  mkdir: (...a: unknown[]) => mkdir(...(a as [])),
  BaseDirectory: { AppLog: 'APPLOG' },
}));
vi.mock('@tauri-apps/api/app', () => ({
  getVersion: () => Promise.resolve('9.9.9'),
}));

const asDesktop = () => {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
};

// 쓰기 체인이 비워질 때까지 — 파일 쓰기는 순서 보장을 위해 프라미스로 이어진다.
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.resetModules();
  asDesktop();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  writeTextFile.mockClear();
  readDir.mockClear();
  remove.mockClear();
  vi.restoreAllMocks();
});

describe('logDiag', () => {
  it('오늘 날짜 파일에 scope와 detail이 실린 줄을 덧붙인다', async () => {
    const { logDiag } = await import('../diagLog');
    logDiag('업로드', '실패했다', new Error('보기용 원인'));
    await flush();

    expect(writeTextFile).toHaveBeenCalledTimes(1);
    const [name, line, opts] = writeTextFile.mock.calls[0] as unknown as [
      string,
      string,
      { baseDir: string; append: boolean },
    ];
    const d = new Date();
    const today = `diag-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.log`;
    expect(name).toBe(today);
    expect(line).toContain('[업로드] 실패했다');
    expect(line).toContain('보기용 원인');
    expect(opts).toMatchObject({ baseDir: 'APPLOG', append: true });
    // 콘솔에도 같이 흘린다 — 개발 중에는 기존 습관대로 보인다.
    expect(console.error).toHaveBeenCalled();
  });

  it('같은 줄이 연달아 오면 한 번만 남긴다 (렌더 루프 홍수 방지)', async () => {
    const { logDiag } = await import('../diagLog');
    for (let i = 0; i < 50; i += 1) logDiag('전역', '같은 오류');
    await flush();
    expect(writeTextFile).toHaveBeenCalledTimes(1);
  });

  it('브라우저(비 Tauri)에서는 파일을 건드리지 않는다', async () => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    const { logDiag } = await import('../diagLog');
    logDiag('업로드', '실패');
    await flush();
    expect(writeTextFile).not.toHaveBeenCalled();
  });
});

describe('describeDetail', () => {
  it('Error는 이름·메시지·스택 앞부분으로 편다', async () => {
    const { describeDetail } = await import('../diagLog');
    const text = describeDetail(new TypeError('t is undefined'));
    expect(text).toContain('TypeError: t is undefined');
  });

  it('큰 detail은 잘라서 파일이 자라는 것을 막는다', async () => {
    const { describeDetail } = await import('../diagLog');
    const text = describeDetail('x'.repeat(10_000));
    expect(text.length).toBeLessThan(2_100);
    expect(text).toContain('잘림');
  });

  it('순환 참조여도 죽지 않는다', async () => {
    const { describeDetail } = await import('../diagLog');
    const a: Record<string, unknown> = {};
    a.self = a;
    expect(() => describeDetail(a)).not.toThrow();
  });
});

describe('initDiagLog', () => {
  it('세션 시작 줄에 버전을 남기고, 14일 지난 로그를 지운다', async () => {
    readDir.mockResolvedValueOnce([
      { name: 'diag-20200101.log' }, // 옛날 — 지워야 한다
      { name: 'diag-99991231.log' }, // 미래(오늘 이후) — 남는다
      { name: '다른파일.txt' }, // 로그가 아니다 — 건드리지 않는다
    ]);
    const { initDiagLog } = await import('../diagLog');
    initDiagLog();
    await flush();
    await flush();

    const first = writeTextFile.mock.calls[0] as unknown as [string, string];
    expect(first[1]).toContain('[세션] 시작 v9.9.9');
    expect(remove).toHaveBeenCalledTimes(1);
    expect((remove.mock.calls[0] as unknown[])[0]).toBe('diag-20200101.log');
  });

  it('잡히지 않은 오류와 프라미스 거부를 파일로 남긴다', async () => {
    const { initDiagLog } = await import('../diagLog');
    initDiagLog();
    await flush();
    writeTextFile.mockClear();

    window.dispatchEvent(
      new ErrorEvent('error', {
        message: '터진 곳',
        error: new Error('원인'),
      }),
    );
    // happy-dom의 PromiseRejectionEvent 유무에 기대지 않고 직접 만든다.
    const rejection = new Event('unhandledrejection') as Event & {
      reason: unknown;
    };
    rejection.reason = new Error('둥둥 떠다니는 거부');
    window.dispatchEvent(rejection);
    await flush();

    const lines = writeTextFile.mock.calls.map(
      (c) => (c as unknown[])[1] as string,
    );
    expect(lines.some((l) => l.includes('터진 곳'))).toBe(true);
    expect(lines.some((l) => l.includes('둥둥 떠다니는 거부'))).toBe(true);
  });
});
