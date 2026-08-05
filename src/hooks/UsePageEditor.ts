import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TranslationBlock } from '../types';
import { ElementType, savePageElements } from '../api/JobService';
import { toUserMessage } from '../api/errorMessages';

// V3 편집 모델 (기능정의서 "블록 단위 결과 편집" + API "수정 페이지 일괄 저장")
//
// 페이지 안의 모든 편집(내용 수정·추가·삭제·순서 변경)을 FE가 로컬에서 관리하다가,
// 페이지 이동 / 앱 종료 / Ctrl+S 시점에 그 페이지의 최종 상태 전체를 한 번에 보낸다.
// 되돌리기(Ctrl+Z / Ctrl+Shift+Z)도 FE가 페이지 단위로 들고 있으며 서버에 남기지 않는다
// (D-3: 세션 종료 후 기록 삭제).

export type PageSaveState = 'saving' | 'saved' | 'error';

// 되돌리기 스택 상한 — 한 페이지에서 이 횟수만큼 거슬러 올라갈 수 있다.
const HISTORY_LIMIT = 100;

interface PageHistory {
  past: TranslationBlock[][];
  future: TranslationBlock[][];
}

interface UsePageEditorOptions {
  jobId: string | null;
  token: string | null;
  elementType: ElementType;
  // 최신 블록을 읽기 위한 접근자 (state가 아닌 ref 기반이어야 저장 시점 값이 정확하다)
  readBlocks: (page: number) => TranslationBlock[];
  setBlocksForPage: (page: number, blocks: TranslationBlock[]) => void;
  replaceBlockId: (page: number, oldId: string, newId: string) => void;
}

export const usePageEditor = ({
  jobId,
  token,
  elementType,
  readBlocks,
  setBlocksForPage,
  replaceBlockId,
}: UsePageEditorOptions) => {
  // 서버가 알고 있는 요소 id 집합. 여기 없는 id는 FE가 만든 신규 블록이라
  // 저장 시 elementId를 null로 보내고, 응답에서 정식 id를 받아 교체한다.
  const serverIdsRef = useRef<Set<string>>(new Set());
  const historyRef = useRef<Record<number, PageHistory>>({});
  const dirtyRef = useRef<Set<number>>(new Set());

  const [saveStates, setSaveStates] = useState<Record<number, PageSaveState>>(
    {},
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  // 되돌리기 가능 여부를 화면에 반영하기 위한 카운터(ref만으로는 리렌더가 안 걸린다)
  const [historyVersion, setHistoryVersion] = useState(0);

  // 콜백 안에서 최신 옵션을 읽기 위한 미러
  const ctxRef = useRef({ jobId, token, elementType });
  useEffect(() => {
    ctxRef.current = { jobId, token, elementType };
  }, [jobId, token, elementType]);

  const setPageState = useCallback(
    (page: number, state: PageSaveState | null) => {
      setSaveStates((prev) => {
        if (state === null) {
          if (!(page in prev)) return prev;
          const next = { ...prev };
          delete next[page];
          return next;
        }
        if (prev[page] === state) return prev;
        return { ...prev, [page]: state };
      });
    },
    [],
  );

  // 서버에서 받은(또는 저장으로 확정된) 블록들의 id를 "서버에 있는 것"으로 등록한다.
  const registerServerBlocks = useCallback((blocks: TranslationBlock[]) => {
    blocks.forEach((b) => serverIdsRef.current.add(b.id));
  }, []);

  // ─── 되돌리기 ────────────────────────────────────────────────────────

  // 변경을 적용하기 "직전"에 호출해 현재 상태를 과거 스택에 쌓는다.
  const pushHistory = useCallback(
    (page: number) => {
      const h = historyRef.current[page] ?? { past: [], future: [] };
      const past = [...h.past, readBlocks(page)];
      if (past.length > HISTORY_LIMIT) past.shift();
      // 새 편집이 생기면 다시 실행 스택은 무효가 된다.
      historyRef.current[page] = { past, future: [] };
      setHistoryVersion((v) => v + 1);
    },
    [readBlocks],
  );

  const markDirty = useCallback(
    (page: number) => {
      dirtyRef.current.add(page);
      setPageState(page, null);
    },
    [setPageState],
  );

  const undo = useCallback(
    (page: number) => {
      const h = historyRef.current[page];
      if (!h?.past.length) return false;
      const past = [...h.past];
      const previous = past.pop() as TranslationBlock[];
      historyRef.current[page] = {
        past,
        future: [readBlocks(page), ...h.future].slice(0, HISTORY_LIMIT),
      };
      setBlocksForPage(page, previous);
      markDirty(page);
      setHistoryVersion((v) => v + 1);
      return true;
    },
    [readBlocks, setBlocksForPage, markDirty],
  );

  const redo = useCallback(
    (page: number) => {
      const h = historyRef.current[page];
      if (!h?.future.length) return false;
      const [next, ...rest] = h.future;
      historyRef.current[page] = {
        past: [...h.past, readBlocks(page)].slice(-HISTORY_LIMIT),
        future: rest,
      };
      setBlocksForPage(page, next);
      markDirty(page);
      setHistoryVersion((v) => v + 1);
      return true;
    },
    [readBlocks, setBlocksForPage, markDirty],
  );

  const canUndo = useCallback(
    (page: number) => (historyRef.current[page]?.past.length ?? 0) > 0,
    // historyVersion이 바뀔 때 재평가되도록 의존성에 남긴다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [historyVersion],
  );
  const canRedo = useCallback(
    (page: number) => (historyRef.current[page]?.future.length ?? 0) > 0,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [historyVersion],
  );

  // ─── 저장 ────────────────────────────────────────────────────────────

  const isDirty = useCallback((page: number) => dirtyRef.current.has(page), []);
  const hasUnsaved = useCallback(() => dirtyRef.current.size > 0, []);

  // 한 페이지의 최종 상태를 서버에 반영한다. 변경이 없으면 아무것도 하지 않는다.
  const savePage = useCallback(
    async (page: number, force = false): Promise<boolean> => {
      const { jobId: id, token: tk, elementType: type } = ctxRef.current;
      if (!id || !tk) return false;
      if (!force && !dirtyRef.current.has(page)) return true;

      const blocks = readBlocks(page);
      // 저장 요청을 보내기 전에 dirty를 내린다. 요청 중 사용자가 또 고치면
      // markDirty가 다시 올려 다음 저장에 포함된다.
      dirtyRef.current.delete(page);
      setPageState(page, 'saving');

      const elements = blocks.map((b) => ({
        elementId: serverIdsRef.current.has(b.id) ? b.id : null,
        contents: b.currentText.split('\n'),
      }));

      try {
        const res = await savePageElements(id, page, type, elements, tk);
        // 응답 elementIds는 요청 배열과 같은 순서 — 위치로 신규 블록의 정식 id를 매핑한다.
        res.elementIds.forEach((serverId, i) => {
          const local = blocks[i];
          if (!local) return;
          if (local.id !== serverId) replaceBlockId(page, local.id, serverId);
          serverIdsRef.current.add(serverId);
        });
        setPageState(page, 'saved');
        setSaveError(null);
        return true;
      } catch (err) {
        // 실패한 편집은 잃지 않도록 dirty를 되돌려 다음 기회에 다시 보낸다.
        dirtyRef.current.add(page);
        setPageState(page, 'error');
        setSaveError(toUserMessage(err, '수정 내용을 저장하지 못했습니다.'));
        return false;
      }
    },
    [readBlocks, replaceBlockId, setPageState],
  );

  // 앱 종료·작업 전환 등에서 남은 편집을 모두 밀어낸다.
  const saveAllDirty = useCallback(async (): Promise<void> => {
    const pages = [...dirtyRef.current];
    for (const page of pages) {
      await savePage(page);
    }
  }, [savePage]);

  // 세션(작업) 종료 — 되돌리기 기록과 저장 상태를 모두 버린다 (D-3).
  const resetEditor = useCallback(() => {
    serverIdsRef.current = new Set();
    historyRef.current = {};
    dirtyRef.current = new Set();
    setSaveStates({});
    setSaveError(null);
    setHistoryVersion(0);
  }, []);

  const clearSaveError = useCallback(() => setSaveError(null), []);

  // 반환 객체의 정체성을 고정한다 — App이 이 객체를 여러 useCallback/useEffect의
  // 의존성으로 쓰기 때문에, 렌더마다 새 객체가 나오면 이펙트가 매번 다시 걸린다.
  return useMemo(
    () => ({
      registerServerBlocks,
      pushHistory,
      markDirty,
      undo,
      redo,
      canUndo,
      canRedo,
      isDirty,
      hasUnsaved,
      savePage,
      saveAllDirty,
      resetEditor,
      saveStates,
      saveError,
      clearSaveError,
    }),
    [
      registerServerBlocks,
      pushHistory,
      markDirty,
      undo,
      redo,
      canUndo,
      canRedo,
      isDirty,
      hasUnsaved,
      savePage,
      saveAllDirty,
      resetEditor,
      saveStates,
      saveError,
      clearSaveError,
    ],
  );
};
