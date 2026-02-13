import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { useDropzone, Accept } from 'react-dropzone';
import {
  FileText,
  ArrowRight,
  Image as ImageIcon,
  X,
  Loader2,
  Download,
} from 'lucide-react';

import { useFileHandler } from './hooks/UseFileHandler';
import { useTranslationBlocks } from './hooks/UseTranslationBlocks'; // 수정된 훅
import FilePreviewer from './component/features/conversion/FilePreviewer';
import Pagination from './component/features/conversion/Pagination';
import BlockItem from './component/features/conversion/BlockItem';
import {
  BoundingBox,
  ConversionTab,
  ImageResolution,
  OCRResponse,
  ProofreadingResponse,
  OriginalTextBlock,
  BrailleTranslationResponse,
} from './types';

const BrailleMate: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ConversionTab>('OCR 변환');
  const { fileState, handleFileDrop, setPage, setTotalPages, reset } =
    useFileHandler();

  // [Update] 상태를 '페이지별 객체'로 관리하여 전환 시 데이터 유지
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

  const isProcessing = false;

  // 현재 페이지 번호 및 해당 페이지의 데이터 추출
  const currentPage = fileState.currentPage;
  const currentBlocks = getBlocks(currentPage);
  const currentBBoxData = bboxDataByPage[currentPage] || [];
  const currentOriginalTexts = originalTextsByPage[currentPage] || [];

  // 탭 변경 핸들러
  const handleTabChange = (tab: ConversionTab) => {
    setActiveTab(tab);
    reset();
    resetAllBlocks();
    setBboxDataByPage({});
    setOriginalTextsByPage({});
    setSelectedBlockId(null);
  };

  // [Update] 다운로드 핸들러: 모든 페이지의 데이터를 순서대로 병합
  const handleDownload = () => {
    const allPages = Object.keys(blocksByPage)
      .map(Number)
      .sort((a, b) => a - b);

    if (allPages.length === 0) return;

    // 각 페이지의 텍스트를 모아서 병합 (페이지 구분선 추가)
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

  // 3. 페이지가 바뀔 때마다 해당 페이지의 데이터를 로드 (Mock)
  useEffect(() => {
    if (!fileState.file || isProcessing) return;

    const page = fileState.currentPage;

    // ✅ 캐싱 로직: 이미 해당 페이지의 데이터가 로드되어 있다면 다시 덮어쓰지 않음! (사용자 수정 유지)
    if (blocksByPage[page] && blocksByPage[page].length > 0) return;

    if (activeTab === '교정 변환') {
      const mockProofData: ProofreadingResponse = {
        job_id: 'job_1',
        page_number: page,
        text_list: [
          {
            id: `text-1-p${page}`,
            content: `[페이지 ${page}] 대한민국은 민주공화국이다.`,
          },
          {
            id: `text-2-p${page}`,
            content: `[페이지 ${page}] 제2조 관련 내용입니다.`,
          },
        ],
        optimized_text_list: [
          {
            id: `text-1-p${page}`,
            order: 1,
            contents: `[페이지 ${page}] 변환된 대한민국...`,
          },
          {
            id: `text-2-p${page}`,
            order: 2,
            contents: `[페이지 ${page}] 변환된 제2조...`,
          },
        ],
      };

      setOriginalTextsByPage((prev) => ({
        ...prev,
        [page]: mockProofData.text_list,
      }));
      setBlocksForPage(
        page,
        mockProofData.optimized_text_list.map((item) => ({
          id: item.id,
          originalText: mockProofData.text_list.find((t) => t.id === item.id)
            ?.content,
          currentText: Array.isArray(item.contents)
            ? item.contents.join('\n')
            : item.contents,
          candidates: ['대체 텍스트 예시 1', '대체 텍스트 예시 2'],
        })),
      );
    } else if (activeTab === '점역 변환') {
      const mockBrailleData: BrailleTranslationResponse = {
        job_id: 'job_2',
        page_number: page,
        text_list: [
          {
            id: `br-1-p${page}`,
            contents:
              '12. 표는 입자 A, B, C의 질량과 운동 에너지를 나타낸 것이다.\n' +
              '이에 대한 설명으로 옳은 것만을 <보기>에서 있는 대로 고른 것은? [3점]\n',
          },
          {
            id: `br-2-p${page}`,
            contents:
              '입자  질량  운동에너지\n' +
              '----------------------------\n' +
              'A     m      E₀\n' +
              'B     2m     8E₀\n' +
              'C     3m     3E₀\n',
          },
          {
            id: `br-3-p${page}`,
            contents:
              'ㄱ. 속력은 A가 B보다 작다.\n' +
              'ㄴ. 운동량의 크기는 B가 C보다 작다.\n' +
              'ㄷ. 물질파 파장은 A가 C보다 짧다.\n',
          },
        ],
        braille_text_list: [
          {
            id: `br-1-p${page}`,
            order: 1,
            content:
              '⠼⠁⠃⠲⠀⠙⠬⠉⠵⠀⠕⠃⠨⠀⠁⠐⠀⠃⠐⠀⠉⠺⠀⠨⠕⠂⠐⠜⠶⠈⠧⠀⠛\n' +
              '⠊⠿⠀⠝⠉⠎⠨⠕⠐⠮⠀⠉⠓⠉⠗⠒⠀⠸⠎⠕⠊⠲\n' +
              '⠕⠝⠀⠊⠗⠚⠒⠀⠠⠞⠑⠻⠪⠐⠥⠀⠥⠂⠴⠵⠀⠸⠎⠑⠒⠮⠀⠂⠶⠘⠥⠈⠕\n' +
              '⠶⠂⠝⠠⠎⠀⠕⠌⠉⠵⠀⠊⠗⠐⠥⠀⠈⠥⠐⠵⠀⠸⠎⠵⠦⠀⠦⠆⠼⠉⠨⠎⠢\n' +
              '⠰⠴\n',
          },
          {
            id: `br-2-p${page}`,
            order: 2,
            content:
              '⠿⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠿\n' +
              '⠕⠃⠨⠀⠀⠨⠕⠂⠐⠜⠶⠀⠀⠛⠊⠿⠀⠝⠉⠎⠨⠕\n' +
              '⠒⠒⠒⠀⠀⠒⠒⠒⠒⠒⠒⠀⠀⠒⠒⠒⠒⠒⠒⠒⠒⠒\n' +
              '⠠⠁⠍⠀⠀⠍⠐⠐⠐⠐⠐⠀⠀⠠⠑⠼⠚⠐⠐⠐⠐⠐\n' +
              '⠠⠃⠐⠀⠀⠼⠃⠍⠐⠐⠐⠀⠀⠼⠓⠠⠑⠼⠚⠐⠐⠐\n' +
              '⠠⠉⠐⠀⠀⠼⠉⠍⠐⠐⠐⠀⠀⠼⠉⠠⠑⠼⠚⠐⠐⠐\n' +
              '⠿⠶⠶⠶⠶⠶⠶⠶⠶⠶⠶⠶⠶⠶⠶⠶⠶⠶⠶⠶⠶⠶⠶⠶⠶⠶⠶⠶⠶⠶⠶⠿\n',
          },
          {
            id: `br-3-p${page}`,
            order: 3,
            content:
              '⠈⠲⠀⠠⠭⠐⠱⠁⠵⠀⠁⠫⠀⠃⠘⠥⠊⠀⠨⠁⠊⠲\n' +
              '⠉⠲⠀⠛⠊⠿⠐⠜⠶⠺⠀⠋⠪⠈⠕⠉⠵⠀⠃⠫⠀⠉⠘⠥⠊⠀⠨⠁⠊⠲\n' +
              '⠊⠲⠀⠑⠯⠨⠕⠂⠙⠀⠙⠨⠶⠵⠀⠁⠫⠀⠉⠘⠥⠊⠀⠠⠨⠂⠃⠊⠲\n',
          },
        ],
      };

      const mappedTexts = mockBrailleData.text_list.map((t) => ({
        id: t.id,
        content: t.contents,
      }));
      setOriginalTextsByPage((prev) => ({ ...prev, [page]: mappedTexts }));
      setImgResolution({ width: 0, height: 0 });
      setBboxDataByPage((prev) => ({ ...prev, [page]: [] }));

      setBlocksForPage(
        page,
        mockBrailleData.braille_text_list.map((item) => ({
          id: item.id,
          originalText: mockBrailleData.text_list.find((t) => t.id === item.id)
            ?.contents,
          currentText: item.content,
          candidates: [],
        })),
      );
    } else {
      // OCR 변환
      const mockOCRData: OCRResponse = {
        job_id: 'job_3',
        page_number: page,
        image_resolution: { width: 1240, height: 1754 },
        bounding_box_list: [
          { id: `ocr-1-p${page}`, x: 120, y: 80, x2: 560, y2: 130 },
          { id: `ocr-2-p${page}`, x: 120, y: 140, x2: 340, y2: 360 },
        ],
        text_list: [
          {
            id: `ocr-1-p${page}`,
            order: 1,
            contents:
              '12. 표는 입자 A, B, C의 질량과 운동 에너지를 나타낸 것이다.\n' +
              '이에 대한 설명으로 옳은 것만을 <보기>에서 있는 대로 고른 것은? [3점]\n',
          },
          {
            id: `ocr-2-p${page}`,
            order: 2,
            contents: `<table>01.jpg`,
          },
          {
            id: `ocr-3-p${page}`,
            order: 3,
            contents:
              'ㄱ. 속력은 A가 B보다 작다.\n' +
              'ㄴ. 운동량의 크기는 B가 C보다 작다.\n' +
              'ㄷ. 물질파 파장은 A가 C보다 짧다.\n',
          },
        ],
      };

      setImgResolution(mockOCRData.image_resolution);
      setBboxDataByPage((prev) => ({
        ...prev,
        [page]: mockOCRData.bounding_box_list,
      }));
      setOriginalTextsByPage((prev) => ({ ...prev, [page]: [] }));

      setBlocksForPage(
        page,
        mockOCRData.text_list.map((item) => ({
          id: item.id,
          originalText: item.contents,
          currentText: item.contents,
          candidates: [],
          bbox: mockOCRData.bounding_box_list.find((b) => b.id === item.id),
        })),
      );
    }
  }, [
    fileState.file,
    activeTab,
    fileState.currentPage,
    blocksByPage,
    setBlocksForPage,
  ]);

  // Dropzone 설정 (기존과 동일)
  const acceptConfig = useMemo<Accept>(() => {
    let config: Accept;
    if (activeTab === '점역 변환' || activeTab === '교정 변환') {
      config = {
        'text/plain': ['.txt'],
        'application/x-hwp': ['.hwp'],
      };
    } else {
      config = {
        'image/*': ['.jpeg', '.jpg', '.png'],
        'application/pdf': ['.pdf'],
      };
    }
    return config;
  }, [activeTab]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleFileDrop,
    accept: acceptConfig,
    multiple: false,
  });

  const tabs: ConversionTab[] = [
    'OCR 변환',
    '교정 변환',
    '점역 변환',
    '통합 변환',
  ];

  return (
    <div className="min-h-screen bg-[#F9F8F1] flex flex-col font-sans text-gray-800 antialiased">
      {/* Header 영역 생략 (기존과 동일) */}
      <header className="max-w-6xl mx-auto pt-12 px-6 w-full">
        {/* ... (기존 코드와 동일) ... */}
        <div className="flex items-center gap-3 mb-10">
          <div className="flex gap-1">
            <img
              src={'BrailleMate_Logo.svg'}
              alt="Logo"
              className="w-12.5 aspect-square object-contain"
            />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">BrailleMate</h1>
        </div>
        <nav className="flex gap-12 border-b border-gray-200/60 relative">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => handleTabChange(tab)}
              className={`pb-4 text-lg font-semibold transition-all relative ${
                activeTab === tab
                  ? 'text-[#5A8FBB]'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {tab}
              {activeTab === tab && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute bottom-0 left-0 right-0 h-1 bg-[#5A8FBB] rounded-t-full"
                />
              )}
            </button>
          ))}
        </nav>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-12 flex flex-col items-center w-full">
        <div className="w-full flex flex-col md:flex-row items-stretch gap-8 mb-4">
          {/* Left: Input Card & Previewer */}
          <section className="flex-1 min-w-0">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100 h-150 flex flex-col"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold">
                  원본 파일{' '}
                  <span className="text-sm font-normal text-gray-500 ml-2">
                    (Page {currentPage})
                  </span>
                </h2>
                {fileState.file && (
                  <button
                    onClick={reset}
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
                    {activeTab === '점역 변환' || activeTab === '교정 변환' ? (
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
                    bboxes={currentBBoxData} // 현재 페이지 BBox 전달
                    selectedBlockId={selectedBlockId}
                    imageResolution={imgResolution}
                    originalTextBlocks={currentOriginalTexts} // 현재 페이지 텍스트 전달
                  />
                )}
              </div>
            </motion.div>
          </section>

          {/* Center: Arrow Icon */}
          <div className="hidden md:flex items-center justify-center">
            <div className="w-12 h-12 rounded-full border border-gray-200 flex items-center justify-center bg-white shadow-sm">
              <ArrowRight
                size={24}
                className={fileState.file ? 'text-[#5A8FBB]' : 'text-gray-300'}
              />
            </div>
          </div>

          {/* Right: Output Card & Editor */}
          <section className="flex-1 min-w-0">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100 h-[600px] flex flex-col"
            >
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-4">
                  <h2 className="text-xl font-bold text-[#5A8FBB]">
                    점역/번역 결과
                  </h2>
                </div>
                {Object.keys(blocksByPage).length > 0 && (
                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-1.5 bg-[#5A8FBB] text-white px-3 py-1.5 rounded-lg hover:bg-[#4A7AA5] transition-colors shadow-sm text-sm font-medium"
                  >
                    <Download size={16} />
                    <span>다운로드</span>
                  </button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                {isProcessing ? (
                  <div className="h-full flex flex-col items-center justify-center space-y-4">
                    <Loader2 className="w-10 h-10 text-[#5A8FBB] animate-spin" />
                    <p className="font-medium text-gray-500">
                      문서를 분석 중입니다...
                    </p>
                  </div>
                ) : currentBlocks.length > 0 ? (
                  <div className="pb-10">
                    {/* [Update] Reorder에 현재 페이지 데이터 연동 */}
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
                          // 페이지 번호를 인자로 넘겨 업데이트
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
                  <div className="h-full bg-gray-50/50 rounded-[2rem] flex flex-col items-center justify-center text-center">
                    <FileText size={48} className="text-gray-200 mb-4" />
                    <p className="text-gray-400 font-medium leading-relaxed">
                      결과가 없습니다.
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          </section>
        </div>

        {/* Pagination */}
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
