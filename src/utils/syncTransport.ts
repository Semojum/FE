// 창 간 동기화 전송 계층.
//  - 웹/브라우저: BroadcastChannel (같은 origin의 다른 탭/창에 전달, 자기 자신엔 미전달)
//  - 데스크톱(Tauri): Tauri 이벤트(emit/listen). BroadcastChannel은 Tauri의 분리된
//    웹뷰 창 사이에서는 전달되지 않으므로 네이티브 이벤트 버스를 사용한다.
//    (Tauri emit은 보낸 창에도 전달되지만, 메시지 타입별 역할 분기로 자기 메시지는 무시된다.)

const CHANNEL = 'braillemate-sync';

const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export interface SyncTransport {
  post: (msg: unknown) => void;
  close: () => void;
}

export const createSyncTransport = (
  onMessage: (msg: unknown) => void,
): SyncTransport => {
  // ── 웹: BroadcastChannel ───────────────────────────────────────────
  if (!isTauri()) {
    const ch = new BroadcastChannel(CHANNEL);
    ch.onmessage = (e: MessageEvent) => onMessage(e.data);
    return {
      post: (msg) => ch.postMessage(msg),
      close: () => ch.close(),
    };
  }

  // ── 데스크톱: Tauri 이벤트 ─────────────────────────────────────────
  let unlisten: (() => void) | null = null;
  let closed = false;

  void import('@tauri-apps/api/event').then(({ listen }) => {
    if (closed) return;
    void listen(CHANNEL, (e: { payload: unknown }) => onMessage(e.payload)).then(
      (un) => {
        if (closed) un();
        else unlisten = un;
      },
    );
  });

  return {
    post: (msg) => {
      void import('@tauri-apps/api/event').then(({ emit }) =>
        emit(CHANNEL, msg),
      );
    },
    close: () => {
      closed = true;
      unlisten?.();
      unlisten = null;
    },
  };
};
