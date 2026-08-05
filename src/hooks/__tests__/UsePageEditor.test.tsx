import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePageEditor } from '../UsePageEditor';
import { TranslationBlock } from '../../types';

vi.mock('../../api/JobService', () => ({
  savePageElements: vi.fn(),
}));
import { savePageElements } from '../../api/JobService';

const block = (id: string, text: string): TranslationBlock => ({
  id,
  currentText: text,
  candidates: [],
});

// 페이지별 블록을 들고 있는 최소한의 저장소로 훅을 감싼다.
const setup = (initial: Record<number, TranslationBlock[]> = {}) => {
  const store: Record<number, TranslationBlock[]> = { ...initial };
  const readBlocks = (page: number) => store[page] ?? [];
  const setBlocksForPage = (page: number, blocks: TranslationBlock[]) => {
    store[page] = blocks;
  };
  const replaceBlockId = (page: number, oldId: string, newId: string) => {
    store[page] = (store[page] ?? []).map((b) =>
      b.id === oldId ? { ...b, id: newId } : b,
    );
  };
  const hook = renderHook(() =>
    usePageEditor({
      jobId: 'job_1',
      token: 'tok',
      elementType: 'BRAILLE',
      readBlocks,
      setBlocksForPage,
      replaceBlockId,
    }),
  );
  return { hook, store };
};

beforeEach(() => vi.clearAllMocks());

describe('usePageEditor — 되돌리기', () => {
  it('pushHistory 이후 undo가 이전 상태로 되돌린다', () => {
    const { hook, store } = setup({ 1: [block('el-1', 'before')] });

    act(() => {
      hook.result.current.pushHistory(1);
      store[1] = [block('el-1', 'after')];
      hook.result.current.markDirty(1);
    });
    expect(store[1][0].currentText).toBe('after');

    act(() => {
      hook.result.current.undo(1);
    });
    expect(store[1][0].currentText).toBe('before');
  });

  it('undo 후 redo가 다시 실행한다', () => {
    const { hook, store } = setup({ 1: [block('el-1', 'v1')] });

    act(() => {
      hook.result.current.pushHistory(1);
      store[1] = [block('el-1', 'v2')];
    });
    act(() => {
      hook.result.current.undo(1);
    });
    expect(store[1][0].currentText).toBe('v1');

    act(() => {
      hook.result.current.redo(1);
    });
    expect(store[1][0].currentText).toBe('v2');
  });

  it('되돌릴 기록이 없으면 아무것도 하지 않는다', () => {
    const { hook } = setup({ 1: [block('el-1', 'x')] });
    let result = true;
    act(() => {
      result = hook.result.current.undo(1);
    });
    expect(result).toBe(false);
  });

  it('새 편집이 생기면 다시 실행 스택이 비워진다', () => {
    const { hook, store } = setup({ 1: [block('el-1', 'v1')] });

    act(() => {
      hook.result.current.pushHistory(1);
      store[1] = [block('el-1', 'v2')];
    });
    act(() => {
      hook.result.current.undo(1); // v1
    });
    act(() => {
      hook.result.current.pushHistory(1); // 새 편집
      store[1] = [block('el-1', 'v3')];
    });

    let redone = true;
    act(() => {
      redone = hook.result.current.redo(1);
    });
    expect(redone).toBe(false);
    expect(store[1][0].currentText).toBe('v3');
  });
});

describe('usePageEditor — 페이지 일괄 저장', () => {
  it('변경이 없으면 요청을 보내지 않는다', async () => {
    const { hook } = setup({ 1: [block('el-1', 'x')] });
    await act(async () => {
      await hook.result.current.savePage(1);
    });
    expect(savePageElements).not.toHaveBeenCalled();
  });

  it('서버가 아는 id는 그대로, 신규 블록은 elementId=null로 보낸다', async () => {
    const { hook, store } = setup({
      1: [block('el-1', 'a'), block('local-uuid', 'b')],
    });
    vi.mocked(savePageElements).mockResolvedValue({
      savedCount: 2,
      elementIds: ['el-1', 'el-new'],
      editLogged: { edited: 1, added: 1, deleted: 0 },
    });

    act(() => {
      // SSE로 받은 블록만 서버가 아는 요소로 등록한다.
      hook.result.current.registerServerBlocks([block('el-1', 'a')]);
      hook.result.current.markDirty(1);
    });

    await act(async () => {
      await hook.result.current.savePage(1);
    });

    expect(savePageElements).toHaveBeenCalledWith(
      'job_1',
      1,
      'BRAILLE',
      [
        { elementId: 'el-1', contents: ['a'] },
        { elementId: null, contents: ['b'] },
      ],
      'tok',
    );
    // 응답 배열 위치로 신규 블록의 정식 id가 매핑된다.
    expect(store[1][1].id).toBe('el-new');
  });

  it('여러 줄 텍스트는 contents 배열로 나눠 보낸다', async () => {
    const { hook } = setup({ 1: [block('el-1', '첫 줄\n둘째 줄')] });
    vi.mocked(savePageElements).mockResolvedValue({
      savedCount: 1,
      elementIds: ['el-1'],
      editLogged: { edited: 1, added: 0, deleted: 0 },
    });

    act(() => {
      hook.result.current.registerServerBlocks([block('el-1', 'x')]);
      hook.result.current.markDirty(1);
    });
    await act(async () => {
      await hook.result.current.savePage(1);
    });

    expect(vi.mocked(savePageElements).mock.calls[0][3]).toEqual([
      { elementId: 'el-1', contents: ['첫 줄', '둘째 줄'] },
    ]);
  });

  it('저장에 실패하면 dirty를 되돌려 다음 기회에 다시 보낸다', async () => {
    const { hook } = setup({ 1: [block('el-1', 'a')] });
    vi.mocked(savePageElements).mockRejectedValue(new Error('network'));

    act(() => hook.result.current.markDirty(1));
    await act(async () => {
      await hook.result.current.savePage(1);
    });

    expect(hook.result.current.isDirty(1)).toBe(true);
    expect(hook.result.current.saveStates[1]).toBe('error');
    expect(hook.result.current.saveError).toBeTruthy();
  });

  it('saveAllDirty가 남은 페이지를 모두 밀어낸다', async () => {
    const { hook } = setup({
      1: [block('el-1', 'a')],
      2: [block('el-2', 'b')],
    });
    vi.mocked(savePageElements).mockResolvedValue({
      savedCount: 1,
      elementIds: ['el-1'],
      editLogged: { edited: 1, added: 0, deleted: 0 },
    });

    act(() => {
      hook.result.current.markDirty(1);
      hook.result.current.markDirty(2);
    });
    expect(hook.result.current.hasUnsaved()).toBe(true);

    await act(async () => {
      await hook.result.current.saveAllDirty();
    });

    expect(savePageElements).toHaveBeenCalledTimes(2);
    expect(hook.result.current.hasUnsaved()).toBe(false);
  });

  it('resetEditor가 되돌리기 기록을 버린다 (세션 종료 시 D-3)', () => {
    const { hook, store } = setup({ 1: [block('el-1', 'v1')] });
    act(() => {
      hook.result.current.pushHistory(1);
      store[1] = [block('el-1', 'v2')];
    });
    act(() => hook.result.current.resetEditor());

    let undone = true;
    act(() => {
      undone = hook.result.current.undo(1);
    });
    expect(undone).toBe(false);
  });
});
