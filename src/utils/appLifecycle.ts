// 앱이 닫히기 직전에 마지막 저장을 밀어낸다.
//
// 브라우저의 beforeunload는 비동기 요청의 완료를 보장하지 않아, 종료 시점의 수정 내용이
// 유실될 수 있었다. 데스크톱(Tauri) 전용이 된 이상 창 닫기 요청을 직접 가로채
// 저장이 끝난 뒤에 창을 없애는 것이 확실하다 (탭별 작업물 보존 D-2).
//
// 웹/테스트 환경에서는 beforeunload로 최선 노력만 한다(개발 중 브라우저로 띄울 때).

const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// 저장이 아무리 오래 걸려도 이 시간이 지나면 창을 닫는다 — 종료가 막히면 안 된다.
const FLUSH_TIMEOUT_MS = 5000;

const withTimeout = (p: Promise<void>): Promise<void> =>
  Promise.race([
    p,
    new Promise<void>((resolve) => setTimeout(resolve, FLUSH_TIMEOUT_MS)),
  ]);

// 반환값은 해제 함수. handler는 저장이 끝나면 resolve해야 한다.
export const onAppClose = (handler: () => Promise<void>): (() => void) => {
  if (!isTauri()) {
    const onBeforeUnload = () => {
      // 확인 창으로 사용자를 붙잡지 않는다 — 보관은 앱이 알아서 한다.
      void handler();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }

  let unlisten: (() => void) | null = null;
  let disposed = false;

  void (async () => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const appWindow = getCurrentWindow();
    const stop = await appWindow.onCloseRequested(async (event) => {
      // 저장이 끝날 때까지 닫기를 보류한다.
      event.preventDefault();
      try {
        await withTimeout(handler());
      } catch (e) {
        // 저장에 실패해도 창은 닫아 준다 — 종료를 막는 것이 더 나쁘다.
        console.warn('종료 전 저장 실패', e);
      }
      // 결과 전용 창(반으로 나누기)이 열려 있으면 메인만 없애도 프로세스가 남아
      // 앱이 종료되지 않는다. 남은 창을 먼저 정리한다.
      try {
        const { getAllWindows } = await import('@tauri-apps/api/window');
        const others = (await getAllWindows()).filter(
          (w) => w.label !== appWindow.label,
        );
        await Promise.all(
          others.map((w) => w.destroy().catch(() => undefined)),
        );
      } catch (e) {
        console.warn('보조 창 정리 실패', e);
      }
      try {
        // destroy는 close-requested를 다시 발생시키지 않으므로 순환하지 않는다.
        await appWindow.destroy();
      } catch (e) {
        // destroy가 막히면(권한 누락 등) 창이 영영 닫히지 않는다 — 프로세스를 직접 끝낸다.
        console.warn('창 destroy 실패 — 프로세스 종료로 대체', e);
        const { exit } = await import('@tauri-apps/plugin-process');
        await exit(0);
      }
    });
    if (disposed) stop();
    else unlisten = stop;
  })();

  return () => {
    disposed = true;
    unlisten?.();
  };
};
