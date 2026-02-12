import React, { memo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
// FileText 아이콘은 이제 텍스트가 없을 때만 쓰거나 제거해도 됩니다.
import { FileState } from '../../../types';

// PDF Worker 설정
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface Props {
  state: FileState;
  onLoadSuccess: (numPages: number) => void;
}

const FilePreviewer: React.FC<Props> = memo(({ state, onLoadSuccess }) => {
  const { previewUrl, fileType, currentPage, textContent } = state;

  // ─────────────────────────────────────────────────────────────
  // [수정됨] 1. 텍스트(.txt) 및 한글(.hwp) 파일 텍스트 미리보기
  // hwp 파일도 파싱된 결과가 textContent에 담겨 있으므로 텍스트로 보여줍니다.
  // ─────────────────────────────────────────────────────────────
  if (fileType === 'text' || fileType === 'hwp') {
    return (
      <div className="w-full h-full bg-white p-6 overflow-y-auto custom-scrollbar">
        {textContent ? (
          <pre className="text-sm text-gray-700 font-mono whitespace-pre-wrap leading-relaxed">
            {textContent}
          </pre>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-gray-400">
            <p>내용이 없거나 텍스트를 추출할 수 없습니다.</p>
          </div>
        )}
      </div>
    );
  }

  // 2. 이미지 및 PDF 미리보기
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
