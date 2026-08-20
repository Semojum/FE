import React from 'react';

// 앱 버전을 화면 왼쪽 아래 구석에 조용히 적어 둔다.
// 문의·장애 신고 때 "어느 버전이냐"를 되묻지 않아도 되게 늘 보이게 한다.
// 로그인 화면(z-50)·마이페이지(z-50) 위, 모달(z-60)·토스트(z-70) 아래에 깔린다.
const AppVersionBadge: React.FC = () => (
  <span className="pointer-events-none fixed bottom-1.5 left-3 z-[52] select-none text-[11px] text-gray-400">
    v{(import.meta.env.VITE_APP_VERSION as string | undefined) ?? '0.0.0'}
  </span>
);

export default AppVersionBadge;
