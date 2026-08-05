import { useCallback, useEffect, useState } from 'react';
import { AppVersionInfo, getAppVersion } from '../api/AppService';
import { checkForUpdates } from '../utils/updater';

// 자동 업데이트 (기능정의서 "자동 업데이트")
//  D-1 호환성이 깨지는 패치 → '최신 버전으로 업데이트가 필요합니다' + 조작 차단
//  D-2 설치가 준비되면 좌하단에 설치 메시지
//  D-3 업데이트 후 첫 화면에서 해당 버전의 업데이트 노트를 새 창으로
// 실패는 조용히 넘긴다 — 업데이트 오류가 사용자에게 장애로 보이면 안 된다.

// 마지막으로 릴리스 노트를 보여준 버전. 같은 버전에서 매번 뜨지 않게 기억한다.
const SEEN_RELEASE_KEY = 'semojum-seen-release';

const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const currentVersion = (): string =>
  (import.meta.env.VITE_APP_VERSION as string | undefined) ?? '0.0.0';

export const useAppVersion = (enabled: boolean) => {
  const [info, setInfo] = useState<AppVersionInfo | null>(null);
  // 설치까지 끝나 다음 실행에 적용될 버전 — 좌하단 토스트로 알린다.
  const [installedVersion, setInstalledVersion] = useState<string | null>(null);
  const [dismissedToast, setDismissedToast] = useState(false);

  // 서버 기준 버전 확인. 로그인 전에도 호출 가능(인증 불필요).
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    getAppVersion(currentVersion())
      .then((res) => {
        if (!cancelled) setInfo(res);
      })
      .catch((e) => console.warn('앱 버전 확인 실패', e));
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  // 새 버전 내려받기·설치는 백그라운드에서. 강제 업데이트여도 같은 경로를 쓴다.
  useEffect(() => {
    if (!enabled) return;
    checkForUpdates({
      onProgress: (p) => {
        if (p.event === 'installing')
          setInstalledVersion(info?.latestVersion ?? '');
      },
    })
      .then((version) => {
        if (version) setInstalledVersion(version);
      })
      .catch((e) => console.warn('업데이트 확인 실패', e));
    // info가 늦게 와도 설치 자체는 한 번만 시도한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // 업데이트 후 첫 실행이면 릴리스 노트를 새 창으로 띄운다.
  useEffect(() => {
    if (!enabled || !info?.releaseNoteUrl) return;
    const seen = localStorage.getItem(SEEN_RELEASE_KEY);
    const running = currentVersion();
    // 지금 돌고 있는 버전이 서버가 아는 최신이고, 아직 노트를 안 봤을 때만.
    if (running !== info.latestVersion || seen === running) return;
    localStorage.setItem(SEEN_RELEASE_KEY, running);

    if (isTauri()) {
      void import('@tauri-apps/plugin-opener')
        .then((m) => m.openUrl(info.releaseNoteUrl))
        .catch((e) => console.warn('릴리스 노트 열기 실패', e));
    } else {
      window.open(info.releaseNoteUrl, '_blank', 'noopener');
    }
  }, [enabled, info]);

  const dismissToast = useCallback(() => setDismissedToast(true), []);

  const relaunchNow = useCallback(async () => {
    if (!isTauri()) {
      window.location.reload();
      return;
    }
    try {
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (e) {
      console.warn('재시작 실패', e);
    }
  }, []);

  return {
    // 호환성이 깨지는 패치 — 업데이트 외의 모든 조작을 막아야 한다.
    forceUpdate: info?.forceUpdate === true,
    latestVersion: info?.latestVersion ?? null,
    releaseNoteUrl: info?.releaseNoteUrl ?? null,
    // 설치가 준비돼 재시작하면 적용되는 상태
    pendingInstall: !!installedVersion && !dismissedToast,
    installedVersion,
    dismissToast,
    relaunchNow,
  };
};
