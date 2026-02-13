import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { useDropzone, Accept } from 'react-dropzone';
import {
  FileText,
  ArrowRight,
  Image as ImageIcon,
  X,
  Loader2,
} from 'lucide-react';

// 커스텀 훅 및 컴포넌트 임포트
import { useFileHandler } from './hooks/UseFileHandler';
import { useTranslationBlocks } from './hooks/UseTranslationBlocks';
import FilePreviewer from './component/features/conversion/FilePreviewer';
import Pagination from './component/features/conversion/Pagination';
import BlockItem from './component/features/conversion/BlockItem';
import {
  BoundingBox,
  ConversionTab,
  ImageResolution,
  OCRResponse,
} from './types';

const BrailleMate: React.FC = () => {
  // 1. 상태 및 훅 초기화
  const [activeTab, setActiveTab] = useState<ConversionTab>('OCR 변환');
  const { fileState, handleFileDrop, setPage, setTotalPages, reset } =
    useFileHandler();

  // [New] BBox 및 선택 상태 관리
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [bboxData, setBboxData] = useState<BoundingBox[]>([]);
  const [imgResolution, setImgResolution] = useState<ImageResolution>({
    width: 0,
    height: 0,
  });

  const {
    blocks,
    setBlocks,
    updateBlock,
    applyCandidate,
    removeBlock,
    addBlock,
  } = useTranslationBlocks();

  const isProcessing = false; // API 로딩 상태 시뮬레이션

  // 2. 탭 변경 핸들러
  const handleTabChange = (tab: ConversionTab) => {
    setActiveTab(tab);
    reset();
    setBlocks([]);
    setBboxData([]);
    setSelectedBlockId(null);
  };

  // 3. 파일 업로드 시 Mock Data 생성 (서버 응답 시뮬레이션)
  useEffect(() => {
    if (fileState.file && !isProcessing) {
      // 실제 구현 시에는 여기서 API 호출 (formData 전송) -> 응답 수신
      const mockResponse: OCRResponse = {
        job_id: 'job_20260211_xc921',
        page_number: 1,
        image_resolution: { width: 1240, height: 1754 }, // 원본 이미지 해상도
        bounding_box_list: [
          {
            id: 'uuid-1',
            x: 120,
            y: 80,
            x2: 560,
            y2: 130,
          },
          {
            id: 'uuid-2',
            x: 120,
            y: 140,
            x2: 340,
            y2: 360,
          },
        ],
        text_list: [
          { id: 'uuid-1', order: 1, contents: '대한민국은 민주공화국이다.' },
          {
            id: 'uuid-2',
            order: 2,
            contents: '대한민국의 주권은 국민에게 있고, $x^2 + y^2 = z^2$',
          },
        ],
      };

      // 상태 업데이트
      setImgResolution(mockResponse.image_resolution);
      setBboxData(mockResponse.bounding_box_list);

      // Block 데이터 생성 (BBox 정보 매핑 포함)
      setBlocks(
        mockResponse.text_list.map((textItem) => {
          const bbox = mockResponse.bounding_box_list.find(
            (b) => b.id === textItem.id,
          );
          return {
            id: textItem.id,
            originalText: textItem.contents,
            currentText: textItem.contents,
            candidates: [], // 데모용 빈 배열
            bbox: bbox,
          };
        }),
      );
    }
  }, [fileState.file, isProcessing, setBlocks]);

  // 4. Dropzone 설정
  const acceptConfig = useMemo<Accept>(() => {
    let config: Accept;
    if (activeTab === '점역 변환' || activeTab === '교정 변환') {
      config = {
        'text/plain': ['.txt'],
        'application/x-hwp': ['.hwp'],
        'application/haansofthwp': ['.hwp'],
        'application/vnd.hancom.hwp': ['.hwp'],
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
      {/* Header */}
      <header className="max-w-6xl mx-auto pt-12 px-6 w-full">
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
                <h2 className="text-xl font-bold">원본 파일</h2>
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
                className={`flex-1 rounded-[2rem] overflow-hidden border-2 border-dashed transition-all 
                ${
                  !fileState.file
                    ? isDragActive
                      ? 'border-[#5A8FBB] bg-blue-50/50'
                      : 'border-gray-200'
                    : 'border-transparent'
                }`}
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
                  // [Updated] FilePreviewer에 BBox 데이터 전달
                  <FilePreviewer
                    state={fileState}
                    onLoadSuccess={setTotalPages}
                    bboxes={bboxData}
                    selectedBlockId={selectedBlockId}
                    imageResolution={imgResolution}
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
                <h2 className="text-xl font-bold text-[#5A8FBB]">
                  점역/번역 결과
                </h2>
                <span className="text-sm text-gray-400">
                  블록을 클릭하여 원본 위치 확인
                </span>
              </div>

              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                {isProcessing ? (
                  <div className="h-full flex flex-col items-center justify-center space-y-4">
                    <Loader2 className="w-10 h-10 text-[#5A8FBB] animate-spin" />
                    <p className="font-medium text-gray-500">
                      문서를 분석 중입니다...
                    </p>
                  </div>
                ) : blocks.length > 0 ? (
                  <div className="pb-10">
                    <Reorder.Group
                      axis="y"
                      values={blocks}
                      onReorder={setBlocks}
                      className="flex flex-col gap-1"
                    >
                      {blocks.map((block, index) => (
                        <BlockItem
                          key={block.id}
                          block={block}
                          index={index}
                          // [Updated] 선택 상태 전달
                          isSelected={block.id === selectedBlockId}
                          onSelect={setSelectedBlockId}
                          onUpdate={updateBlock}
                          onApplyCandidate={applyCandidate}
                          onRemove={removeBlock}
                          onAdd={addBlock}
                        />
                      ))}
                    </Reorder.Group>
                  </div>
                ) : (
                  <div className="h-full bg-gray-50/50 rounded-[2rem] flex flex-col items-center justify-center text-center">
                    <FileText size={48} className="text-gray-200 mb-4" />
                    <p className="text-gray-400 font-medium leading-relaxed">
                      파일을 업로드하면
                      <br />
                      결과가 여기에 표시됩니다.
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
                currentPage={fileState.currentPage}
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
