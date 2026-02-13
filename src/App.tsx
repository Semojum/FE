import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import {
  FileText,
  ArrowRight,
  Image as ImageIcon,
  X,
  Loader2,
} from 'lucide-react';
import { useFileHandler } from './hooks/UseFileHandler';
import FilePreviewer from './component/features/conversion/FilePreviewer';
import Pagination from './component/features/conversion/Pagination';
import { ConversionTab } from './types';
import { Accept } from 'react-dropzone';
import { useTranslationBlocks } from './hooks/UseTranslationBlocks.ts';
import BlockItem from './component/features/conversion/BlockItem.tsx'; // 1. 타입 임포트

const BrailleMate: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ConversionTab>('OCR 변환');
  const { fileState, handleFileDrop, setPage, setTotalPages, reset } =
    useFileHandler();

  const { blocks, setBlocks, updateBlock, removeBlock, addBlock } =
    useTranslationBlocks();
  const isProcessing = false; // 실제 환경에서는 API 로딩 상태와 연결

  const handleTabChange = (tab: ConversionTab) => {
    setActiveTab(tab);
    reset();
    setBlocks([]);
  };

  useEffect(() => {
    if (fileState.file && !isProcessing) {
      setBlocks([
        {
          id: crypto.randomUUID(),
          originalText: 'Hello World',
          translatedText: '안녕 세상',
        },
        {
          id: crypto.randomUUID(),
          originalText: 'This is a test document.',
          translatedText: '이것은 테스트 문서입니다.',
        },
      ]);
    }
  }, [fileState.file, isProcessing, setBlocks]);

  const acceptConfig = useMemo<Accept>(() => {
    // 1. 반환할 객체를 Accept 타입으로 명시적 선언
    let config: Accept;

    if (activeTab === '점역 변환') {
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

    // 2. 이미 Accept 타입으로 검증된 객체를 반환
    return config;
  }, [activeTab]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleFileDrop,
    accept: acceptConfig,
    multiple: false,
  });

  const tabs: ConversionTab[] = ['OCR 변환', '점역 변환', '통합 변환'];

  return (
    <div className="min-h-screen bg-[#F9F8F1] flex flex-col font-sans text-gray-800 antialiased">
      {/* Header Section (동일) */}
      <header className="max-w-6xl mx-auto pt-12 px-6 w-full">
        <div className="flex items-center gap-3 mb-10">
          <div className="flex gap-1">
            <img src={'public/braillemate.png'} alt="" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">BrailleMate</h1>
        </div>
        <nav className="flex gap-12 border-b border-gray-200/60 relative">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => {
                handleTabChange(tab);
              }}
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
          {/* Left: Input Card */}
          <section className="flex-1 min-w-0">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100 h-[600px] flex flex-col"
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
                ${!fileState.file ? (isDragActive ? 'border-[#5A8FBB] bg-blue-50/50' : 'border-gray-200') : 'border-transparent'}`}
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
                      {activeTab === '점역 변환'
                        ? '텍스트(.txt)나 한글(.hwp) 파일을 드롭하세요.'
                        : '이미지나 PDF 파일을 드롭하세요.'}
                    </p>
                    <p className="text-sm text-gray-400 mt-2 underline underline-offset-4">
                      또는 파일 선택
                    </p>
                  </div>
                ) : (
                  <FilePreviewer
                    state={fileState}
                    onLoadSuccess={setTotalPages}
                  />
                )}
              </div>
            </motion.div>
          </section>

          {/* Interaction Icon (동일) */}
          <div className="hidden md:flex items-center justify-center">
            <div className="w-12 h-12 rounded-full border border-gray-200 flex items-center justify-center bg-white shadow-sm">
              <ArrowRight
                size={24}
                className={fileState.file ? 'text-[#5A8FBB]' : 'text-gray-300'}
              />
            </div>
          </div>

          {/* Right: Output Card (동일) */}
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
                  블록을 클릭하여 수정하세요
                </span>
              </div>

              {/* 에디터 스크롤 영역 */}
              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                {isProcessing ? (
                  <div className="h-full flex flex-col items-center justify-center space-y-4">
                    <Loader2 className="w-10 h-10 text-[#5A8FBB] animate-spin" />
                    <p className="font-medium text-gray-500">
                      문서를 분석하고 분할하는 중...
                    </p>
                  </div>
                ) : blocks.length > 0 ? (
                  <div className="flex flex-col gap-2 pb-10">
                    <AnimatePresence>
                      {blocks.map((block, index) => (
                        <motion.div
                          key={block.id}
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <BlockItem
                            block={block}
                            index={index}
                            onUpdate={updateBlock}
                            onRemove={removeBlock}
                            onAdd={addBlock}
                          />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                ) : (
                  <div className="h-full bg-gray-50/50 rounded-[2rem] flex flex-col items-center justify-center text-center">
                    <FileText size={48} className="text-gray-200 mb-4" />
                    <p className="text-gray-400 font-medium leading-relaxed">
                      파일을 업로드하면
                      <br />
                      수정 가능한 블록 형태로 결과가 표시됩니다.
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          </section>
        </div>

        {/* Pagination Section (동일) */}
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
