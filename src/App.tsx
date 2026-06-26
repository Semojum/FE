import React, {
  useState,
  useMemo,
  useEffect,
  useCallback,
  useRef,
} from 'react';
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
  User as UserIcon,
  LogOut,
  History,
  ArrowRightCircle,
} from 'lucide-react';

// Hooks
import { useFileHandler } from './hooks/UseFileHandler';
import { useTranslationBlocks } from './hooks/UseTranslationBlocks';
import { useJobUpload } from './hooks/UseJobUpload.ts';
import { useJobStream } from './hooks/UseJobStream.ts';
import { useAuth } from './hooks/UseAuth';
import {
  PanelMode,
  SyncAction,
  SyncSnapshot,
  usePopupSync,
} from './hooks/UsePopupSync';
import { usePageStreamHandler } from './hooks/UsePageStreamHandler';
import { useSavedJobs } from './hooks/UseSavedJobs';
import { useOAuth } from './hooks/UseOAuth';

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
  FileState,
  ImageResolution,
  OriginalTextBlock,
  TranslationBlock,
  TABS,
  TAB_VALUES,
} from './types';

// 탭별로 보존하는 작업물 스냅샷 — 탭을 전환해도 각 탭의 입력/결과가 날아가지 않게 한다.
interface TabState {
  fileState: FileState;
  blocksByPage: Record<number, TranslationBlock[]>;
  bboxDataByPage: Record<number, BoundingBox[]>;
  originalTextsByPage: Record<number, OriginalTextBlock[]>;
  imgResolution: ImageResolution;
  selectedBlockId: string | null;
}
import { JobDetail } from './types/auth';
import {
  fileValidationMessage,
  TAB_ALLOWED_FILE_LABEL,
} from './utils/fileValidation';
import { checkForUpdates } from './utils/updater';

const BrailleMate: React.FC = () => {
  const isPopup = useMemo(
    () =>
      new URLSearchParams(window.location.search).get('panel') === 'output',
    [],
  );

  const [activeTab, setActiveTab] = useState<ConversionTab>(TABS.OCR);
  const [panelMode, setPanelMode] = useState<PanelMode>(
    isPopup ? 'output-only' : 'both',
  );

  const {
    fileState,
    handleFileDrop,
    setRestoredPreview,
    restoreState,
    setPage,
    setTotalPages,
    setFileError,
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

  const auth = useAuth();
  const [isMyPageOpen, setIsMyPageOpen] = useState(false);

  // 탭별 작업물 보관소. 탭을 떠날 때 현재 상태를 저장하고, 돌아오면 복원한다.
  const [tabSnapshots, setTabSnapshots] = useState<
    Partial<Record<ConversionTab, TabState>>
  >({});
  // 이미 업로드한 File을 기억해 같은 파일이 (탭 복원 등으로) 다시 마운트돼도
  // 재업로드되지 않게 한다. (이전에는 jobId로 가드했지만, 탭 복원 시 jobId가 비므로 ref로 대체)
  const lastUploadedFileRef = useRef<File | null>(null);

  // 데스크톱 소셜 로그인(loopback): 시스템 브라우저로 로그인 → 127.0.0.1 redirect 수신 →
  // BE(/api/auth/{provider})와 code 교환. 성공 시 loginWithTokens로 세션 반영.
  const {
    startLogin: startOAuthLogin,
    isAuthorizing,
    error: oauthError,
  } = useOAuth(auth.loginWithTokens);

  const currentPage = fileState.currentPage;
  const currentBlocks = getBlocks(currentPage);
  const currentBBoxData = bboxDataByPage[currentPage] || [];
  const currentOriginalTexts = originalTextsByPage[currentPage] || [];
  // 입력 미리보기 존재 여부 — 업로드한 파일뿐 아니라 마이페이지에서 복원한
  // 미리보기(file은 없지만 fileType/미리보기가 있는 경우)도 포함한다.
  const hasInputPreview = !!fileState.fileType;

  // 현재 화면 상태를 탭 스냅샷으로 캡처
  const captureState = useCallback(
    (): TabState => ({
      fileState,
      blocksByPage,
      bboxDataByPage,
      originalTextsByPage,
      imgResolution,
      selectedBlockId,
    }),
    [
      fileState,
      blocksByPage,
      bboxDataByPage,
      originalTextsByPage,
      imgResolution,
      selectedBlockId,
    ],
  );

  // 화면 상태를 빈 값으로 초기화 (스냅샷/ref는 건드리지 않음 — 호출부에서 처리)
  const clearWorkspace = useCallback(() => {
    resetFile();
    resetAllBlocks();
    resetUpload();
    setBboxDataByPage({});
    setOriginalTextsByPage({});
    setSelectedBlockId(null);
    setImgResolution({ width: 0, height: 0 });
  }, [resetFile, resetAllBlocks, resetUpload]);

  const handleReset = useCallback(() => {
    clearWorkspace();
    lastUploadedFileRef.current = null;
    // 현재 탭의 보관된 작업물도 비운다(사용자가 명시적으로 지움).
    setTabSnapshots((prev) => ({ ...prev, [activeTab]: undefined }));
  }, [clearWorkspace, activeTab]);

  const handleTabChange = (tab: ConversionTab) => {
    if (tab === activeTab) return;

    // 1) 떠나는 탭의 작업물을 저장
    setTabSnapshots((prev) => ({ ...prev, [activeTab]: captureState() }));
    // 진행 중이던 업로드/스트림 상태는 탭별로 공유되므로 초기화
    resetUpload();

    // 2) 들어가는 탭의 작업물을 복원(없으면 빈 화면)
    const saved = tabSnapshots[tab];
    if (saved) {
      restoreState(saved.fileState);
      setAllBlocks(saved.blocksByPage);
      setBboxDataByPage(saved.bboxDataByPage);
      setOriginalTextsByPage(saved.originalTextsByPage);
      setImgResolution(saved.imgResolution);
      setSelectedBlockId(saved.selectedBlockId);
      // 복원된 파일은 이미 변환됐으므로 재업로드 트리거를 막는다.
      lastUploadedFileRef.current = saved.fileState.file;
    } else {
      clearWorkspace();
      lastUploadedFileRef.current = null;
    }

    setActiveTab(tab);
  };

  // OCR 결과를 점역 변환 입력으로 넘겨 자동 점역한다.
  // OCR 블록 텍스트를 페이지 순서대로 합쳐 .txt File을 만들고, 점역 탭으로 전환한 뒤
  // 입력으로 주입하면 자동 업로드 useEffect가 점역 변환(mode 'b')을 트리거한다.
  const handleSendOcrToBraille = () => {
    const text = Object.keys(blocksByPage)
      .map(Number)
      .sort((a, b) => a - b)
      .flatMap((p) => blocksByPage[p].map((b) => b.currentText))
      .filter((t) => t.trim().length > 0)
      .join('\n');
    if (!text.trim()) return;

    // 현재 OCR 탭 작업물을 저장해 두어 돌아와도 유지되게 한다.
    setTabSnapshots((prev) => ({ ...prev, [activeTab]: captureState() }));

    // 점역 탭으로 전환 + 화면 초기화 (이전 점역 작업물은 새 입력으로 대체)
    clearWorkspace();
    setTabSnapshots((prev) => ({ ...prev, [TABS.BRAILLE]: undefined }));
    setActiveTab(TABS.BRAILLE);

    // OCR 텍스트를 점역 입력 파일로 주입 → 자동 업로드가 점역 변환을 시작
    const file = new File([text], 'ocr-result.txt', { type: 'text/plain' });
    lastUploadedFileRef.current = null; // 새 파일이므로 업로드 허용
    handleFileDrop([file], TABS.BRAILLE);
  };

  // 메인 측에서 직접 호출되는 액션 처리기. 팝업은 BroadcastChannel을 통해 메인에 위임.
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

  useEffect(() => {
    if (isPopup) return;
    if (!fileState.file || isUploading) return;
    // 이미 업로드한 그 File이면(탭 복원 등으로 다시 마운트된 경우 포함) 재업로드하지 않는다.
    if (fileState.file === lastUploadedFileRef.current) return;
    lastUploadedFileRef.current = fileState.file;
    uploadFile(fileState.file, activeTab, auth.token);
  }, [isPopup, fileState.file, activeTab, uploadFile, isUploading, auth.token]);

  const handlePageReceived = usePageStreamHandler({
    activeTab,
    currentPage: fileState.currentPage,
    totalPages: fileState.totalPages,
    setTotalPages,
    setImgResolution,
    setBboxDataByPage,
    setOriginalTextsByPage,
    setBlocksForPage,
  });

  const { isStreaming } = useJobStream({
    jobId: isPopup ? null : jobId,
    token: auth.token,
    onPageReceived: handlePageReceived,
  });

  const snapshot: SyncSnapshot = useMemo(
    () => ({
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
    }),
    [
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
    ],
  );

  const handleSnapshotReceived = useCallback(
    (s: SyncSnapshot) => {
      setActiveTab(s.activeTab);
      setAllBlocks(s.blocksByPage);
      setBboxDataByPage(s.bboxDataByPage);
      setOriginalTextsByPage(s.originalTextsByPage);
      setImgResolution(s.imgResolution);
      setSelectedBlockId(s.selectedBlockId);
      setPage(s.currentPage);
      setTotalPages(s.totalPages);
    },
    [setAllBlocks, setPage, setTotalPages],
  );

  const { dispatchAction, togglePopup } = usePopupSync({
    isPopup,
    panelMode,
    setPanelMode,
    snapshot,
    applyAction,
    onSnapshotReceived: handleSnapshotReceived,
  });

  const handleJobLoaded = useCallback(
    (job: JobDetail) => {
      handleReset();
      setActiveTab(job.mode);
      setAllBlocks(job.blocksByPage);
      setBboxDataByPage(job.bboxDataByPage);
      setOriginalTextsByPage(job.originalTextsByPage);
      setImgResolution(job.imgResolution);
      setTotalPages(job.totalPages);
      setPage(1);
      // 입력 미리보기 복원: 점역(텍스트→점자)은 복원된 원본 텍스트를, 이미지 모드(a/c)는
      // 작업 썸네일을 보여준다. (서버가 원본 파일을 보관하지 않아 썸네일이 최선)
      if (job.mode === TABS.BRAILLE) {
        // 라이브에서는 업로드 파일의 textContent가 입력이지만, 저장된 작업은 파일이 없으므로
        // 응답의 원본 텍스트(text_list)를 페이지 순서대로 합쳐 입력 미리보기로 복원한다.
        const restoredText = Object.keys(job.originalTextsByPage)
          .map(Number)
          .sort((a, b) => a - b)
          .flatMap((p) => job.originalTextsByPage[p].map((blk) => blk.content))
          .filter((t) => t.trim().length > 0)
          .join('\n');
        setRestoredPreview({ fileType: 'text', textContent: restoredText });
      } else {
        setRestoredPreview({
          fileType: 'image',
          previewUrl: job.thumbnailUrl ?? null,
        });
      }
      setIsMyPageOpen(false);
    },
    [handleReset, setAllBlocks, setTotalPages, setPage, setRestoredPreview],
  );

  const { handleSelectJob } = useSavedJobs({
    token: auth.token,
    onJobLoaded: handleJobLoaded,
  });

  // 명세 모드별 허용 파일: a(OCR)=PDF, b(점역)=TXT/HWP, c(통합)=PDF
  const acceptConfig = useMemo<Accept>((): Accept => {
    if (activeTab === TABS.BRAILLE) {
      return { 'text/plain': ['.txt'], 'application/x-hwp': ['.hwp'] };
    }
    return { 'application/pdf': ['.pdf'] };
  }, [activeTab]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => handleFileDrop(files, activeTab),
    onDropRejected: () => setFileError(fileValidationMessage(activeTab)),
    accept: acceptConfig,
    multiple: false,
  });

  // 탭 전환 시 이전 검증 에러 메시지 제거
  useEffect(() => {
    setFileError(null);
  }, [activeTab, setFileError]);

  // 데스크톱 앱: 시작 시 새 버전을 조용히 확인·설치(다음 실행 시 적용).
  // 웹/팝업/테스트 환경에서는 no-op(updater 유틸 내부에서 Tauri 여부를 가드).
  useEffect(() => {
    if (isPopup) return;
    checkForUpdates().catch((e) => console.warn('업데이트 확인 실패', e));
  }, [isPopup]);

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
        return activeTab === TABS.OCR
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
      activeTab === TABS.BRAILLE
        ? `braille_result_${dateStr}.brf`
        : `result_${dateStr}.txt`;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const tabs = TAB_VALUES;

  // 인증 게이트 — 결과 전용 팝업이 아닌 메인 창에서는 로그인해야 앱을 쓸 수 있다.
  // 마운트 시 저장된 refreshToken으로 자동 로그인을 시도하고(auth.isInitializing),
  // 끝나면 로그인 여부에 따라 앱 또는 로그인 화면을 보여준다. (웹/데스크톱 공통)
  if (!isPopup && auth.isInitializing) {
    return (
      <div className="min-h-screen bg-[#F0F4F8] flex flex-col items-center justify-center gap-4 text-gray-500">
        <Loader2 className="animate-spin text-[#407FAC]" size={36} />
        <p className="text-sm font-medium">로그인 정보를 확인하는 중...</p>
      </div>
    );
  }

  if (!isPopup && !auth.isAuthenticated) {
    // AuthModal이 Figma 로그인/회원가입 디자인을 전체화면으로 렌더한다.
    return (
      <AuthModal
        isOpen
        dismissible={false}
        onClose={() => {}}
        onLogin={auth.login}
        onSignup={auth.signup}
        onOAuthLogin={startOAuthLogin}
        isAuthorizing={isAuthorizing}
        externalError={oauthError}
      />
    );
  }

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
            )}
            <button
              onClick={togglePopup}
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
                {hasInputPreview && (
                  <button
                    onClick={handleReset}
                    className="p-2 hover:bg-red-50 text-red-400 rounded-full transition-colors"
                  >
                    <X size={20} />
                  </button>
                )}
              </div>

              <div
                className={`flex-1 rounded-[2rem] overflow-hidden border-2 border-dashed transition-all ${!hasInputPreview ? (isDragActive ? 'border-[#5A8FBB] bg-blue-50/50' : 'border-gray-200') : 'border-transparent'}`}
              >
                {!hasInputPreview ? (
                  <div
                    {...getRootProps()}
                    className="w-full h-full flex flex-col items-center justify-center cursor-pointer p-10 text-center"
                  >
                    <input {...getInputProps()} />
                    {activeTab === TABS.BRAILLE ? (
                      <FileText className="text-gray-400 mb-6" size={32} />
                    ) : (
                      <ImageIcon className="text-gray-400 mb-6" size={32} />
                    )}
                    <p className="text-gray-600 font-medium">
                      드래그 앤 드롭 또는 클릭하여 파일 업로드
                    </p>
                    <p className="text-xs text-gray-400 mt-2">
                      지원 형식: {TAB_ALLOWED_FILE_LABEL[activeTab]}
                    </p>
                    {fileState.error && (
                      <p className="flex items-center gap-1 text-sm text-red-500 mt-3">
                        <AlertCircle size={14} />
                        {fileState.error}
                      </p>
                    )}
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
                    {!isPopup && activeTab === TABS.OCR && (
                      <button
                        onClick={handleSendOcrToBraille}
                        className="flex items-center gap-1.5 border border-[#407FAC] text-[#407FAC] px-3 py-1.5 rounded-lg hover:bg-[#407FAC]/10 transition-colors shadow-sm text-sm font-medium"
                        title="이 OCR 결과를 점역 변환 입력으로 보내 자동 점역합니다"
                      >
                        <ArrowRightCircle size={16} />{' '}
                        <span>점역으로 보내기</span>
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

      {!isPopup && auth.token && (
        <MyPageModal
          isOpen={isMyPageOpen}
          onClose={() => setIsMyPageOpen(false)}
          token={auth.token}
          user={auth.user}
          onSelect={handleSelectJob}
        />
      )}
    </div>
  );
};

export default BrailleMate;
