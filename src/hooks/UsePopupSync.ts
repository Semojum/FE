import { useCallback, useEffect, useRef } from 'react';
import {
  BoundingBox,
  ConversionTab,
  ImageResolution,
  OriginalTextBlock,
  TranslationBlock,
} from '../types';
import { createSyncTransport, SyncTransport } from '../utils/syncTransport';
import { openOutputWindow, OutputWindowHandle } from '../utils/outputWindow';

export type PanelMode = 'both' | 'input-only' | 'output-only';

export type SyncAction =
  | { type: 'updateBlock'; page: number; id: string; text: string }
  | { type: 'applyCandidate'; page: number; id: string; text: string }
  | { type: 'removeBlock'; page: number; id: string }
  | { type: 'addBlock'; page: number; index: number }
  | { type: 'reorderBlocks'; page: number; reordered: TranslationBlock[] }
  | { type: 'setSelected'; id: string | null }
  | { type: 'setPage'; page: number }
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
}

type SyncMessage =
  | { type: 'state-snapshot'; payload: SyncSnapshot }
  | { type: 'action'; payload: SyncAction }
  | { type: 'request-snapshot' }
  | { type: 'popup-closing' };

interface UsePopupSyncOptions {
  isPopup: boolean;
  panelMode: PanelMode;
  setPanelMode: (mode: PanelMode) => void;
  snapshot: SyncSnapshot;
  applyAction: (action: SyncAction) => void;
  onSnapshotReceived: (snapshot: SyncSnapshot) => void;
}

interface UsePopupSyncReturn {
  dispatchAction: (action: SyncAction) => void;
  togglePopup: () => void;
}

export const usePopupSync = ({
  isPopup,
  panelMode,
  setPanelMode,
  snapshot,
  applyAction,
  onSnapshotReceived,
}: UsePopupSyncOptions): UsePopupSyncReturn => {
  const popupRef = useRef<OutputWindowHandle | null>(null);
  const transportRef = useRef<SyncTransport | null>(null);
  const snapshotRef = useRef<SyncSnapshot | null>(null);
  const applyActionRef = useRef(applyAction);
  const onSnapshotReceivedRef = useRef(onSnapshotReceived);
  // 팝업이 최초 스냅샷을 받았는지(요청 재시도 종료 조건)
  const receivedSnapshotRef = useRef(false);

  useEffect(() => {
    applyActionRef.current = applyAction;
  }, [applyAction]);

  useEffect(() => {
    onSnapshotReceivedRef.current = onSnapshotReceived;
  }, [onSnapshotReceived]);

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

  // 팝업 unload 시 메인에 알림(웹 fallback). 데스크톱은 onClosed로도 감지.
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

  return { dispatchAction, togglePopup };
};
