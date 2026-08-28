import React from 'react';
import AppVersionBadge, { APP_VERSION } from '../../shared/AppVersionBadge';
import ConfirmModal from '../../shared/ConfirmModal';
import DevOverlay from './DevOverlay';
import { useDevMode } from '../../../hooks/UseDevMode';
import { DEV_MODE_CLICKS } from '../../../utils/devMode';

// 버전 배지 · 개발자 모드 진입/이탈 · 계측 오버레이를 한 덩어리로 묶는다.
//
// 로그인 화면과 본 화면은 서로를 대체하며 뜨는데(App이 인증 전에는 LoginScreen을
// 그대로 반환한다) 배지는 양쪽에 다 있어야 한다. 두 곳에서 이 조각 하나만 쓰면
// 진입 방법이 갈리지 않는다 — 모드 자체는 localStorage에 남아 화면이 바뀌어도 유지된다.
const DevModeLayer: React.FC = () => {
  const { devMode, askOpen, channel, registerClick, confirm, cancel } =
    useDevMode();

  return (
    <>
      <AppVersionBadge onClick={registerClick} channel={channel} />

      {devMode && (
        <DevOverlay version={APP_VERSION} onExitRequest={confirm} />
      )}

      <ConfirmModal
        isOpen={askOpen}
        title={devMode ? '메인 모드로 돌아갈까요?' : '개발자 모드로 갈까요?'}
        message={
          devMode
            ? '계측 오버레이를 닫고 평소 화면으로 돌아갑니다.'
            : `화면 구석에 RAM · CPU · 네트워크 응답 시간 같은 계측값이 뜹니다.\n작업에는 영향을 주지 않고, 버전을 ${DEV_MODE_CLICKS}번 누르면 다시 나올 수 있습니다.`
        }
        confirmLabel={devMode ? '메인 모드로' : '개발자 모드로'}
        onConfirm={confirm}
        onClose={cancel}
      />
    </>
  );
};

export default DevModeLayer;
