import { useCallback, useEffect, useRef } from 'react';
import {
  BoundingBox,
  ConversionTab,
  ImageResolution,
  OriginalTextBlock,
  TranslationBlock,
} from '../types';
import { PageEventStatus } from '../types/apiTypes';
import { createSyncTransport, SyncTransport } from '../utils/syncTransport';
import { openOutputWindow, OutputWindowHandle } from '../utils/outputWindow';

export type PanelMode = 'both' | 'input-only' | 'output-only';

// V3는 페이지 단위로 저장하므로 저장 상태도 페이지 단위다.
import { PageSaveState } from './UsePageEditor';
export type { PageSaveState };

export type SyncAction =
  | { type: 'updateBlock'; page: number; id: string; text: string }
  | { type: 'applyCandidate'; page: number; id: string; text: string }
  // 대체 초안 선택 — idx가 -1이면 AI 원본으로 되돌리는 스와프
  | { type: 'selectDraft'; page: number; id: string; idx: number }
  | { type: 'removeBlock'; page: number; id: string }
  | { type: 'addBlock'; page: number; index: number }
  // 블록 순서 변경 — delta는 -1(위로) / +1(아래로).
  // 저장 시 배열 순서가 곧 reading_order라 서버에는 별도 API가 필요 없다.
  | { type: 'moveBlock'; page: number; id: string; delta: -1 | 1 }
  | { type: 'setSelected'; id: string | null }
  | { type: 'setPage'; page: number }
  // 현재 페이지 저장(Ctrl+S) — 토큰·jobId를 가진 메인 창이 실행한다.
  | { type: 'savePage'; page: number }
  | { type: 'undo'; page: number }
  | { type: 'redo'; page: number }
  | { type: 'reset' };

export interface SyncSnapshot {
  activeTab: ConversionTab;
  blocksByPage: Record<number, TranslationBlock[]>;
  bboxDataByPage: Record<number, BoundingBox[]>;
  originalTextsByPage: Record<number, OriginalTextBlock[]>;
  imgResolution: ImageResolution;
  selectedBlockId: string | null;
  currentPage: number;
  totalPages: number;
  isUploading: boolean;
  isStreaming: boolean;
  uploadError: string | null;
  // 페이지별 저장 상태 — 팝업이 저장 중/실패 표시를 미러링하는 데 사용
  pageSaveStates: Record<number, PageSaveState>;
  // 페이지별 변환 상태 — 팝업도 BLOCKED 페이지 안내를 동일하게 보여준다
  pageStatuses: Record<number, PageEventStatus>;
}

type SyncMessage =
  | { type: 'state-snapshot'; payload: SyncSnapshot }
  | { type: 'action'; payload: SyncAction }
  | { type: 'request-snapshot' }
  // 마우스가 얹힌 블록. 창을 나눠도 원본·결과가 서로 대응되는 상자를 그려야 한다.
  // 스냅샷에 실어 보내지 않고 따로 보낸다 — 스냅샷은 블록 전체를 담고 있어
  // 마우스가 블록을 옮길 때마다 그걸 다시 브로드캐스트하면 비싸다.
  | { type: 'hover'; id: string | null }
  | { type: 'popup-closing' };

interface UsePopupSyncOptions {
  isPopup: boolean;
  panelMode: PanelMode;
  setPanelMode: (mode: PanelMode) => void;
  snapshot: SyncSnapshot;
  applyAction: (action: SyncAction) => void;
  onSnapshotReceived: (snapshot: SyncSnapshot) => void;
  // 반대편 창에서 마우스를 얹은 블록이 바뀌었을 때
  onHoverReceived?: (id: string | null) => void;
}

interface UsePopupSyncReturn {
  dispatchAction: (action: SyncAction) => void;
  togglePopup: () => void;
  // 이쪽 창에서 얹은 블록을 반대편에 알린다.
  broadcastHover: (id: string | null) => void;
}

export const usePopupSync = ({
  isPopup,
  panelMode,
  setPanelMode,
  snapshot,
  applyAction,
  onSnapshotReceived,
  onHoverReceived,
}: UsePopupSyncOptions): UsePopupSyncReturn => {
  const popupRef = useRef<OutputWindowHandle | null>(null);
  const transportRef = useRef<SyncTransport | null>(null);
  const snapshotRef = useRef<SyncSnapshot | null>(null);
  const applyActionRef = useRef(applyAction);
  const onSnapshotReceivedRef = useRef(onSnapshotReceived);
  const onHoverReceivedRef = useRef(onHoverReceived);
  // 팝업이 최초 스냅샷을 받았는지(요청 재시도 종료 조건)
  const receivedSnapshotRef = useRef(false);

  useEffect(() => {
    applyActionRef.current = applyAction;
  }, [applyAction]);

  useEffect(() => {
    onSnapshotReceivedRef.current = onSnapshotReceived;
  }, [onSnapshotReceived]);

  useEffect(() => {
    onHoverReceivedRef.current = onHoverReceived;
  }, [onHoverReceived]);

  // 메인이 팝업과 분리된 상태일 때만 자동 스냅샷 브로드캐스트
  useEffect(() => {
    snapshotRef.current = snapshot;
    if (isPopup) return;
    if (panelMode !== 'input-only') return;
    transportRef.current?.post({ type: 'state-snapshot', payload: snapshot });
  }, [snapshot, isPopup, panelMode]);

  useEffect(() => {
    const transport = createSyncTransport((raw) => {
      const data = raw as SyncMessage;
      if (!data) return;

      // hover는 양쪽 창이 똑같이 받아 적용한다(메인/팝업 역할 구분이 없다).
      // Tauri emit은 보낸 창에도 전달되지만 같은 값을 다시 넣는 것이라 무해하다.
      if (data.type === 'hover') {
        onHoverReceivedRef.current?.(data.id);
        return;
      }

      if (!isPopup) {
        if (data.type === 'request-snapshot') {
          if (snapshotRef.current) {
            transport.post({
              type: 'state-snapshot',
              payload: snapshotRef.current,
            });
          }
        } else if (data.type === 'action') {
          applyActionRef.current(data.payload);
        } else if (data.type === 'popup-closing') {
          popupRef.current = null;
          setPanelMode('both');
        }
      } else if (data.type === 'state-snapshot') {
        receivedSnapshotRef.current = true;
        onSnapshotReceivedRef.current(data.payload);
      }
    });
    transportRef.current = transport;

    // 팝업: 초기 스냅샷 요청. Tauri 이벤트 리스너 준비 타이밍 때문에 한 번에 누락될 수
    // 있어, 스냅샷을 받을 때까지 짧게 재시도한다.
    let retryId: number | undefined;
    if (isPopup) {
      transport.post({ type: 'request-snapshot' });
      let tries = 0;
      retryId = window.setInterval(() => {
        if (receivedSnapshotRef.current || tries >= 8) {
          window.clearInterval(retryId);
          return;
        }
        tries += 1;
        transport.post({ type: 'request-snapshot' });
      }, 300);
    }

    return () => {
      if (retryId !== undefined) window.clearInterval(retryId);
      transport.close();
      transportRef.current = null;
    };
  }, [isPopup, setPanelMode]);

  // 팝업 unload 시 메인에 알림(브라우저 폴백). 데스크톱은 onClosed로도 감지한다.
  useEffect(() => {
    if (!isPopup) return;
    const handler = () => {
      transportRef.current?.post({ type: 'popup-closing' });
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isPopup]);

  const dispatchAction = useCallback(
    (action: SyncAction) => {
      if (isPopup) {
        transportRef.current?.post({ type: 'action', payload: action });
      } else {
        applyActionRef.current(action);
      }
    },
    [isPopup],
  );

  const togglePopup = useCallback(() => {
    if (isPopup) {
      window.close();
      return;
    }
    if (panelMode === 'both') {
      void (async () => {
        const handle = await openOutputWindow();
        if (!handle) {
          alert('결과 창을 열지 못했습니다. 잠시 후 다시 시도해주세요.');
          return;
        }
        popupRef.current = handle;
        // 창이 (직접) 닫히면 메인을 원래대로 되돌린다.
        handle.onClosed(() => {
          popupRef.current = null;
          setPanelMode('both');
        });
        setPanelMode('input-only');
      })();
    } else {
      popupRef.current?.close();
      popupRef.current = null;
      setPanelMode('both');
    }
  }, [isPopup, panelMode, setPanelMode]);

  const broadcastHover = useCallback((id: string | null) => {
    transportRef.current?.post({ type: 'hover', id });
  }, []);

  return { dispatchAction, togglePopup, broadcastHover };
};
