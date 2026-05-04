import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { useDropzone, Accept } from 'react-dropzone';
import {
  FileText,
  Image as ImageIcon,
  X,
  Loader2,
  Download,
  AlertCircle,
  Columns2,
  Square,
  Save,
  User as UserIcon,
  LogOut,
  History,
} from 'lucide-react';

// Hooks
import { useFileHandler } from './hooks/UseFileHandler';
import { useTranslationBlocks } from './hooks/UseTranslationBlocks';
import { useJobUpload } from './hooks/UseJobUpload.ts';
import { useJobStream } from './hooks/UseJobStream.ts';
import { useAuth } from './hooks/UseAuth';

// API
import { saveJob, getJob } from './api/HistoryService';

// Components
import FilePreviewer from './component/features/conversion/FilePreviewer';
import Pagination from './component/features/conversion/Pagination';
import BlockItem from './component/features/conversion/BlockItem';
import AuthModal from './component/features/auth/AuthModal';
import MyPageModal from './component/features/mypage/MyPageModal';

// Types
import {
  BoundingBox,
  ConversionTab,
  ImageResolution,
  OriginalTextBlock,
  TranslationBlock,
} from './types';
import { StreamPageData } from './types/apiTypes';

const SYNC_CHANNEL = 'braillemate-sync';
const POPUP_FEATURES = 'width=900,height=900,resizable=yes,scrollbars=yes';

type PanelMode = 'both' | 'input-only' | 'output-only';

type SyncAction =
  | { type: 'updateBlock'; page: number; id: string; text: string }
  | { type: 'applyCandidate'; page: number; id: string; text: string }
  | { type: 'removeBlock'; page: number; id: string }
  | { type: 'addBlock'; page: number; index: number }
  | { type: 'reorderBlocks'; page: number; reordered: TranslationBlock[] }
  | { type: 'setSelected'; id: string | null }
  | { type: 'setPage'; page: number }
  | { type: 'reset' };

interface SyncSnapshot {
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

const BrailleMate: React.FC = () => {
  const isPopup = useMemo(
    () =>
      new URLSearchParams(window.location.search).get('panel') === 'output',
    [],
  );

  const [activeTab, setActiveTab] = useState<ConversionTab>('OCR 변환');
  const [panelMode, setPanelMode] = useState<PanelMode>(
    isPopup ? 'output-only' : 'both',
  );

  const {
    fileState,
    handleFileDrop,
    setPage,
    setTotalPages,
    reset: resetFile,
  } = useFileHandler();
  const {
    uploadFile,
    isUploading,
    jobId,
    error: uploadError,
    resetUpload,
  } = useJobUpload();

  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [bboxDataByPage, setBboxDataByPage] = useState<
    Record<number, BoundingBox[]>
  >({});
  const [originalTextsByPage, setOriginalTextsByPage] = useState<
    Record<number, OriginalTextBlock[]>
  >({});
  const [imgResolution, setImgResolution] = useState<ImageResolution>({
    width: 0,
    height: 0,
  });

  const {
    blocksByPage,
    getBlocks,
    setBlocksForPage,
    setAllBlocks,
    updateBlock,
    applyCandidate,
    removeBlock,
    addBlock,
    reorderBlocks,
    resetAllBlocks,
  } = useTranslationBlocks();

  // Sync infra (BroadcastChannel)
  const popupRef = useRef<Window | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const snapshotRef = useRef<SyncSnapshot | null>(null);
  const applyActionRef = useRef<(action: SyncAction) => void>(() => {});

  // Auth & 마이페이지
  const auth = useAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isMyPageOpen, setIsMyPageOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const currentPage = fileState.currentPage;
  const currentBlocks = getBlocks(currentPage);
  const currentBBoxData = bboxDataByPage[currentPage] || [];
  const currentOriginalTexts = originalTextsByPage[currentPage] || [];

  const handleReset = useCallback(() => {
    resetFile();
    resetAllBlocks();
    resetUpload();
    setBboxDataByPage({});
    setOriginalTextsByPage({});
    setSelectedBlockId(null);
    setImgResolution({ width: 0, height: 0 });
  }, [resetFile, resetAllBlocks, resetUpload]);

  const handleTabChange = (tab: ConversionTab) => {
    setActiveTab(tab);
    handleReset();
  };

  // Action apply (메인에서만 직접 호출, 팝업은 dispatchAction 통해 메인에 위임)
  const applyAction = useCallback(
    (action: SyncAction) => {
      switch (action.type) {
        case 'updateBlock':
          updateBlock(action.page, action.id, action.text);
          break;
        case 'applyCandidate':
          applyCandidate(action.page, action.id, action.text);
          break;
        case 'removeBlock':
          removeBlock(action.page, action.id);
          break;
        case 'addBlock':
          addBlock(action.page, action.index);
          break;
        case 'reorderBlocks':
          reorderBlocks(action.page, action.reordered);
          break;
        case 'setSelected':
          setSelectedBlockId(action.id);
          break;
        case 'setPage':
          setPage(action.page);
          break;
        case 'reset':
          handleReset();
          break;
      }
    },
    [
      updateBlock,
      applyCandidate,
      removeBlock,
      addBlock,
      reorderBlocks,
      setPage,
      handleReset,
    ],
  );

  // 최신 applyAction을 ref에 미러링 (channel.onmessage closure가 stale 되는 것 방지)
  useEffect(() => {
    applyActionRef.current = applyAction;
  }, [applyAction]);

  // 메인=직접 호출 / 팝업=메인에 액션 메시지 송신
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

  useEffect(() => {
    if (isPopup) return;
    if (!fileState.file || isUploading || jobId) return;

    uploadFile(fileState.file, activeTab).then((response) => {
      if (response) console.log('Job Started:', response.job_id);
    });
  }, [isPopup, fileState.file, activeTab, uploadFile, isUploading, jobId]);

  const handlePageReceived = useCallback(
    (data: StreamPageData) => {
      const page = data.page_number;
      console.log(`Received Page ${page}`, data);

      setTotalPages(Math.max(fileState.totalPages, page));

      if (data.image_resolution && page === fileState.currentPage) {
        setImgResolution(data.image_resolution);
      }

      // 안전하게 배열로 변환하는 헬퍼 함수
      const getArray = (val: string[] | string | undefined): string[] => {
        if (!val) return [];
        return Array.isArray(val) ? val : [val];
      };

      // ─────────────────────────────────────────────────────────
      // [CASE C] 통합 변환 모드
      // ─────────────────────────────────────────────────────────
      if (activeTab === '통합 변환') {
        const mappedBBoxes: BoundingBox[] = (data.bounding_box_list || []).map(
          (b) => ({
            id: String(b.id),
            x: b.x,
            y: b.y,
            x2: b.x2,
            y2: b.y2,
          }),
        );
        setBboxDataByPage((prev) => ({ ...prev, [page]: mappedBBoxes }));
        setOriginalTextsByPage((prev) => ({ ...prev, [page]: [] }));

        const newBlocks = (data.braille_text_list || []).map((brailleItem) => {
          const matchedBBox = mappedBBoxes.find(
            (b) => String(b.id) === String(brailleItem.id),
          );

          // ✅ 백엔드 변수명 변경 대응 (contents 우선, 없으면 content)
          const brailleContentList = getArray(
            brailleItem.contents,
          );

          return {
            id: String(brailleItem.id),
            originalText: '',
            currentText: brailleContentList[0] || '',
            candidates: brailleContentList.length > 1 ? brailleContentList : [],
            bbox: matchedBBox,
          };
        });

        setBlocksForPage(page, newBlocks);
      }
      // ─────────────────────────────────────────────────────────
      // [CASE B] 점역 변환 모드
      // ─────────────────────────────────────────────────────────
      else if (data.braille_text_list && data.braille_text_list.length > 0) {
        const mappedOriginalTexts: OriginalTextBlock[] = (
          data.text_list || []
        ).map((t) => {
          // ✅ 백엔드 변수명 변경 대응
          const contentList = getArray(t.contents);
          return {
            id: String(t.id),
            content: contentList[0] || '',
          };
        });
        setOriginalTextsByPage((prev) => ({
          ...prev,
          [page]: mappedOriginalTexts,
        }));

        const newBlocks = data.braille_text_list.map((brailleItem) => {
          const originalItem = (data.text_list || []).find(
            (t) => String(t.id) === String(brailleItem.id),
          );

          // ✅ 백엔드 변수명 변경 대응
          const originalContentList = getArray(originalItem?.contents);
          const brailleContentList = getArray(
            brailleItem.contents,
          );

          return {
            id: String(brailleItem.id),
            originalText: originalContentList[0] || '',
            currentText: brailleContentList[0] || '',
            candidates: brailleContentList.length > 1 ? brailleContentList : [],
            bbox: undefined,
          };
        });

        setBlocksForPage(page, newBlocks);
      }
      // ─────────────────────────────────────────────────────────
      // [CASE A] OCR 모드
      // ─────────────────────────────────────────────────────────
      else {
        const mappedBBoxes: BoundingBox[] = (data.bounding_box_list || []).map(
          (b) => ({
            id: String(b.id),
            x: b.x,
            y: b.y,
            x2: b.x2,
            y2: b.y2,
          }),
        );
        setBboxDataByPage((prev) => ({ ...prev, [page]: mappedBBoxes }));

        const mappedOriginalTexts: OriginalTextBlock[] = (
          data.text_list || []
        ).map((t) => {
          // ✅ 백엔드 변수명 변경 대응
          const contentList = getArray(t.contents);
          return {
            id: String(t.id),
            content: contentList[0] || '',
          };
        });
        setOriginalTextsByPage((prev) => ({
          ...prev,
          [page]: mappedOriginalTexts,
        }));

        const newBlocks = (data.text_list || []).map((item) => {
          const matchedBBox = mappedBBoxes.find(
            (b) => String(b.id) === String(item.id),
          );

          // ✅ 백엔드 변수명 변경 대응 (item.content -> item.contents)
          const contentList = getArray(item.contents);

          return {
            id: String(item.id),
            originalText: contentList[0] || '',
            currentText: contentList[0] || '',
            candidates: contentList.length > 1 ? contentList : [],
            bbox: matchedBBox,
          };
        });
        setBlocksForPage(page, newBlocks);
      }
    },
    [
      activeTab,
      fileState.currentPage,
      fileState.totalPages,
      setTotalPages,
      setBlocksForPage,
      setOriginalTextsByPage,
      setBboxDataByPage,
      setImgResolution,
    ],
  );
  const { isStreaming } = useJobStream({
    jobId: isPopup ? null : jobId,
    onPageReceived: handlePageReceived,
  });

  // ─────────────────────────────────────────────────────────
  // 메인 → 팝업 스냅샷 자동 브로드캐스트
  // ─────────────────────────────────────────────────────────
  useEffect(() => {
    const snapshot: SyncSnapshot = {
      activeTab,
      blocksByPage,
      bboxDataByPage,
      originalTextsByPage,
      imgResolution,
      selectedBlockId,
      currentPage: fileState.currentPage,
      totalPages: fileState.totalPages,
      isUploading,
      isStreaming,
      uploadError,
    };
    snapshotRef.current = snapshot;

    if (isPopup) return;
    if (panelMode !== 'input-only') return;
    channelRef.current?.postMessage({ type: 'state-snapshot', payload: snapshot });
  }, [
    isPopup,
    panelMode,
    activeTab,
    blocksByPage,
    bboxDataByPage,
    originalTextsByPage,
    imgResolution,
    selectedBlockId,
    fileState.currentPage,
    fileState.totalPages,
    isUploading,
    isStreaming,
    uploadError,
  ]);

  // ─────────────────────────────────────────────────────────
  // BroadcastChannel: 메인↔팝업 메시지 처리
  // ─────────────────────────────────────────────────────────
  useEffect(() => {
    const channel = new BroadcastChannel(SYNC_CHANNEL);
    channelRef.current = channel;

    channel.onmessage = (e: MessageEvent) => {
      const data = e.data || {};
      const { type, payload } = data;

      if (!isPopup) {
        if (type === 'request-snapshot') {
          if (snapshotRef.current) {
            channel.postMessage({
              type: 'state-snapshot',
              payload: snapshotRef.current,
            });
          }
        } else if (type === 'action') {
          applyActionRef.current(payload as SyncAction);
        } else if (type === 'popup-closing') {
          popupRef.current = null;
          setPanelMode('both');
        }
      } else {
        if (type === 'state-snapshot') {
          const s = payload as SyncSnapshot;
          setActiveTab(s.activeTab);
          setAllBlocks(s.blocksByPage);
          setBboxDataByPage(s.bboxDataByPage);
          setOriginalTextsByPage(s.originalTextsByPage);
          setImgResolution(s.imgResolution);
          setSelectedBlockId(s.selectedBlockId);
          setPage(s.currentPage);
          setTotalPages(s.totalPages);
        }
      }
    };

    if (isPopup) {
      channel.postMessage({ type: 'request-snapshot' });
    }

    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [isPopup, setAllBlocks, setPage, setTotalPages]);

  // ─────────────────────────────────────────────────────────
  // 팝업이 외부 X로 닫혔는지 폴링으로 백업 감지 (메인 전용)
  // ─────────────────────────────────────────────────────────
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
  }, [isPopup, panelMode]);

  // ─────────────────────────────────────────────────────────
  // 팝업 unload 시 메인에 알림
  // ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isPopup) return;
    const handler = () => {
      channelRef.current?.postMessage({ type: 'popup-closing' });
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isPopup]);

  const handleSplitToggle = useCallback(() => {
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
  }, [isPopup, panelMode]);

  // 현재 작업을 마이페이지에 저장
  const handleSaveJob = useCallback(async () => {
    if (!auth.token) {
      setIsAuthModalOpen(true);
      return;
    }
    if (Object.keys(blocksByPage).length === 0) {
      alert('저장할 결과가 없습니다.');
      return;
    }
    const defaultTitle = fileState.file?.name ?? `${activeTab} 작업`;
    const title = window.prompt('작업 이름을 입력하세요', defaultTitle);
    if (!title) return;

    setIsSaving(true);
    try {
      await saveJob(auth.token, {
        title,
        mode: activeTab,
        fileName: fileState.file?.name ?? '',
        totalPages: fileState.totalPages,
        blocksByPage,
        bboxDataByPage,
        originalTextsByPage,
        imgResolution,
      });
      alert('저장되었습니다.');
    } catch (err) {
      alert(
        err instanceof Error ? err.message : '저장 중 오류가 발생했습니다.',
      );
    } finally {
      setIsSaving(false);
    }
  }, [
    auth.token,
    activeTab,
    blocksByPage,
    bboxDataByPage,
    originalTextsByPage,
    imgResolution,
    fileState.file,
    fileState.totalPages,
  ]);

  // 마이페이지에서 작업 선택 시 현재 상태로 복원
  const handleSelectJob = useCallback(
    async (jobId: string) => {
      if (!auth.token) return;
      try {
        const job = await getJob(auth.token, jobId);
        handleReset();
        setActiveTab(job.mode);
        setAllBlocks(job.blocksByPage);
        setBboxDataByPage(job.bboxDataByPage);
        setOriginalTextsByPage(job.originalTextsByPage);
        setImgResolution(job.imgResolution);
        setTotalPages(job.totalPages);
        setPage(1);
        setIsMyPageOpen(false);
      } catch (err) {
        alert(
          err instanceof Error ? err.message : '작업을 불러오지 못했습니다.',
        );
      }
    },
    [
      auth.token,
      handleReset,
      setAllBlocks,
      setTotalPages,
      setPage,
    ],
  );

  const acceptConfig = useMemo<Accept>((): Accept => {
    if (activeTab === '점역 변환') {
      return { 'text/plain': ['.txt'], 'application/x-hwp': ['.hwp'] };
    }
    return {
      'image/*': ['.jpeg', '.jpg', '.png'],
      'application/pdf': ['.pdf'],
    };
  }, [activeTab]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleFileDrop,
    accept: acceptConfig,
    multiple: false,
  });

  const handleDownload = () => {
    const allPages = Object.keys(blocksByPage)
      .map(Number)
      .sort((a, b) => a - b);
    if (allPages.length === 0) return;

    const content = allPages
      .map((page) => {
        const pageContent = blocksByPage[page]
          .map((b) => b.currentText)
          .join('\n\n');
        return activeTab == 'OCR 변환'
          ? `\n${pageContent}\n--- Page ${page} ---\n`
          : `\n${pageContent}`;
      })
      .join('\n\n\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const fileName =
      activeTab === '점역 변환'
        ? `braille_result_${dateStr}.brf`
        : `result_${dateStr}.txt`;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const tabs: ConversionTab[] = ['OCR 변환', '점역 변환', '통합 변환'];

  return (
    <div className="min-h-screen bg-[#F0F4F8] flex flex-col font-sans text-gray-800 antialiased transition-colors duration-500">
      <header className="max-w-6xl mx-auto pt-12 px-6 w-full">
        <div className="flex items-center justify-between mb-3 -ml-15">
          <img
            src={'BrailleMate_Logo.png'}
            alt="Logo"
            className="w-50 object-contain"
          />
          <div className="flex items-center gap-2">
            {!isPopup && (
              <>
                {auth.isAuthenticated ? (
                  <>
                    <button
                      onClick={() => setIsMyPageOpen(true)}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:text-[#407FAC] hover:border-[#407FAC]/40 transition-colors shadow-sm text-sm font-medium"
                      title="마이페이지 — 이전 작업 보기"
                    >
                      <History size={16} />
                      <span>마이페이지</span>
                    </button>
                    <span className="hidden md:flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600">
                      <UserIcon size={14} />
                      {auth.user?.name}
                    </span>
                    <button
                      onClick={() => auth.logout()}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-500 hover:text-red-500 hover:border-red-200 transition-colors shadow-sm text-sm font-medium"
                      title="로그아웃"
                    >
                      <LogOut size={16} />
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setIsAuthModalOpen(true)}
                    disabled={auth.isLoading}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:text-[#407FAC] hover:border-[#407FAC]/40 transition-colors shadow-sm text-sm font-medium disabled:opacity-50"
                  >
                    <UserIcon size={16} />
                    <span>로그인</span>
                  </button>
                )}
              </>
            )}
            <button
              onClick={handleSplitToggle}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:text-[#407FAC] hover:border-[#407FAC]/40 transition-colors shadow-sm text-sm font-medium"
              title={
                panelMode === 'both'
                  ? '결과를 새 창으로 분리'
                  : '한 창으로 합치기'
              }
              aria-pressed={panelMode !== 'both'}
            >
              {panelMode === 'both' ? (
                <Columns2 size={16} />
              ) : (
                <Square size={16} />
              )}
              <span>
                {panelMode === 'both' ? '반으로 나누기' : '합치기'}
              </span>
            </button>
          </div>
        </div>
        {!isPopup && (
          <nav className="flex gap-12 border-b border-white/20 relative">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => handleTabChange(tab)}
                className={`pb-4 text-lg font-semibold transition-all relative ${
                  activeTab === tab
                    ? 'text-[#407FAC]'
                    : 'text-[#929292] hover:text-[#407FAC]'
                }`}
              >
                {tab}
                {activeTab === tab && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute bottom-0 left-0 right-0 h-1 bg-[#407FAC] rounded-t-full"
                  />
                )}
              </button>
            ))}
          </nav>
        )}
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12 flex flex-col items-center w-full">
        <div
          className={
            panelMode === 'both'
              ? 'w-full flex flex-col md:flex-row items-stretch gap-8 mb-4'
              : 'w-full flex flex-col items-stretch mb-4'
          }
        >
          {panelMode !== 'output-only' && (
          <section
            className={
              panelMode === 'both'
                ? 'flex-1 min-w-0'
                : 'w-full'
            }
          >
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-[2.5rem] p-8 shadow-xl border border-white/10 h-150 flex flex-col"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-800">원본 파일</h2>
                {fileState.file && (
                  <button
                    onClick={handleReset}
                    className="p-2 hover:bg-red-50 text-red-400 rounded-full transition-colors"
                  >
                    <X size={20} />
                  </button>
                )}
              </div>

              <div
                className={`flex-1 rounded-[2rem] overflow-hidden border-2 border-dashed transition-all ${!fileState.file ? (isDragActive ? 'border-[#5A8FBB] bg-blue-50/50' : 'border-gray-200') : 'border-transparent'}`}
              >
                {!fileState.file ? (
                  <div
                    {...getRootProps()}
                    className="w-full h-full flex flex-col items-center justify-center cursor-pointer p-10 text-center"
                  >
                    <input {...getInputProps()} />
                    {activeTab === '점역 변환' ? (
                      <FileText className="text-gray-400 mb-6" size={32} />
                    ) : (
                      <ImageIcon className="text-gray-400 mb-6" size={32} />
                    )}
                    <p className="text-gray-600 font-medium">
                      드래그 앤 드롭 또는 클릭하여 파일 업로드
                    </p>
                  </div>
                ) : (
                  <FilePreviewer
                    state={fileState}
                    onLoadSuccess={setTotalPages}
                    bboxes={currentBBoxData}
                    selectedBlockId={selectedBlockId}
                    imageResolution={imgResolution}
                    originalTextBlocks={currentOriginalTexts}
                    onBlockClick={(id) =>
                      dispatchAction({ type: 'setSelected', id })
                    }
                  />
                )}
              </div>
            </motion.div>
          </section>
          )}

          {panelMode !== 'input-only' && (
          <section
            className={
              panelMode === 'both'
                ? 'flex-1 md:flex-[1.4] min-w-0'
                : 'w-full'
            }
          >
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white rounded-[2.5rem] p-8 shadow-xl border border-white/10 h-[600px] flex flex-col"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-[#407FAC]">
                  점역/번역 결과
                </h2>
                {Object.keys(blocksByPage).length > 0 && (
                  <div className="flex items-center gap-2">
                    {!isPopup && (
                      <button
                        onClick={handleSaveJob}
                        disabled={isSaving}
                        className="flex items-center gap-1.5 bg-white border border-[#407FAC] text-[#407FAC] px-3 py-1.5 rounded-lg hover:bg-[#407FAC]/5 transition-colors shadow-sm text-sm font-medium disabled:opacity-50"
                        title={
                          auth.isAuthenticated
                            ? '현재 작업을 마이페이지에 저장'
                            : '로그인 후 저장 가능'
                        }
                      >
                        {isSaving ? (
                          <Loader2 className="animate-spin" size={16} />
                        ) : (
                          <Save size={16} />
                        )}
                        <span>저장</span>
                      </button>
                    )}
                    <button
                      onClick={handleDownload}
                      className="flex items-center gap-1.5 bg-[#407FAC] text-white px-3 py-1.5 rounded-lg hover:bg-[#356a91] transition-colors shadow-sm text-sm font-medium"
                    >
                      <Download size={16} /> <span>다운로드</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                {uploadError ? (
                  <div className="h-full flex flex-col items-center justify-center text-red-500 space-y-2">
                    <AlertCircle size={32} />
                    <p className="font-medium">업로드 실패</p>
                  </div>
                ) : isUploading ? (
                  <div className="h-full flex flex-col items-center justify-center space-y-4">
                    <Loader2 className="w-10 h-10 text-[#407FAC] animate-spin" />
                    <p className="font-medium text-gray-500">전송 중...</p>
                  </div>
                ) : isStreaming && currentBlocks.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center space-y-4">
                    <Loader2 className="w-10 h-10 text-[#407FAC] animate-spin" />
                    <p className="font-medium text-gray-500">분석 중...</p>
                  </div>
                ) : currentBlocks.length > 0 ? (
                  <div className="pb-10">
                    <Reorder.Group
                      axis="y"
                      values={currentBlocks}
                      onReorder={(newOrder) =>
                        dispatchAction({
                          type: 'reorderBlocks',
                          page: currentPage,
                          reordered: newOrder,
                        })
                      }
                      className="flex flex-col gap-1"
                    >
                      {currentBlocks.map((block, index) => (
                        <BlockItem
                          key={block.id}
                          block={block}
                          index={index}
                          mode={activeTab}
                          isSelected={block.id === selectedBlockId}
                          onSelect={(id) =>
                            dispatchAction({ type: 'setSelected', id })
                          }
                          onUpdate={(id, text) =>
                            dispatchAction({
                              type: 'updateBlock',
                              page: currentPage,
                              id,
                              text,
                            })
                          }
                          onApplyCandidate={(id, text) =>
                            dispatchAction({
                              type: 'applyCandidate',
                              page: currentPage,
                              id,
                              text,
                            })
                          }
                          onRemove={(id) =>
                            dispatchAction({
                              type: 'removeBlock',
                              page: currentPage,
                              id,
                            })
                          }
                          onAdd={(idx) =>
                            dispatchAction({
                              type: 'addBlock',
                              page: currentPage,
                              index: idx,
                            })
                          }
                        />
                      ))}
                    </Reorder.Group>
                  </div>
                ) : (
                  <div className="h-full bg-gray-50/50 rounded-[2rem] flex flex-col items-center justify-center text-center text-gray-400">
                    <FileText size={48} className="mb-4 opacity-20" />
                    <p className="font-medium">결과가 없습니다.</p>
                  </div>
                )}
              </div>
            </motion.div>
          </section>
          )}
        </div>

        <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="w-full"
            >
              <Pagination
                currentPage={currentPage}
                totalPages={fileState.totalPages}
                onPageChange={(page) =>
                  dispatchAction({ type: 'setPage', page })
                }
              />
            </motion.div>
        </AnimatePresence>
      </main>

      {!isPopup && (
        <>
          <AuthModal
            isOpen={isAuthModalOpen}
            onClose={() => setIsAuthModalOpen(false)}
            onLogin={auth.login}
            onSignup={auth.signup}
          />
          {auth.token && (
            <MyPageModal
              isOpen={isMyPageOpen}
              onClose={() => setIsMyPageOpen(false)}
              token={auth.token}
              onSelect={handleSelectJob}
            />
          )}
        </>
      )}
    </div>
  );
};

export default BrailleMate;
