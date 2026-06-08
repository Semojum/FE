import React, { useState, useMemo, useEffect, useCallback } from 'react';
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
  ImageResolution,
  OriginalTextBlock,
  TABS,
  TAB_VALUES,
} from './types';
import { JobDetail } from './types/auth';
import {
  fileValidationMessage,
  TAB_ALLOWED_FILE_LABEL,
} from './utils/fileValidation';

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
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isMyPageOpen, setIsMyPageOpen] = useState(false);

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
    if (!fileState.file || isUploading || jobId) return;
    uploadFile(fileState.file, activeTab, auth.token);
  }, [
    isPopup,
    fileState.file,
    activeTab,
    uploadFile,
    isUploading,
    jobId,
    auth.token,
  ]);

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
      setIsMyPageOpen(false);
    },
    [handleReset, setAllBlocks, setTotalPages, setPage],
  );

  const handleAuthRequired = useCallback(() => setIsAuthModalOpen(true), []);

  const { isSaving, handleSaveJob, handleSelectJob } = useSavedJobs({
    token: auth.token,
    current: {
      activeTab,
      fileName: fileState.file?.name ?? '',
      totalPages: fileState.totalPages,
      blocksByPage,
      bboxDataByPage,
      originalTextsByPage,
      imgResolution,
    },
    onAuthRequired: handleAuthRequired,
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
            onOAuthLogin={startOAuthLogin}
            isAuthorizing={isAuthorizing}
            externalError={oauthError}
          />
          {auth.token && (
            <MyPageModal
              isOpen={isMyPageOpen}
              onClose={() => setIsMyPageOpen(false)}
              token={auth.token}
              user={auth.user}
              onSelect={handleSelectJob}
            />
          )}
        </>
      )}
    </div>
  );
};

export default BrailleMate;
