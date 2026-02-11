import React, { useState } from 'react';
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

const BrailleMate: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ConversionTab>('OCR 변환');
  const { fileState, handleFileDrop, setPage, setTotalPages, reset } =
    useFileHandler();

  const isProcessing = false; // 실제 로직에선 상태로 관리

  const { getRootProps, getInputProps } = useDropzone({
    onDrop: handleFileDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png'],
      'application/pdf': ['.pdf'],
    },
    multiple: false,
  });

  const tabs: ConversionTab[] = ['OCR 변환', '점역 변환', '통합 변환'];

  return (
    <div className="min-h-screen bg-[#F9F8F1] flex flex-col font-sans text-gray-800 antialiased">
      {/* Header Section */}
      <header className="max-w-6xl mx-auto pt-12 px-6 w-full">
        <div className="flex items-center gap-3 mb-10">
          <div className="flex gap-1">
            <div className="w-4 h-8 bg-[#8EBDD3] rounded-full" />
            <div className="w-4 h-8 bg-[#EFB495] rounded-full mt-2" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">BrailleMate</h1>
        </div>
        <nav className="flex gap-12 border-b border-gray-200/60 relative">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
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
                className={`flex-1 rounded-[2rem] overflow-hidden border-2 border-dashed transition-all ${!fileState.file ? 'border-gray-200' : 'border-transparent'}`}
              >
                {!fileState.file ? (
                  <div
                    {...getRootProps()}
                    className="w-full h-full flex flex-col items-center justify-center cursor-pointer"
                  >
                    <input {...getInputProps()} />
                    <ImageIcon className="text-gray-400 mb-6" size={32} />
                    <p className="text-gray-600 font-medium">
                      파일을 드롭하거나 클릭하여 선택
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

          {/* Interaction Icon */}
          <div className="hidden md:flex items-center justify-center">
            <div className="w-12 h-12 rounded-full border border-gray-200 flex items-center justify-center bg-white shadow-sm">
              <ArrowRight
                size={24}
                className={fileState.file ? 'text-[#5A8FBB]' : 'text-gray-300'}
              />
            </div>
          </div>

          {/* Right: Output Card */}
          <section className="flex-1 min-w-0">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100 h-[600px] flex flex-col"
            >
              <h2 className="text-xl font-bold mb-6 text-[#5A8FBB]">
                점역 결과
              </h2>
              <div className="flex-1 bg-gray-50/50 rounded-[2rem] p-8 flex flex-col items-center justify-center text-center">
                {isProcessing ? (
                  <div className="space-y-4">
                    <Loader2 className="w-10 h-10 text-[#5A8FBB] animate-spin mx-auto" />
                    <p className="font-medium text-gray-500">분석 중...</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <FileText size={48} className="text-gray-200 mx-auto" />
                    <p className="text-gray-400 font-medium leading-relaxed">
                      변환 결과가 여기에 표시됩니다.
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          </section>
        </div>

        {/* Pagination Section: 하단 중앙 독립 배치 */}
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
