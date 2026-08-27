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
  Lock,
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  Layers,
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
import { getJobPage, listActiveJobs } from './api/HistoryService';

// Components
import FilePreviewer from './component/features/conversion/FilePreviewer';
import Pagination from './component/features/conversion/Pagination';
import BrailleGrid, {
  GridCaret,
} from './component/features/conversion/BrailleGrid';
import ContextMenu from './component/shared/ContextMenu';
import CandidateModal from './component/features/conversion/CandidateModal';
import LatexRenderer from './component/features/conversion/LatexRenderer';
import ConfirmModal from './component/shared/ConfirmModal';
import FindBar, {
  FindScope,
  resolveScope,
} from './component/features/conversion/FindBar';
import LoginScreen from './component/features/auth/LoginScreen';
import MyPage from './component/features/mypage/MyPage';
import InquiryFab from './component/features/support/InquiryFab';
import AppVersionBadge from './component/shared/AppVersionBadge';

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
  TAB_LABEL,
  TAB_VALUES,
} from './types';
import { isOrgAdmin, JobDetail, JobPageOriginal } from './types/auth';
import {
  JobDoneData,
  PageEventStatus,
  QueuePositionData,
} from './types/apiTypes';
import {
  fileValidationMessage,
  MAX_UPLOAD_LABEL,
  TAB_ALLOWED_FILE_LABEL,
} from './utils/fileValidation';
import { httpFetch } from './api/httpFetch';
import {
  cancelJob,
  downloadJobResult,
  ElementType,
  selectDraft,
} from './api/JobService';
import { toUserMessage } from './api/errorMessages';
import { ApiError } from './api/apiClient';
import { mapPageResult } from './utils/mapPageResult';
import { needsStreamResume, receivedPages } from './utils/tabResume';
import { hasMath } from './utils/mathText';
import { replaceRanges, searchGrid, searchTextBlocks } from './utils/docSearch';
import { saveBlob } from './utils/download';
import { brailleSourceFileName, mergePagesToText } from './utils/mergePages';
import { isTextOriginal, renderableOriginals } from './utils/pageOriginals';
import { onAppClose } from './utils/appLifecycle';
import { loadBrailleDefaults } from './utils/brailleDefaults';
import { logDiag } from './utils/diagLog';
import {
  blockTextWithRowEdit,
  buildLayout,
  CELLS_PER_ROW,
  firstRowIndexOfPage,
  flattenRows,
  ROWS_PER_PAGE,
} from './utils/brailleLayout';
import DownloadModal from './component/features/conversion/DownloadModal';
import ConversionSettingsModal from './component/features/conversion/ConversionSettingsModal';
import SendToBrailleModal from './component/features/conversion/SendToBrailleModal';
import { usePageEditor } from './hooks/UsePageEditor';
import { useAppVersion } from './hooks/UseAppVersion';
import {
  ForceUpdateGate,
  UpdateReadyToast,
} from './component/features/update/UpdateGate';

// 결과 패널 블록 도구 버튼 공통 스타일
// 복원 원본 PDF 블롭 캐시 상한 — 메모리 때문에 최근 몇 쪽만 남긴다.
const MAX_CACHED_ORIGINALS = 8;
// 페이지 원본 서명 URL의 신선도 한계. 서명 URL은 15분이면 만료되므로(BE 2026-08-09)
// 받은 지 이보다 오래됐으면 시도하지 않고 바로 재발급받는다.
const ORIGINAL_URL_TTL_MS = 10 * 60_000;

const blockToolCls =
  'flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 transition-colors hover:border-[#407FAC]/40 hover:bg-[#eef3fc] hover:text-[#407FAC] disabled:cursor-not-allowed disabled:border-gray-100 disabled:bg-transparent disabled:text-gray-300 disabled:hover:bg-transparent';

// 대기 시간을 사람이 읽는 말로. 분 단위가 되면 초는 버린다 — 흘러가는 것만 보이면 된다.
const formatDuration = (totalSec: number): string => {
  const s = Math.max(0, Math.floor(totalSec));
  if (s < 60) return `${s}초`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return rest === 0 ? `${m}분` : `${m}분 ${rest}초`;
};

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

const Semojum: React.FC = () => {
  const isPopup = useMemo(
    () => new URLSearchParams(window.location.search).get('panel') === 'output',
    [],
  );

  // 처음 열리는 탭은 점역 기본 설정(V3-06 사용량 화면 "기본 변환 모드")을 따른다.
  const [activeTab, setActiveTab] = useState<ConversionTab>(
    () => loadBrailleDefaults().defaultMode,
  );
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
    jobTab,
    error: uploadError,
    resetUpload,
    attachJob,
  } = useJobUpload();

  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  // 마우스가 얹힌 블록 — 원본 패널과 결과 격자가 같은 값을 쓴다.
  // 어느 쪽에 얹든 양쪽의 대응되는 블록에 같은 테두리 상자가 뜬다.
  const [hoverBlockId, setHoverBlockId] = useState<string | null>(null);
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
    setBlocksForPage,
    setAllBlocks,
    updateBlock,
    applyCandidate,
    removeBlock,
    addBlock,
    replaceBlockId,
    reorderBlocks,
    resetAllBlocks,
  } = useTranslationBlocks();

  const auth = useAuth();
  // 앱 시작 시 서버 기준 버전 확인 + 새 버전 확인 (결과 팝업 창은 제외).
  // 설치는 사용자가 고를 때만 한다 — Windows에서 설치는 곧 프로세스 종료라,
  // 자동 설치하면 앱이 저 혼자 꺼진 것처럼 보이고 미저장 편집도 날아간다.
  // editorRef를 거치는 이유: editor는 아래에서 만들어진다.
  const editorRef = useRef<{ saveAllDirty: () => Promise<void> } | null>(null);
  const flushBeforeInstall = useCallback(async () => {
    await editorRef.current?.saveAllDirty();
  }, []);
  const appVersion = useAppVersion(!isPopup, flushBeforeInstall);
  const [isMyPageOpen, setIsMyPageOpen] = useState(false);
  // ROLE_ORG_ADMIN은 점역 작업자가 아니라 관리자다 — 로그인하면 변환 화면이 아니라
  // 기관 관리부터 연다(MyPage가 initialSubView='org'로 마운트된다). 세션마다 한 번만.
  const orgLandingDoneRef = useRef(false);
  useEffect(() => {
    if (isPopup) return;
    if (!auth.isAuthenticated) {
      orgLandingDoneRef.current = false;
      return;
    }
    if (orgLandingDoneRef.current) return;
    orgLandingDoneRef.current = true;
    if (isOrgAdmin(auth.user)) setIsMyPageOpen(true);
  }, [isPopup, auth.isAuthenticated, auth.user]);
  const [isDownloadOpen, setIsDownloadOpen] = useState(false);
  // 업로드 시 확정하는 쪽번호 삽입 여부(2026-08-04 확정 — 에디터 토글이 아니라 업로드 옵션).
  const [insertPageNumber, setInsertPageNumber] = useState(false);
  // 페이지행 가운데에 들어갈 꼬리말(묵자). 쪽번호와 마찬가지로 업로드 시점에 확정된다
  // (2026-08-07 명세 추가). 점역은 다운로드 시점에 서버가 한다.
  const [footerText, setFooterText] = useState('');
  // 파일을 골랐지만 아직 변환 설정(쪽번호·꼬리말)을 정하지 않은 상태.
  // 값이 있으면 [변환 설정] 모달이 뜨고, [변환 시작]을 눌러야 업로드가 시작된다.
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  // 점역으로 보내기 — 기존 연결 문서가 있어 덮어쓰기 확인이 필요한 상태(JOB4011)
  const [isOverwriteOpen, setIsOverwriteOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  // 화면 하단 토스트 — 저장·이동·삭제 실패 등 짧은 안내
  const [toast, setToast] = useState<string | null>(null);
  // 서버 대기열 안내(SSE queue_position). 붐빌 때 왜 아무것도 안 오는지 알려 준다.
  const [queueInfo, setQueueInfo] = useState<QueuePositionData | null>(null);

  // 결과 격자 — 커서(선택된 줄·칸), 우클릭 메뉴, 현재 보이는 출력 쪽,
  // 원본 페이지를 넘겼을 때 스크롤할 줄 번호.
  const [caret, setCaret] = useState<GridCaret | null>(null);
  const [gridMenu, setGridMenu] = useState<{
    rowIndex: number;
    x: number;
    y: number;
  } | null>(null);
  const [visibleOutputPage, setVisibleOutputPage] = useState(1);
  const [scrollToRow, setScrollToRow] = useState<number | null>(null);
  // 원본 미리보기를 맨 위로 올리라는 신호. 쪽 번호를 눌러 넘겼을 때만 올린다 —
  // 블록을 골라 넘어온 경우에는 그 블록 자리로 가야 하므로 건드리면 안 된다
  // (2026-08-26 QA: 우측에서 아래쪽 블록을 고르면 좌측이 위로 튀어 안 보였다).
  const [originalTopToken, setOriginalTopToken] = useState(0);
  // 나머지 쪽이 채워져 판면 번호가 다시 매겨졌을 때 보던 자리로 되돌리는 신호.
  const [realignToken, setRealignToken] = useState(0);
  // 취소 처리 — "전송 중"(업로드 응답 전)에 X를 누르면 아직 jobId가 없어 취소 API를
  // 부를 수가 없다. 그래서 업로드마다 세대 번호를 매기고, 취소하면 세대를 넘긴다.
  // 응답이 돌아왔을 때 세대가 바뀌어 있으면 붙이지 않고 그 자리에서 취소한다.
  const uploadEpochRef = useRef(0);
  // 취소한 Job — 탭을 갔다 와도 스트림을 다시 붙이지 않는다.
  const canceledJobsRef = useRef<Set<string>>(new Set());

  // ─── 문서에서 찾기 (Ctrl+F) ────────────────────────────────────────
  // 인덱스를 두지 않는다 — 열려 있는 작업 하나만 메모리에 있고 본문이 1MB 남짓이라
  // 훑는 편이 인덱스를 만들고 편집마다 갱신하는 것보다 싸다(docSearch 주석 참고).
  const [isFindOpen, setIsFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  // 범위: 원본만 / 결과만. 화면에는 그 자리에 있는 글자 이름(묵자·점자)으로 보인다.
  const [findScope, setFindScope] = useState<FindScope>('result');
  const [findBrailleInput, setFindBrailleInput] = useState(false);
  const [findReplacement, setFindReplacement] = useState('');
  const [findIndex, setFindIndex] = useState(0);
  // Ctrl+F를 다시 누르면 열려 있어도 입력창으로 돌아오게 하는 신호.
  const [findFocusToken, setFindFocusToken] = useState(0);
  // 찾기 동작은 applyAction보다 아래에서 만들어지므로 ref를 거쳐 부른다.
  const stepFindRef = useRef<((delta: 1 | -1) => void) | null>(null);
  const replaceCurrentRef = useRef<(() => void) | null>(null);
  const replaceAllRef = useRef<(() => void) | null>(null);
  // 저장된 작업의 나머지 쪽이 아직 오는 중인지 — 모두 바꾸기 가드가 읽는다.
  // (useSavedJobs는 한참 아래에서 만들어져, 위쪽의 콜백이 state를 바로 읽을 수 없다.)
  const isFillingSavedPagesRef = useRef(false);
  // 손으로 고친 블록(`페이지:블록id`) — 대체 텍스트 적용 전 확인 여부를 가른다.
  const [editedBlocks, setEditedBlocks] = useState<Set<string>>(new Set());
  // 대체 초안 피커를 연 블록 — 어느 페이지의 블록인지까지 들고 있는다.
  // (id만 들고 페이지 전체를 훑으면 다른 페이지의 같은 블록을 먼저 집을 수 있다)
  const [draftTarget, setDraftTarget] = useState<{
    pageNo: number;
    blockId: string;
  } | null>(null);

  // 페이지 일괄 저장(PUT) 대상 Job ID. 라이브 업로드/마이페이지 복원/탭 복원 시 갱신된다.
  const [workingJobId, setWorkingJobId] = useState<string | null>(null);
  // 비동기 콜백(늦게 도착한 쪽 채우기)이 최신 값을 읽을 수 있게 비춰 둔다 —
  // 오래된 클로저의 state는 다른 작업을 여는 사이 낡아 있을 수 있다.
  const workingJobIdRef = useRef<string | null>(null);
  workingJobIdRef.current = workingJobId;
  // 페이지별 변환 상태 — page_done/job_done의 BLOCKED 페이지를 안내하는 데 쓴다.
  const [pageStatuses, setPageStatuses] = useState<
    Record<number, PageEventStatus>
  >({});
  // 비동기 콜백에서 참조할 최신 블록 목록(state 미러)
  const blocksRef = useRef<Record<number, TranslationBlock[]>>({});
  // 마이페이지에서 복원한 작업의 원본 파일명(라이브 업로드는 fileState.file이 들고 있다).
  const [originalFileName, setOriginalFileName] = useState<string | null>(null);
  // 복원 작업의 원본(PDF/이미지) 로드 실패 안내와 "다시 시도" 신호.
  // 마이페이지에서 작업을 열면 결과(블록)와 원본(페이지 PDF·이미지)이 서로 다른
  // 시점에 도착한다. 예전에는 결과만 먼저 그려져, 아직 원본이 없는 패널 위로
  // 마우스를 얹으면 대조 상자를 그릴 자리가 없어 화면이 어긋났다(2026-08-24 QA).
  // 둘이 다 준비될 때까지는 진행 표시만 보여 준다.
  const [isRestoringJob, setIsRestoringJob] = useState(false);
  // 되돌릴 수 없는 조작을 묻는 창(작업 비우기 · 모드 이동).
  const [pendingConfirm, setPendingConfirm] = useState<
    { kind: 'reset' } | { kind: 'tab'; tab: ConversionTab } | null
  >(null);
  const [originalLoadError, setOriginalLoadError] = useState<string | null>(
    null,
  );
  const [originalReloadToken, setOriginalReloadToken] = useState(0);
  // 복원한 작업의 쪽별 원본 PDF 바이트. 쪽을 넘길 때마다 서명 URL을 새로 받고
  // 3MB짜리를 다시 내려받느라 쪽마다 2초씩 기다렸다(2026-08-25 실측).
  // URL이 아니라 **바이트**를 들고 있는다 — 서명 URL만 만료되지 미 받아 둔 내용은
  // 그대로 쓸 수 있고, blob URL은 쓸 때마다 새로 만들어 기존 revoke 규칙을 건드리지
  // 않는다. 메모리 때문에 최근 몇 쪽만 남긴다.
  const originalBlobCacheRef = useRef<Map<string, Blob>>(new Map());
  // 미리보기 세대 — 작업을 갈아탈 때마다 올린다. 이전 작업의 원본 다운로드가
  // 취소 확인(cancelled)을 통과한 직후에 완료되면 새 작업의 미리보기를 덮었다
  // (2026-08-26 QA: 점역 작업을 열었는데 왼쪽에 직전 작업의 PDF가 떴다).
  const previewEpochRef = useRef(0);
  // 페이지 원본 URL(서명 링크)을 받은 시각. 서명 URL은 15분이면 만료되므로(BE
  // 2026-08-09) 받은 지 오래됐으면 시도하지 않고 바로 재발급받는다. 반대로 방금
  // 받은 URL은 그대로 쓴다 — 예전에는 매번 페이지 조회로 새 URL부터 받아, 열 때와
  // 쪽 넘김마다 왕복 하나(0.7~1초)를 그냥 버렸다(2026-08-26 QA: 왼쪽 로딩 지연).
  const savedOriginalsAtRef = useRef(0);

  // 탭별 작업물 보관소. 탭을 떠날 때 현재 상태를 저장하고, 돌아오면 복원한다.
  const [tabSnapshots, setTabSnapshots] = useState<
    Partial<Record<ConversionTab, TabState>>
  >({});
  // 이미 업로드한 File을 기억해 같은 파일이 (탭 복원 등으로) 다시 마운트돼도
  // 재업로드되지 않게 한다. (이전에는 jobId로 가드했지만, 탭 복원 시 jobId가 비므로 ref로 대체)
  const lastUploadedFileRef = useRef<File | null>(null);

  const currentPage = fileState.currentPage;
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

  // 격자를 눌러서 페이지가 바뀐 경우 표시 — 그때는 격자를 되돌려 스크롤하지 않는다
  // (사용자가 방금 누른 자리에 그대로 있어야 한다).
  const skipGridScrollRef = useRef(false);

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

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

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
    // 진행 중이던 이전 작업의 원본 다운로드가 새 화면을 덮지 못하게 세대를 올린다.
    previewEpochRef.current += 1;
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
    setOriginalLoadError(null);
    // 커서는 줄 번호(rowIndex)로만 가리킨다 — 다른 작업물로 갈아타면 그 번호가
    // 새 문서의 엉뚱한 줄을 가리켜, 아무것도 누르지 않았는데 블록 도구(대체 텍스트
    // 포함)가 켜져 있었다(2026-08-20 QA).
    setCaret(null);
    setScrollToRow(null);
  }, [resetFile, resetAllBlocks, resetUpload, editor]);

  const handleReset = useCallback(() => {
    clearWorkspace();
    // 받아 둔 쪽별 원본도 버린다 — 다음 작업의 같은 쪽 번호와 섞이면 안 된다.
    originalBlobCacheRef.current.clear();
    lastUploadedFileRef.current = null;
    // 현재 탭의 보관된 작업물도 비운다(사용자가 명시적으로 지움).
    setTabSnapshots((prev) => ({ ...prev, [activeTab]: undefined }));
  }, [clearWorkspace, activeTab]);

  // 원본 패널의 X(작업 비우기) — 변환이 진행 중이면 먼저 확인을 받는다.
  // 예전에는 아무 확인 없이 바로 화면을 비워, 사용자에게는 "취소를 누르니 모달도
  // 없이 변환이 끝났다"로 보였다 (QA 2026-08-09).
  // (isStreaming은 아래에서 만들어지므로 호출 시점에 읽는 일반 함수로 둔다)
  const performReset = (converting: boolean) => {
    // 화면만 비우면 서버는 계속 분석한다 — 크레딧도 그만큼 나간다.
    // 명세대로 취소 API를 불러 남은 페이지를 큐에서 뺀다(이미 AI에 들어간 페이지는
    // 마무리되고, 거기까지가 결과로 남는다). 실패해도 화면은 비운다.
    //
    // 업로드 응답이 아직 안 온 구간("전송 중")에는 jobId를 모른다. 세대를 넘겨
    // 두면 응답이 도착할 때 위 업로드 트리거가 그 jobId로 취소를 부른다.
    if (converting) uploadEpochRef.current += 1;
    const runningJobId = jobId;
    if (converting && runningJobId) {
      // 탭을 갔다 와도 이 Job의 스트림을 다시 붙이지 않는다.
      canceledJobsRef.current.add(runningJobId);
      if (auth.token) {
        void cancelJob(runningJobId, auth.token).catch((err) =>
          setToast(toUserMessage(err, '변환을 중단하지 못했습니다.')),
        );
      }
    }
    handleReset();
  };

  // 변환 중이면 먼저 묻는다. window.confirm은 데스크톱 웹뷰에서 뜨지 않아
  // "눌렀는데 아무것도 안 뜬다"가 됐다 — 앱 모달로 묻는다(2026-08-24 QA).
  //
  // 판정은 화면에 "분석 중"을 띄우는 조건(isConverting)과 같아야 한다. 예전에는
  // isUploading·isStreaming만 봤는데, 업로드 응답과 SSE 연결 사이에는 둘 다 false라
  // 그 구간에서 X를 누르면 묻지도 않고 작업이 지워졌다 (2026-08-24 QA).
  const handleResetRequest = () => {
    if (isConverting) {
      setPendingConfirm({ kind: 'reset' });
      return;
    }
    performReset(false);
  };

  const performTabChange = (tab: ConversionTab) => {
    // 1) 떠나는 탭의 편집 내용을 서버에 밀어내고 화면 상태를 스냅샷으로 보관
    void editor.saveAllDirty();
    setTabSnapshots((prev) => ({ ...prev, [activeTab]: captureState() }));
    // 진행 중이던 업로드/스트림 상태는 탭별로 공유되므로 초기화
    resetUpload();

    // 2) 들어가는 탭의 작업물을 복원(없으면 빈 화면)
    const saved = tabSnapshots[tab];
    if (saved) {
      // 마이페이지에서 복원한 작업은 원본 File이 없고 페이지별 원본을 그때그때
      // 내려받아 blob으로 만든다. 그 blob은 탭을 떠날 때 revoke되므로, 스냅샷에
      // 남아 있는 주소는 이미 죽은 값이다 — 그대로 되살리면 PDF 뷰어가
      // "Failed to load PDF file"을 띄운다(2026-08-24 QA).
      // 그래서 죽은 주소는 지우고 다시 받아 오게 한 뒤, 받아올 때까지 진행 표시를 둔다.
      const needsOriginalRefetch =
        !saved.fileState.file && !!saved.savedOriginalsByPage;
      restoreState(
        needsOriginalRefetch
          ? { ...saved.fileState, previewUrl: null }
          : saved.fileState,
      );
      setAllBlocks(saved.blocksByPage);
      setBboxDataByPage(saved.bboxDataByPage);
      setOriginalTextsByPage(saved.originalTextsByPage);
      setImgResolution(saved.imgResolution);
      setSelectedBlockId(saved.selectedBlockId);
      setSavedOriginalsByPage(saved.savedOriginalsByPage);
      if (needsOriginalRefetch) {
        setOriginalLoadError(null);
        setIsRestoringJob(true);
        // 같은 값을 다시 넣는 것만으로는 원본 조회 effect가 돌지 않는다(의존성이 그대로다).
        setOriginalReloadToken((v) => v + 1);
      }
      setWorkingJobId(saved.jobId);
      setInsertPageNumber(saved.insertPageNumber ?? false);
      setFooterText(saved.footerText ?? '');
      editor.resetEditor();
      editor.registerServerBlocks(Object.values(saved.blocksByPage).flat());
      setPageStatuses(saved.pageStatuses ?? {});
      setOriginalFileName(saved.originalFileName ?? null);
      // 탭마다 판면이 다르므로 줄 번호로 잡아 둔 커서는 넘겨받지 않는다.
      setCaret(null);
      setScrollToRow(null);
      // 복원된 파일은 이미 변환됐으므로 재업로드 트리거를 막는다.
      lastUploadedFileRef.current = saved.fileState.file;

      // 변환이 끝나지 않은 채 떠났던 탭이면 스트림을 다시 붙인다.
      // 떠날 때 resetUpload가 jobId를 비워 SSE가 끊기는데, 돌아와도 다시 붙이지 않아
      // 남은 페이지가 영영 오지 않고 결과 패널이 "결과가 없습니다"로 남았다
      // (jobId가 없으니 isConverting도 false가 되어 "분석 중"으로도 못 갔다).
      const have = receivedPages(saved.blocksByPage, saved.pageStatuses);
      if (
        saved.jobId &&
        // 사용자가 취소한 Job은 되살리지 않는다 — 예전에는 탭을 갔다 오면
        // 취소했던 변환이 다시 붙어 "취소가 안 된다"로 보였다.
        !canceledJobsRef.current.has(saved.jobId) &&
        needsStreamResume(saved.jobId, saved.fileState.totalPages, have)
      ) {
        attachJob(saved.jobId, tab);
        void catchUpMissingPages(
          saved.jobId,
          tab,
          saved.fileState.totalPages,
          have,
        );
      }
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

  // 탭을 떠나 있는 동안 서버가 끝낸 페이지는 SSE로 다시 오지 않는다(그동안 스트림이 끊겨 있었다).
  // 돌아왔을 때 빠진 페이지만 조회로 채워 넣는다. 아직 변환 전인 페이지(JOB4001)는 건너뛰고,
  // 그 페이지는 다시 붙인 스트림이 마저 가져온다.
  const catchUpMissingPages = useCallback(
    async (
      jobIdToFetch: string,
      tab: ConversionTab,
      totalPages: number,
      have: Set<number>,
    ) => {
      const token = auth.token;
      if (!token) return;
      for (let page = 1; page <= totalPages; page += 1) {
        if (have.has(page)) continue;
        try {
          const data = await getJobPage(token, jobIdToFetch, page);
          const mapped = mapPageResult(tab, data.result ?? {});
          setBboxDataByPage((prev) => ({ ...prev, [page]: mapped.bboxes }));
          setOriginalTextsByPage((prev) => ({
            ...prev,
            [page]: mapped.originalTexts,
          }));
          setBlocksForPageWithBaseline(page, mapped.blocks);
          setPageStatuses((prev) => ({ ...prev, [page]: 'COMPLETED' }));
        } catch (e) {
          if (e instanceof ApiError && e.code === 'JOB4001') continue;
          console.warn('페이지 따라잡기 실패', page, e);
        }
      }
    },
    [auth.token, setBlocksForPageWithBaseline],
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

  // 블록 순서 변경 — 저장 시 배열 순서가 그대로 reading_order가 되므로
  // 화면 배열만 바꾸고 페이지 저장에 맡긴다.
  const handleMoveBlock = useCallback(
    (page: number, id: string, delta: -1 | 1) => {
      const blocks = readBlocks(page);
      const from = blocks.findIndex((b) => b.id === id);
      const to = from + delta;
      if (from === -1 || to < 0 || to >= blocks.length) return;
      const next = [...blocks];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      editor.pushHistory(page);
      reorderBlocks(page, next);
      editor.markDirty(page);
    },
    [readBlocks, editor, reorderBlocks],
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
      // 손으로 고친 블록을 기억해 둔다 — 대체 텍스트를 적용하면 이 편집이 사라지므로
      // 피커가 한 번 확인을 받는다(기획 §2 "대체 텍스트 선택 · 적용").
      setEditedBlocks((prev) => {
        const key = `${page}:${id}`;
        if (prev.has(key)) return prev;
        return new Set(prev).add(key);
      });
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
        (e) => logDiag('대체 초안', '선택 저장 실패', e),
      );
    },
    [workingJobId, auth.token, elementType],
  );

  // ─── 결과 격자 ────────────────────────────────────────────────────
  // 판면 배치는 braille-assist가 만든다 — 32칸 줄바꿈·원본 쪽 변경선·26줄 면 나눔·
  // 페이지행까지 다운로드 .brf와 같은 자리에서 나뉜다. 하단 페이지네이션이 옮기는
  // 원본 파일 페이지와 여기의 "출력 쪽"(점자 면)은 별개다.
  const layout = useMemo(
    () => buildLayout(blocksByPage, insertPageNumber),
    [blocksByPage, insertPageNumber],
  );
  const gridRows = useMemo(() => flattenRows(layout), [layout]);

  const outputPageCount = Math.max(1, layout.length);

  // 대체 초안 피커 대상 블록 — 지정된 페이지 안에서만 찾는다.
  const draftBlock = useMemo(() => {
    if (!draftTarget) return null;
    const block = (blocksByPage[draftTarget.pageNo] ?? []).find(
      (b) => b.id === draftTarget.blockId,
    );
    return block ? { pageNo: draftTarget.pageNo, block } : null;
  }, [draftTarget, blocksByPage]);

  // 커서가 놓인 줄의 블록 — 결과 패널 블록 버튼(추가·이동·삭제·대체 텍스트)의 대상.
  // 우클릭 메뉴만으로는 기능이 있는지조차 알기 어려웠다 (QA "블록 관련 버튼 생성").
  // 이미지 점자 번역(c)의 원본은 그림이라 찾을 글자가 없다 — 잠긴 범위에 남지 않게 한다.
  const effectiveFindScope = resolveScope(activeTab, findScope);
  useEffect(() => {
    if (effectiveFindScope !== findScope) setFindScope(effectiveFindScope);
  }, [effectiveFindScope, findScope]);

  // 찾기 결과 — 범위에 따라 훑을 곳이 달라진다.
  const findHits = useMemo(() => {
    const query = findQuery.trim();
    if (!isFindOpen || !query) return { grid: [], text: [] };
    return {
      grid:
        effectiveFindScope === 'original' ? [] : searchGrid(gridRows, query),
      text:
        effectiveFindScope === 'result'
          ? []
          : searchTextBlocks(currentOriginalTexts, query),
    };
  }, [
    isFindOpen,
    findQuery,
    effectiveFindScope,
    gridRows,
    currentOriginalTexts,
  ]);

  // 이동 순서는 "원본 먼저, 그다음 결과" — 화면 왼쪽에서 오른쪽으로 읽는 순서다.
  const findTotal = findHits.text.length + findHits.grid.length;

  // 검색어·범위가 바뀌면 첫 건부터 다시 본다.
  useEffect(() => setFindIndex(0), [findQuery, findScope, isFindOpen]);

  // 바꾸고 나면 건수가 줄어든다 — 보고 있던 자리가 사라졌으면 앞으로 당긴다.
  useEffect(() => {
    setFindIndex((prev) =>
      prev >= findTotal ? Math.max(0, findTotal - 1) : prev,
    );
  }, [findTotal]);

  const activeTextHit =
    findIndex < findHits.text.length ? findHits.text[findIndex] : null;
  const activeGridHit =
    findIndex >= findHits.text.length
      ? findHits.grid[findIndex - findHits.text.length]
      : null;

  const findCells = useMemo(() => {
    const map = new Map<number, Set<number>>();
    findHits.grid.forEach((hit) =>
      hit.cells.forEach(({ rowIndex, cells }) => {
        const set = map.get(rowIndex) ?? new Set<number>();
        cells.forEach((c) => set.add(c));
        map.set(rowIndex, set);
      }),
    );
    return map;
  }, [findHits.grid]);

  const activeFindCells = useMemo(() => {
    const map = new Map<number, Set<number>>();
    activeGridHit?.cells.forEach(({ rowIndex, cells }) => {
      const set = map.get(rowIndex) ?? new Set<number>();
      cells.forEach((c) => set.add(c));
      map.set(rowIndex, set);
    });
    return map;
  }, [activeGridHit]);

  const findRangesByBlock = useMemo(() => {
    const map = new Map<string, { start: number; end: number }[]>();
    findHits.text.forEach(({ blockId, range }) => {
      const list = map.get(blockId) ?? [];
      list.push(range);
      map.set(blockId, list);
    });
    return map;
  }, [findHits.text]);

  // 지금 보고 있는 한 건으로 화면을 옮긴다 — 결과는 격자 스크롤, 원본은 블록 선택.
  useEffect(() => {
    if (activeGridHit) setScrollToRow(activeGridHit.rowIndex);
  }, [activeGridHit]);

  // 바꾸기는 결과(출력)에만 건다 — 원본 패널은 읽기 전용 미리보기다.
  // 화면 행이 아니라 블록 본문에 적용한다(행 경계에 걸친 말도 한 번에 바뀐다).
  const replaceHits = useCallback(
    (hits: typeof findHits.grid) => {
      if (hits.length === 0) return;
      const byBlock = new Map<string, typeof hits>();
      hits.forEach((hit) => {
        const key = `${hit.pageNo}:${hit.blockId}`;
        byBlock.set(key, [...(byBlock.get(key) ?? []), hit]);
      });

      byBlock.forEach((blockHits) => {
        const { pageNo, blockId } = blockHits[0];
        const block = blocksByPage[pageNo]?.find((b) => b.id === blockId);
        if (!block) return;
        // dispatchAction은 아래에서 만들어지므로 ref를 거친다(다른 핸들러와 같은 방식).
        dispatchActionRef.current?.({
          type: 'updateBlock',
          page: pageNo,
          id: blockId,
          text: replaceRanges(block.currentText, blockHits, findReplacement),
        });
      });
    },
    [blocksByPage, findReplacement],
  );

  const replaceCurrent = useCallback(() => {
    if (activeGridHit) replaceHits([activeGridHit]);
  }, [activeGridHit, replaceHits]);

  const replaceAll = useCallback(() => {
    // 저장된 작업의 쪽을 아직 받는 중이면 막는다 — 지금 바꾸면 메모리에 있는
    // 쪽만 바뀌고, 뒤이어 도착하는 쪽은 원문 그대로 남는다(2026-08-26 QA:
    // 12쪽짜리를 열자마자 찾으면 한동안 첫 쪽 52건만 잡히던 실측). 팝업(결과
    // 전용 창)에서 오는 호출도 이 길을 지나므로 버튼 잠금만으로는 부족하다.
    if (isFillingSavedPagesRef.current) return;
    replaceHits(findHits.grid);
  }, [findHits.grid, replaceHits]);

  const stepFind = useCallback(
    (delta: 1 | -1) => {
      if (findTotal === 0) return;
      setFindIndex((prev) => (prev + delta + findTotal) % findTotal);
    },
    [findTotal],
  );

  useEffect(() => {
    stepFindRef.current = stepFind;
    replaceCurrentRef.current = replaceCurrent;
    replaceAllRef.current = replaceAll;
  }, [stepFind, replaceCurrent, replaceAll]);

  // 마우스를 얹은 블록의 수식을 판면 아래에서 통째로 조판해 보여 준다.
  // 판면은 32칸 격자라 LaTeX가 한 글자씩 흩뿌려져 읽을 수 없다 — 밑줄로 어디가
  // 수식인지 표시하고, 실제 모양은 이 자리에서 블록 단위로 확인한다.
  const hoveredMathBlock = useMemo(() => {
    if (!hoverBlockId) return null;
    for (const blocks of Object.values(blocksByPage)) {
      const found = blocks.find((b) => b.id === hoverBlockId);
      // 독립 수식 요소는 구분자 없이 순수 LaTeX로 오기도 해서, 표기($·```)만으로는
      // 놓친다 — 서버가 준 요소 유형(formula)을 함께 본다(2026-08-24 실측).
      if (found)
        return found.isFormula || hasMath(found.currentText) ? found : null;
    }
    return null;
  }, [hoverBlockId, blocksByPage]);

  const caretSource = caret ? (gridRows[caret.rowIndex]?.source ?? null) : null;
  const caretBlocks = caretSource
    ? (blocksByPage[caretSource.pageNo] ?? [])
    : [];
  const caretBlockIndex = caretSource
    ? caretBlocks.findIndex((b) => b.id === caretSource.blockId)
    : -1;

  // 커서가 놓인 줄의 블록을 원본 대조 선택으로도 반영한다(좌측 원본이 같이 강조됨).
  const handleCaretChange = useCallback(
    (next: GridCaret) => {
      setCaret(next);
      const source = gridRows[next.rowIndex]?.source;
      if (!source) return;
      if (source.blockId !== selectedBlockId) {
        dispatchActionRef.current?.({
          type: 'setSelected',
          id: source.blockId,
        });
      }
      // 결과는 원본 페이지 경계와 무관하게 이어지므로, 한 판면에 여러 원본 페이지의 줄이
      // 섞여 있다. 다른 페이지의 줄을 짚으면 왼쪽 원본도 그 페이지로 옮겨 대조를 맞춘다.
      // (setPage 액션이 떠나는 페이지의 편집 저장과 팝업 동기화까지 처리한다)
      if (source.pageNo !== currentPageRef.current) {
        skipGridScrollRef.current = true;
        dispatchActionRef.current?.({ type: 'setPage', page: source.pageNo });
      }
    },
    [gridRows, selectedBlockId],
  );

  // 원본에서 블록을 고르면 결과 격자의 커서도 그 블록 첫 칸으로 옮기고 그 줄을 보여 준다.
  // 예전에는 원본에만 주황 상자가 뜨고 결과의 파란 커서는 보던 자리에 남아 있어,
  // 어느 줄이 그 블록인지 눈으로 다시 찾아야 했다.
  const handleSelectFromOriginal = useCallback(
    (id: string) => {
      dispatchActionRef.current?.({ type: 'setSelected', id });
      const rowIndex = gridRows.findIndex(
        (r) =>
          r.source?.blockId === id &&
          r.source?.pageNo === currentPageRef.current,
      );
      if (rowIndex < 0) return;
      setCaret({ rowIndex, cell: 0 });
      setScrollToRow(rowIndex);
    },
    [gridRows],
  );

  // 새 작업이 붙으면 판면이 통째로 바뀐다 — 줄 번호로만 잡아 둔 커서는 무효다.
  // 남겨 두면 변환이 끝나자마자 엉뚱한 줄이 "선택된" 상태가 되어, 아무것도 누르지
  // 않았는데 블록 도구(대체 텍스트 포함)가 켜져 있었다(2026-08-20 QA).
  useEffect(() => {
    setCaret(null);
    setScrollToRow(null);
  }, [jobId]);

  // 같은 줄을 다시 골라도 스크롤이 걸리도록 값을 곧 비운다(격자는 값이 바뀔 때 움직인다).
  useEffect(() => {
    if (scrollToRow == null) return;
    const id = window.setTimeout(() => setScrollToRow(null), 400);
    return () => window.clearTimeout(id);
  }, [scrollToRow]);

  // 격자에서 한 행을 고치면 그 행이 속한 블록의 본문을 다시 만들어 넘긴다.
  // 접힌 행이면 논리 줄의 그 구간만 갈아 끼우므로, 길어진 만큼 다음 행으로 다시 접힌다.
  const handleEditRow = useCallback(
    (rowIndex: number, text: string) => {
      const row = gridRows[rowIndex];
      const source = row?.source;
      if (!source) return;
      const block = blocksByPage[source.pageNo]?.find(
        (b) => b.id === source.blockId,
      );
      if (!block) return;
      dispatchActionRef.current?.({
        type: 'updateBlock',
        page: source.pageNo,
        id: source.blockId,
        text: blockTextWithRowEdit(block.currentText, source, row.text, text),
      });
    },
    [gridRows, blocksByPage],
  );

  // 원본 페이지를 넘기면 결과 격자를 그 페이지의 첫 줄로 옮겨 대조를 유지한다.
  // (결과 자체는 끊기지 않고 계속 이어져 있다.)
  useEffect(() => {
    if (gridRows.length === 0) return;
    // 격자를 눌러서 넘어온 경우는 이미 그 줄을 보고 있다 — 되돌려 스크롤하지 않는다.
    if (skipGridScrollRef.current) {
      skipGridScrollRef.current = false;
      return;
    }
    // 값을 비우는 것은 위의 scrollToRow 정리 effect가 맡는다(같은 줄 재선택 대비).
    setScrollToRow(firstRowIndexOfPage(gridRows, currentPage));
    // 쪽 번호로 넘어온 경우다 — 원본도 그 쪽 맨 위부터 보여 준다.
    setOriginalTopToken((v) => v + 1);
    // gridRows가 바뀔 때마다 스크롤하면 스트리밍 중 계속 튀므로 페이지만 본다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  // 나머지 쪽이 채워지면 판면 번호가 다시 매겨진다 — 보던 쪽 첫 줄로 되돌린다.
  // (없으면 먼저 뜬 쪽이 판면 1쪽이었다가 갑자기 한참 아래로 밀린다.)
  useEffect(() => {
    if (realignToken === 0 || gridRows.length === 0) return;
    setScrollToRow(firstRowIndexOfPage(gridRows, currentPageRef.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realignToken]);

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
        case 'find': {
          const patch = action.patch;
          if (patch.open !== undefined) setIsFindOpen(patch.open);
          if (patch.query !== undefined) setFindQuery(patch.query);
          if (patch.scope !== undefined) setFindScope(patch.scope);
          if (patch.brailleInput !== undefined)
            setFindBrailleInput(patch.brailleInput);
          if (patch.index !== undefined) setFindIndex(patch.index);
          if (patch.replacement !== undefined)
            setFindReplacement(patch.replacement);
          break;
        }
        case 'findStep':
          stepFindRef.current?.(action.delta);
          break;
        case 'findReplace':
          (action.all ? replaceAllRef : replaceCurrentRef).current?.();
          break;
        case 'removeBlock':
          handleRemoveBlock(action.page, action.id);
          break;
        case 'addBlock':
          handleAddBlock(action.page, action.index);
          break;
        case 'moveBlock':
          handleMoveBlock(action.page, action.id, action.delta);
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
      handleMoveBlock,
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
    const epoch = (uploadEpochRef.current += 1);
    const stillMine = () => uploadEpochRef.current === epoch;
    void uploadFile(
      fileState.file,
      activeTab,
      auth.token,
      insertPageNumber,
      footerText,
      { shouldAttach: stillMine },
    ).then((data) => {
      // 올리는 동안 취소했으면 이제서야 알게 된 jobId로 서버 작업을 중단시킨다.
      if (!data || stillMine()) return;
      canceledJobsRef.current.add(data.jobId);
      if (auth.token) {
        void cancelJob(data.jobId, auth.token).catch((err) =>
          console.warn('취소하지 못했습니다', err),
        );
      }
    });
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

  // 격자 우클릭 위치. 인라인 화살표로 넘기면 렌더마다 새 함수가 되어 격자 메모가
  // 깨진다 — 판면이 수만 칸이라 그 한 번이 그대로 멈춤으로 보인다.
  const handleGridContextMenu = useCallback(
    (rowIndex: number, x: number, y: number) => setGridMenu({ rowIndex, x, y }),
    [],
  );

  const handleTabChange = (tab: ConversionTab) => {
    if (tab === activeTab) return;
    // 변환이 진행 중이면 바로 이동해 작업이 끊기지 않도록 먼저 확인을 받는다.
    // (판정 기준은 X(작업 비우기)와 같다 — handleResetRequest 주석 참고)
    if (isConverting) {
      setPendingConfirm({ kind: 'tab', tab });
      return;
    }
    performTabChange(tab);
  };

  // 라이브 업로드로 생성된 Job을 블록 편집 저장 대상으로 등록
  useEffect(() => {
    if (jobId) setWorkingJobId(jobId);
  }, [jobId]);

  const handlePageMapped = usePageStreamHandler({
    // 결과 해석은 이 Job이 만들어진 모드 기준이다 (탭을 옮겨도 흔들리지 않게).
    activeTab: jobTab ?? activeTab,
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
    // 대기열 안내는 받아만 두고 쓰지 않고 있었다 — 첫 쪽이 오기 전 몇 분을
    // 설명해 줄 수 있는 유일한 서버 신호다(2026-08-27 인수시험).
    onQueuePosition: setQueueInfo,
    // 스트림이 끊기면 화면은 "분석 중"에서 멈춘 것처럼 보인다 — 기능정의서
    // "변환 결과 실시간 표시" D-1대로 실패를 알린다. 복구는 재시작·재접속과 같은
    // 절차(작업 목록 → 상태 조회 → 스트림 재연결)를 따르므로 안내도 그렇게 준다.
    onError: () =>
      setToast(
        '변환 결과 연결이 끊겼습니다. 마이페이지에서 해당 작업을 다시 열면 이어서 받습니다.',
      ),
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

  // 업로드 응답을 받은 뒤 SSE가 붙기까지는 isUploading·isStreaming이 둘 다 false인
  // 짧은 구간이 있다. 그 사이 결과 패널이 "결과가 없습니다"로 떨어졌다가 변환이 끝나야
  // 결과로 바뀌어, 실패한 것처럼 보였다 (QA "파일 업로드 시 결과가 없습니다 뜨다…").
  // jobId가 있는 동안은 변환이 진행 중인 것으로 본다.
  const isConverting =
    isUploading || isStreaming || (!!jobId && !isConversionComplete);

  // 변환 경과 시간. 10쪽짜리를 올리면 첫 결과가 오기까지 2분 30초 동안 진행률이
  // "0 / 10"에 그대로 멈춰 있어, 멈춘 것과 구분할 신호가 화면에 하나도 없었다
  // (2026-08-27 인수시험 — 서버가 4쪽씩 묶어 보낸다). 서버 소식과 무관하게
  // **반드시 움직이는 값**을 하나 둔다.
  const [elapsedSec, setElapsedSec] = useState(0);
  useEffect(() => {
    if (!isConverting) return;
    const startedAt = Date.now();
    const id = window.setInterval(
      () => setElapsedSec(Math.floor((Date.now() - startedAt) / 1000)),
      1000,
    );
    // 다음 변환이 0초부터 세도록 끝날 때 되돌린다(대기열 안내도 이때 버린다).
    return () => {
      window.clearInterval(id);
      setElapsedSec(0);
      setQueueInfo(null);
    };
  }, [isConverting]);

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
      find: {
        open: isFindOpen,
        query: findQuery,
        scope: findScope,
        brailleInput: findBrailleInput,
        index: findIndex,
        replacement: findReplacement,
      },
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
      isFindOpen,
      findQuery,
      findScope,
      findBrailleInput,
      findIndex,
      findReplacement,
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
      // 찾기 상태는 메인 창이 소유한다 — 팝업은 받은 값을 그대로 비춘다.
      if (s.find) {
        setIsFindOpen(s.find.open);
        setFindQuery(s.find.query);
        setFindScope(s.find.scope);
        setFindBrailleInput(s.find.brailleInput);
        setFindIndex(s.find.index);
        setFindReplacement(s.find.replacement);
      }
    },
    [setAllBlocks, setPage, setTotalPages],
  );

  const { dispatchAction, togglePopup, broadcastHover } = usePopupSync({
    isPopup,
    panelMode,
    setPanelMode,
    snapshot,
    applyAction,
    onSnapshotReceived: handleSnapshotReceived,
    onHoverReceived: setHoverBlockId,
  });

  // 창이 나뉘어 있으면 원본과 결과가 서로 다른 창에 있다. 이쪽에서 얹은 블록을
  // 반대편에도 알려 같은 자리에 상자가 뜨게 한다.
  const handleHoverBlock = useCallback(
    (id: string | null) => {
      setHoverBlockId(id);
      broadcastHover(id);
    },
    [broadcastHover],
  );

  useEffect(() => {
    dispatchActionRef.current = dispatchAction;
  }, [dispatchAction]);

  // 원본 응답이 끝내 오지 않아도 화면이 갇히지는 않게 한다 — 진행 표시를 내리면
  // 그 아래의 실패 안내·다시 시도 버튼을 쓸 수 있다.
  useEffect(() => {
    if (!isRestoringJob) return;
    const id = window.setTimeout(() => setIsRestoringJob(false), 20_000);
    return () => window.clearTimeout(id);
  }, [isRestoringJob]);

  const handleJobLoaded = useCallback(
    (job: JobDetail) => {
      handleReset();
      // 원본까지 준비되면 아래 effect가 내린다(점역 모드는 원본이 텍스트라 즉시).
      setIsRestoringJob(job.mode !== TABS.BRAILLE);
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
        // 이미지 모드(a/c): 페이지별 원본이 있으면 그 원본을 띄우고, 페이지 전환은
        // 아래 effect가 처리한다. 원본이 없으면 썸네일(페이지 고정)로 폴백.
        //
        // 열 때는 직전에 보던 쪽 하나만 먼저 도착하므로 그 쪽을 봐야 한다 — 1쪽만
        // 보면 뒤쪽을 보다 연 작업이 전부 "원본 없음"으로 빠져, 나머지 쪽 조회가
        // 다 끝날 때까지 왼쪽 원본이 안 떴다(2026-08-26 QA: 무거운 파일 열기 지연).
        const first =
          job.originalByPage?.[job.startPage ?? 1] ?? job.originalByPage?.[1];
        if (first?.url) {
          const ft: FileType = first.type === 'image' ? 'image' : 'pdf';
          setRestoredPreview({
            fileType: ft,
            // 이미지는 <img>로 바로 표시 가능. PDF는 CORS 때문에 아래 effect가
            // httpFetch로 받아 blob URL을 채운다(여기선 빈 값으로 두어 hasInputPreview만 켬).
            previewUrl: ft === 'image' ? first.url : null,
            isRestoredPages: true,
            previewPage: job.startPage ?? 1,
          });
          savedOriginalsAtRef.current = Date.now();
          setSavedOriginalsByPage(job.originalByPage ?? null);
        } else {
          setRestoredPreview({
            fileType: 'image',
            previewUrl: job.thumbnailUrl ?? null,
          });
          setSavedOriginalsByPage(null);
          // 페이지 원본이 없으면 더 기다릴 것이 없다(썸네일로 폴백).
          setIsRestoringJob(false);
        }
      }
      setIsMyPageOpen(false);
    },
    [handleReset, setAllBlocks, setTotalPages, setPage, setRestoredPreview],
  );

  // 마이페이지 복원 작업에서 페이지를 바꾸면 왼쪽 원본 미리보기를 해당 페이지 원본으로 교체.
  // 이미지 모드(a/c)만 해당(원본 url 존재). 점역(b)은 url이 null이라 건너뛴다.
  //
  // 원본 URL은 서명된 링크라 15분이면 만료된다(BE 2026-08-09). 작업을 열 때 받아 둔
  // 값을 계속 쓰면 한참 뒤 페이지를 넘겼을 때 403이 나므로, 페이지에 들어갈 때마다
  // 페이지 조회로 새 URL을 받는다. PDF는 그 URL의 바이트를 받아 blob으로 렌더한다.
  useEffect(() => {
    if (!savedOriginalsByPage) return;

    // 이미 받아 둔 쪽이면 네트워크를 타지 않는다.
    const cacheKey = `${workingJobId ?? 'none'}:${currentPage}`;
    const cachedBlob = originalBlobCacheRef.current.get(cacheKey);
    if (cachedBlob) {
      setRestoredPreview({
        fileType: 'pdf',
        previewUrl: URL.createObjectURL(cachedBlob),
        isRestoredPages: true,
        previewPage: currentPage,
      });
      setIsRestoringJob(false);
      return;
    }

    const cached = savedOriginalsByPage[currentPage];
    // 텍스트 원본(점역 b — url 없이 lines만)은 왼쪽이 원본 텍스트를 직접 그린다.
    // PDF 원본을 찾을 일이 아니다 — 여기서 오류를 내면 텍스트 미리보기를 덮는다.
    if (isTextOriginal(cached)) {
      setIsRestoringJob(false);
      return;
    }
    // 이 페이지의 원본 주소를 아직 모르면 작업 조회로 받아 온다. 둘 다 없으면
    // 기다릴 것이 없으니 진행 표시를 내린다(그대로 두면 화면이 갇힌다).
    const canRefetch = !!workingJobId && !!auth.token;
    if (!cached?.url && !canRefetch) {
      setIsRestoringJob(false);
      return;
    }

    let cancelled = false;
    // cancelled는 cleanup이 돌아야 켜진다 — 확인을 통과한 직후 새 작업이 열리는
    // 틈이 있다. 세대 번호를 함께 봐서 그 틈으로 새 화면을 덮지 못하게 한다.
    const previewEpoch = previewEpochRef.current;
    const stale = () => cancelled || previewEpochRef.current !== previewEpoch;
    setOriginalLoadError(null);

    (async () => {
      // 원본 하나를 화면에 올린다. 실패(만료 403 등)면 false — 새 URL로 다시 시도.
      const show = async (
        orig: JobPageOriginal | null | undefined,
      ): Promise<boolean> => {
        if (!orig?.url) return false;
        if (orig.type === 'image') {
          if (!stale()) {
            setRestoredPreview({
              fileType: 'image',
              previewUrl: orig.url,
              isRestoredPages: true,
              previewPage: currentPage,
            });
            setIsRestoringJob(false);
          }
          return true;
        }
        const res = await httpFetch(orig.url, { method: 'GET' });
        if (!res.ok) return false;
        const buf = await res.arrayBuffer();
        if (stale()) return true;
        const blob = new Blob([buf], { type: 'application/pdf' });
        // 다음에 이 쪽으로 돌아오면 바로 그린다. 오래된 쪽부터 버린다.
        const cache = originalBlobCacheRef.current;
        cache.set(cacheKey, blob);
        while (cache.size > MAX_CACHED_ORIGINALS) {
          const oldest = cache.keys().next().value;
          if (oldest === undefined) break;
          cache.delete(oldest);
        }
        const blobUrl = URL.createObjectURL(blob);
        if (stale()) {
          URL.revokeObjectURL(blobUrl); // 적용 전 취소되면 누수 방지
          return true;
        }
        // 이후 blob URL의 폐기는 setRestoredPreview/reset의 revoke가 담당.
        setRestoredPreview({
          fileType: 'pdf',
          previewUrl: blobUrl,
          isRestoredPages: true,
          previewPage: currentPage,
        });
        setIsRestoringJob(false);
        return true;
      };

      try {
        // 1) 들고 있는 URL이 아직 살아 있을 시각이면 그대로 쓴다. 작업을 연 직후에는
        //    방금 발급된 URL이라 거의 항상 성공한다 — 예전처럼 매번 재조회부터 하면
        //    열 때와 쪽 넘김마다 왕복 하나를 그냥 버린다(위 ORIGINAL_URL_TTL_MS 참고).
        const urlUsable =
          Date.now() - savedOriginalsAtRef.current < ORIGINAL_URL_TTL_MS;
        if (urlUsable && (await show(cached).catch(() => false))) return;
        if (stale()) return;

        // 2) URL이 낡았거나 방금 실패했다 — 지금 발급된 URL을 받아 한 번 더.
        if (!canRefetch || !auth.token || !workingJobId) {
          throw new Error('원본 주소를 받지 못했습니다.');
        }
        const fresh = await getJobPage(auth.token, workingJobId, currentPage);
        if (stale()) return;
        // 재조회 응답이 텍스트 원본이면 그릴 PDF가 없는 게 정상이다(위 가드와 동일).
        if (isTextOriginal(fresh.original)) {
          setIsRestoringJob(false);
          return;
        }
        if (!(await show(fresh.original))) {
          throw new Error('원본 주소를 받지 못했습니다.');
        }
      } catch (e) {
        if (stale()) return;
        // 실패를 삼키면 미리보기가 이유 없는 빈 화면이 된다 — 화면에 알린다.
        // 진행 표시를 내려야 그 안내가 보인다.
        logDiag('복원', '원본 미리보기 실패', e);
        setIsRestoringJob(false);
        setOriginalLoadError('원본을 불러오지 못했습니다.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    savedOriginalsByPage,
    currentPage,
    setRestoredPreview,
    workingJobId,
    auth.token,
    originalReloadToken,
  ]);

  // 보고 있는 쪽의 앞뒤를 미리 받아 둔다.
  //
  // 복원한 작업은 쪽마다 서명 URL을 새로 받고 그 쪽 원본을 통째로 내려받는다. 원본
  // 대조는 쪽을 차례로 넘기며 하는 일이라, 넘길 때마다 그 대기(테스터 PC에서 1~2초,
  // 여는 순간은 5~10초)를 그대로 맞는다. 지금 쪽을 다 그린 뒤 조용히 이웃 쪽을 채워
  // 두면 다음 넘김이 캐시에서 바로 나온다(2026-08-26 QA).
  useEffect(() => {
    if (!savedOriginalsByPage || !workingJobId || !auth.token) return;
    const token = auth.token;
    const jobId = workingJobId;
    const total = fileState.totalPages;
    let cancelled = false;

    const warm = async (page: number) => {
      if (page < 1 || (total > 0 && page > total)) return;
      const key = `${jobId}:${page}`;
      const cache = originalBlobCacheRef.current;
      if (cache.has(key)) return;
      try {
        // 이미지 원본은 원격 URL을 그대로 쓰는 경로라 미리 받아도 소용이 없다.
        const fetchBytes = async (o: JobPageOriginal | null | undefined) => {
          if (!o?.url || o.type === 'image') return null;
          const res = await httpFetch(o.url, { method: 'GET' });
          return res.ok ? await res.arrayBuffer() : null;
        };
        // 들고 있는 URL이 살아 있으면 그대로 받는다(본문 미리보기 effect와 같은 규칙).
        const urlUsable =
          Date.now() - savedOriginalsAtRef.current < ORIGINAL_URL_TTL_MS;
        let buf = urlUsable
          ? await fetchBytes(savedOriginalsByPage[page]).catch(() => null)
          : null;
        if (cancelled) return;
        if (!buf) {
          // 모르는 쪽이거나 URL이 낡았다 — 지금 발급된 URL로 받는다.
          const fresh = await getJobPage(token, jobId, page);
          if (cancelled) return;
          buf = await fetchBytes(fresh.original);
        }
        if (!buf || cancelled || cache.has(key)) return;
        cache.set(key, new Blob([buf], { type: 'application/pdf' }));
        while (cache.size > MAX_CACHED_ORIGINALS) {
          const oldest = cache.keys().next().value;
          if (oldest === undefined) break;
          cache.delete(oldest);
        }
      } catch {
        // 미리 받기는 실패해도 그만이다 — 그 쪽에 갈 때 정식 경로가 다시 받는다.
      }
    };

    // 지금 쪽을 먼저 보여 준 다음에 시작한다(같은 회선을 두고 다투지 않게).
    const id = window.setTimeout(() => {
      void (async () => {
        await warm(currentPage + 1);
        await warm(currentPage - 1);
      })();
    }, 800);

    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [
    savedOriginalsByPage,
    currentPage,
    workingJobId,
    auth.token,
    fileState.totalPages,
  ]);

  // 뒤이어 도착한 나머지 쪽을 채운다. 화면에 이미 있는 쪽은 건드리지 않는다 —
  // 먼저 뜬 쪽을 사용자가 벌써 고치고 있을 수 있다.
  const handlePagesFilled = useCallback(
    (job: JobDetail) => {
      // 다른 작업의 늦은 채우기는 버린다. 채우기가 끝나기 전에 새 작업을 열면
      // 이전 작업의 쪽들이 새 작업 화면에 합쳐졌다(2026-08-26 QA 실측: 점역
      // 작업이 "변환 완료 12/2"가 되고 왼쪽 원본까지 다른 작업 것으로 바뀜).
      // UseSavedJobs의 세대 가드에 더한 이중 안전장치다.
      if (job.jobId !== workingJobIdRef.current) return;
      const keepExisting = <T,>(
        prev: Record<number, T>,
        incoming: Record<number, T>,
      ): Record<number, T> => ({ ...incoming, ...prev });

      // 다른 setter들처럼 **갱신 함수**로 합쳐야 한다. 값으로 넘기면 이 콜백이
      // 만들어질 때의 blocksByPage가 굳는다 — 앞 작업을 열어 둔 채로 다른 작업을
      // 열면, 새 작업의 채우기가 그 굳은 값(앞 작업의 쪽 전부)을 되살려 화면이
      // "완료 552 / 10"처럼 어긋났다(2026-08-27 인수시험, 이전 빌드에서도 재현).
      setAllBlocks((prev) => keepExisting(prev, job.blocksByPage));
      editor.registerServerBlocks(Object.values(job.blocksByPage).flat());
      setBboxDataByPage((prev) => keepExisting(prev, job.bboxDataByPage));
      setOriginalTextsByPage((prev) =>
        keepExisting(prev, job.originalTextsByPage),
      );
      // 점역(b) 저장본의 텍스트 원본(url 없음)은 페이지 원본 경로에 넣지 않는다 —
      // 넣으면 미리보기 effect가 PDF 원본을 찾다 "원본을 불러오지 못했습니다"로
      // 텍스트 미리보기를 덮는다(2026-08-26 QA). 그릴 수 있는 원본이 하나도 없으면
      // null을 유지해 이 경로 자체를 끈다.
      const incomingOriginals = renderableOriginals(job.originalByPage);
      savedOriginalsAtRef.current = Date.now();
      setSavedOriginalsByPage((prev) => {
        const merged = prev
          ? keepExisting(prev, incomingOriginals)
          : incomingOriginals;
        return Object.keys(merged).length > 0 ? merged : null;
      });
      setPageStatuses((prev) => {
        const next = { ...prev };
        for (let p = 1; p <= job.totalPages; p += 1) {
          if (!next[p]) next[p] = 'COMPLETED';
        }
        (job.failedPages ?? []).forEach((p) => {
          next[p] = 'BLOCKED';
        });
        return next;
      });
      // 앞뒤 쪽이 채워지며 판면 번호가 다시 매겨진다 — 보던 자리로 되돌린다.
      setRealignToken((v) => v + 1);
    },
    [editor, setAllBlocks],
  );

  const { isLoading: isFillingSavedPages, handleSelectJob: loadSavedJob } =
    useSavedJobs({
      token: auth.token,
      onJobLoaded: handleJobLoaded,
      onPagesFilled: handlePagesFilled,
      onError: (message) => {
        setIsRestoringJob(false);
        setIsMyPageOpen(true);
        setToast(message);
      },
    });
  isFillingSavedPagesRef.current = isFillingSavedPages;

  // 마이페이지에서 파일을 고르면 **누르는 즉시** 불러오는 중 화면으로 넘어간다.
  // 예전에는 쪽별 조회가 다 끝나야 화면이 바뀌어, 그동안(느린 PC에서 5~10초)
  // 목록이 그대로 떠 있어 눌린 건지조차 알 수 없었다(2026-08-26 QA).
  const handleSelectJob = useCallback(
    (job: Parameters<typeof loadSavedJob>[0]) => {
      setIsMyPageOpen(false);
      setIsRestoringJob(true);
      void loadSavedJob(job);
    },
    [loadSavedJob],
  );

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
      // 점자 판면을 만드는 모드(b·c)는 쪽번호·꼬리말을 먼저 묻는다.
      // 초안 생성(a)은 .txt를 내므로 물을 것이 없어 바로 올린다.
      if (activeTab !== TABS.OCR) {
        setPendingFile(files[0] ?? null);
        return;
      }
      void handleFileDrop(files, activeTab);
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
      } else if (key === 'f') {
        // 브라우저 찾기 대신 문서 안에서 찾는다. 결과 전용 창에서 눌러도
        // 상태는 메인 창이 바꾸고 스냅샷으로 두 창에 함께 반영된다.
        e.preventDefault();
        dispatchAction({ type: 'find', patch: { open: true } });
        setFindFocusToken((v) => v + 1);
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
        // 이 세션에서 취소한 작업은 되살리지 않는다 — 취소는 "수렴"이라 서버 목록에
        // 잠깐 더 남아 있을 수 있다(명세: 진행 중이던 페이지는 마무리된다).
        const resumable = active.filter(
          (job) => !canceledJobsRef.current.has(job.jobId),
        );
        if (cancelled || resumable.length === 0) return;
        // 응답은 lastModifiedAt 최신순이지만, 순서에 기대지 않고 직접 고른다.
        const latest = resumable.reduce((a, b) =>
          new Date(b.lastModifiedAt) > new Date(a.lastModifiedAt) ? b : a,
        );
        setActiveTab(modeToTab(latest.mode));
        setWorkingJobId(latest.jobId);
        setTotalPages(latest.totalPages);
        setPage(latest.lastEditedPage ?? 1);
        // 아직 변환 중이므로 SSE를 다시 붙여 남은 페이지를 따라잡는다.
        attachJob(latest.jobId, modeToTab(latest.mode));
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
      const saved = await saveBlob(blob, served ?? `${fileName}${ext}`);
      if (saved) setToast(`저장했습니다 — ${saved}`);
    },
    [workingJobId, auth.token, editor, activeTab],
  );

  const tabs = TAB_VALUES;

  // 각 탭에서 작업 중인 문서명. 현재 탭은 화면 상태에서, 나머지 탭은 보관된 스냅샷에서
  // 읽는다. 좌측 원본만 보고는 어떤 파일을 다루는지 알 수 없었고, 다른 탭에 무엇이
  // 열려 있는지도 알 방법이 없었다 (QA "현재 각 탭에서 작업 중인 문서명 UI에 표기").
  const currentDocName = fileState.file?.name ?? originalFileName;
  const docNameOf = (tab: ConversionTab): string | null => {
    if (tab === activeTab) return currentDocName;
    const saved = tabSnapshots[tab];
    return saved?.fileState.file?.name ?? saved?.originalFileName ?? null;
  };

  // 호환성이 깨지는 패치는 업데이트 외의 모든 조작을 막는다 (자동 업데이트 D-1).
  if (!isPopup && appVersion.forceUpdate) {
    return (
      <ForceUpdateGate
        latestVersion={appVersion.latestVersion}
        busy={appVersion.isInstalling}
        onInstall={() => void appVersion.installNow()}
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
    // h-screen이어야 한다(min-h-screen 아님) — 창 높이가 그대로 확정 높이가 되어야
    // 아래 flex-1·h-full 사슬이 값을 갖고, 결과 격자가 제 안에서 스크롤한다.
    // min-h-screen이면 높이가 auto라 판면이 길어질수록 패널이 함께 늘어나고,
    // 격자의 overflow-auto가 걸릴 데가 없어 탭 줄·페이지 이동까지 화면 밖으로 밀렸다.
    <div className="h-screen overflow-hidden bg-[#F0F4F8] flex flex-col font-sans text-gray-800 antialiased transition-colors duration-500">
      {/* 화면 폭 배분 — 입력란과 출력란을 같은 크기로 두고 바깥 여백을 최소로 깎는다.
          그래도 32칸 판면이 가로 스크롤 없이 들어가야 해서(QA "화면 크기 조정") 숫자가 빠듯하다.
          기본 창 1440(세로 스크롤바 감안 뷰포트 ~1425) 기준:

            1425 − px-2(16) − gap-4(16) = 1393 → 패널 하나 696
            696 − p-4(32) − pr-1(4)             = 660  ← 격자가 쓸 수 있는 폭
            격자 필요 폭: px-1(8) + 테두리(4) + 줄번호(26) + 32칸×19 = 646

          여유가 14px뿐이다. 패딩·간격을 더 키우거나 칸 크기를 늘리면 스크롤이 되살아난다.
          (Windows 디스플레이 배율이 100%가 아니면 CSS 폭이 줄어 여전히 스크롤이 생긴다)

          세로는 남는 만큼 패널이 늘어난다 — 로고 줄을 없애고 계정·창 버튼을 탭 줄로
          내려 위쪽 두 줄을 한 줄로 줄였다. 판면이 화면에 한 줄이라도 더 들어와야 한다. */}
      <header className="w-full pt-3 px-2">
        {!isPopup && (
          <nav className="flex items-end gap-12 border-b border-white/20 relative">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => handleTabChange(tab)}
                title={docNameOf(tab) ?? undefined}
                className={`pb-4 text-lg font-semibold transition-all relative ${
                  activeTab === tab
                    ? 'text-[#407FAC]'
                    : 'text-[#929292] hover:text-[#407FAC]'
                }`}
              >
                {TAB_LABEL[tab]}
                <span className="block max-w-[170px] truncate text-left text-[11px] font-normal text-gray-400">
                  {docNameOf(tab) ?? ' '}
                </span>
                {activeTab === tab && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute bottom-0 left-0 right-0 h-1 bg-[#407FAC] rounded-t-full"
                  />
                )}
              </button>
            ))}

            {/* 되돌리기 · 다시 실행 · 계정/창 조작. 변환 진행률은 결과 패널로 옮겼다 —
                로고 줄까지 걷어내 위쪽 두 줄을 한 줄로 줄이고, 그만큼 패널을 세로로 키운다. */}
            <div className="ml-auto mb-3 flex items-center gap-1.5">
              <button
                onClick={() =>
                  dispatchAction({ type: 'undo', page: currentPage })
                }
                disabled={!editor.canUndo(currentPage)}
                title="되돌리기 (Ctrl+Z)"
                aria-label="되돌리기"
                className="rounded p-1.5 text-gray-400 transition-colors hover:text-[#407FAC] disabled:opacity-30"
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
                className="rounded p-1.5 text-gray-400 transition-colors hover:text-[#407FAC] disabled:opacity-30"
              >
                <Redo2 size={17} />
              </button>

              <span className="mx-1 h-4 w-px bg-gray-200" />

              <button
                onClick={() => setIsMyPageOpen(true)}
                title="마이페이지 — 이전 작업 보기"
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[13px] font-medium text-gray-600 shadow-sm transition-colors hover:border-[#407FAC]/40 hover:text-[#407FAC]"
              >
                <History size={15} />
                <span>마이페이지</span>
              </button>
              {/* 합치기/나누기 토글은 메인 창에서만 노출한다.
                  결과 전용 창에서 합치기를 누르면 window.close가 막혀 흰 화면이
                  되는 문제가 있어, 결과 창은 창 닫기(X)로만 합치도록 한다. */}
              <button
                onClick={togglePopup}
                title={
                  panelMode === 'both'
                    ? '결과를 새 창으로 분리'
                    : '한 창으로 합치기'
                }
                aria-pressed={panelMode !== 'both'}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[13px] font-medium text-gray-600 shadow-sm transition-colors hover:border-[#407FAC]/40 hover:text-[#407FAC]"
              >
                {panelMode === 'both' ? (
                  <Columns2 size={15} />
                ) : (
                  <Square size={15} />
                )}
                <span>{panelMode === 'both' ? '반으로 나누기' : '합치기'}</span>
              </button>
              <span className="hidden items-center gap-1.5 px-2 text-[13px] text-gray-500 lg:flex">
                <UserIcon size={14} />
                {auth.user?.loginId}
              </span>
              <button
                onClick={() => auth.logout()}
                title="로그아웃"
                aria-label="로그아웃"
                className="flex items-center rounded-lg border border-gray-200 bg-white p-1.5 text-gray-500 shadow-sm transition-colors hover:border-red-200 hover:text-red-500"
              >
                <LogOut size={16} />
              </button>
            </div>
          </nav>
        )}
      </header>

      <main className="relative flex min-h-0 w-full flex-1 flex-col items-center px-2 py-3">
        {/* 작업을 불러오는 동안은 두 패널을 함께 덮는다 — 결과만 먼저 그려 놓으면
            아직 원본이 없는 자리에 대조 상자를 그리려다 화면이 어긋난다.
            "원본을 불러오지 못했습니다"를 성급히 띄우지 않는 효과도 있다. */}
        {isRestoringJob && (
          <div
            role="status"
            aria-live="polite"
            className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-[#F0F4F8]/92"
          >
            <Loader2 className="h-9 w-9 animate-spin text-[#407FAC]" />
            <p className="text-[14px] font-medium text-gray-600">
              작업을 불러오는 중...
            </p>
            <p className="text-[12px] text-gray-400">
              원본과 결과가 모두 준비되면 함께 보여 드립니다.
            </p>
          </div>
        )}

        <div
          className={
            panelMode === 'both'
              ? 'flex min-h-0 w-full flex-1 flex-col items-stretch gap-4 md:flex-row'
              : 'flex min-h-0 w-full flex-1 flex-col items-stretch'
          }
        >
          {panelMode !== 'output-only' && (
            <section
              className={
                panelMode === 'both'
                  ? 'min-h-0 flex-1 min-w-0'
                  : 'min-h-0 w-full'
              }
            >
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex h-full min-h-[420px] flex-col rounded-[2rem] border border-white/10 bg-white p-4 shadow-xl"
              >
                <div className="flex justify-between items-center mb-4 gap-3">
                  <div className="min-w-0">
                    <h2 className="text-xl font-bold text-gray-800">
                      원본 파일
                    </h2>
                    {currentDocName && (
                      <p
                        title={currentDocName}
                        className="mt-0.5 truncate text-xs text-gray-400"
                      >
                        {currentDocName}
                      </p>
                    )}
                  </div>
                  {hasInputPreview && (
                    <button
                      title="이 작업 비우기"
                      aria-label="이 작업 비우기"
                      onClick={handleResetRequest}
                      className="p-2 hover:bg-red-50 text-red-400 rounded-full transition-colors"
                    >
                      <X size={20} />
                    </button>
                  )}
                </div>

                <div
                  className={`min-h-0 flex-1 rounded-[2rem] overflow-hidden border-2 border-dashed transition-all ${!hasInputPreview ? (isDragActive ? 'border-[#5A8FBB] bg-blue-50/50' : 'border-gray-200') : 'border-transparent'}`}
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
                        지원 형식: {TAB_ALLOWED_FILE_LABEL[activeTab]} · 최대{' '}
                        {MAX_UPLOAD_LABEL}
                      </p>
                      {activeTab === TABS.OCR && (
                        <p className="text-[11px] text-gray-400 mt-1">
                          HWPX 형식은 아직 지원하지 않습니다. 한글에서
                          &ldquo;한글 문서(.hwp)&rdquo;로 저장해 주세요.
                        </p>
                      )}

                      {/* 쪽번호·꼬리말은 파일을 고른 직후 [변환 설정] 모달에서 정한다
                          (Figma V3-02). 예전에는 드롭존 안에 체크박스·입력칸을 붙여 뒀는데
                          파일을 올리기 전에 눈에 띄지 않아 그냥 지나치기 쉬웠다. */}
                      {fileState.error && (
                        <p className="flex items-center gap-1 text-sm text-red-500 mt-3">
                          <AlertCircle size={14} />
                          {fileState.error}
                        </p>
                      )}
                    </div>
                  ) : originalLoadError ? (
                    // 원본 로드 실패를 숨기면 이유 없는 빈 패널이 된다.
                    <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center text-gray-500">
                      <AlertCircle size={32} className="text-red-400" />
                      <p className="font-medium">{originalLoadError}</p>
                      <p className="text-sm text-gray-400">
                        원본 보기 링크가 만료됐거나 네트워크가 끊겼을 수
                        있습니다.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setOriginalLoadError(null);
                          setOriginalReloadToken((v) => v + 1);
                        }}
                        className="mt-1 rounded-lg border border-[#407FAC] px-3 py-1.5 text-sm font-medium text-[#407FAC] transition-colors hover:bg-[#407FAC]/10"
                      >
                        다시 시도
                      </button>
                    </div>
                  ) : (
                    <FilePreviewer
                      state={fileState}
                      onLoadSuccess={setTotalPages}
                      bboxes={currentBBoxData}
                      selectedBlockId={selectedBlockId}
                      imageResolution={imgResolution}
                      originalTextBlocks={currentOriginalTexts}
                      findRangesByBlock={findRangesByBlock}
                      activeFind={
                        activeTextHit
                          ? {
                              blockId: activeTextHit.blockId,
                              ...activeTextHit.range,
                            }
                          : null
                      }
                      onBlockClick={handleSelectFromOriginal}
                      hoveredBlockId={hoverBlockId}
                      onBlockHover={handleHoverBlock}
                      scrollTopToken={originalTopToken}
                    />
                  )}
                </div>
              </motion.div>
            </section>
          )}

          {panelMode !== 'input-only' && (
            <section
              className={
                panelMode === 'both'
                  ? 'min-h-0 flex-1 min-w-0'
                  : 'min-h-0 w-full'
              }
            >
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="flex h-full min-h-[420px] flex-col rounded-[2rem] border border-white/10 bg-white p-4 shadow-xl"
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

                {/* 변환 진행률은 상단 탭 줄에서 한 번만 보여준다.
                    (여기에도 같은 막대가 있어 중복으로 보였다 — QA 2026-08-09) */}

                {/* 판면 규격 · 페이지행 · 변환 진행률 · 보고 있는 출력 쪽.
                    진행률은 원래 상단 탭 줄에 있었는데 결과가 여기 있으니 여기가 맞다. */}
                {(gridRows.length > 0 || fileState.totalPages > 0) && (
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      {gridRows.length > 0 && (
                        <span className="rounded-md bg-[#eef3fc] px-2 py-1 text-[11px] font-semibold text-[#5b8ce6]">
                          {ROWS_PER_PAGE}줄 × {CELLS_PER_ROW}칸
                        </span>
                      )}
                      {/* 이 작업의 페이지행 설정. 값을 바꾸면 판면이 통째로 다시 짜이는데,
                          BE가 저장된 값으로만 다운로드를 만들어(PATCH·다운로드 body 모두 무시,
                          2026-08-07 실서버 확인) 여기서 바꾸면 화면과 파일이 어긋난다.
                          바꾸는 API가 생기면 disabled만 풀면 된다. */}
                      {gridRows.length > 0 && activeTab !== TABS.OCR && (
                        <label
                          title="업로드할 때 정해집니다. 바꾸려면 파일을 다시 올려 주세요."
                          className="flex cursor-not-allowed items-center gap-1.5 rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-400"
                        >
                          <input
                            type="checkbox"
                            checked={insertPageNumber}
                            disabled
                            readOnly
                            className="cursor-not-allowed"
                          />
                          페이지행(쪽번호·꼬리말)
                          <Lock size={10} />
                        </label>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {fileState.totalPages > 0 && (
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-semibold text-[#407FAC]">
                            {isConversionComplete ? '변환 완료' : '변환 진행'}{' '}
                            {settledPages} / {fileState.totalPages}
                          </span>
                          <div className="h-1.5 w-[80px] overflow-hidden rounded-full bg-gray-200">
                            <div
                              className="h-full rounded-full bg-[#407FAC] transition-[width] duration-300"
                              style={{ width: `${conversionProgress}%` }}
                            />
                          </div>
                        </div>
                      )}
                      {/* 출력 쪽은 원본 페이지와 별개다 — 스크롤로 이어 본다. */}
                      {gridRows.length > 0 && (
                        <span className="text-[11px] text-gray-400">
                          {visibleOutputPage} / {outputPageCount}쪽
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* 블록 도구 — 우클릭 메뉴와 같은 동작을 버튼으로도 제공한다.
                    대상은 커서가 놓인 줄의 블록이다 (QA "블록 관련 버튼 생성" ·
                    "대체 텍스트 버튼 생성"). */}
                {gridRows.length > 0 && (
                  <div className="mb-2 flex items-center gap-1 border-b border-gray-100 pb-2">
                    <button
                      type="button"
                      disabled={caretBlockIndex === -1}
                      title={
                        caretSource
                          ? '커서가 있는 블록 앞에 빈 블록을 넣습니다'
                          : '판면에서 줄을 먼저 선택해 주세요'
                      }
                      onClick={() =>
                        caretSource &&
                        dispatchAction({
                          type: 'addBlock',
                          page: caretSource.pageNo,
                          index: caretBlockIndex,
                        })
                      }
                      className={blockToolCls}
                    >
                      <Plus size={13} /> 블록 추가
                    </button>
                    <button
                      type="button"
                      disabled={caretBlockIndex <= 0}
                      title="블록을 위로 옮깁니다"
                      onClick={() =>
                        caretSource &&
                        dispatchAction({
                          type: 'moveBlock',
                          page: caretSource.pageNo,
                          id: caretSource.blockId,
                          delta: -1,
                        })
                      }
                      className={blockToolCls}
                    >
                      <ArrowUp size={13} /> 위로
                    </button>
                    <button
                      type="button"
                      disabled={
                        caretBlockIndex === -1 ||
                        caretBlockIndex >= caretBlocks.length - 1
                      }
                      title="블록을 아래로 옮깁니다"
                      onClick={() =>
                        caretSource &&
                        dispatchAction({
                          type: 'moveBlock',
                          page: caretSource.pageNo,
                          id: caretSource.blockId,
                          delta: 1,
                        })
                      }
                      className={blockToolCls}
                    >
                      <ArrowDown size={13} /> 아래로
                    </button>
                    <button
                      type="button"
                      disabled={caretBlockIndex === -1}
                      title="이 블록을 지웁니다 (Ctrl+Z로 되돌릴 수 있습니다)"
                      onClick={() =>
                        caretSource &&
                        dispatchAction({
                          type: 'removeBlock',
                          page: caretSource.pageNo,
                          id: caretSource.blockId,
                        })
                      }
                      className={`${blockToolCls} text-[#ff3b30] hover:bg-red-50 hover:text-[#ff3b30]`}
                    >
                      <Trash2 size={13} /> 블록 삭제
                    </button>

                    <button
                      type="button"
                      disabled={!caretSource?.hasDrafts}
                      title={
                        !caretSource
                          ? '판면에서 줄을 먼저 선택해 주세요'
                          : caretSource.hasDrafts
                            ? 'AI가 만든 다른 표현(대체 텍스트)을 골라 넣습니다'
                            : '이 블록에는 대체 텍스트가 없습니다'
                      }
                      onClick={() =>
                        caretSource &&
                        setDraftTarget({
                          pageNo: caretSource.pageNo,
                          blockId: caretSource.blockId,
                        })
                      }
                      className={`ml-auto flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                        caretSource?.hasDrafts
                          ? 'border-[#f47726]/40 bg-[#fdf0e6] text-[#c25a12] hover:bg-[#fbe4d3]'
                          : 'border-gray-200 text-gray-400'
                      }`}
                    >
                      <Layers size={13} /> 대체 텍스트
                    </button>
                  </div>
                )}

                {/* 수식 보기 — 마우스를 얹은 블록에 수식이 있을 때만 뜬다.
                    읽기 전용이다: 고치는 곳은 위 판면 격자 하나뿐이어야 한다. */}
                {hoveredMathBlock && (
                  <section
                    aria-label="라텍스 변환기"
                    className="order-last mt-2 shrink-0 rounded-[10px] border border-[#e2e8f0] bg-white px-3 py-2"
                  >
                    <p className="mb-1 text-[10.5px] font-bold text-gray-400">
                      라텍스 변환기
                    </p>
                    {/* 판면보다 이 칸이 중요하다 — 결과 창을 좀 덜 보이더라도 크게 둔다. */}
                    <div className="custom-scrollbar max-h-[34vh] min-h-[120px] overflow-auto text-[14px] leading-relaxed text-gray-700">
                      <LatexRenderer
                        // 구분자 없이 온 수식 요소는 통째로 한 식으로 그린다.
                        text={
                          hoveredMathBlock.isFormula &&
                          !hasMath(hoveredMathBlock.currentText)
                            ? `$$${hoveredMathBlock.currentText}$$`
                            : hoveredMathBlock.currentText
                        }
                        className="whitespace-pre-wrap"
                      />
                    </div>
                  </section>
                )}

                {/* min-h-0 — flex 아이템 기본값(min-height:auto)이면 격자가 제 높이만큼
                    이 칸을 밀어내 스크롤이 걸리지 않는다. */}
                <div className="min-h-0 flex-1 overflow-hidden pr-1">
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
                  ) : isConverting && gridRows.length === 0 ? (
                    // 결과 격자는 원본 페이지 경계와 무관하게 이어지므로, 한 페이지라도
                    // 도착하면 그것을 보여준다. 예전에는 "현재 페이지 블록이 비었는가"로
                    // 판단해서, 이미 끝난 페이지를 보고 있어도 아직 안 온 페이지로 넘기면
                    // 결과가 통째로 사라지고 '분석 중'이 떴다 (QA 2026-08-09).
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
                      {/* 서버는 결과를 몇 쪽씩 묶어 보내서, 첫 묶음이 오기까지
                          쪽 수가 한참 0에 머문다. 그동안 멈춘 것이 아님을 알리는
                          값은 이 두 줄뿐이다(2026-08-27 인수시험). */}
                      <p
                        role="status"
                        aria-live="polite"
                        className="text-center text-xs text-gray-400"
                      >
                        {queueInfo && settledPages === 0
                          ? `대기열 ${queueInfo.position}번째 · 예상 ${formatDuration(queueInfo.estimated_wait_sec)}`
                          : `${formatDuration(elapsedSec)} 경과`}
                      </p>
                      <p className="max-w-xs text-center text-[11px] text-gray-300">
                        결과는 몇 쪽씩 묶여 도착합니다.
                      </p>
                    </div>
                  ) : gridRows.length > 0 ? (
                    <BrailleGrid
                      pages={layout}
                      mode={activeTab}
                      caret={caret}
                      highlightBlockId={selectedBlockId}
                      onCaretChange={handleCaretChange}
                      onEditRow={handleEditRow}
                      onContextMenu={handleGridContextMenu}
                      hoverBlockId={hoverBlockId}
                      onHoverBlockChange={handleHoverBlock}
                      onVisiblePageChange={setVisibleOutputPage}
                      scrollToRow={scrollToRow}
                      findCells={findCells}
                      activeFindCells={activeFindCells}
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
            className="w-full shrink-0 pt-2"
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
      {gridMenu && gridRows[gridMenu.rowIndex]?.source && (
        <ContextMenu
          x={gridMenu.x}
          y={gridMenu.y}
          onClose={() => setGridMenu(null)}
          items={(() => {
            const line = gridRows[gridMenu.rowIndex].source!;
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
                label: '위로 이동',
                disabled: index <= 0,
                title: index <= 0 ? '이 페이지의 첫 블록입니다' : undefined,
                onSelect: () =>
                  dispatchAction({
                    type: 'moveBlock',
                    page: line.pageNo,
                    id: line.blockId,
                    delta: -1,
                  }),
              },
              {
                label: '아래로 이동',
                disabled: index === -1 || index >= blocks.length - 1,
                title:
                  index >= blocks.length - 1
                    ? '이 페이지의 마지막 블록입니다'
                    : undefined,
                onSelect: () =>
                  dispatchAction({
                    type: 'moveBlock',
                    page: line.pageNo,
                    id: line.blockId,
                    delta: 1,
                  }),
              },
              {
                label: '대체 초안',
                disabled: !line.hasDrafts,
                title: line.hasDrafts
                  ? undefined
                  : '이 블록에는 대체 초안이 없습니다',
                onSelect: () =>
                  setDraftTarget({
                    pageNo: line.pageNo,
                    blockId: line.blockId,
                  }),
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

      {/* 대체 초안 피커 — 방식(라벨)을 탭으로 두고 한 안을 크게 본다 */}
      {draftBlock && (
        <CandidateModal
          isOpen
          onClose={() => setDraftTarget(null)}
          candidates={draftBlock.block.candidates}
          drafts={draftBlock.block.drafts}
          mode={activeTab}
          currentText={draftBlock.block.currentText}
          tnText={draftBlock.block.tnText}
          ruleTrail={draftBlock.block.ruleTrail}
          isEdited={editedBlocks.has(
            `${draftBlock.pageNo}:${draftBlock.block.id}`,
          )}
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

      {/* 파일을 고른 직후의 변환 설정 — 여기서 [변환 시작]을 눌러야 업로드된다. */}
      <ConversionSettingsModal
        isOpen={!!pendingFile}
        fileName={pendingFile?.name ?? null}
        onCancel={() => setPendingFile(null)}
        onStart={(withPageNumber, footer) => {
          const file = pendingFile;
          setPendingFile(null);
          if (!file) return;
          // 업로드 effect가 이 두 값을 함께 읽는다 — 같은 배치에서 갱신되므로
          // effect가 도는 시점에는 새 값이 반영돼 있다.
          setInsertPageNumber(withPageNumber);
          setFooterText(footer);
          void handleFileDrop([file], activeTab);
        }}
      />

      <SendToBrailleModal
        isOpen={isOverwriteOpen}
        busy={isSending}
        onCancel={() => setIsOverwriteOpen(false)}
        onConfirm={() => void runSendToBraille(true)}
      />

      {/* 되돌릴 수 없는 조작 확인 — 변환 중 작업 비우기 · 모드 이동 */}
      <ConfirmModal
        isOpen={pendingConfirm !== null}
        title={
          pendingConfirm?.kind === 'tab'
            ? '다른 모드로 이동할까요?'
            : '변환을 중단할까요?'
        }
        message={
          pendingConfirm?.kind === 'tab'
            ? '변환이 아직 진행 중입니다.\n지금 이동하면 진행 중인 변환이 중단됩니다.'
            : '변환이 아직 진행 중입니다.\n지금 비우면 변환을 중단하고 화면을 비웁니다.'
        }
        confirmLabel={
          pendingConfirm?.kind === 'tab' ? '이동' : '중단하고 비우기'
        }
        onClose={() => setPendingConfirm(null)}
        onConfirm={() => {
          const target = pendingConfirm;
          setPendingConfirm(null);
          if (!target) return;
          if (target.kind === 'tab') performTabChange(target.tab);
          else performReset(true);
        }}
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

      {!isPopup && appVersion.updateAvailable && (
        <UpdateReadyToast
          version={appVersion.availableVersion}
          busy={appVersion.isInstalling}
          onInstall={() => void appVersion.installNow()}
          onDismiss={appVersion.dismissToast}
        />
      )}

      {/* 문서에서 찾기 — Ctrl+F. 결과 전용 창에서도 같은 줄이 뜬다.
          상태는 메인 창이 들고, 팝업의 조작은 액션으로 건너가 스냅샷으로 돌아온다.
          걸린 자리는 두 창이 같은 블록을 보고 있으므로 각자 계산한다. */}
      {isFindOpen && (
        <div className="fixed left-1/2 top-3 z-[45] -translate-x-1/2">
          <FindBar
            query={findQuery}
            onQueryChange={(query) =>
              dispatchAction({ type: 'find', patch: { query } })
            }
            scope={findScope}
            onScopeChange={(scope) =>
              dispatchAction({ type: 'find', patch: { scope } })
            }
            brailleInput={findBrailleInput}
            onBrailleInputChange={(brailleInput) =>
              dispatchAction({ type: 'find', patch: { brailleInput } })
            }
            mode={activeTab}
            total={findTotal}
            current={findIndex}
            filling={isFillingSavedPages}
            onStep={(delta) => dispatchAction({ type: 'findStep', delta })}
            focusToken={findFocusToken}
            replacement={findReplacement}
            onReplacementChange={(replacement) =>
              dispatchAction({ type: 'find', patch: { replacement } })
            }
            onReplace={() =>
              dispatchAction({ type: 'findReplace', all: false })
            }
            onReplaceAll={() =>
              dispatchAction({ type: 'findReplace', all: true })
            }
            onClose={() =>
              dispatchAction({
                type: 'find',
                patch: { open: false, query: '' },
              })
            }
          />
        </div>
      )}

      {!isPopup && <AppVersionBadge />}

      {/* 문의하기 — 화면에 매이지 않는 FAB. 마이페이지·기관 관리 위에도 뜬다. */}
      {!isPopup && auth.token && (
        <InquiryFab token={auth.token} onToast={setToast} />
      )}

      {!isPopup && auth.token && (
        <MyPage
          isOpen={isMyPageOpen}
          initialSubView={isOrgAdmin(auth.user) ? 'org' : null}
          onClose={() => setIsMyPageOpen(false)}
          onLogout={() => void auth.logout()}
          // 변환 중이면 그 작업이 목록에 뜨도록 열려 있는 동안 목록을 갱신한다.
          isConverting={isConverting}
          token={auth.token}
          user={auth.user}
          onSelect={handleSelectJob}
          onToast={setToast}
        />
      )}
    </div>
  );
};

export default Semojum;
