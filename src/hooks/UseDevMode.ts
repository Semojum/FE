import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEV_MODE_CLICKS,
  DEV_MODE_CLICK_WINDOW_MS,
  getBuildChannel,
  loadDevMode,
  saveDevMode,
  type BuildChannel,
} from '../utils/devMode';

// 버전 배지 일곱 번 연타 → 확인 → 개발자 모드. 개발자 모드에서 다시 일곱 번 → 메인.
//
// 연타 판정은 "마지막 클릭에서 1.5초 안"이다. 그냥 횟수만 세면 며칠에 걸쳐 눌린
// 클릭이 쌓여 어느 날 갑자기 물어보게 된다.
export const useDevMode = () => {
  const [devMode, setDevMode] = useState(loadDevMode);
  const [askOpen, setAskOpen] = useState(false);
  const [channel, setChannel] = useState<BuildChannel>('production');
  const clicks = useRef(0);
  const lastAt = useRef(0);

  useEffect(() => {
    let alive = true;
    void getBuildChannel().then((c) => {
      if (alive) setChannel(c);
    });
    return () => {
      alive = false;
    };
  }, []);

  const registerClick = useCallback(() => {
    const t = Date.now();
    clicks.current = t - lastAt.current > DEV_MODE_CLICK_WINDOW_MS ? 1 : clicks.current + 1;
    lastAt.current = t;
    if (clicks.current >= DEV_MODE_CLICKS) {
      clicks.current = 0;
      setAskOpen(true);
    }
  }, []);

  const confirm = useCallback(() => {
    setAskOpen(false);
    setDevMode((prev) => {
      const next = !prev;
      saveDevMode(next);
      return next;
    });
  }, []);

  const cancel = useCallback(() => setAskOpen(false), []);

  return { devMode, askOpen, channel, registerClick, confirm, cancel };
};
