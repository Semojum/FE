// 데스크톱(Tauri) 자동 업데이트 유틸.
//  - 웹/테스트 환경에서는 아무 동작도 하지 않는다(no-op).
//  - 플러그인은 Tauri 런타임에서만 동적 import 한다(웹 번들에 포함되지 않게).
//  - 기본 동작: 새 버전이 있으면 조용히 내려받아 설치하고, 강제 재시작 없이
//    사용자의 다음 실행 시 새 버전이 적용된다(사용 중 방해 없음).
//    즉시 재시작이 필요하면 checkForUpdates({ relaunch: true }).
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
  // true면 업데이트 발견 시 자동으로 내려받아 설치한다.
  // false면 발견 여부만 반환하고, 설치는 호출 측에서 결정한다.
  autoInstall?: boolean;
  // 설치 후 즉시 앱을 재시작할지 여부.
  //  - false(기본): 조용히 설치만 하고 다음 실행 시 새 버전 적용(사용 중 방해 없음).
  //  - true: 설치 직후 relaunch()로 재시작.
  relaunch?: boolean;
  onProgress?: (p: UpdateProgress) => void;
}

// 업데이트를 확인한다.
//  - 반환: 적용 가능한 새 버전 문자열, 없으면 null(웹 환경도 null).
export const checkForUpdates = async (
  opts: CheckForUpdatesOptions = {},
): Promise<string | null> => {
  const { autoInstall = true, relaunch: doRelaunch = false, onProgress } = opts;
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
