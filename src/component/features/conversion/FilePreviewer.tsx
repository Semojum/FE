import React, { memo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { FileState } from '../../../types';

// PDF Worker 설정 수정: CDN 대신 로컬 node_modules의 워커를 사용하도록 설정
// Vite 환경에서 가장 권장되는 방식입니다.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface Props {
  state: FileState;
  onLoadSuccess: (numPages: number) => void;
}

const FilePreviewer: React.FC<Props> = memo(
  ({ state, onLoadSuccess }) => {
    const { previewUrl, fileType, currentPage } = state;

    if (!previewUrl) return null;

    return (
      <div className="w-full h-full flex flex-col bg-gray-50 rounded-2xl overflow-hidden">
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 flex justify-center items-start">
          {fileType === 'image' ? (
            <img
              src={previewUrl}
              alt="Preview"
              className="w-full h-auto object-contain"
            />
          ) : (
            <Document
              file={previewUrl}
              onLoadSuccess={({ numPages }) => onLoadSuccess(numPages)}
              loading={<div className="p-10 text-gray-400">PDF 로딩 중...</div>}
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
  },
);
export default FilePreviewer;
