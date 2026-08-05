import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useCardSelection } from '../UseCardSelection';

const IDS = ['a', 'b', 'c', 'd'];
const plain = { ctrlKey: false, metaKey: false, shiftKey: false };
const ctrl = { ...plain, ctrlKey: true };
const shift = { ...plain, shiftKey: true };

describe('useCardSelection — 윈도우 탐색기 방식 다중 선택', () => {
  it('클릭은 단일 선택으로 바꾼다', () => {
    const { result } = renderHook(() => useCardSelection(IDS, true));
    act(() => result.current.handleClick('a', plain));
    act(() => result.current.handleClick('c', plain));
    expect([...result.current.selected]).toEqual(['c']);
  });

  it('Ctrl+클릭은 하나씩 토글한다', () => {
    const { result } = renderHook(() => useCardSelection(IDS, true));
    act(() => result.current.handleClick('a', ctrl));
    act(() => result.current.handleClick('c', ctrl));
    expect(result.current.selected).toEqual(new Set(['a', 'c']));

    act(() => result.current.handleClick('a', ctrl));
    expect(result.current.selected).toEqual(new Set(['c']));
  });

  it('Shift+클릭은 기준점부터 범위로 선택한다', () => {
    const { result } = renderHook(() => useCardSelection(IDS, true));
    act(() => result.current.handleClick('b', plain));
    act(() => result.current.handleClick('d', shift));
    expect(result.current.selected).toEqual(new Set(['b', 'c', 'd']));
  });

  it('Shift 범위는 역방향도 동작한다', () => {
    const { result } = renderHook(() => useCardSelection(IDS, true));
    act(() => result.current.handleClick('d', plain));
    act(() => result.current.handleClick('b', shift));
    expect(result.current.selected).toEqual(new Set(['b', 'c', 'd']));
  });

  it('목록에서 사라진 항목의 선택은 정리된다', () => {
    const { result, rerender } = renderHook(
      ({ ids }) => useCardSelection(ids, true),
      { initialProps: { ids: IDS } },
    );
    act(() => result.current.handleClick('d', plain));
    rerender({ ids: ['a', 'b'] });
    expect(result.current.selected.size).toBe(0);
  });

  it('clear는 전부 해제한다', () => {
    const { result } = renderHook(() => useCardSelection(IDS, true));
    act(() => result.current.handleClick('a', ctrl));
    act(() => result.current.clear());
    expect(result.current.selected.size).toBe(0);
  });
});
