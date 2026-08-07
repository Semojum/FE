import React, {
  useState,
  useMemo,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDropzone, Accept } from 'react-dropzone';
import {
  FileText,
  Image as ImageIcon,
  X,
  Loader2,
  Download,
  AlertCircle,
  Columns2,
  Square,
  User as UserIcon,
  LogOut,
  History,
  ArrowRightCircle,
  Undo2,
  Redo2,
} from 'lucide-react';

// Hooks
import { useFileHandler } from './hooks/UseFileHandler';
import { useTranslationBlocks } from './hooks/UseTranslationBlocks';
import { useJobUpload } from './hooks/UseJobUpload.ts';
import { useJobStream } from './hooks/UseJobStream.ts';
import { useAuth } from './hooks/UseAuth';
import {
  PanelMode,
  SyncAction,
  SyncSnapshot,
  usePopupSync,
} from './hooks/UsePopupSync';
import { usePageStreamHandler } from './hooks/UsePageStreamHandler';
import { modeToTab, useSavedJobs } from './hooks/UseSavedJobs';
import { listActiveJobs } from './api/HistoryService';

// Components
import FilePreviewer from './component/features/conversion/FilePreviewer';
import Pagination from './component/features/conversion/Pagination';
import BrailleGrid, {
  GridCaret,
} from './component/features/conversion/BrailleGrid';
import ContextMenu from './component/shared/ContextMenu';
import CandidateModal from './component/features/conversion/CandidateModal';
import LoginScreen from './component/features/auth/LoginScreen';
import MyPage from './component/features/mypage/MyPage';

// Types
import {
  BoundingBox,
  ConversionTab,
  FileState,
  FileType,
  ImageResolution,
  OriginalTextBlock,
  TranslationBlock,
  TABS,
  TAB_VALUES,
} from './types';
import { JobDetail, JobPageOriginal } from './types/auth';
import { JobDoneData, PageEventStatus } from './types/apiTypes';
import {
  fileValidationMessage,
  FOOTER_TEXT_MAX_LENGTH,
  TAB_ALLOWED_FILE_LABEL,
} from './utils/fileValidation';
import { httpFetch } from './api/httpFetch';
import { downloadJobResult, ElementType, selectDraft } from './api/JobService';
import { toUserMessage } from './api/errorMessages';
import { saveBlob } from './utils/download';
import { brailleSourceFileName, mergePagesToText } from './utils/mergePages';
import { onAppClose } from './utils/appLifecycle';
import {
  blockTextFromLines,
  bodyRowsPerPage,
  buildGridLines,
  CELLS_PER_ROW,
  firstLineIndexOfPage,
  ROWS_PER_PAGE,
  totalOutputPages,
} from './utils/brailleGrid';
import DownloadModal from './component/features/conversion/DownloadModal';
import SendToBrailleModal from './component/features/conversion/SendToBrailleModal';
import { usePageEditor } from './hooks/UsePageEditor';
import { useAppVersion } from './hooks/UseAppVersion';
import {
  ForceUpdateGate,
  UpdateReadyToast,
} from './component/features/update/UpdateGate';

// 탭별로 보존하는 작업물 스냅샷 — 탭을 전환해도 각 탭의 입력/결과가 날아가지 않게 한다.
interface TabState {
  fileState: FileState;
  blocksByPage: Record<number, TranslationBlock[]>;
  bboxDataByPage: Record<number, BoundingBox[]>;
  originalTextsByPage: Record<number, OriginalTextBlock[]>;
  imgResolution: ImageResolution;
  selectedBlockId: string | null;
  // 마이페이지 복원 작업의 페이지별 원본(없으면 null) — 페이지 전환 시 미리보기 교체용
  savedOriginalsByPage: Record<number, JobPageOriginal> | null;
  // 이 탭 작업물의 서버 Job ID(페이지 일괄 저장 대상). 없으면 저장 불가.
  jobId: string | null;
  // 업로드 시 정해진 쪽번호 삽입 여부 — 판면 격자를 26줄 전체로 그릴지 본문 25줄로 그릴지
  insertPageNumber: boolean;
  // 업로드 시 정해진 꼬리말(묵자). 다운로드(.brf) 조판에서만 쓰이고 화면에는 그리지 않는다.
  footerText: string;
  // 페이지별 변환 상태(BLOCKED 페이지 안내용)
  pageStatuses: Record<number, PageEventStatus>;
  // 마이페이지에서 복원한 작업의 원본 파일명(라이브 업로드는 fileState.file.name).
  // 점역으로 보내기가 합친 텍스트에 이 이름을 물려준다.
  originalFileName: string | null;
}

const BrailleMate: React.FC = () => {
  const isPopup = useMemo(
    () => new URLSearchParams(window.location.search).get('panel') === 'output',
    [],
  );

  const [activeTab, setActiveTab] = useState<ConversionTab>(TABS.OCR);
  const [panelMode, setPanelMode] = useState<PanelMode>(
    isPopup ? 'output-only' : 'both',
  );

  const {
    fileState,
    handleFileDrop,
    setRestoredPreview,
    restoreState,
    setPage,
    setTotalPages,
    setFileError,
    reset: resetFile,
  } = useFileHandler();
  const {
    uploadFile,
    isUploading,
    jobId,
    error: uploadError,
    resetUpload,
    attachJob,
  } = useJobUpload();

  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [bboxDataByPage, setBboxDataByPage] = useState<
    Record<number, BoundingBox[]>
  >({});
  const [originalTextsByPage, setOriginalTextsByPage] = useState<
    Record<number, OriginalTextBlock[]>
  >({});
  const [imgResolution, setImgResolution] = useState<ImageResolution>({
    width: 0,
    height: 0,
  });
  // 마이페이지에서 불러온 작업의 페이지별 원본. 설정돼 있으면 페이지 전환 시
  // 왼쪽 미리보기를 해당 페이지 원본(단일 페이지 PDF/이미지)으로 교체한다.
  const [savedOriginalsByPage, setSavedOriginalsByPage] = useState<Record<
    number,
    JobPageOriginal
  > | null>(null);

  const {
    blocksByPage,
    getBlocks,
    setBlocksForPage,
    setAllBlocks,
    updateBlock,
    applyCandidate,
    removeBlock,
    addBlock,
    replaceBlockId,
    resetAllBlocks,
  } = useTranslationBlocks();

  const auth = useAuth();
  // 앱 시작 시 서버 기준 버전 확인 + 백그라운드 업데이트 (결과 팝업 창은 제외)
  const appVersion = useAppVersion(!isPopup);
  const [isMyPageOpen, setIsMyPageOpen] = useState(false);
  const [isDownloadOpen, setIsDownloadOpen] = useState(false);
  // 업로드 시 확정하는 쪽번호 삽입 여부(2026-08-04 확정 — 에디터 토글이 아니라 업로드 옵션).
  const [insertPageNumber, setInsertPageNumber] = useState(false);
  // 페이지행 가운데에 들어갈 꼬리말(묵자). 쪽번호와 마찬가지로 업로드 시점에 확정된다
  // (2026-08-07 명세 추가). 점역은 다운로드 시점에 서버가 한다.
  const [footerText, setFooterText] = useState('');
  // 점역으로 보내기 — 기존 연결 문서가 있어 덮어쓰기 확인이 필요한 상태(JOB4011)
  const [isOverwriteOpen, setIsOverwriteOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  // 화면 하단 토스트 — 저장·이동·삭제 실패 등 짧은 안내
  const [toast, setToast] = useState<string | null>(null);

  // 결과 격자 — 커서(선택된 줄·칸), 우클릭 메뉴, 현재 보이는 출력 쪽,
  // 원본 페이지를 넘겼을 때 스크롤할 줄 번호.
  const [caret, setCaret] = useState<GridCaret | null>(null);
  const [gridMenu, setGridMenu] = useState<{
    lineIndex: number;
    x: number;
    y: number;
  } | null>(null);
  const [visibleOutputPage, setVisibleOutputPage] = useState(1);
  const [scrollToLine, setScrollToLine] = useState<number | null>(null);
  // 대체 초안 피커를 연 블록
  const [draftBlockId, setDraftBlockId] = useState<string | null>(null);

  // 페이지 일괄 저장(PUT) 대상 Job ID. 라이브 업로드/마이페이지 복원/탭 복원 시 갱신된다.
  const [workingJobId, setWorkingJobId] = useState<string | null>(null);
  // 페이지별 변환 상태 — page_done/job_done의 BLOCKED 페이지를 안내하는 데 쓴다.
  const [pageStatuses, setPageStatuses] = useState<
    Record<number, PageEventStatus>
  >({});
  // 비동기 콜백에서 참조할 최신 블록 목록(state 미러)
  const blocksRef = useRef<Record<number, TranslationBlock[]>>({});
  // 마이페이지에서 복원한 작업의 원본 파일명(라이브 업로드는 fileState.file이 들고 있다).
  const [originalFileName, setOriginalFileName] = useState<string | null>(null);

  // 탭별 작업물 보관소. 탭을 떠날 때 현재 상태를 저장하고, 돌아오면 복원한다.
  const [tabSnapshots, setTabSnapshots] = useState<
    Partial<Record<ConversionTab, TabState>>
  >({});
  // 이미 업로드한 File을 기억해 같은 파일이 (탭 복원 등으로) 다시 마운트돼도
  // 재업로드되지 않게 한다. (이전에는 jobId로 가드했지만, 탭 복원 시 jobId가 비므로 ref로 대체)
  const lastUploadedFileRef = useRef<File | null>(null);

  const currentPage = fileState.currentPage;
  const currentBlocks = getBlocks(currentPage);
  const currentBBoxData = bboxDataByPage[currentPage] || [];
  const currentOriginalTexts = originalTextsByPage[currentPage] || [];
  // 입력 미리보기 존재 여부 — 업로드한 파일뿐 아니라 마이페이지에서 복원한
  // 미리보기(file은 없지만 fileType/미리보기가 있는 경우)도 포함한다.
  const hasInputPreview = !!fileState.fileType;

  // 명세 elementType: a(text_list)=TEXT, b/c(braille_text_list)=BRAILLE
  const elementType: ElementType = activeTab === TABS.OCR ? 'TEXT' : 'BRAILLE';

  useEffect(() => {
    blocksRef.current = blocksByPage;
  }, [blocksByPage]);

  // 콜백(페이지 이동 저장·단축키)에서 최신 페이지 번호를 읽기 위한 미러
  const currentPageRef = useRef(fileState.currentPage);
  useEffect(() => {
    currentPageRef.current = fileState.currentPage;
  }, [fileState.currentPage]);

  const readBlocks = useCallback(
    (page: number) => blocksRef.current[page] ?? [],
    [],
  );

  // dispatchAction은 usePopupSync가 아래에서 만들어 주므로, 그 위에서 정의되는
  // 격자 핸들러들이 참조할 수 있도록 ref로 미러링한다.
  const dispatchActionRef = useRef<((action: SyncAction) => void) | null>(null);

  // V3 편집 모델: 페이지 안의 편집을 로컬에서 모았다가 페이지 이동·종료·Ctrl+S에
  // 한 번에 저장한다. 되돌리기도 이 훅이 페이지 단위로 들고 있다.
  const editor = usePageEditor({
    jobId: workingJobId,
    token: auth.token,
    readBlocks,
    setBlocksForPage,
    replaceBlockId,
  });

  // 현재 화면 상태를 탭 스냅샷으로 캡처
  const captureState = useCallback(
    (): TabState => ({
      fileState,
      blocksByPage,
      bboxDataByPage,
      originalTextsByPage,
      imgResolution,
      selectedBlockId,
      savedOriginalsByPage,
      jobId: workingJobId,
      insertPageNumber,
      footerText,
      pageStatuses,
      originalFileName,
    }),
    [
      fileState,
      blocksByPage,
      bboxDataByPage,
      originalTextsByPage,
      imgResolution,
      selectedBlockId,
      savedOriginalsByPage,
      workingJobId,
      insertPageNumber,
      footerText,
      pageStatuses,
      originalFileName,
    ],
  );

  // 화면 상태를 빈 값으로 초기화 (스냅샷/ref는 건드리지 않음 — 호출부에서 처리)
  const clearWorkspace = useCallback(() => {
    resetFile();
    resetAllBlocks();
    resetUpload();
    setBboxDataByPage({});
    setOriginalTextsByPage({});
    setSelectedBlockId(null);
    setImgResolution({ width: 0, height: 0 });
    setSavedOriginalsByPage(null);
    setWorkingJobId(null);
    editor.resetEditor();
    setPageStatuses({});
    setOriginalFileName(null);
  }, [resetFile, resetAllBlocks, resetUpload, editor]);

  const handleReset = useCallback(() => {
    clearWorkspace();
    lastUploadedFileRef.current = null;
    // 현재 탭의 보관된 작업물도 비운다(사용자가 명시적으로 지움).
    setTabSnapshots((prev) => ({ ...prev, [activeTab]: undefined }));
  }, [clearWorkspace, activeTab]);

  const handleTabChange = (tab: ConversionTab) => {
    if (tab === activeTab) return;

    // 변환이 진행 중이면 바로 이동해 작업이 끊기지 않도록 먼저 확인을 받는다.
    if (isUploading || isStreaming) {
      const ok = window.confirm(
        '변환 작업이 아직 진행 중입니다.\n지금 다른 모드로 이동하면 진행 중인 작업이 중단됩니다. 이동할까요?',
      );
      if (!ok) return;
    }

    // 1) 떠나는 탭의 편집 내용을 서버에 밀어내고 화면 상태를 스냅샷으로 보관
    void editor.saveAllDirty();
    setTabSnapshots((prev) => ({ ...prev, [activeTab]: captureState() }));
    // 진행 중이던 업로드/스트림 상태는 탭별로 공유되므로 초기화
    resetUpload();

    // 2) 들어가는 탭의 작업물을 복원(없으면 빈 화면)
    const saved = tabSnapshots[tab];
    if (saved) {
      restoreState(saved.fileState);
      setAllBlocks(saved.blocksByPage);
      setBboxDataByPage(saved.bboxDataByPage);
      setOriginalTextsByPage(saved.originalTextsByPage);
      setImgResolution(saved.imgResolution);
      setSelectedBlockId(saved.selectedBlockId);
      setSavedOriginalsByPage(saved.savedOriginalsByPage);
      setWorkingJobId(saved.jobId);
      setInsertPageNumber(saved.insertPageNumber ?? false);
      setFooterText(saved.footerText ?? '');
      editor.resetEditor();
      editor.registerServerBlocks(Object.values(saved.blocksByPage).flat());
      setPageStatuses(saved.pageStatuses ?? {});
      setOriginalFileName(saved.originalFileName ?? null);
      // 복원된 파일은 이미 변환됐으므로 재업로드 트리거를 막는다.
      lastUploadedFileRef.current = saved.fileState.file;
    } else {
      clearWorkspace();
      lastUploadedFileRef.current = null;
    }

    setActiveTab(tab);
  };

  // OCR 결과를 점역 변환으로 넘긴다. 전용 API(`POST .../send-to-braille`)는 만들지
  // 않기로 했으므로, 교정된 전체 페이지를 FE가 하나의 텍스트로 합쳐 모드 b Job으로
  // 재업로드한다(V2와 같은 방식). 사용자에게는 저장·재업로드 수작업이 보이지 않는다.
  const runSendToBraille = useCallback(
    async (overwrite: boolean) => {
      if (!auth.token) return;

      // 점역 탭에 이미 작업물이 있으면 먼저 덮어쓸지 확인받는다(기능정의서 §3).
      // 기존 문서는 만들어진 시점부터 마이페이지에 남아 있으므로 따로 보관할 것이 없다.
      if (!overwrite && tabSnapshots[TABS.BRAILLE]) {
        setIsOverwriteOpen(true);
        return;
      }

      setIsSending(true);
      try {
        // 남은 교정을 먼저 서버에 밀어낸다 — 화면 블록이 곧 병합 대상이라 실패해도
        // 합쳐지는 내용은 같지만, 원본 OCR 작업의 최종본을 잃지 않게 한다.
        await editor.saveAllDirty();

        const merged = mergePagesToText(blocksByPage);
        if (!merged) {
          setToast('점역으로 보낼 내용이 없습니다.');
          return;
        }
        const file = new File(
          [merged],
          brailleSourceFileName(fileState.file?.name ?? originalFileName),
          { type: 'text/plain' },
        );

        setIsOverwriteOpen(false);
        // 현재 OCR 탭 작업물을 보관하고 점역 탭으로 이동한다. 새 파일을 넣으면
        // 업로드 effect가 모드 b로 올리고, 그 Job의 변환을 스트림으로 지켜본다.
        setTabSnapshots((prev) => ({ ...prev, [activeTab]: captureState() }));
        clearWorkspace();
        setTabSnapshots((prev) => ({ ...prev, [TABS.BRAILLE]: undefined }));
        setActiveTab(TABS.BRAILLE);
        lastUploadedFileRef.current = null;
        await handleFileDrop([file], TABS.BRAILLE);
      } catch (err) {
        setToast(toUserMessage(err, '점역으로 보내지 못했습니다.'));
      } finally {
        setIsSending(false);
      }
    },
    [
      auth.token,
      editor,
      activeTab,
      blocksByPage,
      fileState.file,
      originalFileName,
      tabSnapshots,
      captureState,
      clearWorkspace,
      handleFileDrop,
    ],
  );

  const handleSendOcrToBraille = useCallback(
    () => void runSendToBraille(false),
    [runSendToBraille],
  );

  // SSE로 받은 페이지 블록을 상태에 반영하면서, 서버가 아는 요소 id로 등록해 둔다.
  // 여기 등록되지 않은 id는 FE가 만든 신규 블록이라 저장 시 elementId=null로 나간다.
  const setBlocksForPageWithBaseline = useCallback(
    (page: number, blocks: TranslationBlock[]) => {
      editor.registerServerBlocks(blocks);
      setBlocksForPage(page, blocks);
    },
    [editor, setBlocksForPage],
  );

  // 블록 추가 — 화면에만 넣고 저장은 페이지 단위로 미룬다(elementId는 저장 응답에서 받는다).
  const handleAddBlock = useCallback(
    (page: number, index: number) => {
      editor.pushHistory(page);
      addBlock(page, index);
      editor.markDirty(page);
    },
    [editor, addBlock],
  );

  // 블록 삭제 — 화면에서 지우기만 한다. 저장 시 배열에 없는 요소를 서버가 삭제 처리하고,
  // 실수로 지웠다면 Ctrl+Z로 되돌린다 (D-2: 별도 확인 창을 두지 않는다).
  const handleRemoveBlock = useCallback(
    (page: number, id: string) => {
      editor.pushHistory(page);
      removeBlock(page, id);
      editor.markDirty(page);
    },
    [editor, removeBlock],
  );

  // 블록 내 편집 — 타이핑마다 히스토리를 쌓으면 Ctrl+Z가 한 글자씩 되돌아가므로,
  // 그 블록을 처음 건드릴 때만 스냅샷을 남긴다.
  const editingBlockRef = useRef<string | null>(null);
  const handleUpdateBlock = useCallback(
    (page: number, id: string, text: string) => {
      if (editingBlockRef.current !== id) {
        editor.pushHistory(page);
        editingBlockRef.current = id;
      }
      updateBlock(page, id, text);
      editor.markDirty(page);
    },
    [editor, updateBlock],
  );

  // 대체 초안 채택 — 화면 본문을 후보 내용으로 바꾸고, 선택 상태(selected_idx)는
  // 서버가 별도로 관리하므로 draft API로 즉시 알린다.
  const handleApplyCandidate = useCallback(
    (page: number, id: string, text: string) => {
      editor.pushHistory(page);
      editingBlockRef.current = null;
      applyCandidate(page, id, text);
      editor.markDirty(page);
    },
    [editor, applyCandidate],
  );

  const handleSelectDraft = useCallback(
    (page: number, id: string, idx: number) => {
      if (!workingJobId || !auth.token) return;
      selectDraft(workingJobId, page, id, elementType, idx, auth.token).catch(
        (e) => console.error('대체 초안 선택 저장 실패', e),
      );
    },
    [workingJobId, auth.token, elementType],
  );

  // ─── 결과 격자 ────────────────────────────────────────────────────
  // 모든 페이지의 블록 줄을 순서대로 이어 붙인다. 출력 쪽은 이 줄들을 판면 규격으로
  // 자른 것이고, 하단 페이지네이션이 옮기는 원본 파일 페이지와는 별개다.
  const gridLines = useMemo(() => buildGridLines(blocksByPage), [blocksByPage]);

  const outputPageCount = totalOutputPages(gridLines.length, insertPageNumber);

  // 대체 초안 피커 대상 블록 — 어느 원본 페이지의 블록인지 함께 찾는다.
  const draftBlock = useMemo(() => {
    if (!draftBlockId) return null;
    for (const [page, blocks] of Object.entries(blocksByPage)) {
      const block = blocks.find((b) => b.id === draftBlockId);
      if (block) return { pageNo: Number(page), block };
    }
    return null;
  }, [draftBlockId, blocksByPage]);

  // 커서가 놓인 줄의 블록을 원본 대조 선택으로도 반영한다(좌측 원본이 같이 강조됨).
  const handleCaretChange = useCallback(
    (next: GridCaret) => {
      setCaret(next);
      const line = gridLines[next.lineIndex];
      if (line && line.blockId !== selectedBlockId) {
        dispatchActionRef.current?.({ type: 'setSelected', id: line.blockId });
      }
    },
    [gridLines, selectedBlockId],
  );

  // 격자에서 한 줄을 고치면 그 줄이 속한 블록의 본문을 다시 만들어 넘긴다.
  const handleEditLine = useCallback(
    (lineIndex: number, text: string) => {
      const line = gridLines[lineIndex];
      if (!line) return;
      const updated = gridLines.map((l, i) =>
        i === lineIndex ? { ...l, text } : l,
      );
      dispatchActionRef.current?.({
        type: 'updateBlock',
        page: line.pageNo,
        id: line.blockId,
        text: blockTextFromLines(updated, line.blockId),
      });
    },
    [gridLines],
  );

  // 원본 페이지를 넘기면 결과 격자를 그 페이지의 첫 줄로 옮겨 대조를 유지한다.
  // (결과 자체는 끊기지 않고 계속 이어져 있다.)
  useEffect(() => {
    if (gridLines.length === 0) return;
    setScrollToLine(firstLineIndexOfPage(gridLines, currentPage));
    // 같은 페이지로 다시 이동해도 스크롤이 걸리도록 다음 틱에 비운다.
    const id = window.setTimeout(() => setScrollToLine(null), 400);
    return () => window.clearTimeout(id);
    // gridLines가 바뀔 때마다 스크롤하면 스트리밍 중 계속 튀므로 페이지만 본다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  // 메인 측에서 직접 호출되는 액션 처리기. 팝업은 BroadcastChannel을 통해 메인에 위임.
  const applyAction = useCallback(
    (action: SyncAction) => {
      switch (action.type) {
        case 'updateBlock':
          handleUpdateBlock(action.page, action.id, action.text);
          break;
        case 'applyCandidate':
          handleApplyCandidate(action.page, action.id, action.text);
          break;
        case 'selectDraft':
          handleSelectDraft(action.page, action.id, action.idx);
          break;
        case 'removeBlock':
          handleRemoveBlock(action.page, action.id);
          break;
        case 'addBlock':
          handleAddBlock(action.page, action.index);
          break;
        case 'setSelected':
          setSelectedBlockId(action.id);
          break;
        case 'setPage':
          // 페이지를 벗어날 때 그 페이지의 최종 수정본을 한 번에 저장한다.
          void editor.savePage(currentPageRef.current);
          editingBlockRef.current = null;
          setPage(action.page);
          break;
        case 'savePage':
          void editor.savePage(action.page);
          break;
        case 'undo':
          editingBlockRef.current = null;
          editor.undo(action.page);
          break;
        case 'redo':
          editingBlockRef.current = null;
          editor.redo(action.page);
          break;
        case 'reset':
          handleReset();
          break;
      }
    },
    [
      handleUpdateBlock,
      handleApplyCandidate,
      handleSelectDraft,
      handleRemoveBlock,
      handleAddBlock,
      editor,
      setPage,
      handleReset,
    ],
  );

  useEffect(() => {
    if (isPopup) return;
    if (!fileState.file || isUploading) return;
    // 이미 업로드한 그 File이면(탭 복원 등으로 다시 마운트된 경우 포함) 재업로드하지 않는다.
    if (fileState.file === lastUploadedFileRef.current) return;
    lastUploadedFileRef.current = fileState.file;
    uploadFile(
      fileState.file,
      activeTab,
      auth.token,
      insertPageNumber,
      footerText,
    );
  }, [
    isPopup,
    fileState.file,
    activeTab,
    uploadFile,
    isUploading,
    auth.token,
    insertPageNumber,
    footerText,
  ]);

  // 라이브 업로드로 생성된 Job을 블록 편집 저장 대상으로 등록
  useEffect(() => {
    if (jobId) setWorkingJobId(jobId);
  }, [jobId]);

  const handlePageMapped = usePageStreamHandler({
    activeTab,
    currentPage: fileState.currentPage,
    totalPages: fileState.totalPages,
    setTotalPages,
    setImgResolution,
    setBboxDataByPage,
    setOriginalTextsByPage,
    setBlocksForPage: setBlocksForPageWithBaseline,
  });

  // page_done은 변환에 실패한 페이지도 status만 담아(result 없이) 내려온다.
  // 그 페이지는 결과가 비므로, 빈 화면 대신 실패 안내를 띄우기 위해 상태를 기록한다.
  const handlePageReceived = useCallback(
    (data: Parameters<typeof handlePageMapped>[0]) => {
      setPageStatuses((prev) => ({
        ...prev,
        [data.page_no]: data.status ?? 'COMPLETED',
      }));
      handlePageMapped(data);
    },
    [handlePageMapped],
  );

  // job_done의 failed_pages — page_done을 놓친 페이지에 대한 보완.
  const handleJobDone = useCallback((data: JobDoneData) => {
    if (!data.failed_pages?.length) return;
    setPageStatuses((prev) => {
      const next = { ...prev };
      data.failed_pages.forEach((p) => {
        if (next[p] !== 'COMPLETED') next[p] = 'BLOCKED';
      });
      return next;
    });
  }, []);

  const { isStreaming } = useJobStream({
    jobId: isPopup ? null : jobId,
    token: auth.token,
    onPageReceived: handlePageReceived,
    onJobDone: handleJobDone,
  });

  // 처리가 끝난(성공이든 실패든) 페이지 수. 전체 진행률 프로그레스바(V3)와
  // 다운로드·점역으로 보내기 버튼 활성 조건의 기준이다.
  const settledPages = useMemo(() => {
    const pages = new Set<number>(Object.keys(blocksByPage).map(Number));
    Object.keys(pageStatuses).forEach((p) => pages.add(Number(p)));
    return pages.size;
  }, [blocksByPage, pageStatuses]);

  const conversionProgress =
    fileState.totalPages > 0
      ? Math.min(100, Math.round((settledPages / fileState.totalPages) * 100))
      : 0;

  // 모든 페이지의 AI 변환이 끝난 시점 — 결과 다운로드 D-3 · 점역으로 보내기 D-2
  const isConversionComplete =
    !isUploading &&
    !isStreaming &&
    fileState.totalPages > 0 &&
    settledPages >= fileState.totalPages;

  const snapshot: SyncSnapshot = useMemo(
    () => ({
      activeTab,
      blocksByPage,
      bboxDataByPage,
      originalTextsByPage,
      imgResolution,
      selectedBlockId,
      currentPage: fileState.currentPage,
      totalPages: fileState.totalPages,
      isUploading,
      isStreaming,
      uploadError,
      pageSaveStates: editor.saveStates,
      pageStatuses,
    }),
    [
      activeTab,
      blocksByPage,
      bboxDataByPage,
      originalTextsByPage,
      imgResolution,
      selectedBlockId,
      fileState.currentPage,
      fileState.totalPages,
      isUploading,
      isStreaming,
      uploadError,
      editor.saveStates,
      pageStatuses,
    ],
  );

  const handleSnapshotReceived = useCallback(
    (s: SyncSnapshot) => {
      setActiveTab(s.activeTab);
      setAllBlocks(s.blocksByPage);
      setBboxDataByPage(s.bboxDataByPage);
      setOriginalTextsByPage(s.originalTextsByPage);
      setImgResolution(s.imgResolution);
      setSelectedBlockId(s.selectedBlockId);
      setPage(s.currentPage);
      setTotalPages(s.totalPages);
      setPageStatuses(s.pageStatuses ?? {});
    },
    [setAllBlocks, setPage, setTotalPages],
  );

  const { dispatchAction, togglePopup } = usePopupSync({
    isPopup,
    panelMode,
    setPanelMode,
    snapshot,
    applyAction,
    onSnapshotReceived: handleSnapshotReceived,
  });

  useEffect(() => {
    dispatchActionRef.current = dispatchAction;
  }, [dispatchAction]);

  const handleJobLoaded = useCallback(
    (job: JobDetail) => {
      handleReset();
      setActiveTab(job.mode);
      setAllBlocks(job.blocksByPage);
      // 복원된 블록을 "서버에 있는 요소"로 등록하고, 이 Job을 저장 대상으로 삼는다.
      editor.registerServerBlocks(Object.values(job.blocksByPage).flat());
      setWorkingJobId(job.jobId);
      setBboxDataByPage(job.bboxDataByPage);
      setOriginalTextsByPage(job.originalTextsByPage);
      setImgResolution(job.imgResolution);
      setTotalPages(job.totalPages);
      setPageStatuses(
        Object.fromEntries(
          (job.failedPages ?? []).map((p) => [p, 'BLOCKED' as PageEventStatus]),
        ),
      );
      // 업로드 시 정해진 쪽번호 삽입 여부를 그대로 되살린다(판면 격자 기준이 달라진다).
      setInsertPageNumber(job.insertPageNumber ?? false);
      // 꼬리말은 페이지 조회 응답에 없다(다운로드 때 서버가 저장값을 쓴다). 복원한 작업의
      // 값을 다음 업로드에 흘리지 않도록 비운다.
      setFooterText('');
      // 원본 File은 없으므로 이름만 기억해 둔다(점역으로 보내기가 물려받는다).
      setOriginalFileName(job.originalFileName ?? null);
      // 재시작 복구·마이페이지 복원은 마지막 편집 페이지로 바로 이동한다.
      setPage(job.startPage ?? 1);
      // 입력 미리보기 복원: 점역(텍스트→점자)은 복원된 원본 텍스트를, 이미지 모드(a/c)는
      // 작업 썸네일을 보여준다. (서버가 원본 파일을 보관하지 않아 썸네일이 최선)
      if (job.mode === TABS.BRAILLE) {
        // 라이브에서는 업로드 파일의 textContent가 입력이지만, 저장된 작업은 파일이 없으므로
        // 응답의 원본 텍스트(text_list)를 페이지 순서대로 합쳐 입력 미리보기로 복원한다.
        const restoredText = Object.keys(job.originalTextsByPage)
          .map(Number)
          .sort((a, b) => a - b)
          .flatMap((p) => job.originalTextsByPage[p].map((blk) => blk.content))
          .filter((t) => t.trim().length > 0)
          .join('\n');
        setRestoredPreview({ fileType: 'text', textContent: restoredText });
        // 점역은 페이지별 originalTextsByPage로 원본을 표시하므로 페이지별 원본 경로는 미사용.
        setSavedOriginalsByPage(null);
      } else {
        // 이미지 모드(a/c): 페이지별 원본 PDF가 있으면 1페이지 원본을 띄우고, 페이지 전환은
        // 아래 effect가 처리한다. 원본이 없으면 썸네일(페이지 고정)로 폴백.
        const first = job.originalByPage?.[1];
        if (first?.url) {
          const ft: FileType = first.type === 'image' ? 'image' : 'pdf';
          setRestoredPreview({
            fileType: ft,
            // 이미지는 <img>로 바로 표시 가능. PDF는 CORS 때문에 아래 effect가
            // httpFetch로 받아 blob URL을 채운다(여기선 빈 값으로 두어 hasInputPreview만 켬).
            previewUrl: ft === 'image' ? first.url : null,
            isRestoredPages: true,
          });
          setSavedOriginalsByPage(job.originalByPage ?? null);
        } else {
          setRestoredPreview({
            fileType: 'image',
            previewUrl: job.thumbnailUrl ?? null,
          });
          setSavedOriginalsByPage(null);
        }
      }
      setIsMyPageOpen(false);
    },
    [handleReset, setAllBlocks, setTotalPages, setPage, setRestoredPreview],
  );

  // 마이페이지 복원 작업에서 페이지를 바꾸면 왼쪽 원본 미리보기를 해당 페이지 원본으로 교체.
  // 이미지 모드(a/c)만 해당(원본 url 존재). 점역(b)은 url이 null이라 건너뛴다.
  // PDF는 원격 GCS URL이라 webview fetch가 CORS로 막히므로, 네이티브 httpFetch로
  // 바이트를 받아 blob URL로 렌더한다(이미지는 <img>로 바로 표시 가능).
  useEffect(() => {
    if (!savedOriginalsByPage) return;
    const orig = savedOriginalsByPage[currentPage];
    if (!orig?.url) return;

    if (orig.type === 'image') {
      setRestoredPreview({
        fileType: 'image',
        previewUrl: orig.url,
        isRestoredPages: true,
      });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await httpFetch(orig.url as string, { method: 'GET' });
        if (!res.ok) throw new Error(`원본 PDF 로드 실패: ${res.status}`);
        const buf = await res.arrayBuffer();
        if (cancelled) return;
        const blobUrl = URL.createObjectURL(
          new Blob([buf], { type: 'application/pdf' }),
        );
        if (cancelled) {
          URL.revokeObjectURL(blobUrl); // 적용 전 취소되면 누수 방지
          return;
        }
        // 이후 blob URL의 폐기는 setRestoredPreview/reset의 revoke가 담당.
        setRestoredPreview({
          fileType: 'pdf',
          previewUrl: blobUrl,
          isRestoredPages: true,
        });
      } catch (e) {
        if (!cancelled) console.error(e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [savedOriginalsByPage, currentPage, setRestoredPreview]);

  const { handleSelectJob } = useSavedJobs({
    token: auth.token,
    onJobLoaded: handleJobLoaded,
  });

  // 명세 모드별 허용 파일: a(OCR)=PDF, b(점역)=TXT/HWP, c(통합)=PDF
  const acceptConfig = useMemo<Accept>((): Accept => {
    if (activeTab === TABS.BRAILLE) {
      return { 'text/plain': ['.txt'], 'application/x-hwp': ['.hwp'] };
    }
    return { 'application/pdf': ['.pdf'] };
  }, [activeTab]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => {
      // 새 파일 업로드 시 마이페이지 복원 원본 경로를 해제(라이브 미리보기로 전환)
      setSavedOriginalsByPage(null);
      handleFileDrop(files, activeTab);
    },
    onDropRejected: () => setFileError(fileValidationMessage(activeTab)),
    accept: acceptConfig,
    multiple: false,
  });

  // 탭 전환 시 이전 검증 에러 메시지 제거
  useEffect(() => {
    setFileError(null);
  }, [activeTab, setFileError]);

  // 토스트는 몇 초 뒤 스스로 사라진다.
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(id);
  }, [toast]);

  // 저장 실패를 숨기지 않는다 (블록 편집 UX 원칙) — 페이지 표시와 별개로 토스트로도 알린다.
  useEffect(() => {
    if (!editor.saveError) return;
    setToast(editor.saveError);
    editor.clearSaveError();
  }, [editor.saveError, editor.clearSaveError]);

  // 편집 단축키 — Ctrl+Z 되돌리기 / Ctrl+Shift+Z 다시 실행 / Ctrl+S 즉시 저장.
  // (별도 저장 버튼 UI는 두지 않는다 — 블록 편집 D-4)
  // 결과 전용 창에서 누른 단축키도 메인 창이 실행하도록 dispatchAction으로 보낸다.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'z') {
        e.preventDefault();
        dispatchAction({
          type: e.shiftKey ? 'redo' : 'undo',
          page: currentPageRef.current,
        });
      } else if (key === 'y') {
        // 윈도우 관습(Ctrl+Y = 다시 실행)도 함께 받는다.
        e.preventDefault();
        dispatchAction({ type: 'redo', page: currentPageRef.current });
      } else if (key === 's') {
        e.preventDefault();
        dispatchAction({ type: 'savePage', page: currentPageRef.current });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dispatchAction]);

  // 앱 종료 시 남은 편집을 밀어낸다 (탭별 작업물 보존 D-2: 종료 시 FE → BE로 페이지
  // 전체 수정 내용을 전달). 데스크톱에서는 창 닫기 요청을 가로채 저장이 끝난 뒤 닫는다.
  useEffect(() => {
    if (isPopup) return;
    return onAppClose(async () => {
      if (editor.hasUnsaved()) await editor.saveAllDirty();
    });
  }, [isPopup, editor]);

  // 재시작·재접속 복구 (탭별 작업물 보존 D-1·D-3·D-5).
  // 로그인 직후 진행 중 작업을 조회해, 가장 나중에 수정한 작업의 마지막 편집 페이지로
  // 별도 팝업 없이 바로 복구한다. lastEditedPage가 null이면 1페이지로 폴백한다.
  const recoveredRef = useRef(false);
  useEffect(() => {
    if (isPopup || !auth.token || recoveredRef.current) return;
    recoveredRef.current = true;

    let cancelled = false;
    (async () => {
      try {
        const active = await listActiveJobs(auth.token as string);
        if (cancelled || active.length === 0) return;
        // 응답은 lastModifiedAt 최신순이지만, 순서에 기대지 않고 직접 고른다.
        const latest = active.reduce((a, b) =>
          new Date(b.lastModifiedAt) > new Date(a.lastModifiedAt) ? b : a,
        );
        setActiveTab(modeToTab(latest.mode));
        setWorkingJobId(latest.jobId);
        setTotalPages(latest.totalPages);
        setPage(latest.lastEditedPage ?? 1);
        // 아직 변환 중이므로 SSE를 다시 붙여 남은 페이지를 따라잡는다.
        attachJob(latest.jobId);
        setToast(
          `진행 중이던 "${latest.originalFileName}" 작업을 이어서 불러왔습니다.`,
        );
      } catch (err) {
        // 복구 실패는 앱 사용을 막지 않는다.
        console.warn('진행 중 작업 복구 실패', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isPopup, auth.token, setTotalPages, setPage, attachJob]);

  // 다운로드 — 전체 페이지를 reading_order대로 병합한 파일을 서버가 만들어 준다.
  // 항상 DB의 현재 편집본으로 만들어지므로, 미저장 편집분이 빠지지 않게 저장을 먼저 밀어낸다.
  const handleDownloadFile = useCallback(
    async (fileName: string) => {
      if (!workingJobId || !auth.token) {
        throw new Error('다운로드할 작업이 없습니다.');
      }
      // 마지막 편집까지 반영된 파일을 받기 위해 저장을 먼저 밀어낸다.
      await editor.saveAllDirty();
      const { blob, fileName: served } = await downloadJobResult(
        workingJobId,
        fileName,
        auth.token,
      );
      const ext = activeTab === TABS.OCR ? '.txt' : '.brf';
      saveBlob(blob, served ?? `${fileName}${ext}`);
    },
    [workingJobId, auth.token, editor, activeTab],
  );

  const tabs = TAB_VALUES;

  // 호환성이 깨지는 패치는 업데이트 외의 모든 조작을 막는다 (자동 업데이트 D-1).
  if (!isPopup && appVersion.forceUpdate) {
    return (
      <ForceUpdateGate
        latestVersion={appVersion.latestVersion}
        onRelaunch={() => void appVersion.relaunchNow()}
      />
    );
  }

  // 인증 게이트 — 결과 전용 팝업이 아닌 메인 창에서는 로그인해야 앱을 쓸 수 있다.
  // V3는 자동 로그인이 없으므로 부트스트랩 대기 없이 바로 로그인 화면을 띄운다.
  if (!isPopup && !auth.isAuthenticated) {
    return (
      <LoginScreen
        onLogin={auth.login}
        sessionEndedReason={auth.sessionEndedReason}
        onAcknowledgeSessionEnded={auth.acknowledgeSessionEnded}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#F0F4F8] flex flex-col font-sans text-gray-800 antialiased transition-colors duration-500">
      <header className="max-w-6xl mx-auto pt-12 px-6 w-full">
        <div className="flex items-center justify-between mb-3 -ml-15">
          <img
            src={'BrailleMate_Logo.png'}
            alt="Logo"
            className="w-50 object-contain"
          />
          <div className="flex items-center gap-2">
            {!isPopup && (
              <>
                <button
                  onClick={() => setIsMyPageOpen(true)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:text-[#407FAC] hover:border-[#407FAC]/40 transition-colors shadow-sm text-sm font-medium"
                  title="마이페이지 — 이전 작업 보기"
                >
                  <History size={16} />
                  <span>마이페이지</span>
                </button>
                <span className="hidden md:flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600">
                  <UserIcon size={14} />
                  {auth.user?.loginId}
                </span>
                <button
                  onClick={() => auth.logout()}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-500 hover:text-red-500 hover:border-red-200 transition-colors shadow-sm text-sm font-medium"
                  title="로그아웃"
                >
                  <LogOut size={16} />
                </button>
                {/* 합치기/나누기 토글은 메인 창에서만 노출한다.
                    결과 전용 창에서 합치기를 누르면 window.close가 막혀 흰 화면이
                    되는 문제가 있어, 결과 창은 창 닫기(X)로만 합치도록 한다. */}
                <button
                  onClick={togglePopup}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:text-[#407FAC] hover:border-[#407FAC]/40 transition-colors shadow-sm text-sm font-medium"
                  title={
                    panelMode === 'both'
                      ? '결과를 새 창으로 분리'
                      : '한 창으로 합치기'
                  }
                  aria-pressed={panelMode !== 'both'}
                >
                  {panelMode === 'both' ? (
                    <Columns2 size={16} />
                  ) : (
                    <Square size={16} />
                  )}
                  <span>
                    {panelMode === 'both' ? '반으로 나누기' : '합치기'}
                  </span>
                </button>
              </>
            )}
          </div>
        </div>
        {!isPopup && (
          <nav className="flex items-end gap-12 border-b border-white/20 relative">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => handleTabChange(tab)}
                className={`pb-4 text-lg font-semibold transition-all relative ${
                  activeTab === tab
                    ? 'text-[#407FAC]'
                    : 'text-[#929292] hover:text-[#407FAC]'
                }`}
              >
                {tab}
                {activeTab === tab && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute bottom-0 left-0 right-0 h-1 bg-[#407FAC] rounded-t-full"
                  />
                )}
              </button>
            ))}

            {/* 되돌리기 · 다시 실행 · 변환 진행률 (Figma V3-03 상단) */}
            <div className="ml-auto mb-3 flex items-center gap-3">
              <button
                onClick={() =>
                  dispatchAction({ type: 'undo', page: currentPage })
                }
                disabled={!editor.canUndo(currentPage)}
                title="되돌리기 (Ctrl+Z)"
                aria-label="되돌리기"
                className="rounded p-1 text-gray-400 transition-colors hover:text-[#407FAC] disabled:opacity-30"
              >
                <Undo2 size={17} />
              </button>
              <button
                onClick={() =>
                  dispatchAction({ type: 'redo', page: currentPage })
                }
                disabled={!editor.canRedo(currentPage)}
                title="다시 실행 (Ctrl+Shift+Z)"
                aria-label="다시 실행"
                className="rounded p-1 text-gray-400 transition-colors hover:text-[#407FAC] disabled:opacity-30"
              >
                <Redo2 size={17} />
              </button>

              {fileState.totalPages > 0 && (
                <div className="flex items-center gap-2 border-l border-gray-200 pl-3">
                  <span className="text-[12px] font-semibold text-[#407FAC]">
                    {isConversionComplete ? '변환 완료' : '변환 진행'}{' '}
                    {settledPages} / {fileState.totalPages}
                  </span>
                  <div className="h-1.5 w-[90px] overflow-hidden rounded-full bg-gray-200">
                    <div
                      className="h-full rounded-full bg-[#407FAC] transition-[width] duration-300"
                      style={{ width: `${conversionProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </nav>
        )}
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12 flex flex-col items-center w-full">
        <div
          className={
            panelMode === 'both'
              ? 'w-full flex flex-col md:flex-row items-stretch gap-8 mb-4'
              : 'w-full flex flex-col items-stretch mb-4'
          }
        >
          {panelMode !== 'output-only' && (
            <section
              className={panelMode === 'both' ? 'flex-1 min-w-0' : 'w-full'}
            >
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-[2.5rem] p-8 shadow-xl border border-white/10 h-150 flex flex-col"
              >
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold text-gray-800">원본 파일</h2>
                  {hasInputPreview && (
                    <button
                      onClick={handleReset}
                      className="p-2 hover:bg-red-50 text-red-400 rounded-full transition-colors"
                    >
                      <X size={20} />
                    </button>
                  )}
                </div>

                <div
                  className={`flex-1 rounded-[2rem] overflow-hidden border-2 border-dashed transition-all ${!hasInputPreview ? (isDragActive ? 'border-[#5A8FBB] bg-blue-50/50' : 'border-gray-200') : 'border-transparent'}`}
                >
                  {!hasInputPreview ? (
                    <div
                      {...getRootProps()}
                      className="w-full h-full flex flex-col items-center justify-center cursor-pointer p-10 text-center"
                    >
                      <input {...getInputProps()} />
                      {activeTab === TABS.BRAILLE ? (
                        <FileText className="text-gray-400 mb-6" size={32} />
                      ) : (
                        <ImageIcon className="text-gray-400 mb-6" size={32} />
                      )}
                      <p className="text-gray-600 font-medium">
                        드래그 앤 드롭 또는 클릭하여 파일 업로드
                      </p>
                      <p className="text-xs text-gray-400 mt-2">
                        지원 형식: {TAB_ALLOWED_FILE_LABEL[activeTab]} · 최대
                        100MB
                      </p>
                      {activeTab === TABS.BRAILLE && (
                        <p className="text-[11px] text-gray-400 mt-1">
                          HWPX 형식은 아직 지원하지 않습니다. 한글에서
                          &ldquo;한글 문서(.hwp)&rdquo;로 저장해 주세요.
                        </p>
                      )}

                      {/* 쪽번호·꼬리말은 업로드 시점에 정한다(에디터 토글 방식은 폐기).
                          둘 다 페이지행에 들어가는 값이라 .brf를 만드는 모드에서만 묻는다. */}
                      {activeTab !== TABS.OCR && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="mt-4 w-full max-w-[320px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600"
                        >
                          <label className="flex cursor-pointer items-center gap-2">
                            <input
                              type="checkbox"
                              checked={insertPageNumber}
                              onChange={(e) =>
                                setInsertPageNumber(e.target.checked)
                              }
                            />
                            점자 판면 마지막 줄에 쪽번호 넣기
                          </label>

                          <label className="mt-2 block border-t border-gray-100 pt-2 text-left text-gray-500">
                            꼬리말 (선택)
                            <input
                              type="text"
                              value={footerText}
                              maxLength={FOOTER_TEXT_MAX_LENGTH}
                              onChange={(e) => setFooterText(e.target.value)}
                              placeholder="예: 수학 익힘책 1"
                              className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 outline-none focus:border-[#407FAC]"
                            />
                          </label>
                          <p className="mt-1 text-left text-[11px] leading-snug text-gray-400">
                            묵자로 입력하면 다운로드 파일의 페이지행 가운데에
                            점역되어 들어갑니다. ({footerText.length}/
                            {FOOTER_TEXT_MAX_LENGTH})
                          </p>
                        </div>
                      )}
                      {fileState.error && (
                        <p className="flex items-center gap-1 text-sm text-red-500 mt-3">
                          <AlertCircle size={14} />
                          {fileState.error}
                        </p>
                      )}
                    </div>
                  ) : (
                    <FilePreviewer
                      state={fileState}
                      onLoadSuccess={setTotalPages}
                      bboxes={currentBBoxData}
                      selectedBlockId={selectedBlockId}
                      imageResolution={imgResolution}
                      originalTextBlocks={currentOriginalTexts}
                      onBlockClick={(id) =>
                        dispatchAction({ type: 'setSelected', id })
                      }
                    />
                  )}
                </div>
              </motion.div>
            </section>
          )}

          {panelMode !== 'input-only' && (
            <section
              className={
                panelMode === 'both' ? 'flex-1 md:flex-[1.4] min-w-0' : 'w-full'
              }
            >
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-white rounded-[2.5rem] p-8 shadow-xl border border-white/10 h-[600px] flex flex-col"
              >
                <div className="flex justify-between items-center mb-6">
                  <div className="flex items-baseline gap-3">
                    <h2 className="text-xl font-bold text-[#407FAC]">
                      점역/번역 결과
                    </h2>
                    {/* 저장은 페이지 이동·Ctrl+S 시점에 일어난다(별도 저장 버튼 없음). */}
                    {editor.saveStates[currentPage] === 'saving' && (
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <Loader2 size={11} className="animate-spin" /> 저장
                        중...
                      </span>
                    )}
                    {editor.saveStates[currentPage] === 'saved' && (
                      <span className="text-xs text-gray-400">저장됨</span>
                    )}
                    {editor.saveStates[currentPage] === 'error' && (
                      <button
                        type="button"
                        onClick={() =>
                          dispatchAction({
                            type: 'savePage',
                            page: currentPage,
                          })
                        }
                        className="flex items-center gap-1 text-xs font-medium text-red-500 hover:underline"
                      >
                        <AlertCircle size={11} /> 저장 실패 — 다시 시도
                      </button>
                    )}
                  </div>
                  {Object.keys(blocksByPage).length > 0 && (
                    <div className="flex items-center gap-2">
                      {!isPopup && activeTab === TABS.OCR && (
                        <button
                          onClick={handleSendOcrToBraille}
                          disabled={!isConversionComplete || isSending}
                          className="flex items-center gap-1.5 border border-[#407FAC] text-[#407FAC] px-3 py-1.5 rounded-lg hover:bg-[#407FAC]/10 transition-colors shadow-sm text-sm font-medium disabled:opacity-40"
                          title={
                            isConversionComplete
                              ? '이 OCR 결과를 점역 변환으로 보내 자동 점역합니다'
                              : '모든 페이지의 변환이 끝나면 보낼 수 있습니다'
                          }
                        >
                          <ArrowRightCircle size={16} />{' '}
                          <span>점역으로 보내기</span>
                        </button>
                      )}
                      <button
                        onClick={() => setIsDownloadOpen(true)}
                        disabled={!isConversionComplete}
                        title={
                          isConversionComplete
                            ? '결과 파일 다운로드'
                            : '변환이 끝나면 다운로드할 수 있습니다'
                        }
                        className="flex items-center gap-1.5 bg-[#407FAC] text-white px-3 py-1.5 rounded-lg hover:bg-[#356a91] transition-colors shadow-sm text-sm font-medium disabled:opacity-40 disabled:hover:bg-[#407FAC]"
                      >
                        <Download size={16} /> <span>다운로드</span>
                      </button>
                    </div>
                  )}
                </div>

                {isStreaming && currentBlocks.length > 0 && (
                  <div className="mb-3 flex items-center gap-2">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-[#407FAC] transition-[width] duration-300"
                        style={{ width: `${conversionProgress}%` }}
                      />
                    </div>
                    <span className="shrink-0 text-[11px] text-gray-400">
                      {settledPages}/{fileState.totalPages}
                    </span>
                  </div>
                )}

                {gridLines.length > 0 && (
                  <div className="mb-2 flex items-center justify-between">
                    <span className="rounded-md bg-[#eef3fc] px-2 py-1 text-[11px] font-semibold text-[#5b8ce6]">
                      {ROWS_PER_PAGE}줄 × {CELLS_PER_ROW}칸
                      {insertPageNumber && ` · 본문 ${bodyRowsPerPage(true)}줄`}
                    </span>
                    {/* 출력 쪽은 원본 페이지와 별개다 — 스크롤로 이어 본다. */}
                    <span className="text-[11px] text-gray-400">
                      {visibleOutputPage} / {outputPageCount}쪽
                    </span>
                  </div>
                )}

                <div className="flex-1 overflow-hidden pr-1">
                  {uploadError ? (
                    <div className="h-full flex flex-col items-center justify-center text-red-500 space-y-2">
                      <AlertCircle size={32} />
                      <p className="font-medium">업로드 실패</p>
                    </div>
                  ) : isUploading ? (
                    <div className="h-full flex flex-col items-center justify-center space-y-4">
                      <Loader2 className="w-10 h-10 text-[#407FAC] animate-spin" />
                      <p className="font-medium text-gray-500">전송 중...</p>
                    </div>
                  ) : isStreaming && currentBlocks.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center space-y-4 px-10">
                      <Loader2 className="w-10 h-10 text-[#407FAC] animate-spin" />
                      <p className="font-medium text-gray-500">분석 중...</p>
                      {fileState.totalPages > 0 && (
                        <div className="w-full max-w-xs">
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                            <div
                              className="h-full rounded-full bg-[#407FAC] transition-[width] duration-300"
                              style={{ width: `${conversionProgress}%` }}
                            />
                          </div>
                          <p className="mt-2 text-center text-xs text-gray-400">
                            {settledPages} / {fileState.totalPages}페이지 ·{' '}
                            {conversionProgress}%
                          </p>
                        </div>
                      )}
                    </div>
                  ) : gridLines.length > 0 ? (
                    <BrailleGrid
                      lines={gridLines}
                      mode={activeTab}
                      insertPageNumber={insertPageNumber}
                      caret={caret}
                      highlightBlockId={selectedBlockId}
                      onCaretChange={handleCaretChange}
                      onEditLine={handleEditLine}
                      onContextMenu={(lineIndex, x, y) =>
                        setGridMenu({ lineIndex, x, y })
                      }
                      onVisiblePageChange={setVisibleOutputPage}
                      scrollToLine={scrollToLine}
                    />
                  ) : pageStatuses[currentPage] === 'BLOCKED' ? (
                    // 서버가 이 페이지를 변환하지 못한 경우(page_done status=BLOCKED /
                    // job_done failed_pages). 결과가 비어 있어 빈 화면처럼 보이므로 이유를 알린다.
                    <div className="h-full bg-red-50/40 rounded-[2rem] flex flex-col items-center justify-center text-center text-red-500 px-8">
                      <AlertCircle size={40} className="mb-3" />
                      <p className="font-medium">
                        이 페이지는 변환하지 못했습니다.
                      </p>
                      <p className="mt-1 text-sm text-red-400">
                        서버에서 변환이 차단된 페이지입니다. 잠시 후 다시
                        시도하거나 다른 파일로 변환해 주세요.
                      </p>
                    </div>
                  ) : (
                    <div className="h-full bg-gray-50/50 rounded-[2rem] flex flex-col items-center justify-center text-center text-gray-400">
                      <FileText size={48} className="mb-4 opacity-20" />
                      <p className="font-medium">결과가 없습니다.</p>
                    </div>
                  )}
                </div>
              </motion.div>
            </section>
          )}
        </div>

        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="w-full"
          >
            <Pagination
              currentPage={currentPage}
              totalPages={fileState.totalPages}
              onPageChange={(page) => dispatchAction({ type: 'setPage', page })}
            />
          </motion.div>
        </AnimatePresence>
      </main>

      {/* 격자 우클릭 — 블록 단위 기능 (추가 · 삭제 · 대체 초안) */}
      {gridMenu && gridLines[gridMenu.lineIndex] && (
        <ContextMenu
          x={gridMenu.x}
          y={gridMenu.y}
          onClose={() => setGridMenu(null)}
          items={(() => {
            const line = gridLines[gridMenu.lineIndex];
            const blocks = blocksByPage[line.pageNo] ?? [];
            const index = blocks.findIndex((b) => b.id === line.blockId);
            return [
              {
                label: '블록 추가',
                onSelect: () =>
                  dispatchAction({
                    type: 'addBlock',
                    page: line.pageNo,
                    index,
                  }),
              },
              {
                label: '대체 초안',
                disabled: !line.hasDrafts,
                title: line.hasDrafts
                  ? undefined
                  : '이 블록에는 대체 초안이 없습니다',
                onSelect: () => setDraftBlockId(line.blockId),
              },
              {
                label: '블록 삭제',
                danger: true,
                onSelect: () =>
                  dispatchAction({
                    type: 'removeBlock',
                    page: line.pageNo,
                    id: line.blockId,
                  }),
              },
            ];
          })()}
        />
      )}

      {/* 대체 초안 피커 — 근거(방식명·설명)와 함께 후보를 고른다 */}
      {draftBlock && (
        <CandidateModal
          isOpen
          onClose={() => setDraftBlockId(null)}
          candidates={draftBlock.block.candidates}
          drafts={draftBlock.block.drafts}
          currentText={draftBlock.block.currentText}
          originalText={draftBlock.block.originalText}
          onSelect={(text, idx) => {
            dispatchAction({
              type: 'applyCandidate',
              page: draftBlock.pageNo,
              id: draftBlock.block.id,
              text,
            });
            dispatchAction({
              type: 'selectDraft',
              page: draftBlock.pageNo,
              id: draftBlock.block.id,
              idx,
            });
          }}
        />
      )}

      <DownloadModal
        isOpen={isDownloadOpen}
        mode={activeTab}
        onClose={() => setIsDownloadOpen(false)}
        onDownload={handleDownloadFile}
      />

      <SendToBrailleModal
        isOpen={isOverwriteOpen}
        busy={isSending}
        onCancel={() => setIsOverwriteOpen(false)}
        onConfirm={() => void runSendToBraille(true)}
      />

      {/* 하단 토스트 — 저장·이동·삭제 실패 등 짧은 안내 (모달 공통 규칙) */}
      {toast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-[10px] bg-gray-800/95 px-4 py-2.5 text-sm text-white shadow-lg"
        >
          {toast}
        </div>
      )}

      {!isPopup && appVersion.pendingInstall && (
        <UpdateReadyToast
          version={appVersion.installedVersion}
          onRelaunch={() => void appVersion.relaunchNow()}
          onDismiss={appVersion.dismissToast}
        />
      )}

      {!isPopup && auth.token && (
        <MyPage
          isOpen={isMyPageOpen}
          onClose={() => setIsMyPageOpen(false)}
          token={auth.token}
          user={auth.user}
          onSelect={handleSelectJob}
          onToast={setToast}
        />
      )}
    </div>
  );
};

export default BrailleMate;
