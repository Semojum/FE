import { useCallback, useEffect, useRef, useState } from 'react';

// 윈도우 탐색기 관습을 그대로 따르는 다중 선택 (마이페이지 3-2 "여러 개 선택").
//  - 클릭        : 단일 선택
//  - Ctrl+클릭   : 하나씩 토글
//  - Shift+클릭  : 마지막 기준점부터 범위 선택
//  - Ctrl+A      : 불러온 파일 전체 (전체 선택 버튼은 두지 않는다)
//  - ESC / 빈 곳 : 해제
// 묶어서 조작하는 것은 파일만이다. 폴더는 메뉴에서 하나씩 다룬다 (D-6).

export const useCardSelection = (orderedIds: string[], enabled: boolean) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Shift 범위 선택의 기준점
  const anchorRef = useRef<string | null>(null);
  const idsRef = useRef(orderedIds);
  idsRef.current = orderedIds;

  const clear = useCallback(() => {
    setSelected(new Set());
    anchorRef.current = null;
  }, []);

  // 목록이 바뀌면(폴더 이동·검색·필터) 사라진 항목의 선택을 정리한다.
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const alive = new Set(orderedIds);
      const next = new Set([...prev].filter((id) => alive.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [orderedIds]);

  const handleClick = useCallback(
    (
      id: string,
      e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean },
    ) => {
      const ids = idsRef.current;
      if (e.shiftKey && anchorRef.current) {
        const from = ids.indexOf(anchorRef.current);
        const to = ids.indexOf(id);
        if (from !== -1 && to !== -1) {
          const [lo, hi] = from < to ? [from, to] : [to, from];
          setSelected(new Set(ids.slice(lo, hi + 1)));
          return;
        }
      }
      if (e.ctrlKey || e.metaKey) {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
        anchorRef.current = id;
        return;
      }
      setSelected(new Set([id]));
      anchorRef.current = id;
    },
    [],
  );

  // Ctrl+A(전체 선택) / ESC(해제)
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      // 입력 중에는 가로채지 않는다 (검색창의 Ctrl+A는 텍스트 전체 선택이어야 한다).
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
      ) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setSelected(new Set(idsRef.current));
      } else if (e.key === 'Escape') {
        clear();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, clear]);

  return { selected, setSelected, clear, handleClick };
};
