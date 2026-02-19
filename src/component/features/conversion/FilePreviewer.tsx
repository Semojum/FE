import React, { memo, useEffect, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import {
  BoundingBox,
  FileState,
  ImageResolution,
  OriginalTextBlock,
} from '../../../types';
import BBoxOverlay from './BboxOverlay'; // .tsx 확장자는 import 시 생략 가능

// PDF Worker 설정
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface Props {
  state: FileState;
  onLoadSuccess: (numPages: number) => void;
  bboxes: BoundingBox[];
  selectedBlockId: string | null;
  imageResolution: ImageResolution;
  originalTextBlocks?: OriginalTextBlock[];
  onBlockClick?: (id: string) => void; // ✅ 클릭 핸들러
}

const FilePreviewer: React.FC<Props> = memo(
  ({
    state,
    onLoadSuccess,
    bboxes,
    selectedBlockId,
    imageResolution,
    originalTextBlocks,
    onBlockClick,
  }) => {
    const { previewUrl, fileType, currentPage, textContent } = state;
    const activeTextRef = useRef<HTMLDivElement>(null);

    // 선택된 텍스트 블록으로 스크롤 이동
    useEffect(() => {
      if (selectedBlockId && activeTextRef.current) {
        activeTextRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
    }, [selectedBlockId]);

    // ─────────────────────────────────────────────────────────────
    // 1. 텍스트(.txt) 및 한글(.hwp) 파일 미리보기
    // ─────────────────────────────────────────────────────────────
    if (fileType === 'text' || fileType === 'hwp') {
      return (
        <div className="w-full h-full bg-gray-50/30 p-8 overflow-y-auto custom-scrollbar shadow-inner">
          {originalTextBlocks && originalTextBlocks.length > 0 ? (
            <div className="flex flex-col gap-4">
              {originalTextBlocks.map((block) => {
                const isActive = block.id === selectedBlockId;
                return (
                  <div
                    key={block.id}
                    ref={isActive ? activeTextRef : null}
                    // ✅ 클릭 이벤트 연결 & 커서 스타일 추가
                    onClick={() => onBlockClick?.(block.id)}
                    className={`p-3 rounded-lg border transition-all duration-200 cursor-pointer ${
                      isActive
                        ? 'bg-[#5A8FBB]/10 border-[#5A8FBB] text-[#2c3e50] shadow-sm scale-[1.01]'
                        : 'bg-white border-transparent text-gray-500 hover:bg-white hover:border-gray-200 hover:shadow-sm'
                    }`}
                  >
                    <p className="leading-relaxed whitespace-pre-wrap text-sm md:text-base font-medium">
                      {block.content}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <pre className="text-sm text-gray-700 font-mono whitespace-pre-wrap leading-relaxed">
              {textContent || '내용이 없습니다.'}
            </pre>
          )}
        </div>
      );
    }

    // 2. 이미지 및 PDF 미리보기
    if (!previewUrl) return null;

    return (
      <div className="w-full h-full flex flex-col bg-gray-50 rounded-2xl overflow-hidden relative">
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 flex justify-center items-start">
          <div className="relative inline-block shadow-sm rounded-lg bg-white">
            {fileType === 'image' ? (
              <img
                src={previewUrl}
                alt="Preview"
                className="max-w-full h-auto object-contain block"
              />
            ) : (
              <Document
                file={previewUrl}
                onLoadSuccess={({ numPages }) => onLoadSuccess(numPages)}
                className="flex justify-center"
              >
                <Page
                  pageNumber={currentPage}
                  width={500}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                />
              </Document>
            )}

            {/* ✅ BBoxOverlay에 클릭 핸들러 전달 */}
            <BBoxOverlay
              bboxes={bboxes}
              selectedId={selectedBlockId}
              originalResolution={imageResolution}
              onBlockClick={onBlockClick}
            />
          </div>
        </div>
      </div>
    );
  },
);

export default FilePreviewer;
