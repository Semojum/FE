import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Mock the JobService startJob — useJobUpload imports it
vi.mock('../../api/JobService', () => ({
  startJob: vi.fn(),
}));

import { useJobUpload } from '../UseJobUpload';
import { startJob } from '../../api/JobService';

const startJobMock = startJob as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  startJobMock.mockReset();
});

const fakeFile = () =>
  new File(['x'], 'a.pdf', { type: 'application/pdf' });

describe('useJobUpload', () => {
  it('starts in idle state', () => {
    const { result } = renderHook(() => useJobUpload());
    expect(result.current.isUploading).toBe(false);
    expect(result.current.jobId).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('uploadFile happy path: sets jobId from response', async () => {
    startJobMock.mockResolvedValue({
      job_id: 'job-1',
      status: 'PROCESSING',
      message: 'ok',
      mode: 'a',
    });
    const { result } = renderHook(() => useJobUpload());

    await act(async () => {
      const res = await result.current.uploadFile(fakeFile(), 'OCR 변환');
      expect(res?.job_id).toBe('job-1');
    });

    expect(result.current.jobId).toBe('job-1');
    expect(result.current.isUploading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(startJobMock).toHaveBeenCalledWith(expect.any(File), 'a');
  });

  it.each([
    ['OCR 변환', 'a'],
    ['점역 변환', 'b'],
    ['통합 변환', 'c'],
  ] as const)('maps tab "%s" to mode "%s"', async (tab, expectedMode) => {
    startJobMock.mockResolvedValue({
      job_id: 'j',
      status: 'PROCESSING',
      message: '',
      mode: expectedMode,
    });
    const { result } = renderHook(() => useJobUpload());
    await act(async () => {
      await result.current.uploadFile(fakeFile(), tab);
    });
    expect(startJobMock).toHaveBeenCalledWith(expect.any(File), expectedMode);
  });

  it('uploadFile error: stores error message and returns null', async () => {
    startJobMock.mockRejectedValue(new Error('boom'));
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
    startJobMock.mockReturnValue(
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
      resolveFn({ job_id: 'j', status: 'OK', message: '', mode: 'a' });
      await uploadPromise!;
    });

    expect(result.current.isUploading).toBe(false);
  });

  it('resetUpload clears state', async () => {
    startJobMock.mockResolvedValue({
      job_id: 'j-1',
      status: 'OK',
      message: '',
      mode: 'a',
    });
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
