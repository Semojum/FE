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
} from 'lucide-react';

// Hooks
import { useFileHandler } from './hooks/UseFileHandler';
import { useTranslationBlocks } from './hooks/UseTranslationBlocks';
import { useJobUpload } from './hooks/UseJobUpload.ts';
import { useJobStream } from './hooks/UseJobStream.ts';

// Components
import FilePreviewer from './component/features/conversion/FilePreviewer';
import Pagination from './component/features/conversion/Pagination';
import BlockItem from './component/features/conversion/BlockItem';

// Types
import {
  BoundingBox,
  ConversionTab,
  ImageResolution,
  OriginalTextBlock,
} from './types';
import { StreamPageData } from './types/apiTypes';

const BrailleMate: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ConversionTab>('OCR 변환');
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
    updateBlock,
    applyCandidate,
    removeBlock,
    addBlock,
    reorderBlocks,
    resetAllBlocks,
  } = useTranslationBlocks();

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

  useEffect(() => {
    if (!fileState.file || isUploading || jobId) return;
    if (Object.keys(blocksByPage).length > 0) return;

    uploadFile(fileState.file, activeTab).then((response) => {
      if (response) console.log('Job Started:', response.job_id);
    });
  }, [fileState.file, activeTab, uploadFile, isUploading, jobId, blocksByPage]);

  const handlePageReceived = useCallback(
    (data: StreamPageData) => {
      const page = data.page_number;
      console.log(`Received Page ${page}`, data);

      setTotalPages(Math.max(fileState.totalPages, page));

      if (data.image_resolution && page === fileState.currentPage) {
        setImgResolution(data.image_resolution);
      }

      // [CASE A] 점역 변환 모드
      if (data.braille_text_list && data.braille_text_list.length > 0) {
        const mappedOriginalTexts: OriginalTextBlock[] = data.text_list.map(
          (t) => ({
            id: String(t.id),
            content: t.content,
          }),
        );
        setOriginalTextsByPage((prev) => ({
          ...prev,
          [page]: mappedOriginalTexts,
        }));

        const newBlocks = data.braille_text_list.map((brailleItem) => {
          const originalItem = data.text_list.find(
            (t) => String(t.id) === String(brailleItem.id),
          );

          return {
            id: String(brailleItem.id),
            originalText: originalItem?.content || '',
            currentText: brailleItem.content,
            candidates: [],
            bbox: undefined,
          };
        });

        setBlocksForPage(page, newBlocks);
      }
      // [CASE B] OCR 모드
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

        const mappedOriginalTexts: OriginalTextBlock[] = data.text_list.map(
          (t) => ({
            id: String(t.id),
            content: t.content,
          }),
        );
        setOriginalTextsByPage((prev) => ({
          ...prev,
          [page]: mappedOriginalTexts,
        }));

        const newBlocks = data.text_list.map((item) => {
          const matchedBBox = mappedBBoxes.find(
            (b) => String(b.id) === String(item.id),
          );
          return {
            id: String(item.id),
            originalText: item.content,
            currentText: item.content,
            candidates: [],
            bbox: matchedBBox,
          };
        });
        setBlocksForPage(page, newBlocks);
      }
    },
    [
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
    jobId,
    onPageReceived: handlePageReceived,
  });

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
        return `--- Page ${page} ---\n\n${pageContent}`;
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
        <div className="flex items-center gap-3 mb-10">
          <img
            src={'BrailleMate_Logo.svg'}
            alt="Logo"
            className="w-12.5 aspect-square object-contain"
          />
          <h1 className="text-3xl font-bold tracking-tight text-[#407FAC]">
            BrailleMate
          </h1>
        </div>
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
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12 flex flex-col items-center w-full">
        <div className="w-full flex flex-col md:flex-row items-stretch gap-8 mb-4">
          {/* [Left: Input Card]
            - flex-1 : 기본 비율 유지
          */}
          <section className="flex-1 min-w-0">
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
                    onBlockClick={setSelectedBlockId}
                  />
                )}
              </div>
            </motion.div>
          </section>

          {/* ❌ [Center Arrow Removed] 화살표 섹션 삭제됨 */}

          {/* [Right: Output Card]
            - md:flex-[1.4] : 데스크탑에서 왼쪽보다 약 1.4배 넓게 설정
          */}
          <section className="flex-1 md:flex-[1.4] min-w-0">
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
                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-1.5 bg-[#407FAC] text-white px-3 py-1.5 rounded-lg hover:bg-[#356a91] transition-colors shadow-sm text-sm font-medium"
                  >
                    <Download size={16} /> <span>다운로드</span>
                  </button>
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
                        reorderBlocks(currentPage, newOrder)
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
                          onSelect={setSelectedBlockId}
                          onUpdate={(id, text) =>
                            updateBlock(currentPage, id, text)
                          }
                          onApplyCandidate={(id, text) =>
                            applyCandidate(currentPage, id, text)
                          }
                          onRemove={(id) => removeBlock(currentPage, id)}
                          onAdd={(idx) => addBlock(currentPage, idx)}
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
        </div>

        <AnimatePresence>
          {fileState.fileType === 'pdf' && fileState.totalPages > 1 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="w-full"
            >
              <Pagination
                currentPage={currentPage}
                totalPages={fileState.totalPages}
                onPageChange={setPage}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};

export default BrailleMate;
