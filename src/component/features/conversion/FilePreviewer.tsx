import React, { memo, useEffect, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
// FileText 아이콘은 이제 텍스트가 없을 때만 쓰거나 제거해도 됩니다.
import {
  BoundingBox,
  FileState,
  ImageResolution,
  OriginalTextBlock,
} from '../../../types';
import BBoxOverlay from './BboxOverlay.tsx';

// PDF Worker 설정
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface Props {
  state: FileState;
  onLoadSuccess: (numPages: number) => void;
  bboxes: BoundingBox[];
  selectedBlockId: string | null;
  imageResolution: ImageResolution;
  // [New] 텍스트 하이라이팅을 위한 데이터
  originalTextBlocks?: OriginalTextBlock[];
}

const FilePreviewer: React.FC<Props> = memo(
  ({
    state,
    onLoadSuccess,
    bboxes,
    selectedBlockId,
    imageResolution,
    originalTextBlocks,
  }) => {
    const { previewUrl, fileType, currentPage, textContent } = state;

    const activeTextRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (selectedBlockId && activeTextRef.current) {
        activeTextRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
    }, [selectedBlockId]);
    // ─────────────────────────────────────────────────────────────
    // [수정됨] 1. 텍스트(.txt) 및 한글(.hwp) 파일 텍스트 미리보기
    // hwp 파일도 파싱된 결과가 textContent에 담겨 있으므로 텍스트로 보여줍니다.
    // ─────────────────────────────────────────────────────────────
    if (fileType === 'text' || fileType === 'hwp') {
      return (
        <div className="w-full h-full bg-white p-8 overflow-y-auto custom-scrollbar shadow-inner bg-gray-50/30">
          {originalTextBlocks && originalTextBlocks.length > 0 ? (
            // [A] 교정 변환 모드: 블록 단위 렌더링 & 하이라이팅
            <div className="flex flex-col gap-4">
              {originalTextBlocks.map((block) => {
                const isActive = block.id === selectedBlockId;
                return (
                  <div
                    key={block.id}
                    ref={isActive ? activeTextRef : null}
                    className={`p-3 rounded-lg border transition-all duration-300 ${
                      isActive
                        ? 'bg-[#5A8FBB]/10 border-[#5A8FBB] text-[#2c3e50] shadow-sm scale-[1.01]' // 활성 스타일
                        : 'bg-white border-transparent text-gray-500 hover:bg-gray-50' // 비활성 스타일
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
            // [B] 일반 모드: 단순 텍스트 렌더링
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
          {/* 컨테이너: 이미지/PDF와 오버레이를 감싸는 relative 부모 */}
          <div className="relative inline-block shadow-sm rounded-lg">
            {fileType === 'image' ? (
              <img
                src={previewUrl}
                alt="Preview"
                className="max-w-full h-auto object-contain block" // block 처리로 하단 여백 제거
              />
            ) : (
              <Document
                file={previewUrl}
                onLoadSuccess={({ numPages }) => onLoadSuccess(numPages)}
                className="flex justify-center"
              >
                <Page
                  pageNumber={currentPage}
                  width={500} // 반응형 처리를 위해선 CSS width나 scale 처리가 필요할 수 있음
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                />
              </Document>
            )}

            {/* BBox 오버레이: 이미지가 로드된 후 정확한 위치에 표시됨 */}
            <BBoxOverlay
              bboxes={bboxes}
              selectedId={selectedBlockId}
              originalResolution={imageResolution}
            />
          </div>
        </div>
      </div>
    );
  },
);

export default FilePreviewer;
