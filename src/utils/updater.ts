// 데스크톱(Tauri) 자동 업데이트 유틸.
//  - 브라우저/테스트 환경에서는 아무 동작도 하지 않는다(no-op).
//  - 플러그인은 Tauri 런타임에서만 동적 import 한다(브라우저 번들에 포함되지 않게).
//
// ⚠️ **Windows에서 설치는 앱을 죽인다.** tauri-plugin-updater의 Windows 구현은
//    설치 파일을 ShellExecute로 띄운 뒤 `std::process::exit(0)`으로 현재 프로세스를
//    즉시 끝낸다(plugin 2.10.1 `src/updater.rs` Windows `install_inner` 마지막 줄).
//    close-requested 이벤트도, 저장 플러시도 거치지 않는다.
//    → 그래서 시작하자마자 조용히 자동 설치하면 사용자에게는 "앱이 저 혼자 꺼진다"가 된다.
//    설치는 **반드시 사용자가 고른 시점에만** 하고, 그 전에 저장을 밀어내야 한다.
//    (macOS·Linux는 프로세스를 죽이지 않으므로 설치 후 relaunch가 필요하다.)
//
//  - autoInstall 기본값은 false다 — 확인만 하고 설치는 호출 측이 결정한다.
//
// 사용 예 (앱 시작 시 1회):
//   import { checkForUpdates } from './utils/updater';
//   useEffect(() => {
//     // 첫 릴리스 전/오프라인이면 엔드포인트 조회가 실패할 수 있으므로 catch 필수.
//     checkForUpdates().catch((e) => console.warn('업데이트 확인 실패', e));
//   }, []);

// Tauri(데스크톱) 런타임 여부. 일반 브라우저/테스트에서는 false.
const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export type UpdateProgress =
  | { event: 'available'; version: string; notes?: string }
  | { event: 'downloading'; downloaded: number; total?: number }
  | { event: 'installing' }
  | { event: 'up-to-date' };

export interface CheckForUpdatesOptions {
  // true면 업데이트 발견 시 내려받아 설치한다. Windows에서는 이 호출이 돌아오지 않는다
  // (설치 프로그램을 띄우고 프로세스가 종료된다). 사용자가 명시적으로 고른 때만 켤 것.
  // 기본 false — 발견 여부만 반환한다.
  autoInstall?: boolean;
  // 설치 후 재시작 여부. Windows는 설치 단계에서 이미 종료되므로 이 값과 무관하고,
  // macOS·Linux에서만 의미가 있다(설치해도 프로세스가 살아 있어 직접 재시작해야 한다).
  relaunch?: boolean;
  onProgress?: (p: UpdateProgress) => void;
}

// 업데이트를 확인한다.
//  - 반환: 적용 가능한 새 버전 문자열, 없으면 null(브라우저에서도 null).
export const checkForUpdates = async (
  opts: CheckForUpdatesOptions = {},
): Promise<string | null> => {
  const {
    autoInstall = false,
    relaunch: doRelaunch = false,
    onProgress,
  } = opts;
  if (!isTauri()) return null;

  // Tauri 환경에서만 로드(동적 import).
  const { check } = await import('@tauri-apps/plugin-updater');

  const update = await check();
  if (!update) {
    onProgress?.({ event: 'up-to-date' });
    return null;
  }

  onProgress?.({
    event: 'available',
    version: update.version,
    notes: update.body,
  });

  if (!autoInstall) return update.version;

  let total: number | undefined;
  let downloaded = 0;
  await update.downloadAndInstall((progress) => {
    switch (progress.event) {
      case 'Started':
        total = progress.data.contentLength;
        onProgress?.({ event: 'downloading', downloaded: 0, total });
        break;
      case 'Progress':
        downloaded += progress.data.chunkLength;
        onProgress?.({ event: 'downloading', downloaded, total });
        break;
      case 'Finished':
        onProgress?.({ event: 'installing' });
        break;
    }
  });

  // 설치 직후 재시작은 옵션. 기본은 재시작하지 않고 다음 실행 시 적용.
  if (doRelaunch) {
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
  }

  return update.version;
};
