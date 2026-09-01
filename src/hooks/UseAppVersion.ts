import { useCallback, useEffect, useState } from 'react';
import {
  AppVersionInfo,
  compareVersions,
  getAppVersion,
} from '../api/AppService';
import { checkForUpdates } from '../utils/updater';

// 자동 업데이트 (기능정의서 "자동 업데이트")
//  D-1 호환성이 깨지는 패치 → '최신 버전으로 업데이트가 필요합니다' + 조작 차단
//  D-2 설치가 준비되면 좌하단에 설치 메시지
//  D-3 업데이트 후 첫 화면에서 해당 버전의 업데이트 노트를 보여 준다
//      — 2026-08-20 서버가 노트 "주소" 대신 "본문"(releaseNotes)을 주도록 바뀌어
//        새 창을 여는 대신 그대로 내려보낸다(표시는 호출부 몫).
// 실패는 조용히 넘긴다 — 업데이트 오류가 사용자에게 장애로 보이면 안 된다.

// 마지막으로 릴리스 노트를 보여준 버전. 같은 버전에서 매번 뜨지 않게 기억한다.
const SEEN_RELEASE_KEY = 'semojum-seen-release';

const currentVersion = (): string =>
  (import.meta.env.VITE_APP_VERSION as string | undefined) ?? '0.0.0';

// onBeforeInstall — 설치는 앱을 끝내므로(윈도우) 그 직전에 저장을 밀어낼 기회를 준다.
export const useAppVersion = (
  enabled: boolean,
  onBeforeInstall?: () => Promise<void>,
) => {
  const [info, setInfo] = useState<AppVersionInfo | null>(null);
  // 받아서 설치할 수 있는 새 버전 — 좌하단 토스트로 알리고, 설치는 사용자가 고른다.
  const [availableVersion, setAvailableVersion] = useState<string | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [dismissedToast, setDismissedToast] = useState(false);

  // 서버 기준 버전 확인. 로그인 전에도 호출 가능(인증 불필요).
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    getAppVersion()
      .then((res) => {
        if (!cancelled) setInfo(res);
      })
      .catch((e) => console.warn('앱 버전 확인 실패', e));
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  // 새 버전이 있는지 **확인만** 한다. 설치는 사용자가 토스트/게이트에서 고를 때 한다.
  //
  // 예전에는 시작하자마자 downloadAndInstall까지 갔는데, Windows에서 그 호출이
  // 설치 프로그램을 띄우고 `std::process::exit(0)`으로 프로세스를 즉시 끝낸다.
  // 사용자에게는 "앱이 저 혼자 강제로 꺼진다"로 보였고, close-requested를 거치지 않아
  // 저장하지 않은 편집도 함께 날아갔다.
  useEffect(() => {
    if (!enabled) return;
    checkForUpdates({ autoInstall: false })
      .then((version) => setAvailableVersion(version))
      .catch((e) => console.warn('업데이트 확인 실패', e));
  }, [enabled]);

  // 업데이트 후 첫 실행이면 릴리스 노트를 한 번만 내보낸다(같은 버전에서 반복 금지).
  const [freshReleaseNotes, setFreshReleaseNotes] = useState<string | null>(
    null,
  );
  useEffect(() => {
    if (!enabled || !info?.releaseNotes) return;
    const running = currentVersion();
    if (running !== info.latestVersion) return;
    if (localStorage.getItem(SEEN_RELEASE_KEY) === running) return;
    localStorage.setItem(SEEN_RELEASE_KEY, running);
    setFreshReleaseNotes(info.releaseNotes);
  }, [enabled, info]);

  const dismissToast = useCallback(() => setDismissedToast(true), []);
  // 닫아도 사라지지 않는다 — 접힌 자리를 눌러 다시 편다(아래 updateAvailable 주석).
  const restoreToast = useCallback(() => setDismissedToast(false), []);

  // 지금 설치. 저장을 먼저 밀어낸 뒤 내려받아 설치한다.
  // Windows에서는 이 호출이 돌아오지 않는다 — 설치 프로그램이 뜨고 앱이 종료됐다가
  // 설치가 끝나면 다시 뜬다. macOS·Linux는 살아 있으므로 직접 재시작한다.
  const installNow = useCallback(async () => {
    if (isInstalling) return;
    setIsInstalling(true);
    try {
      await onBeforeInstall?.();
    } catch (e) {
      // 저장 실패가 업데이트를 막지는 않는다 — 강제 업데이트면 막으면 안 된다.
      console.warn('업데이트 전 저장 실패', e);
    }
    try {
      // Windows에서는 이 호출이 돌아오지 않는다 — 설치 프로그램이 뜨고 프로세스가 끝난다.
      // macOS·Linux는 설치 후에도 살아 있어 relaunch로 재시작한다.
      // 브라우저(개발용)에서는 checkForUpdates가 곧바로 null이라 아무 일도 없다.
      await checkForUpdates({ autoInstall: true, relaunch: true });
    } catch (e) {
      console.warn('업데이트 설치 실패', e);
    }
    // 여기에 닿았다면 앱이 아직 살아 있다(설치할 게 없었거나 실패). 버튼을 되살린다.
    setIsInstalling(false);
  }, [isInstalling, onBeforeInstall]);

  return {
    // 호환성이 깨지는 패치 — 업데이트 외의 모든 조작을 막아야 한다.
    // 서버가 판단해 주지 않으므로(2026-08-20 계약 변경) 여기서 버전을 비교한다.
    forceUpdate:
      !!info?.minSupportedVersion &&
      compareVersions(currentVersion(), info.minSupportedVersion) < 0,
    latestVersion: info?.latestVersion ?? null,
    releaseNotes: freshReleaseNotes,
    currentVersion: currentVersion(),
    // 내려받아 설치할 수 있는 새 버전이 있는 상태.
    //
    // 닫기(dismiss)는 **알림을 접을 뿐 없애지 않는다.** 예전에는 닫으면 그 세션에서
    // 다시 뜰 길이 없어, 작업 중에 무심코 닫은 사람은 앱을 껐다 켜기 전까지 업데이트가
    // 있다는 사실 자체를 알 수 없었다(2026-09-01 요청). 접힌 뒤에는 작은 칩만 남고,
    // 그것을 누르면 다시 펴진다 — 그래서 여기서는 닫힘과 무관하게 true를 돌린다.
    updateAvailable: !!availableVersion,
    toastDismissed: dismissedToast,
    availableVersion,
    isInstalling,
    dismissToast,
    restoreToast,
    installNow,
  };
};
