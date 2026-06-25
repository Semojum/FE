import { useCallback, useState } from 'react';
import { OAuthProvider } from '../types/auth';
import { exchangeOAuthCode } from '../api/AuthService';
import { OAUTH_CONFIG, OAUTH_LOOPBACK_PORT } from '../api/oauthConfig';
import { createPkcePair, randomState } from '../utils/pkce';

// Tauri(데스크톱) 런타임 여부. 일반 브라우저/테스트에서는 false.
const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// Tauri 커맨드/플러그인은 실패를 Error 인스턴스가 아니라 문자열·객체로 reject하는 경우가 많다.
// `e instanceof Error`만 보면 진짜 원인(예: "oauth.start not allowed", "Address already in use")이
// 버려지고 generic 메시지만 남는다. 어떤 형태든 사람이 읽을 문자열로 변환해 표면화한다.
const toErrorMessage = (e: unknown, fallback: string): string => {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string' && e.trim()) return e;
  if (e != null && typeof e === 'object') {
    try {
      return JSON.stringify(e);
    } catch {
      /* noop */
    }
  }
  return fallback;
};

type OnTokens = (accessToken: string, refreshToken?: string | null) => void;

// 데스크톱 소셜 로그인 훅 (RFC 8252 loopback).
//  1) localhost 임시 서버 기동(tauri-plugin-oauth)
//  2) 시스템 브라우저로 authorize URL 열기(tauri-plugin-opener)
//  3) http://127.0.0.1:{PORT}?code=... 리다이렉트를 수신
//  4) BE(/api/auth/{provider})와 code 교환 → 토큰
export const useOAuth = (onTokens: OnTokens) => {
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startLogin = useCallback(
    async (provider: OAuthProvider) => {
      setError(null);

      if (!isTauri()) {
        setError('소셜 로그인은 데스크톱 앱에서만 사용할 수 있습니다.');
        return;
      }
      const cfg = OAUTH_CONFIG[provider];
      if (!cfg.clientId) {
        setError(
          `${provider} 클라이언트 ID가 설정되지 않았습니다. .env의 VITE_${provider.toUpperCase()}_CLIENT_ID를 확인하세요.`,
        );
        return;
      }

      setIsAuthorizing(true);

      // Tauri 환경에서만 플러그인을 로드(동적 import) — 웹 번들/테스트에서 평가되지 않게 한다.
      // ⚠️ 패키지명/시그니처는 첫 빌드 시 확인 필요:
      //    - @fabianlars/tauri-plugin-oauth : start({ports,response}) → port, onUrl(cb), cancel(port)
      //    - @tauri-apps/plugin-opener      : openUrl(url)
      const { start, cancel, onUrl } = await import(
        '@fabianlars/tauri-plugin-oauth'
      );
      const { openUrl } = await import('@tauri-apps/plugin-opener');

      let port: number | null = null;
      let unlisten: (() => void) | null = null;

      const cleanup = async () => {
        try {
          unlisten?.();
        } catch {
          /* noop */
        }
        try {
          if (port != null) await cancel(port);
        } catch {
          /* noop */
        }
        setIsAuthorizing(false);
      };

      try {
        // 카카오 redirect URI 일치를 위해 고정 포트만 시도한다.
        port = await start({
          ports: [OAUTH_LOOPBACK_PORT],
          response: '로그인이 완료되었습니다. 이 창을 닫고 앱으로 돌아가세요.',
        });
        const redirectUri = `http://127.0.0.1:${port}`;
        const state = randomState();

        const params = new URLSearchParams({
          client_id: cfg.clientId,
          redirect_uri: redirectUri,
          response_type: 'code',
          state,
        });
        if (cfg.scope) params.set('scope', cfg.scope);

        let codeVerifier = '';
        if (cfg.usePkce) {
          const pair = await createPkcePair();
          codeVerifier = pair.verifier;
          params.set('code_challenge', pair.challenge);
          params.set('code_challenge_method', 'S256');
        }

        // redirect 수신 핸들러를 브라우저 열기 전에 등록한다.
        unlisten = await onUrl(async (url: string) => {
          try {
            const parsed = new URL(url);
            const code = parsed.searchParams.get('code');
            const returnedState = parsed.searchParams.get('state');
            const oauthErr = parsed.searchParams.get('error');
            if (oauthErr) throw new Error(`소셜 로그인 실패 (${oauthErr})`);
            if (!code) throw new Error('인가 코드를 받지 못했습니다.');
            if (returnedState !== state) {
              throw new Error('state가 일치하지 않습니다. (CSRF 의심)');
            }
            const res = await exchangeOAuthCode(provider, {
              code,
              codeVerifier,
              redirectUri,
            });
            onTokens(res.accessToken, res.refreshToken);
          } catch (e) {
            setError(toErrorMessage(e, '소셜 로그인에 실패했습니다.'));
          } finally {
            await cleanup();
          }
        });

        await openUrl(`${cfg.authorizeUrl}?${params.toString()}`);
      } catch (e) {
        setError(toErrorMessage(e, '소셜 로그인을 시작할 수 없습니다.'));
        await cleanup();
      }
    },
    [onTokens],
  );

  return { startLogin, isAuthorizing, error };
};
