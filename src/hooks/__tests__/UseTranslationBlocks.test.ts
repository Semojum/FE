import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTranslationBlocks } from '../UseTranslationBlocks';
import type { TranslationBlock } from '../../types';

const block = (id: string, currentText = id): TranslationBlock => ({
  id,
  currentText,
  candidates: [],
});

describe('useTranslationBlocks', () => {
  it('starts with empty blocksByPage', () => {
    const { result } = renderHook(() => useTranslationBlocks());
    expect(result.current.blocksByPage).toEqual({});
    expect(result.current.getBlocks(1)).toEqual([]);
  });

  it('setBlocksForPage stores blocks for a specific page', () => {
    const { result } = renderHook(() => useTranslationBlocks());
    act(() => result.current.setBlocksForPage(1, [block('a'), block('b')]));
    expect(result.current.getBlocks(1)).toHaveLength(2);
    expect(result.current.getBlocks(2)).toEqual([]);
  });

  it('updateBlock changes currentText in place', () => {
    const { result } = renderHook(() => useTranslationBlocks());
    act(() => result.current.setBlocksForPage(1, [block('a', 'old')]));
    act(() => result.current.updateBlock(1, 'a', 'new'));
    expect(result.current.getBlocks(1)[0].currentText).toBe('new');
  });

  it('updateBlock leaves other pages untouched', () => {
    const { result } = renderHook(() => useTranslationBlocks());
    act(() => result.current.setBlocksForPage(1, [block('a', 'p1')]));
    act(() => result.current.setBlocksForPage(2, [block('b', 'p2')]));
    act(() => result.current.updateBlock(1, 'a', 'p1-edit'));
    expect(result.current.getBlocks(2)[0].currentText).toBe('p2');
  });

  it('applyCandidate replaces currentText', () => {
    const { result } = renderHook(() => useTranslationBlocks());
    act(() =>
      result.current.setBlocksForPage(1, [
        { id: 'a', currentText: 'orig', candidates: ['cand1', 'cand2'] },
      ]),
    );
    act(() => result.current.applyCandidate(1, 'a', 'cand2'));
    expect(result.current.getBlocks(1)[0].currentText).toBe('cand2');
  });

  it('removeBlock removes by id', () => {
    const { result } = renderHook(() => useTranslationBlocks());
    act(() =>
      result.current.setBlocksForPage(1, [block('a'), block('b'), block('c')]),
    );
    act(() => result.current.removeBlock(1, 'b'));
    expect(result.current.getBlocks(1).map((b) => b.id)).toEqual(['a', 'c']);
  });

  it('addBlock inserts a new empty block after the given index', () => {
    const { result } = renderHook(() => useTranslationBlocks());
    act(() => result.current.setBlocksForPage(1, [block('a'), block('b')]));
    act(() => result.current.addBlock(1, 0)); // insert after index 0
    const ids = result.current.getBlocks(1).map((b) => b.id);
    expect(ids[0]).toBe('a');
    expect(ids[2]).toBe('b');
    // The inserted block has a fresh UUID and empty currentText
    expect(result.current.getBlocks(1)[1].currentText).toBe('');
    expect(result.current.getBlocks(1)[1].id).toEqual(expect.any(String));
  });

  it('reorderBlocks accepts a fully reordered array', () => {
    const { result } = renderHook(() => useTranslationBlocks());
    const blocks = [block('a'), block('b'), block('c')];
    act(() => result.current.setBlocksForPage(1, blocks));
    act(() => result.current.reorderBlocks(1, [blocks[2], blocks[0], blocks[1]]));
    expect(result.current.getBlocks(1).map((b) => b.id)).toEqual([
      'c',
      'a',
      'b',
    ]);
  });

  it('setAllBlocks replaces every page at once', () => {
    const { result } = renderHook(() => useTranslationBlocks());
    act(() => result.current.setBlocksForPage(1, [block('a')]));
    act(() => result.current.setAllBlocks({ 5: [block('z')] }));
    expect(result.current.getBlocks(1)).toEqual([]);
    expect(result.current.getBlocks(5)[0].id).toBe('z');
  });

  it('resetAllBlocks empties everything', () => {
    const { result } = renderHook(() => useTranslationBlocks());
    act(() => result.current.setBlocksForPage(1, [block('a')]));
    act(() => result.current.setBlocksForPage(2, [block('b')]));
    act(() => result.current.resetAllBlocks());
    expect(result.current.blocksByPage).toEqual({});
  });
});
