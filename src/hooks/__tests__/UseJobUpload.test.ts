import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Mock the JobService createJob — useJobUpload imports it
vi.mock('../../api/JobService', () => ({
  createJob: vi.fn(),
}));

import { useJobUpload } from '../UseJobUpload';
import { TABS } from '../../types';
import { createJob } from '../../api/JobService';

const createJobMock = createJob as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  createJobMock.mockReset();
});

const fakeFile = () => new File(['x'], 'a.pdf', { type: 'application/pdf' });

const jobResult = (over: Record<string, unknown> = {}) => ({
  jobId: 'job-1',
  mode: 'a',
  totalPages: 1,
  status: 'PENDING',
  ...over,
});

describe('useJobUpload', () => {
  // "전송 중"에 X를 누르면 아직 jobId를 모른다. 응답이 오더라도 붙이지 않아야
  // 하고(붙으면 취소했는데 스트림이 이어진다), 호출부가 그 jobId로 취소를 부른다.
  it('업로드 중 취소했으면 응답이 와도 Job을 붙이지 않고 값만 돌려준다', async () => {
    createJobMock.mockResolvedValue(jobResult({ jobId: 'job-canceled' }));
    const { result } = renderHook(() => useJobUpload());

    const returned: { jobId?: string } = {};
    await act(async () => {
      const data = await result.current.uploadFile(
        fakeFile(),
        TABS.OCR,
        'tk',
        false,
        '',
        { shouldAttach: () => false },
      );
      returned.jobId = data?.jobId;
    });

    expect(returned.jobId).toBe('job-canceled');
    // 붙이지 않았으므로 스트림 대상이 되지 않는다.
    expect(result.current.jobId).toBeNull();
    expect(result.current.jobTab).toBeNull();
  });

  it('starts in idle state', () => {
    const { result } = renderHook(() => useJobUpload());
    expect(result.current.isUploading).toBe(false);
    expect(result.current.jobId).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('uploadFile happy path: sets jobId from response', async () => {
    createJobMock.mockResolvedValue(jobResult());
    const { result } = renderHook(() => useJobUpload());

    await act(async () => {
      const res = await result.current.uploadFile(fakeFile(), TABS.OCR, 'tok');
      expect(res?.jobId).toBe('job-1');
    });

    expect(result.current.jobId).toBe('job-1');
    expect(result.current.isUploading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(createJobMock).toHaveBeenCalledWith(
      expect.any(File),
      'a',
      'tok',
      false,
      '',
      undefined, // 조판 옵션 — 안 주면 서버가 기본값으로 채운다(V30)
    );
  });

  it.each([
    [TABS.OCR, 'a'],
    [TABS.BRAILLE, 'b'],
    [TABS.INTEGRATED, 'c'],
  ] as const)('maps tab "%s" to mode "%s"', async (tab, expectedMode) => {
    createJobMock.mockResolvedValue(jobResult({ mode: expectedMode }));
    const { result } = renderHook(() => useJobUpload());
    await act(async () => {
      await result.current.uploadFile(fakeFile(), tab, 'tok');
    });
    expect(createJobMock).toHaveBeenCalledWith(
      expect.any(File),
      expectedMode,
      'tok',
      false,
      '',
      undefined,
    );
  });

  it('passes footerText through to createJob', async () => {
    createJobMock.mockResolvedValue(jobResult({ mode: 'b' }));
    const { result } = renderHook(() => useJobUpload());
    await act(async () => {
      await result.current.uploadFile(
        fakeFile(),
        TABS.BRAILLE,
        'tok',
        true,
        '수학 익힘책 1',
      );
    });
    expect(createJobMock).toHaveBeenCalledWith(
      expect.any(File),
      'b',
      'tok',
      true,
      '수학 익힘책 1',
      undefined,
    );
  });

  it('rejects a footerText over 200 chars without calling the API', async () => {
    const { result } = renderHook(() => useJobUpload());
    await act(async () => {
      const res = await result.current.uploadFile(
        fakeFile(),
        TABS.BRAILLE,
        'tok',
        false,
        'ㄱ'.repeat(201),
      );
      expect(res).toBeNull();
    });
    expect(createJobMock).not.toHaveBeenCalled();
    expect(result.current.error).toContain('200자');
  });

  it('조판 옵션을 주면 그대로 createJob에 넘긴다 (V30)', async () => {
    createJobMock.mockResolvedValue({ jobId: 'job_1', totalPages: 1 });
    const { result } = renderHook(() => useJobUpload());
    const layout = {
      cellsPerLine: 40,
      linesPerPage: 20,
      pageNumberLine: 'every' as const,
      coverPages: 2,
      sourcePageStart: 100,
      braillePageStart: 5,
      showSourcePageNumber: true,
      showBraillePageNumber: false,
      footerAlign: 'right' as const,
      editScope: 'page' as const,
      advancedAi: true,
    };
    await act(async () => {
      await result.current.uploadFile(fakeFile(), TABS.OCR, 'tok', false, '', {
        layout,
      });
    });
    expect(createJobMock).toHaveBeenCalledWith(
      expect.any(File),
      'a',
      'tok',
      false,
      '',
      layout,
    );
  });

  it('uploadFile error: stores error message and returns null', async () => {
    createJobMock.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useJobUpload());

    await act(async () => {
      const res = await result.current.uploadFile(fakeFile(), TABS.OCR);
      expect(res).toBeNull();
    });

    expect(result.current.error).toBe('boom');
    expect(result.current.isUploading).toBe(false);
    expect(result.current.jobId).toBeNull();
  });

  it('isUploading flips during the in-flight call', async () => {
    let resolveFn: (v: unknown) => void = () => {};
    createJobMock.mockReturnValue(
      new Promise((r) => {
        resolveFn = r;
      }),
    );
    const { result } = renderHook(() => useJobUpload());

    let uploadPromise: Promise<unknown>;
    act(() => {
      uploadPromise = result.current.uploadFile(fakeFile(), TABS.OCR);
    });

    await waitFor(() => expect(result.current.isUploading).toBe(true));

    await act(async () => {
      resolveFn(jobResult({ jobId: 'j' }));
      await uploadPromise!;
    });

    expect(result.current.isUploading).toBe(false);
  });

  it('resetUpload clears state', async () => {
    createJobMock.mockResolvedValue(jobResult({ jobId: 'j-1' }));
    const { result } = renderHook(() => useJobUpload());
    await act(async () => {
      await result.current.uploadFile(fakeFile(), TABS.OCR);
    });
    expect(result.current.jobId).toBe('j-1');

    act(() => result.current.resetUpload());
    expect(result.current.jobId).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
