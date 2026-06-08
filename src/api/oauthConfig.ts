import { OAuthProvider } from '../types/auth';

// 데스크톱(네이티브) OAuth — RFC 8252 loopback 방식.
// 시스템 브라우저로 로그인 → http://127.0.0.1:{PORT} 로 리다이렉트되며
// 앱이 임시 localhost 서버로 그 redirect를 받아 code를 추출한다.
// (BE 명세의 redirectUri 예시 http://127.0.0.1:{PORT} 와 동일한 설계)
//
// ⚠️ 카카오는 redirect URI 정확 일치가 필요하므로 포트를 고정한다.
//    provider 콘솔에 http://127.0.0.1:<이 포트> 를 등록해야 한다.
//    (구글 "데스크톱 앱" 클라이언트는 loopback 포트를 임의 허용하지만,
//     양쪽 일관성을 위해 동일 포트를 등록하는 것을 권장)
export const OAUTH_LOOPBACK_PORT = Number(
  import.meta.env.VITE_OAUTH_PORT ?? '4279',
);

interface ProviderConfig {
  authorizeUrl: string;
  clientId: string;
  scope: string;
  usePkce: boolean;
}

export const OAUTH_CONFIG: Record<OAuthProvider, ProviderConfig> = {
  kakao: {
    authorizeUrl: 'https://kauth.kakao.com/oauth/authorize',
    clientId: import.meta.env.VITE_KAKAO_CLIENT_ID ?? '',
    scope: '',
    usePkce: false,
  },
  google: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '',
    scope: 'openid email profile',
    usePkce: true,
  },
};
