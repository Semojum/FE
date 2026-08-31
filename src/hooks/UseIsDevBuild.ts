import { useEffect, useState } from 'react';
import { getBuildChannel } from '../utils/devMode';

/**
 * 지금 실행 중인 것이 개발 빌드(`세모점 (개발)`)인지.
 *
 * 아직 완성되지 않은 기능은 프로덕션에서 막고 개발 빌드에서는 그대로 쓴다 —
 * 현장에서 미리 만져 보고 피드백을 받으려고 만든 빌드이기 때문이다
 * (utils/unfinished.ts 머리말).
 *
 * 판단이 비동기라 첫 렌더에서는 늘 false(=프로덕션)로 시작한다. 잘못 막는 쪽이
 * 잘못 열어 주는 쪽보다 안전해서 이 방향으로 둔다 — 개발 빌드에서 첫 프레임에
 * 잠깐 잠긴 것처럼 보여도 곧 풀린다.
 */
export const useIsDevBuild = (): boolean => {
  const [isDev, setIsDev] = useState(false);
  useEffect(() => {
    let alive = true;
    void getBuildChannel().then((channel) => {
      if (alive) setIsDev(channel === 'development');
    });
    return () => {
      alive = false;
    };
  }, []);
  return isDev;
};
