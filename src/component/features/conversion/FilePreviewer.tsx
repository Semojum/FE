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
import { endOp, now } from '../../../utils/perfBus';
import {
  captureThumb,
  dropOtherDocs,
  getThumb,
  putThumb,
  thumbKey,
} from '../../../utils/pageThumbs';

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
  // 복원본 쪽 축소본을 어느 작업의 것으로 담을지(아래 thumbDoc 주석 참고 —
  // 라이브 업로드본은 이 값 대신 blob: URL로 가른다).
  docKey?: string | null;
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

// pdf.js 문서에서 우리가 쓰는 것은 캐시 비우기뿐이다.
type PdfCleanup = { cleanup: (keepLoadedFonts?: boolean) => Promise<unknown> };
// 쪽 하나짜리 손잡이 — 라이브 업로드본은 두 슬롯이 **한 문서**를 나눠 쓰므로
// 문서째 비울 수 없다(그리는 중인 쪽까지 날아간다). 나가는 쪽만 따로 놓는다.
type PdfPageCleanup = { cleanup: () => unknown };

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
    docKey,
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
    // pdf.js 문서 손잡이 — 다 그린 뒤 디코드 캐시를 비우는 데만 쓴다.
    const livePdfRef = useRef<PdfCleanup | null>(null);
    // 복원본은 쪽마다 다른 문서라 슬롯별로 들고 있어야 한다.
    const restoredPdfRef = useRef<Record<'a' | 'b', PdfCleanup | null>>({
      a: null,
      b: null,
    });

    // 슬롯의 캔버스를 찾기 위한 참조 — 다 그린 뒤 축소본을 떠 두는 데만 쓴다.
    const slotElRef = useRef<Record<'a' | 'b', HTMLDivElement | null>>({
      a: null,
      b: null,
    });

    // 라이브 슬롯이 그린 쪽의 손잡이 — 나가는 쪽의 디코드 결과를 놓는 데만 쓴다.
    const livePageRef = useRef<Record<'a' | 'b', PdfPageCleanup | null>>({
      a: null,
      b: null,
    });

    // 나가는 쪽의 디코드 결과를 **새 쪽을 풀기 전에** 놓는다.
    //
    // 스캔 문제집은 한 장이 4959×7017(=139MB)이고 JPEG2000이라 푸는 동안 그 몇 배를
    // 더 쓴다. 지금까지는 다 그린 **뒤** 800ms에 비웠는데(아래 cleanup effect), 그러면
    // 넘기는 동안 이전 쪽과 새 쪽의 디코드가 겹쳐 최고치가 두 배가 됐다
    // (2026-08-27 인수시험: 슬롯 둘 3.9GB · 하나 2.4GB).
    //
    // 캔버스에 이미 찍힌 그림은 문서와 별개라 여기서 비워도 **화면은 그대로 남는다** —
    // 이전 쪽은 새 쪽이 올라올 때까지 예전처럼 보인다. 되돌아가면 다시 풀어야 하지만
    // 그 사이는 쪽 축소본이 메운다(위 stashThumb).
    const releaseDecoded = useCallback((drop: () => unknown) => {
      try {
        const r = drop() as Promise<unknown> | undefined;
        if (r && typeof r.catch === 'function') r.catch(() => {});
      } catch {
        // 아직 그리는 중이면 pdf.js가 거부한다 — 그때는 다 그린 뒤 정리에 맡긴다.
      }
    }, []);

    // 쪽 넘김에 걸린 시간을 개발자 오버레이("최근 동작")로 흘린다. 이 화면의 체감은
    // 거의 이 값이라, 느려졌을 때 어디를 볼지 재지 않고는 알 수 없다.
    const switchAtRef = useRef<number | null>(null);
    const endSwitch = useCallback((label: string) => {
      const at = switchAtRef.current;
      if (at === null) return;
      switchAtRef.current = null;
      endOp(label, at);
    }, []);

    // 축소본을 어느 문서의 것으로 담을지.
    //
    // 라이브 업로드본은 **blob: URL 자체가 그 파일의 신원**이다 — 문서 하나에 URL
    // 하나이고, 이름이 같은 다른 파일(고친 판을 다시 올리는 경우)을 올리면 URL이
    // 달라져 옛 축소본이 뜨지 않는다. 넘겨받은 docKey는 작업 id가 없을 때 파일
    // 이름으로 떨어지므로 그 경우를 가르지 못한다.
    // 복원본은 반대로 **쪽마다 URL이 다르므로**(단일 페이지 문서) 작업 id로 가른다.
    //
    // 어긋나면 못 찾는 쪽으로 어긋난다 — 못 찾으면 이전 쪽이 그대로 남을 뿐이고,
    // 잘못 찾으면 남의 쪽이 뜬다. 후자만 막으면 된다.
    const thumbDoc = isRestoredPages ? docKey : previewUrl;

    // 다른 작업의 축소본은 들고 있을 이유가 없다(위 dropOtherDocs 주석 — 상한을
    // 나눠 쓰는 탓에 지금 문서의 쪽이 밀려난다).
    useEffect(() => {
      dropOtherDocs(thumbDoc);
    }, [thumbDoc]);

    // 다 그린 캔버스를 줄여 담아 둔다. 다음에 이 쪽으로 오면 곧바로 늘려 보여 주고,
    // 진짜 그림이 오면 바꿔 끼운다(아래 placeholder). 전환 시간에 얹히지 않도록
    // 다음 프레임 뒤로 미룬다 — 축소는 몇 ms지만 그 몇 ms가 쪽 넘김에 들어가면 안 된다.
    const stashThumb = useCallback(
      (slot: 'a' | 'b', page: number) => {
        const key = thumbKey(thumbDoc, page);
        window.setTimeout(() => {
          const canvas = slotElRef.current[slot]?.querySelector('canvas');
          if (!canvas) return;
          const thumb = captureThumb(canvas);
          if (thumb) putThumb(key, thumb);
        }, 0);
      },
      [thumbDoc],
    );

    // 라이브 업로드본 이중 버퍼 — 지금 화면에 나와 있는 슬롯과 그 슬롯이 다 그린 쪽.
    //
    // 예전에는 <Page pageNumber={currentPage}> 하나뿐이라, 쪽을 넘기면 react-pdf가
    // 이전 캔버스를 버리고 새 캔버스를 붙인 뒤 거기에 그렸다. <Page loading>은 쪽
    // 객체를 읽는 동안만 뜨고 그리는 동안에는 사라지므로, 고화질 스캔본에서는
    // **4~5초 동안 안내 없는 흰(가끔 검은) 화면**이 남았다(2026-08-27 인수시험 실측:
    // 쪽 넘김 2.1~6.4초, 그중 빈 화면 1.5~4.9초, 안내는 5회 중 1회만).
    // 복원본이 쓰던 이중 슬롯을 여기에도 둔다 — 새 쪽은 보이지 않는 자리에서 다 그린
    // 뒤에 한 번에 바뀌고, 그때까지는 이전 쪽이 그대로 남는다.
    //
    // 슬롯을 두 개 두고 **보이는 슬롯을 바꾸는** 것이 핵심이다. 한 슬롯의 pageNumber만
    // 갈아 끼우면 react-pdf가 그 캔버스를 버리고 처음부터 다시 그린다 — 애써 미리 그려
    // 둔 것이 날아가고 흰 화면이 그대로 남는다(첫 시도에서 이렇게 만들었다가 잡았다).
    //
    // 어느 문서의 것인지도 함께 들고 있는다 — 다른 파일로 갈아타면 문서를 처음부터
    // 읽으므로, 별도 초기화 없이 "지금 문서의 것이 아니면 아직 아무것도 못 그린 것"이 된다.
    const [painted, setPainted] = useState<{
      slot: 'a' | 'b';
      url: string;
      page: number;
    } | null>(null);

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
    // painted를 effect에서 읽으려고 나란히 든다. 바뀌는 자리가 promoteLiveSlot
    // 한 곳뿐이라 거기서 함께 적는다 — 렌더 중에 ref를 건드리지 않는다.
    const paintedRef = useRef<{ slot: 'a' | 'b'; page: number } | null>(null);
    // 복원본 슬롯은 쪽마다 다른 단일 페이지 문서(pageNumber는 늘 1)라, 그 슬롯이
    // 실제로 어느 쪽인지는 지금 받아 둔 원본의 쪽 번호로 안다.
    const previewPageRef = useRef(previewPage);
    previewPageRef.current = previewPage;

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
      const pending = visibleSlot === 'a' ? slotB : slotA;
      if (pending === previewUrl) return; // 이미 이 쪽을 준비하고 있다
      if (visibleSlot === 'a') setSlotB(previewUrl);
      else setSlotA(previewUrl);
      switchAtRef.current = now();
      // 새 쪽을 풀기 전에 나가는 쪽을 놓는다(위 releaseDecoded). 복원본은 쪽마다
      // 문서가 따로라 문서째 비워도 그리는 쪽을 건드리지 않는다.
      releaseDecoded(() => restoredPdfRef.current[visibleSlot]?.cleanup(true));
    }, [
      isRestoredPages,
      fileType,
      previewUrl,
      visibleSlot,
      slotA,
      slotB,
      releaseDecoded,
    ]);

    // 준비 슬롯이 다 그려지면 화면에 올린다. 그리는 사이 또 다른 쪽으로 넘어갔으면
    // (previewUrl이 벌써 바뀌었으면) 이 결과는 버린다 — 다음 effect가 다시 준비한다.
    const promoteSlot = useCallback(
      (slot: 'a' | 'b', url: string) => {
        if (url !== previewUrlRef.current) return;
        setVisibleSlot(slot);
        if (slot === 'a') setSlotB(null);
        else setSlotA(null);
        setPageRendered(true);
        endSwitch('원본 쪽 그리기');
        const page = previewPageRef.current;
        if (page !== undefined) stashThumb(slot, page);
      },
      [stashThumb, endSwitch],
    );

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

    // 다 그려진 슬롯을 화면으로 올린다. 그리는 사이에 사용자가 또 넘겼으면
    // (currentPage가 이미 달라졌으면) 이 결과는 버린다 — 그 쪽을 위한 슬롯이 이미
    // 새로 돌고 있다.
    // (메모하지 않아도 된다 — react-pdf의 Canvas는 이 콜백을 렌더 의존성에 넣지 않는다)
    const promoteLiveSlot = (slot: 'a' | 'b', page: number) => {
      if (page !== currentPage || !previewUrl) return;
      paintedRef.current = { slot, page };
      setPainted({ slot, url: previewUrl, page });
      endSwitch('원본 쪽 그리기');
      stashThumb(slot, page);
    };

    // 라이브 업로드본도 같다 — 넘기기 시작하면 지금 그려져 있는 쪽을 먼저 놓는다.
    // 두 슬롯이 한 문서를 나눠 쓰므로 문서째가 아니라 **그 쪽만** 놓는다.
    useEffect(() => {
      if (isRestoredPages) return;
      switchAtRef.current = now();
      const cur = paintedRef.current;
      if (!cur || cur.page === currentPage) return;
      releaseDecoded(() => livePageRef.current[cur.slot]?.cleanup());
    }, [currentPage, isRestoredPages, releaseDecoded]);

    // 다 그린 뒤에는 pdf.js가 들고 있는 디코드 결과를 비운다.
    //
    // 문제집 PDF는 쪽마다 4959×7017짜리 스캔 이미지가 여러 장 들어 있다. pdf.js는 디코드
    // 결과를 문서 안에 캐시하는데 한 장이 139MB(4959×7017×4)라, **첫 쪽을 그리는 것만으로**
    // 렌더러가 90MB → 1,236MB가 됐다. 2026-08-27 인수시험에서 판면 격자가 아직 비어
    // (DOM 노드 216개, JS 힙 7MB) 있을 때 잰 값이다 — 앱 메모리를 끌어올리는 것은
    // 판면이 아니라 여기다. 캔버스에 다 그린 뒤에는 그 캐시가 필요 없다.
    // 글꼴은 남겨 둔다(keepLoadedFonts) — 다음 쪽에서 다시 받지 않게.
    const liveSettledPage =
      painted && painted.url === previewUrl && painted.page === currentPage
        ? painted.page
        : null;
    useEffect(() => {
      if (isRestoredPages || liveSettledPage === null) return;
      const id = window.setTimeout(() => {
        livePdfRef.current?.cleanup(true).catch(() => {});
      }, 800);
      return () => window.clearTimeout(id);
    }, [isRestoredPages, liveSettledPage]);

    // 복원본도 같은 이유로 비운다. 이쪽은 쪽마다 **다른 단일 페이지 문서**를 읽으므로
    // 그 쪽의 디코드 결과가 슬롯이 살아 있는 동안 그대로 남는다 — 2026-08-27 인수시험에서
    // 슬롯 두 개가 모두 그려져 있는 동안 3.9GB, 한 개일 때 2.4GB로 오르내렸다.
    // 다음 쪽을 준비하는 중에는 건드리지 않는다(그리는 문서를 비우면 pdf.js가 거부한다).
    const restoredPending = visibleSlot === 'a' ? slotB : slotA;
    const restoredSettled = isRestoredPages && pageRendered && !restoredPending;
    useEffect(() => {
      if (!restoredSettled) return;
      const id = window.setTimeout(() => {
        restoredPdfRef.current[visibleSlot]?.cleanup(true).catch(() => {});
      }, 800);
      return () => window.clearTimeout(id);
    }, [restoredSettled, visibleSlot]);

    // p-2(8px×2)를 뺀 실제 그릴 수 있는 폭과 캔버스 배율 상한. 본 렌더와 미리 그리기가
    // 같은 값을 써야 디코드 캐시가 그대로 쓰인다.
    const pageRenderWidth = pageWidth > 0 ? Math.max(240, pageWidth - 16) : 500;
    const pageDevicePixelRatio = Math.min(
      2,
      typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1,
    );

    // (이웃 쪽 미리 그리기는 걷어냈다 — 2026-08-27 인수시험)
    //
    // 지금 쪽을 그린 뒤 앞뒤 쪽을 화면 밖 캔버스에 한 번 그려 두면 넘길 때 캐시만
    // 쓰게 된다는 계산이었는데(주석에 남아 있던 실측 497ms → 43ms), 실제 문제집에서는
    // 효과가 없었다: 25초를 머물러 미리 그리기가 끝나고도 이웃 쪽 전환이 5.8초·5.7초로
    // 그대로였다. 얻는 것 없이 쪽마다 캔버스를 두 장 더 만들고, 무엇보다 그 디코드
    // 결과가 문서 캐시에 그대로 쌓였다(아래 cleanup 주석의 1.2GB).
    // 전환 중 빈 화면은 위의 이중 슬롯이 없앴으므로 이 편법은 필요 없다.

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

    // 라이브 업로드본 슬롯 파생값.
    const live = painted && painted.url === previewUrl ? painted : null;
    const liveVisibleSlot = live?.slot ?? 'a';
    const livePage = live?.page ?? null;
    // 보이는 쪽과 사용자가 고른 쪽이 다르면 전환 중 — 반대쪽 슬롯이 새 쪽을 그린다.
    const isLiveSwitching =
      !isRestoredPages &&
      fileType === 'pdf' &&
      livePage !== null &&
      livePage !== currentPage;
    // 슬롯별로 그릴 쪽. 아직 아무것도 못 그렸으면 보이는 슬롯이 지금 쪽을 바로 그린다.
    const liveSlotPage = (slot: 'a' | 'b'): number | null => {
      if (slot === liveVisibleSlot) return livePage ?? currentPage;
      return isLiveSwitching ? currentPage : null;
    };
    // 전환 중에 보여 줄 이 쪽의 축소본. 있으면 이전 쪽 대신 이것을 늘려 보여 준다 —
    // 넘겼는데 화면이 그대로면 "안 넘어갔나"로 읽히지만, 흐릿해도 **그 쪽 그림**이면
    // 넘어간 것이 보이고 곧 선명해진다는 것도 읽힌다.
    const switching = isSwitchingPage || isLiveSwitching;
    const placeholder = switching
      ? getThumb(thumbKey(thumbDoc, currentPage))
      : null;

    // 보이는 슬롯의 클래스. **흐려지는 것(전환 시작)만** 부드럽게 하고, 드러나는
    // 것(전환 끝)은 즉시 한다.
    //
    // 승격되는 슬롯은 이미 다 그려져 있어 감출 것이 없는데, transition-opacity가
    // 남아 있으면 숨어 있던 opacity-0에서 150ms에 걸쳐 밝아진다. 그 사이 축소본은
    // 벌써 걷힌 뒤라 **흐릿한 그림 → 흰 바탕 → 선명한 쪽**으로 보인다 — 넘김을
    // 부드럽게 하려던 트랜지션이 도리어 이음매를 만드는 자리다. 전환이 끝나는
    // 렌더에서는 트랜지션 클래스를 빼서 그 자리에서 바로 드러나게 한다.
    const visibleSlotCls = (dimming: boolean) =>
      dimming
        ? `transition-opacity duration-150 ${
            placeholder ? 'opacity-0' : 'opacity-50'
          }`
        : '';

    // 상자(BBox)는 그 쪽 좌표라, 아직 이전 쪽이 보이는 동안 얹으면 엉뚱한 자리에 뜬다.
    const overlayReady = isRestoredPages
      ? pageRendered
      : livePage === currentPage;

    return (
      <div className="w-full h-full flex flex-col bg-gray-50 rounded-2xl overflow-hidden relative">
        <div
          ref={viewportRef}
          className="flex-1 overflow-y-auto custom-scrollbar p-2 flex justify-center items-start"
        >
          <div className="relative inline-block max-w-full shadow-sm rounded-lg bg-white">
            {/* 전환 중 이 쪽의 축소본을 늘려 보여 준다. 진짜 그림이 올라오면
                placeholder가 걷히고 그 아래 슬롯이 곧바로 드러난다 —
                사이에 흰 바탕이 끼지 않게 위 visibleSlotCls가 트랜지션을 뺀다. */}
            {placeholder && (
              <img
                src={placeholder.src}
                alt=""
                aria-hidden
                draggable={false}
                className="pointer-events-none absolute inset-0 z-[1] h-full w-full object-contain blur-[1.5px]"
              />
            )}
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
                      ref={(el) => {
                        slotElRef.current[id] = el;
                      }}
                      aria-hidden={visibleSlot !== id || undefined}
                      className={
                        visibleSlot === id
                          ? visibleSlotCls(isSwitchingPage)
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
                        onLoadSuccess={(pdf) => {
                          restoredPdfRef.current[id] = pdf;
                        }}
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
                onLoadSuccess={(pdf) => {
                  livePdfRef.current = pdf;
                  onLoadSuccess(pdf.numPages);
                }}
                className="flex justify-center"
              >
                {/* 슬롯 두 개를 늘 같은 순서로 두고 **보이는 쪽만 바꾼다**.
                    준비 슬롯이 다 그려지면 그 슬롯이 그대로 화면으로 올라오므로
                    캔버스를 다시 그리지 않는다. */}
                {(['a', 'b'] as const).map((slot) => {
                  const slotPage = liveSlotPage(slot);
                  if (slotPage === null) return null;
                  const isVisible = slot === liveVisibleSlot;
                  return (
                    <div
                      key={slot}
                      ref={(el) => {
                        slotElRef.current[slot] = el;
                      }}
                      aria-hidden={!isVisible || undefined}
                      className={
                        isVisible
                          ? visibleSlotCls(isLiveSwitching)
                          : 'pointer-events-none absolute inset-0 overflow-hidden opacity-0'
                      }
                    >
                      <Page
                        pageNumber={slotPage}
                        // p-2(8px×2)를 뺀 실제 그릴 수 있는 폭. 아직 측정 전이면 종전 값(500).
                        width={pageRenderWidth}
                        // 캔버스 해상도 상한. 기본값은 기기 배율(고DPI에서 2~3배)이라
                        // 고화질 문서에서 캔버스가 수천만 픽셀이 되고, 그리기·합성이 GPU에
                        // 걸려 창 전환까지 굼떴다(2026-08-25 QA: RTX 2060에서 렉).
                        // 원본 대조용 미리보기에는 2배면 충분하다.
                        devicePixelRatio={pageDevicePixelRatio}
                        renderTextLayer={false}
                        renderAnnotationLayer={false}
                        onRenderSuccess={(page) => {
                          livePageRef.current[slot] = page;
                          promoteLiveSlot(slot, page.pageNumber);
                        }}
                        // 그리다 실패해도 이전 쪽에 갇히지 않게 올려 준다 —
                        // 그래야 react-pdf의 오류 안내라도 보인다.
                        onRenderError={() => promoteLiveSlot(slot, slotPage)}
                        loading={isVisible ? <PreviewLoading /> : null}
                      />
                    </div>
                  );
                })}
              </Document>
            )}

            {/* 다음 쪽을 그리는 동안 이전 쪽 위에 작게 알린다 — 복원본과 같은 표시다. */}
            {isLiveSwitching && (
              <div
                role="status"
                aria-live="polite"
                className="absolute inset-x-0 top-3 z-10 flex justify-center"
              >
                <span className="flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-[12px] font-medium text-gray-500 shadow-sm">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#407FAC]" />
                  {currentPage}쪽 불러오는 중...
                </span>
              </div>
            )}

            {/* 페이지가 다 그려진 뒤에만 상자를 얹는다 (위 pageRendered 주석 참고) */}
            {(fileType === 'image' || overlayReady) && (
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
