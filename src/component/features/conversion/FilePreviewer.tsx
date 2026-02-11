import React, { memo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { FileText } from 'lucide-react'; // 아이콘 추가
import { FileState } from '../../../types';

// PDF Worker 설정 (기존과 동일)
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface Props {
  state: FileState;
  onLoadSuccess: (numPages: number) => void;
}

const FilePreviewer: React.FC<Props> = memo(({ state, onLoadSuccess }) => {
  const { previewUrl, fileType, currentPage, textContent, file } = state;

  // 1. 텍스트(.txt) 파일 미리보기
  if (fileType === 'text') {
    return (
      <div className="w-full h-full bg-white p-6 overflow-y-auto custom-scrollbar">
        <pre className="text-sm text-gray-700 font-mono whitespace-pre-wrap leading-relaxed">
          {textContent || '내용이 없는 파일입니다.'}
        </pre>
      </div>
    );
  }

  // 2. 한글(.hwp) 파일 정보 표시 (브라우저 직접 렌더링 불가)
  if (fileType === 'hwp') {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50 p-8">
        <div className="w-20 h-20 bg-blue-50 rounded-2xl flex items-center justify-center mb-4 shadow-sm">
          <FileText size={40} className="text-[#5A8FBB]" />
        </div>
        <h3 className="text-lg font-bold text-gray-900 mb-1 break-all text-center">
          {file?.name}
        </h3>
        <p className="text-sm text-gray-400 mb-6">
          {(file?.size ? file.size / 1024 : 0).toFixed(1)} KB
        </p>
        <span className="px-4 py-2 bg-[#5A8FBB]/10 text-[#5A8FBB] rounded-full text-xs font-bold tracking-wide">
          점역 대기 중
        </span>
      </div>
    );
  }

  // 3. 이미지 및 PDF 미리보기 (기존 로직)
  if (!previewUrl) return null;

  return (
    <div className="w-full h-full flex flex-col bg-gray-50 rounded-2xl overflow-hidden">
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 flex justify-center items-start">
        {fileType === 'image' ? (
          <img
            src={previewUrl}
            alt="Preview"
            className="w-full h-auto object-contain shadow-sm rounded-lg"
          />
        ) : (
          <Document
            file={previewUrl}
            onLoadSuccess={({ numPages }) => onLoadSuccess(numPages)}
            loading={<div className="p-10 text-gray-400">PDF 분석 중...</div>}
            className="flex justify-center"
          >
            <Page
              pageNumber={currentPage}
              width={500}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              className="shadow-xl"
            />
          </Document>
        )}
      </div>
    </div>
  );
});

export default FilePreviewer;
