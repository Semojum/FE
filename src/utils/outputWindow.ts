// 결과 전용 보조 창(반으로 나누기) 생성/종료.
//  - 웹: window.open (Tauri 웹뷰에선 동작하지 않음)
//  - 데스크톱(Tauri): WebviewWindow 네이티브 창
// 호출부가 환경을 신경 쓰지 않도록 동일한 핸들 인터페이스를 반환한다.

const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const OUTPUT_LABEL = 'output';
const WEB_FEATURES = 'width=900,height=900,resizable=yes,scrollbars=yes';

export interface OutputWindowHandle {
  close: () => void;
  // 창이 닫혔을 때(사용자가 직접 X 등) 콜백. 메인이 panelMode를 되돌리는 데 사용.
  onClosed: (cb: () => void) => void;
}

const outputUrl = (): string => `${window.location.pathname}?panel=output`;

export const openOutputWindow = async (): Promise<OutputWindowHandle | null> => {
  const url = outputUrl();

  // ── 웹: window.open ────────────────────────────────────────────────
  if (!isTauri()) {
    const popup = window.open(url, 'braillemate-output', WEB_FEATURES);
    if (!popup) return null; // 팝업 차단
    return {
      close: () => popup.close(),
      onClosed: (cb) => {
        const id = window.setInterval(() => {
          if (popup.closed) {
            window.clearInterval(id);
            cb();
          }
        }, 500);
      },
    };
  }

  // ── 데스크톱: WebviewWindow ────────────────────────────────────────
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');

  // 이미 열려 있으면 닫고 새로 만든다(중복 라벨 생성 에러 방지).
  const existing = await WebviewWindow.getByLabel(OUTPUT_LABEL);
  if (existing) await existing.close();

  const win = new WebviewWindow(OUTPUT_LABEL, {
    url,
    title: 'BrailleMate — 결과',
    width: 900,
    height: 900,
    resizable: true,
  });

  return new Promise<OutputWindowHandle | null>((resolve) => {
    win.once('tauri://created', () => {
      resolve({
        close: () => void win.close(),
        onClosed: (cb) => void win.once('tauri://destroyed', () => cb()),
      });
    });
    win.once('tauri://error', (e) => {
      console.error('결과 창 생성 실패:', e);
      resolve(null);
    });
  });
};
