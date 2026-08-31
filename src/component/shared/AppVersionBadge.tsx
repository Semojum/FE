import React from 'react';
import type { BuildChannel } from '../../utils/devMode';

// 앱 버전을 화면 왼쪽 아래 구석에 조용히 적어 둔다.
// 문의·장애 신고 때 "어느 버전이냐"를 되묻지 않아도 되게 늘 보이게 한다.
// 로그인 화면(z-50)·마이페이지(z-50) 위, 모달(z-60)·토스트(z-70) 아래에 깔린다.
//
// 개발 빌드(3.3.0)는 프로덕션(3.2.1)과 나란히 설치되므로, 어느 앱을 보고 있는지
// 여기서 바로 구분되어야 한다 — 창 제목만으로는 두 창을 띄워 놓으면 헷갈린다.
//
// 일곱 번 누르면 개발자 모드를 물어본다(UseDevMode). 그래서 pointer-events를 살리되,
// 배지가 화면 조작을 가리지 않도록 글자 크기만큼만 차지하게 둔다.

interface Props {
  onClick?: () => void;
  channel?: BuildChannel;
}

export const APP_VERSION =
  (import.meta.env.VITE_APP_VERSION as string | undefined) ?? '0.0.0';

const AppVersionBadge: React.FC<Props> = ({ onClick, channel }) => {
  const isDev = channel === 'development';
  return (
    <button
      type="button"
      onClick={onClick}
      // 개발자 모드 진입은 숨은 조작이다 — 스크린 리더에도 버전만 읽히게 둔다.
      aria-label={`앱 버전 ${APP_VERSION}${isDev ? ' 개발 빌드' : ''}`}
      // bottom-1.5는 최대화한 창에서 작업 표시줄에 닿아 잘려 보였다(2026-08-28).
      className={`fixed bottom-3 left-3 z-[52] select-none rounded px-1 text-[11px] transition-colors ${
        isDev
          ? 'bg-[#f47726]/15 font-semibold text-[#c2410c] hover:bg-[#f47726]/25'
          : 'text-gray-400 hover:text-gray-500'
      }`}
    >
      v{APP_VERSION}
      {isDev && ' 개발'}
    </button>
  );
};

export default AppVersionBadge;
