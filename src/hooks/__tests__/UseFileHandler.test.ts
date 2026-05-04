import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Mock HwpParser to avoid loading the wasm-based hwpjs in tests
vi.mock('../../component/shared/HwpParser', () => ({
  parseHwpToText: vi.fn().mockResolvedValue('mocked-hwp-content'),
}));

import { useFileHandler } from '../UseFileHandler';

beforeEach(() => {
  // happy-dom may not implement createObjectURL — provide a stub
  if (!URL.createObjectURL) {
    URL.createObjectURL = () => 'blob:fake';
    URL.revokeObjectURL = () => undefined;
  }
});

describe('useFileHandler', () => {
  it('initial state is empty', () => {
    const { result } = renderHook(() => useFileHandler());
    expect(result.current.fileState).toMatchObject({
      file: null,
      previewUrl: null,
      fileType: null,
      currentPage: 1,
      totalPages: 0,
    });
  });

  it('handleFileDrop with PDF sets fileType=pdf and previewUrl', async () => {
    const { result } = renderHook(() => useFileHandler());
    const file = new File(['%PDF-1.4'], 'doc.pdf', {
      type: 'application/pdf',
    });

    await act(async () => {
      await result.current.handleFileDrop([file]);
    });

    expect(result.current.fileState.fileType).toBe('pdf');
    expect(result.current.fileState.previewUrl).toMatch(/^blob:/);
    expect(result.current.fileState.file).toBe(file);
  });

  it('handleFileDrop with image sets fileType=image', async () => {
    const { result } = renderHook(() => useFileHandler());
    const file = new File(['fake-png'], 'pic.png', { type: 'image/png' });

    await act(async () => {
      await result.current.handleFileDrop([file]);
    });

    expect(result.current.fileState.fileType).toBe('image');
    expect(result.current.fileState.previewUrl).toMatch(/^blob:/);
  });

  it('handleFileDrop with text reads contents', async () => {
    const { result } = renderHook(() => useFileHandler());
    const file = new File(['hello world'], 'note.txt', {
      type: 'text/plain',
    });

    await act(async () => {
      await result.current.handleFileDrop([file]);
    });

    expect(result.current.fileState.fileType).toBe('text');
    expect(result.current.fileState.textContent).toBe('hello world');
    expect(result.current.fileState.previewUrl).toBeNull();
  });

  it('handleFileDrop with .hwp delegates to parseHwpToText', async () => {
    const { result } = renderHook(() => useFileHandler());
    const file = new File(['blob'], 'doc.hwp', {
      type: 'application/x-hwp',
    });

    await act(async () => {
      await result.current.handleFileDrop([file]);
    });

    expect(result.current.fileState.fileType).toBe('hwp');
    expect(result.current.fileState.textContent).toBe('mocked-hwp-content');
  });

  it('setPage updates currentPage', () => {
    const { result } = renderHook(() => useFileHandler());
    act(() => result.current.setPage(5));
    expect(result.current.fileState.currentPage).toBe(5);
  });

  it('setTotalPages updates totalPages', () => {
    const { result } = renderHook(() => useFileHandler());
    act(() => result.current.setTotalPages(42));
    expect(result.current.fileState.totalPages).toBe(42);
  });

  it('reset clears file state', async () => {
    const { result } = renderHook(() => useFileHandler());
    const file = new File(['hi'], 'a.txt', { type: 'text/plain' });
    await act(async () => {
      await result.current.handleFileDrop([file]);
    });
    expect(result.current.fileState.file).not.toBeNull();

    act(() => result.current.reset());
    await waitFor(() => {
      expect(result.current.fileState.file).toBeNull();
      expect(result.current.fileState.fileType).toBeNull();
      expect(result.current.fileState.textContent).toBe('');
    });
  });

  it('drop with empty array is a no-op', async () => {
    const { result } = renderHook(() => useFileHandler());
    await act(async () => {
      await result.current.handleFileDrop([]);
    });
    expect(result.current.fileState.file).toBeNull();
  });
});
