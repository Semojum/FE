import { useCallback, useEffect, useRef } from 'react';
import {
  BoundingBox,
  ConversionTab,
  ImageResolution,
  OriginalTextBlock,
  TranslationBlock,
} from '../types';

const SYNC_CHANNEL = 'braillemate-sync';
const POPUP_FEATURES = 'width=900,height=900,resizable=yes,scrollbars=yes';

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
  const popupRef = useRef<Window | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const snapshotRef = useRef<SyncSnapshot | null>(null);
  const applyActionRef = useRef(applyAction);
  const onSnapshotReceivedRef = useRef(onSnapshotReceived);

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
    channelRef.current?.postMessage({ type: 'state-snapshot', payload: snapshot });
  }, [snapshot, isPopup, panelMode]);

  useEffect(() => {
    const channel = new BroadcastChannel(SYNC_CHANNEL);
    channelRef.current = channel;

    channel.onmessage = (e: MessageEvent<SyncMessage>) => {
      const data = e.data;
      if (!data) return;

      if (!isPopup) {
        if (data.type === 'request-snapshot') {
          if (snapshotRef.current) {
            channel.postMessage({
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
        onSnapshotReceivedRef.current(data.payload);
      }
    };

    if (isPopup) {
      channel.postMessage({ type: 'request-snapshot' });
    }

    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [isPopup, setPanelMode]);

  // 팝업이 외부 X로 닫힌 경우 백업 감지 (beforeunload 메시지가 누락될 때 대비)
  useEffect(() => {
    if (isPopup) return;
    if (panelMode !== 'input-only') return;
    const id = setInterval(() => {
      if (popupRef.current?.closed) {
        popupRef.current = null;
        setPanelMode('both');
      }
    }, 500);
    return () => clearInterval(id);
  }, [isPopup, panelMode, setPanelMode]);

  // 팝업 unload 시 메인에 알림
  useEffect(() => {
    if (!isPopup) return;
    const handler = () => {
      channelRef.current?.postMessage({ type: 'popup-closing' });
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isPopup]);

  const dispatchAction = useCallback(
    (action: SyncAction) => {
      if (isPopup) {
        channelRef.current?.postMessage({ type: 'action', payload: action });
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
      const url = `${window.location.pathname}?panel=output`;
      const popup = window.open(url, 'braillemate-output', POPUP_FEATURES);
      if (!popup) {
        alert('팝업이 차단되었습니다. 브라우저 팝업 허용 후 다시 시도해주세요.');
        return;
      }
      popupRef.current = popup;
      setPanelMode('input-only');
    } else {
      popupRef.current?.close();
      popupRef.current = null;
      setPanelMode('both');
    }
  }, [isPopup, panelMode, setPanelMode]);

  return { dispatchAction, togglePopup };
};
