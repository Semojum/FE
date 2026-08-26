import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Loader2 } from 'lucide-react';
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

// pdf.js가 CID 폰트(한글 PDF가 흔히 쓴다)를 그리려면 CMap 파일이 필요하다. 이 값을
// 안 주면 해당 페이지의 글자가 하나도 안 그려지고 표·선만 남는다 — 원본 2쪽이
// 빈 표로 보이던 원인(2026-08-25 QA). 렌더 속도도 같이 무너진다(6,331ms → 164ms).
// 파일은 vite.config.ts의 semojum:pdfjs-assets 플러그인이 /pdfjs/ 아래로 담는다.
//
// 이 객체는 반드시 모듈 수준 상수여야 한다 — react-pdf는 options의 참조가 바뀌면
// 문서를 처음부터 다시 읽는다(렌더할 때마다 새 객체를 넘기면 무한 재로딩).
// disableFontFace: 임베드 글꼴을 @font-face로 등록하지 않고 글자 외곽선을 직접 그린다.
// 문제집 PDF에는 pdf.js의 글꼴 검사를 통과하지 못하는 글꼴이 섞여 있고("Invalid font
// data in ArrayBuffer"), 그 글꼴로 찍힌 글자가 통째로 엑스박스로 나왔다(2026-08-25 QA).
// 외곽선으로 그리면 그 글꼴도 제대로 나온다. 같은 쪽 실측 153ms vs 145ms로 속도 차이는
// 없었다.
const PDF_OPTIONS = {
  cMapUrl: '/pdfjs/cmaps/',
  cMapPacked: true,
  standardFontDataUrl: '/pdfjs/standard_fonts/',
  disableFontFace: true,
};

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
  // 원본을 맨 위로 올리라는 신호(쪽 번호로 넘겼을 때만 온다). 블록을 골라 넘어온
  // 경우에는 오지 않는다 — 그때는 아래 BBoxOverlay가 고른 상자로 옮긴다.
  scrollTopToken?: number;
}

// 원본 텍스트 한 블록을 그린다 — 찾기(Ctrl+F)에 걸린 구간에 노란 칠을 한다.
// 수식 구간 밑줄은 뺐다(2026-08-24 요청) — 조판된 모양은 아래 "수식" 칸이 보여 준다.
const renderWithFind = (
  content: string,
  hits: { start: number; end: number }[],
  active: { start: number; end: number } | null,
): React.ReactNode[] => {
  const hitAt = new Set<number>();
  hits.forEach((h) => {
    for (let i = h.start; i < h.end; i++) hitAt.add(i);
  });
  const activeAt = new Set<number>();
  if (active) {
    for (let i = active.start; i < active.end; i++) activeAt.add(i);
  }

  const classOf = (i: number) =>
    activeAt.has(i)
      ? 'bg-[#f9c74f] text-gray-900'
      : hitAt.has(i)
        ? 'bg-[#fdf1c7]'
        : '';

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

// 원본을 그리는 동안 보여 주는 자리 표시. 쪽을 넘길 때 흰 종이만 남지 않게 한다.
const PreviewLoading: React.FC<{ label?: string }> = ({
  label = '불러오는 중...',
}) => (
  <div
    role="status"
    aria-live="polite"
    className="flex h-[320px] w-[240px] flex-col items-center justify-center gap-2 text-gray-400"
  >
    <Loader2 className="h-6 w-6 animate-spin text-[#407FAC]" />
    <p className="text-[12px]">{label}</p>
  </div>
);

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
    scrollTopToken,
  }) => {
    const {
      previewUrl,
      fileType,
      currentPage,
      textContent,
      isRestoredPages,
      previewPage,
    } = state;
    const activeTextRef = useRef<HTMLDivElement>(null);
    // PDF 페이지 폭은 패널 폭에 맞춘다. 예전에는 500px 고정이라 패널이 그보다 좁으면
    // 가운데 정렬된 페이지의 좌우가 잘려 나갔다(문제 번호가 안 보였다 — QA "mode A 좌측
    // 원본 잘려서 보임"). 넓을 때는 여백을 남기지 않고 더 크게 그린다.
    const [pageWidth, setPageWidth] = useState(0);
    const resizeObserverRef = useRef<ResizeObserver | null>(null);
    // 이 쪽이 캔버스에 다 그려졌는지. 그리기 전에는 원본이 흰 종이라, 그 위에 상자만
    // 먼저 떠서 "빈 화면에 네모가 파바박" 튀었다(2026-08-25 QA). 다 그려진 뒤에 얹는다.
    const [pageRendered, setPageRendered] = useState(false);

    // 복원본(마이페이지) PDF 이중 버퍼.
    //
    // 복원한 작업의 원본은 쪽마다 다른 단일 페이지 PDF(url)다. <Document>의 file을
    // 그냥 갈아 끼우면 문서를 새로 읽는 동안 이전 쪽 → 흰 화면 → "불러오는 중" →
    // 흰 화면 → 새 쪽 순서로 깜빡여 오류처럼 보였다(2026-08-26 QA). 새 쪽은 보이지
    // 않는 슬롯에서 캔버스까지 다 그린 뒤 한 번에 보이는 슬롯과 바꾼다. 같은 슬롯이
    // 숨김→표시로만 바뀌므로 다시 읽는 일이 없고, 바꾸기 전까지는 이전 쪽이 남는다.
    const [slotA, setSlotA] = useState<string | null>(null);
    const [slotB, setSlotB] = useState<string | null>(null);
    const [visibleSlot, setVisibleSlot] = useState<'a' | 'b'>('a');
    const previewUrlRef = useRef(previewUrl);
    previewUrlRef.current = previewUrl;

    useEffect(() => {
      if (!isRestoredPages || fileType !== 'pdf' || !previewUrl) {
        // 복원 PDF 경로가 아니면(라이브 업로드·초기화) 슬롯을 비워 이전 쪽이 남지 않게.
        setSlotA(null);
        setSlotB(null);
        return;
      }
      const shown = visibleSlot === 'a' ? slotA : slotB;
      if (shown === previewUrl) {
        // 이미 화면에 있는 쪽 — 빠르게 오가다 남은 준비 슬롯은 버린다.
        if (visibleSlot === 'a') setSlotB(null);
        else setSlotA(null);
        return;
      }
      if (visibleSlot === 'a') setSlotB(previewUrl);
      else setSlotA(previewUrl);
    }, [isRestoredPages, fileType, previewUrl, visibleSlot, slotA, slotB]);

    // 준비 슬롯이 다 그려지면 화면에 올린다. 그리는 사이 또 다른 쪽으로 넘어갔으면
    // (previewUrl이 벌써 바뀌었으면) 이 결과는 버린다 — 다음 effect가 다시 준비한다.
    const promoteSlot = useCallback((slot: 'a' | 'b', url: string) => {
      if (url !== previewUrlRef.current) return;
      setVisibleSlot(slot);
      if (slot === 'a') setSlotB(null);
      else setSlotA(null);
      setPageRendered(true);
    }, []);

    // 콜백 ref로 "지금 붙어 있는 노드"를 관찰한다.
    // 예전에는 effect가 [previewUrl, fileType]에 걸려 있었는데, 미리보기 칸은
    // previewUrl이 없으면 통째로 언마운트된다(탭 전환·작업 복원). 그래서 관찰 대상이
    // 이미 떨어져 나간 옛 노드로 남고, 그 사이에 잰 폭(패널이 아직 좁던 순간의 값)이
    // 그대로 굳어 원본 PDF가 손바닥만 하게 그려졌다 — 다른 탭에 갔다 mode a로
    // 돌아오면 원본이 깨져 보이던 원인(2026-08-17 QA 영상).
    const viewportElRef = useRef<HTMLDivElement | null>(null);
    const viewportRef = useCallback((el: HTMLDivElement | null) => {
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      viewportElRef.current = el;
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

    // 쪽이나 파일이 바뀌면 "아직 안 그려짐"으로 되돌린다. react-pdf의 콜백에 기대면
    // 같은 문서에서 쪽 번호만 바뀌는 경로(방금 올린 작업)에서 초기화가 안 될 수 있다.
    useEffect(() => {
      setPageRendered(false);
    }, [currentPage, previewUrl]);

    // 쪽 번호로 넘기면 원본도 맨 위로 올린다. 결과 격자는 그 쪽 첫 줄로 올라가는데
    // 원본만 앞 쪽에서 보던 자리에 남아 두 화면이 서로 다른 곳을 가리켰다(2026-08-25 요청).
    // 블록을 골라 넘어온 경우에는 신호가 오지 않는다 — 그때는 고른 상자로 가야 한다.
    useEffect(() => {
      if (scrollTopToken === undefined || scrollTopToken === 0) return;
      viewportElRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }, [scrollTopToken]);

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
                        {/* 문장을 통째로 조판해 보여 준다 — 수식만 떼어 놓으면
                            앞뒤 맥락이 끊겨 무엇을 가리키는 식인지 알기 어렵다. */}
                        <LatexRenderer
                          text={block.content}
                          className="min-w-0 whitespace-pre-wrap text-[13px] text-gray-700"
                        />
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

    // 복원본 슬롯 파생값 — 보이는 쪽 / 준비 중인 쪽 / 전환 중 여부.
    // 쪽을 넘기면 currentPage는 바로 바뀌지만 원본은 내려받은 뒤에야 도착하므로
    // (previewPage가 아직 이전 쪽), 그 구간도 "전환 중"으로 본다.
    const shownSlotUrl = visibleSlot === 'a' ? slotA : slotB;
    const pendingSlotUrl = visibleSlot === 'a' ? slotB : slotA;
    const isSwitchingPage =
      !!isRestoredPages &&
      (!!pendingSlotUrl ||
        (previewPage !== undefined && previewPage !== currentPage));
    const restoredSlots = [
      { id: 'a' as const, url: slotA },
      { id: 'b' as const, url: slotB },
    ];
    const pageRenderWidth = pageWidth > 0 ? Math.max(240, pageWidth - 16) : 500;
    const pageDevicePixelRatio = Math.min(
      2,
      typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1,
    );

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
            ) : isRestoredPages ? (
              // 복원본: 이중 버퍼 슬롯(위 slotA/slotB 주석 참고). 준비 슬롯은 보이지
              // 않게 겹쳐 그리고, 캔버스가 완성되면 promoteSlot이 한 번에 바꾼다.
              <>
                {restoredSlots.map(({ id, url }) =>
                  url ? (
                    <div
                      key={id}
                      aria-hidden={visibleSlot !== id || undefined}
                      className={
                        visibleSlot === id
                          ? `transition-opacity duration-150 ${
                              isSwitchingPage ? 'opacity-50' : ''
                            }`
                          : 'pointer-events-none absolute inset-0 overflow-hidden opacity-0'
                      }
                    >
                      <Document
                        file={url}
                        options={PDF_OPTIONS}
                        // react-pdf 기본 문구는 영어("Loading PDF…")다 — 앱의 다른
                        // 대기 표시와 말이 다르면 오류처럼 읽힌다(2026-08-26 요청).
                        loading={visibleSlot === id ? <PreviewLoading /> : null}
                        error={
                          <PreviewLoading label="원본을 불러오지 못했습니다" />
                        }
                        // 문서가 아예 안 읽혀도 승격한다 — 오류 안내가 보이려면
                        // 이 슬롯이 화면에 나와야 한다.
                        onLoadError={() => promoteSlot(id, url)}
                        className="flex justify-center"
                      >
                        <Page
                          pageNumber={1}
                          width={pageRenderWidth}
                          devicePixelRatio={pageDevicePixelRatio}
                          renderTextLayer={false}
                          renderAnnotationLayer={false}
                          onRenderSuccess={() => promoteSlot(id, url)}
                          loading={
                            visibleSlot === id ? <PreviewLoading /> : null
                          }
                        />
                      </Document>
                    </div>
                  ) : null,
                )}
                {/* 첫 진입 — 아직 보여 줄 쪽이 없다 */}
                {!shownSlotUrl && <PreviewLoading />}
                {/* 다음 쪽을 준비하는 동안 이전 쪽 위에 작게 알린다 */}
                {shownSlotUrl && isSwitchingPage && (
                  <div
                    role="status"
                    aria-live="polite"
                    className="absolute inset-x-0 top-3 z-10 flex justify-center"
                  >
                    <span className="flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-[12px] font-medium text-gray-500 shadow-sm">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[#407FAC]" />
                      원본 불러오는 중...
                    </span>
                  </div>
                )}
              </>
            ) : (
              <Document
                file={previewUrl}
                options={PDF_OPTIONS}
                // react-pdf 기본 문구는 영어("Loading PDF…")다 — 앱의 다른 대기
                // 표시와 말이 다르면 오류처럼 읽힌다(2026-08-26 요청).
                loading={<PreviewLoading />}
                error={<PreviewLoading label="원본을 불러오지 못했습니다" />}
                onLoadSuccess={({ numPages }) => onLoadSuccess(numPages)}
                className="flex justify-center"
              >
                <Page
                  pageNumber={currentPage}
                  // p-2(8px×2)를 뺀 실제 그릴 수 있는 폭. 아직 측정 전이면 종전 값(500).
                  width={pageRenderWidth}
                  // 캔버스 해상도 상한. 기본값은 기기 배율(고DPI에서 2~3배)이라
                  // 고화질 문서에서 캔버스가 수천만 픽셀이 되고, 그리기·합성이 GPU에
                  // 걸려 창 전환까지 굼떴다(2026-08-25 QA: RTX 2060에서 렉).
                  // 원본 대조용 미리보기에는 2배면 충분하다.
                  devicePixelRatio={pageDevicePixelRatio}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  onRenderSuccess={() => setPageRendered(true)}
                  loading={<PreviewLoading />}
                />
              </Document>
            )}

            {/* 페이지가 다 그려진 뒤에만 상자를 얹는다 (위 pageRendered 주석 참고) */}
            {(fileType === 'image' || pageRendered) && (
              <BBoxOverlay
                bboxes={bboxes}
                selectedId={selectedBlockId}
                originalResolution={imageResolution}
                onBlockClick={onBlockClick}
                hoveredId={hoveredBlockId}
                onBlockHover={onBlockHover}
              />
            )}
          </div>
        </div>
      </div>
    );
  },
);

export default FilePreviewer;
