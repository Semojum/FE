import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Mock the JobService createJob — useJobUpload imports it
vi.mock('../../api/JobService', () => ({
  createJob: vi.fn(),
}));

import { useJobUpload } from '../UseJobUpload';
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
      const res = await result.current.uploadFile(
        fakeFile(),
        'OCR 변환',
        'tok',
      );
      expect(res?.jobId).toBe('job-1');
    });

    expect(result.current.jobId).toBe('job-1');
    expect(result.current.isUploading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(createJobMock).toHaveBeenCalledWith(expect.any(File), 'a', 'tok');
  });

  it.each([
    ['OCR 변환', 'a'],
    ['점역 변환', 'b'],
    ['통합 변환', 'c'],
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
    );
  });

  it('uploadFile error: stores error message and returns null', async () => {
    createJobMock.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useJobUpload());

    await act(async () => {
      const res = await result.current.uploadFile(fakeFile(), 'OCR 변환');
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
      uploadPromise = result.current.uploadFile(fakeFile(), 'OCR 변환');
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
      await result.current.uploadFile(fakeFile(), 'OCR 변환');
    });
    expect(result.current.jobId).toBe('j-1');

    act(() => result.current.resetUpload());
    expect(result.current.jobId).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
