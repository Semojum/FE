import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import LatexRenderer from './LatexRenderer';
import { findMath } from '../../../utils/mathText';
import {
  BoundingBox,
  FileState,
  ImageResolution,
  OriginalTextBlock,
} from '../../../types';
import BBoxOverlay from './BboxOverlay'; // .tsx 확장자는 import 시 생략 가능
// PDF 워커는 번들에 포함해 로컬에서 불러온다. 예전에는 unpkg CDN(//unpkg.com/…)을
// 가리켰는데, 배포 대상인 데스크톱 앱은 origin이 tauri.localhost라 프로토콜 상대
// 경로가 http로 풀리고 CSP·오프라인에서도 막힌다. 워커가 안 뜨면 <Document>가
// 아무것도 그리지 않아 원본 미리보기가 통째로 빈 화면이 됐다.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface Props {
  state: FileState;
  onLoadSuccess: (numPages: number) => void;
  bboxes: BoundingBox[];
  selectedBlockId: string | null;
  imageResolution: ImageResolution;
  originalTextBlocks?: OriginalTextBlock[];
  // 문서에서 찾기(Ctrl+F) — 블록별로 걸린 구간. 지금 보고 있는 한 건만 진하게 칠한다.
  findRangesByBlock?: Map<string, { start: number; end: number }[]>;
  activeFind?: { blockId: string; start: number; end: number } | null;
  onBlockClick?: (id: string) => void; // ✅ 클릭 핸들러
  // 마우스가 얹힌 블록 — 결과 격자와 같은 값을 공유해 양쪽에 같은 상자를 그린다.
  hoveredBlockId?: string | null;
  onBlockHover?: (id: string | null) => void;
}

// 원본 텍스트 한 블록을 그린다 — 수식 구간에는 밑줄(기능정의서 "결과 렌더링" D-2),
// 찾기(Ctrl+F)에 걸린 구간에는 노란 칠. 두 표시가 겹칠 수 있어 글자 단위로 한 번에 나눈다.
const renderWithFind = (
  content: string,
  hits: { start: number; end: number }[],
  active: { start: number; end: number } | null,
): React.ReactNode[] => {
  const mathAt = new Set<number>();
  findMath(content).forEach((m) => {
    for (let i = m.start; i < m.end; i++) mathAt.add(i);
  });
  const hitAt = new Set<number>();
  hits.forEach((h) => {
    for (let i = h.start; i < h.end; i++) hitAt.add(i);
  });
  const activeAt = new Set<number>();
  if (active) {
    for (let i = active.start; i < active.end; i++) activeAt.add(i);
  }

  const classOf = (i: number) =>
    [
      mathAt.has(i)
        ? 'underline decoration-[#5b8ce6] decoration-2 underline-offset-2'
        : '',
      activeAt.has(i)
        ? 'bg-[#f9c74f] text-gray-900'
        : hitAt.has(i)
          ? 'bg-[#fdf1c7]'
          : '',
    ]
      .filter(Boolean)
      .join(' ');

  // 같은 표시가 이어지는 동안은 한 조각으로 묶는다.
  const nodes: React.ReactNode[] = [];
  let buffer = '';
  let current = '';
  const flush = () => {
    if (!buffer) return;
    nodes.push(
      <span key={nodes.length} className={current || undefined}>
        {buffer}
      </span>,
    );
    buffer = '';
  };

  [...content].forEach((ch, i) => {
    const cls = classOf(i);
    if (cls !== current) {
      flush();
      current = cls;
    }
    buffer += ch;
  });
  flush();
  return nodes;
};

const FilePreviewer: React.FC<Props> = memo(
  ({
    state,
    onLoadSuccess,
    bboxes,
    selectedBlockId,
    imageResolution,
    originalTextBlocks,
    findRangesByBlock,
    activeFind,
    onBlockClick,
    hoveredBlockId,
    onBlockHover,
  }) => {
    const { previewUrl, fileType, currentPage, textContent, isRestoredPages } =
      state;
    const activeTextRef = useRef<HTMLDivElement>(null);
    // PDF 페이지 폭은 패널 폭에 맞춘다. 예전에는 500px 고정이라 패널이 그보다 좁으면
    // 가운데 정렬된 페이지의 좌우가 잘려 나갔다(문제 번호가 안 보였다 — QA "mode A 좌측
    // 원본 잘려서 보임"). 넓을 때는 여백을 남기지 않고 더 크게 그린다.
    const [pageWidth, setPageWidth] = useState(0);
    const resizeObserverRef = useRef<ResizeObserver | null>(null);

    // 콜백 ref로 "지금 붙어 있는 노드"를 관찰한다.
    // 예전에는 effect가 [previewUrl, fileType]에 걸려 있었는데, 미리보기 칸은
    // previewUrl이 없으면 통째로 언마운트된다(탭 전환·작업 복원). 그래서 관찰 대상이
    // 이미 떨어져 나간 옛 노드로 남고, 그 사이에 잰 폭(패널이 아직 좁던 순간의 값)이
    // 그대로 굳어 원본 PDF가 손바닥만 하게 그려졌다 — 다른 탭에 갔다 mode a로
    // 돌아오면 원본이 깨져 보이던 원인(2026-08-17 QA 영상).
    const viewportRef = useCallback((el: HTMLDivElement | null) => {
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      if (!el) return;
      const measure = () => setPageWidth(el.clientWidth);
      measure();
      // 붙자마자 잰 값은 레이아웃이 끝나기 전일 수 있다 — 다음 프레임에 한 번 더 잰다.
      requestAnimationFrame(measure);
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      resizeObserverRef.current = ro;
    }, []);

    useEffect(() => () => resizeObserverRef.current?.disconnect(), []);

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
                // hover 표시는 CSS :hover가 아니라 상태로 그린다 — 결과 격자에서
                // 얹었을 때도 여기에 같은 상자가 떠야 하기 때문이다.
                const isHovered = !isActive && block.id === hoveredBlockId;
                return (
                  <div
                    key={block.id}
                    ref={isActive ? activeTextRef : null}
                    // ✅ 클릭 이벤트 연결 & 커서 스타일 추가
                    onClick={() => onBlockClick?.(block.id)}
                    onMouseEnter={() => onBlockHover?.(block.id)}
                    onMouseLeave={() => onBlockHover?.(null)}
                    className={`p-3 rounded-lg border transition-all duration-200 cursor-pointer ${
                      isActive
                        ? 'bg-[#5A8FBB]/10 border-[#5A8FBB] text-[#2c3e50] shadow-sm scale-[1.01]'
                        : isHovered
                          ? 'bg-white border-[#c3cfdd] text-gray-500 shadow-sm'
                          : 'bg-white border-transparent text-gray-500'
                    }`}
                  >
                    <p className="leading-relaxed whitespace-pre-wrap text-sm md:text-base font-medium">
                      {renderWithFind(
                        block.content,
                        findRangesByBlock?.get(block.id) ?? [],
                        activeFind?.blockId === block.id ? activeFind : null,
                      )}
                    </p>
                    {findMath(block.content).length > 0 && (
                      <div className="mt-1.5 flex items-start gap-2 rounded-[8px] bg-[#fbfcfe] px-2 py-1.5">
                        <span
                          aria-hidden
                          className="shrink-0 text-[9.5px] font-bold text-[#5b8ce6]"
                        >
                          수식
                        </span>
                        {/* 밑줄 친 구간만 조판해 보여 준다 — 문장까지 다시 그리면
                            같은 글이 두 번 보여 오히려 읽기 어렵다. */}
                        <div className="min-w-0 text-[13px] text-gray-700">
                          {findMath(block.content).map((m, i) => (
                            <LatexRenderer key={i} text={`$${m.body}$`} />
                          ))}
                        </div>
                      </div>
                    )}
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
        <div
          ref={viewportRef}
          className="flex-1 overflow-y-auto custom-scrollbar p-2 flex justify-center items-start"
        >
          <div className="relative inline-block max-w-full shadow-sm rounded-lg bg-white">
            {fileType === 'image' ? (
              <img
                src={previewUrl}
                alt="Preview"
                className="max-w-full h-auto object-contain block"
              />
            ) : (
              <Document
                file={previewUrl}
                // 마이페이지 복원본은 페이지별로 분리된 단일 페이지 PDF이므로 총 페이지 수를
                // 덮어쓰지 않는다(총 페이지는 작업 메타에서 이미 설정됨).
                onLoadSuccess={({ numPages }) =>
                  !isRestoredPages && onLoadSuccess(numPages)
                }
                className="flex justify-center"
              >
                <Page
                  pageNumber={isRestoredPages ? 1 : currentPage}
                  // p-2(8px×2)를 뺀 실제 그릴 수 있는 폭. 아직 측정 전이면 종전 값(500).
                  width={pageWidth > 0 ? Math.max(240, pageWidth - 16) : 500}
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
              hoveredId={hoveredBlockId}
              onBlockHover={onBlockHover}
            />
          </div>
        </div>
      </div>
    );
  },
);

export default FilePreviewer;
