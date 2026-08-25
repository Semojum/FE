import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useSavedJobs } from '../UseSavedJobs';
import { JobRef } from '../../types/auth';

// 저장된 작업 열기.
//
// 예전에는 1쪽부터 마지막 쪽까지 한 번에 하나씩 기다렸다. 왕복이 1초쯤이라 10쪽짜리는
// 열기만 5~10초였다(2026-08-26 QA). 지금은 두 단계다:
//   1) 직전에 보던 쪽(lastEditedPage) 하나를 먼저 받아 바로 보여 준다
//   2) 나머지는 몇 개씩 겹쳐 받아 뒤에서 채운다

const getJobPage = vi.fn();
vi.mock('../../api/HistoryService', () => ({
  getJobPage: (...args: unknown[]) => getJobPage(...args),
}));

const pageResponse = (pageNo: number) => ({
  result: { text_list: [{ id: pageNo, contents: [`${pageNo}쪽 본문`] }] },
  originalFileName: '문서.pdf',
});

const job = (over: Partial<JobRef> = {}): JobRef => ({
  jobId: 'job_1',
  mode: 'a',
  totalPages: 10,
  ...over,
});

afterEach(() => {
  getJobPage.mockReset();
});

describe('useSavedJobs · 두 단계 복원', () => {
  it('직전에 보던 쪽을 먼저 넘기고, 나머지는 뒤이어 채운다', async () => {
    getJobPage.mockImplementation((_t, _j, page: number) =>
      Promise.resolve(pageResponse(page)),
    );
    const onJobLoaded = vi.fn();
    const onPagesFilled = vi.fn();

    const { result } = renderHook(() =>
      useSavedJobs({ token: 't', onJobLoaded, onPagesFilled }),
    );
    await act(async () => {
      await result.current.handleSelectJob(job({ startPage: 7 }));
    });

    // 1단계: 7쪽만 들고 먼저 나간다.
    expect(onJobLoaded).toHaveBeenCalledTimes(1);
    const first = onJobLoaded.mock.calls[0][0];
    expect(Object.keys(first.blocksByPage)).toEqual(['7']);
    expect(first.startPage).toBe(7);

    // 2단계: 열 쪽이 모두 채워진 채로 온다.
    await waitFor(() => expect(onPagesFilled).toHaveBeenCalledTimes(1));
    const filled = onPagesFilled.mock.calls[0][0];
    expect(
      Object.keys(filled.blocksByPage)
        .map(Number)
        .sort((a, b) => a - b),
    ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('먼저 받은 쪽을 다시 부르지 않는다', async () => {
    getJobPage.mockImplementation((_t, _j, page: number) =>
      Promise.resolve(pageResponse(page)),
    );

    const { result } = renderHook(() =>
      useSavedJobs({
        token: 't',
        onJobLoaded: vi.fn(),
        onPagesFilled: vi.fn(),
      }),
    );
    await act(async () => {
      await result.current.handleSelectJob(job({ startPage: 3 }));
    });

    const asked = getJobPage.mock.calls.map((c) => c[2]);
    expect(asked).toHaveLength(10);
    expect(asked.filter((p) => p === 3)).toHaveLength(1);
  });

  it('쪽 조회를 순차가 아니라 겹쳐 부른다', async () => {
    let inFlight = 0;
    let peak = 0;
    getJobPage.mockImplementation(async (_t, _j, page: number) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return pageResponse(page);
    });

    const { result } = renderHook(() =>
      useSavedJobs({
        token: 't',
        onJobLoaded: vi.fn(),
        onPagesFilled: vi.fn(),
      }),
    );
    await act(async () => {
      await result.current.handleSelectJob(job());
    });

    // 1단계는 혼자 나가고, 2단계에서 여러 개가 동시에 떠 있어야 한다.
    expect(peak).toBeGreaterThan(1);
  });

  it('startPage가 없으면 1쪽을 먼저 보여 준다', async () => {
    getJobPage.mockImplementation((_t, _j, page: number) =>
      Promise.resolve(pageResponse(page)),
    );
    const onJobLoaded = vi.fn();

    const { result } = renderHook(() =>
      useSavedJobs({ token: 't', onJobLoaded, onPagesFilled: vi.fn() }),
    );
    await act(async () => {
      await result.current.handleSelectJob(job({ totalPages: 3 }));
    });

    expect(Object.keys(onJobLoaded.mock.calls[0][0].blocksByPage)).toEqual([
      '1',
    ]);
  });
});
