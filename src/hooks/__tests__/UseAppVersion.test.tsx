import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAppVersion } from '../UseAppVersion';

// Windows에서 tauri-plugin-updater의 설치는 설치 프로그램을 띄운 뒤
// `std::process::exit(0)`으로 앱을 즉시 끝낸다(plugin 2.10.1 Windows install_inner).
// 그래서 시작하자마자 자동 설치하면 사용자에게는 "앱이 저 혼자 강제로 꺼진다"가 되고,
// close-requested를 거치지 않아 저장하지 않은 편집도 함께 사라진다.
// 여기서는 "시작 시엔 확인만, 설치는 사용자가 고를 때"라는 규칙을 지킨다.

vi.mock('../../utils/updater', () => ({
  checkForUpdates: vi.fn(),
}));
vi.mock('../../api/AppService', async () => {
  const actual = await vi.importActual<typeof import('../../api/AppService')>(
    '../../api/AppService',
  );
  return { ...actual, getAppVersion: vi.fn() };
});

import { checkForUpdates } from '../../utils/updater';
import { getAppVersion } from '../../api/AppService';

const mockedCheck = vi.mocked(checkForUpdates);
const mockedVersion = vi.mocked(getAppVersion);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockedVersion.mockRejectedValue(new Error('버전 조회 안 함'));
  mockedCheck.mockResolvedValue('3.1.0');
});

describe('useAppVersion', () => {
  it('시작할 때는 설치하지 않고 새 버전 확인만 한다', async () => {
    const { result } = renderHook(() => useAppVersion(true));

    await waitFor(() => expect(result.current.availableVersion).toBe('3.1.0'));
    expect(mockedCheck).toHaveBeenCalledTimes(1);
    expect(mockedCheck).toHaveBeenCalledWith({ autoInstall: false });
    expect(result.current.updateAvailable).toBe(true);
    expect(result.current.isInstalling).toBe(false);
  });

  // 2026-08-20 계약 변경: 서버가 forceUpdate를 계산해 주지 않고
  // minSupportedVersion만 준다. 비교는 문자열이 아니라 숫자 단위여야 한다.
  it('minSupportedVersion보다 낮은 버전이면 강제 업데이트로 본다', async () => {
    mockedVersion.mockResolvedValue({
      latestVersion: '9.9.9',
      minSupportedVersion: '9.0.0',
      downloadUrl: null,
      releaseNotes: null,
      updatedAt: null,
    });

    const { result } = renderHook(() => useAppVersion(true));
    await waitFor(() => expect(result.current.forceUpdate).toBe(true));
  });

  it('버전 정보가 없으면(result null) 검사를 건너뛴다', async () => {
    mockedVersion.mockResolvedValue(null);

    const { result } = renderHook(() => useAppVersion(true));
    await waitFor(() => expect(result.current.availableVersion).toBe('3.1.0'));
    expect(result.current.forceUpdate).toBe(false);
    expect(result.current.latestVersion).toBeNull();
  });

  it('installNow는 저장을 먼저 밀어낸 뒤 설치한다', async () => {
    const order: string[] = [];
    const flush = vi.fn(async () => {
      order.push('save');
    });
    mockedCheck.mockImplementation(async (opts) => {
      if (opts?.autoInstall) order.push('install');
      return '3.1.0';
    });

    const { result } = renderHook(() => useAppVersion(true, flush));
    await waitFor(() => expect(result.current.availableVersion).toBe('3.1.0'));

    await act(async () => {
      await result.current.installNow();
    });

    expect(flush).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['save', 'install']);
    expect(mockedCheck).toHaveBeenLastCalledWith({
      autoInstall: true,
      relaunch: true,
    });
  });

  it('저장에 실패해도 설치를 막지 않는다 (강제 업데이트를 잠그면 안 된다)', async () => {
    const flush = vi.fn().mockRejectedValue(new Error('저장 실패'));
    const { result } = renderHook(() => useAppVersion(true, flush));
    await waitFor(() => expect(result.current.availableVersion).toBe('3.1.0'));

    await act(async () => {
      await result.current.installNow();
    });

    expect(mockedCheck).toHaveBeenLastCalledWith({
      autoInstall: true,
      relaunch: true,
    });
  });

  it('결과 전용 창(enabled=false)에서는 확인도 하지 않는다', async () => {
    renderHook(() => useAppVersion(false));
    expect(mockedCheck).not.toHaveBeenCalled();
  });
});
