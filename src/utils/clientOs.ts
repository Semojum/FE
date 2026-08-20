// 접속 환경(OS)을 서버에 알린다 — 운영자 콘솔 "작업 상세(T1-4) · 접속 환경"에 뜬다.
//
// 데스크톱 앱의 요청은 webview가 아니라 네이티브(tauri-plugin-http)에서 나가므로
// User-Agent에 OS가 실리지 않는다. 그래서 명세(2026-08-20)대로 FE가 X-Client-Os
// 헤더로 직접 보낸다. 값이 없으면 서버는 clientOs를 null로 둔다.

// Tauri(데스크톱) 런타임 여부 — httpFetch와 같은 기준.
const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// 요청 헤더는 동기로 만들어지므로, 값은 앱 시작 때 한 번 구해 두고 여기서 읽는다.
let clientOs: string | null = null;

export const getClientOs = (): string | null => clientOs;

// 테스트·재시작용.
export const setClientOs = (value: string | null): void => {
  clientOs = value;
};

// 'windows' + '10.0.22631' → 'Windows 11'
// 윈도우는 11도 커널 버전이 10.0이고 빌드 번호(22000+)로만 갈린다.
export const formatOs = (
  platform: string,
  version: string | null,
): string | null => {
  const build = Number(version?.split('.')[2] ?? NaN);
  switch (platform) {
    case 'windows':
      return `Windows ${Number.isFinite(build) && build >= 22000 ? 11 : 10}`;
    case 'macos':
      return version ? `macOS ${version}` : 'macOS';
    case 'linux':
      return version ? `Linux ${version}` : 'Linux';
    default:
      return platform ? platform : null;
  }
};

// 브라우저(개발·테스트)에서는 UA로 대신한다 — 데스크톱 배포본은 위 경로를 탄다.
export const osFromUserAgent = (ua: string): string | null => {
  if (/Windows NT 10/.test(ua)) return 'Windows 10';
  if (/Windows/.test(ua)) return 'Windows';
  const mac = /Mac OS X (\d+)[._](\d+)/.exec(ua);
  if (mac) return `macOS ${mac[1]}.${mac[2]}`;
  if (/Linux/.test(ua)) return 'Linux';
  return null;
};

// 앱 시작 때 한 번 부른다. 실패해도 조용히 넘긴다 — 헤더 하나 때문에 앱이
// 멈추거나 오류를 띄우면 안 된다(없으면 서버가 null로 기록할 뿐이다).
export const initClientOs = async (): Promise<void> => {
  try {
    if (isTauri()) {
      const os = await import('@tauri-apps/plugin-os');
      clientOs = formatOs(os.platform(), os.version());
      return;
    }
    if (typeof navigator !== 'undefined') {
      clientOs = osFromUserAgent(navigator.userAgent);
    }
  } catch (e) {
    console.warn('접속 환경(OS) 확인 실패', e);
  }
};
