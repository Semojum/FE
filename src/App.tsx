import React, {
  useState,
  useMemo,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
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
} from 'lucide-react';

// Hooks
import { useFileHandler } from './hooks/UseFileHandler';
import { useTranslationBlocks } from './hooks/UseTranslationBlocks';
import { useJobUpload } from './hooks/UseJobUpload.ts';
import { useJobStream } from './hooks/UseJobStream.ts';
import { useAuth } from './hooks/UseAuth';
import {
  BlockSaveState,
  PanelMode,
  SyncAction,
  SyncSnapshot,
  usePopupSync,
} from './hooks/UsePopupSync';
import { usePageStreamHandler } from './hooks/UsePageStreamHandler';
import { useSavedJobs } from './hooks/UseSavedJobs';
import { useOAuth } from './hooks/UseOAuth';

// Components
import FilePreviewer from './component/features/conversion/FilePreviewer';
import Pagination from './component/features/conversion/Pagination';
import BlockItem from './component/features/conversion/BlockItem';
import AuthModal from './component/features/auth/AuthModal';
import MyPageModal from './component/features/mypage/MyPageModal';

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
  TAB_ALLOWED_FILE_LABEL,
} from './utils/fileValidation';
import { checkForUpdates } from './utils/updater';
import { httpFetch } from './api/httpFetch';
import {
  createElement,
  deleteElement,
  patchElement,
  reorderElements,
  ElementType,
} from './api/JobService';

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
  // 이 탭 작업물의 서버 Job ID(블록 편집 저장 대상). 없으면 저장 불가.
  jobId: string | null;
  // 페이지별 변환 상태(BLOCKED 페이지 안내용)
  pageStatuses: Record<number, PageEventStatus>;
}

const BrailleMate: React.FC = () => {
  const isPopup = useMemo(
    () =>
      new URLSearchParams(window.location.search).get('panel') === 'output',
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
    insertBlockAt,
    replaceBlockId,
    reorderBlocks,
    resetAllBlocks,
  } = useTranslationBlocks();

  const auth = useAuth();
  const [isMyPageOpen, setIsMyPageOpen] = useState(false);

  // 블록 편집 저장(PATCH) 대상 Job ID. 라이브 업로드/마이페이지 복원/탭 복원 시 갱신된다.
  const [workingJobId, setWorkingJobId] = useState<string | null>(null);
  // 블록별 저장 상태(저장 중/실패). 성공하면 엔트리를 지운다.
  const [blockSaveStates, setBlockSaveStates] = useState<
    Record<string, BlockSaveState>
  >({});
  // 서버가 알고 있는 블록 내용(id → currentText). 변경 없으면 저장을 건너뛴다.
  // 여기 없는 id는 아직 서버에 요소가 없는 블록(추가 직후/생성 실패)이다.
  // (UUID는 전역 유일하므로 탭이 바뀌어도 그대로 둔다.)
  const serverContentRef = useRef<Record<string, string>>({});
  // 페이지별 변환 상태 — page_done/job_done의 BLOCKED 페이지를 안내하는 데 쓴다.
  const [pageStatuses, setPageStatuses] = useState<
    Record<number, PageEventStatus>
  >({});
  // 비동기 콜백에서 참조할 최신 블록 목록(state 미러)
  const blocksRef = useRef<Record<number, TranslationBlock[]>>({});
  // 서버 생성(POST) 진행 중인 블록 — blur가 겹쳐도 중복 생성되지 않게 막는다.
  const creatingRef = useRef<Set<string>>(new Set());
  // 순서 저장 디바운스 — 드래그 중 onReorder가 연속 발생해도 PATCH는 한 번만 보낸다.
  const orderTimerRef = useRef<number | undefined>(undefined);
  const pendingOrderRef = useRef<{ page: number; ids: string[] } | null>(null);

  // 탭별 작업물 보관소. 탭을 떠날 때 현재 상태를 저장하고, 돌아오면 복원한다.
  const [tabSnapshots, setTabSnapshots] = useState<
    Partial<Record<ConversionTab, TabState>>
  >({});
  // 이미 업로드한 File을 기억해 같은 파일이 (탭 복원 등으로) 다시 마운트돼도
  // 재업로드되지 않게 한다. (이전에는 jobId로 가드했지만, 탭 복원 시 jobId가 비므로 ref로 대체)
  const lastUploadedFileRef = useRef<File | null>(null);

  // 데스크톱 소셜 로그인(loopback): 시스템 브라우저로 로그인 → 127.0.0.1 redirect 수신 →
  // BE(/api/auth/{provider})와 code 교환. 성공 시 loginWithTokens로 세션 반영.
  const {
    startLogin: startOAuthLogin,
    isAuthorizing,
    error: oauthError,
  } = useOAuth(auth.loginWithTokens);

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
      pageStatuses,
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
      pageStatuses,
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
    setBlockSaveStates({});
    setPageStatuses({});
  }, [resetFile, resetAllBlocks, resetUpload]);

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

    // 1) 떠나는 탭의 작업물을 저장
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
      setBlockSaveStates({});
      setPageStatuses(saved.pageStatuses ?? {});
      // 복원된 파일은 이미 변환됐으므로 재업로드 트리거를 막는다.
      lastUploadedFileRef.current = saved.fileState.file;
    } else {
      clearWorkspace();
      lastUploadedFileRef.current = null;
    }

    setActiveTab(tab);
  };

  // OCR 결과를 점역 변환 입력으로 넘겨 자동 점역한다.
  // OCR 블록 텍스트를 페이지 순서대로 합쳐 .txt File을 만들고, 점역 탭으로 전환한 뒤
  // 입력으로 주입하면 자동 업로드 useEffect가 점역 변환(mode 'b')을 트리거한다.
  const handleSendOcrToBraille = () => {
    const text = Object.keys(blocksByPage)
      .map(Number)
      .sort((a, b) => a - b)
      .flatMap((p) => blocksByPage[p].map((b) => b.currentText))
      .filter((t) => t.trim().length > 0)
      .join('\n');
    if (!text.trim()) return;

    // 현재 OCR 탭 작업물을 저장해 두어 돌아와도 유지되게 한다.
    setTabSnapshots((prev) => ({ ...prev, [activeTab]: captureState() }));

    // 점역 탭으로 전환 + 화면 초기화 (이전 점역 작업물은 새 입력으로 대체)
    clearWorkspace();
    setTabSnapshots((prev) => ({ ...prev, [TABS.BRAILLE]: undefined }));
    setActiveTab(TABS.BRAILLE);

    // OCR 텍스트를 점역 입력 파일로 주입 → 자동 업로드가 점역 변환을 시작
    const file = new File([text], 'ocr-result.txt', { type: 'text/plain' });
    lastUploadedFileRef.current = null; // 새 파일이므로 업로드 허용
    handleFileDrop([file], TABS.BRAILLE);
  };

  // SSE로 받은 페이지 블록을 상태에 반영하면서, 서버가 알고 있는 내용(저장 기준값)도 기록
  const setBlocksForPageWithBaseline = useCallback(
    (page: number, blocks: TranslationBlock[]) => {
      blocks.forEach((b) => {
        serverContentRef.current[b.id] = b.currentText;
      });
      setBlocksForPage(page, blocks);
    },
    [setBlocksForPage],
  );

  const clearSaveState = useCallback((id: string) => {
    setBlockSaveStates((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  // 페이지의 최종 순서를 서버에 반영(PATCH .../elements/order).
  // 명세상 orderedElementIds는 "살아있는 요소 전체의 순열"이어야 하므로,
  // 아직 서버에 생성되지 않은 블록이 하나라도 있으면 보류한다(생성 후 다시 동기화된다).
  const syncOrder = useCallback(
    (page: number, ids: string[]) => {
      if (!workingJobId || !auth.token) return;
      if (ids.length < 2) return;
      if (ids.some((id) => !(id in serverContentRef.current))) return;
      reorderElements(workingJobId, page, elementType, ids, auth.token).catch(
        (e) => console.error('블록 순서 저장 실패', e),
      );
    },
    [workingJobId, auth.token, elementType],
  );

  // 드래그 중 onReorder가 연속으로 울리므로 마지막 순서만 한 번 저장한다.
  const scheduleOrderSync = useCallback(
    (page: number, ids: string[]) => {
      pendingOrderRef.current = { page, ids };
      window.clearTimeout(orderTimerRef.current);
      orderTimerRef.current = window.setTimeout(() => {
        const pending = pendingOrderRef.current;
        pendingOrderRef.current = null;
        if (pending) syncOrder(pending.page, pending.ids);
      }, 600);
    },
    [syncOrder],
  );

  useEffect(() => () => window.clearTimeout(orderTimerRef.current), []);

  // 생성(POST) 응답을 화면 블록에 반영한다. 응답이 오기 전에 그 블록이 삭제됐다면
  // 서버에만 남은 고아 요소가 되므로(이후 순서 저장이 JOB4006으로 실패) 곧바로 지운다.
  const adoptCreatedElement = useCallback(
    (page: number, tempId: string, createdId: string, text: string) => {
      const stillPresent = (blocksRef.current[page] || []).some(
        (b) => b.id === tempId,
      );
      if (!stillPresent) {
        if (workingJobId && auth.token) {
          deleteElement(
            workingJobId,
            page,
            createdId,
            elementType,
            auth.token,
          ).catch((e) => console.error('취소된 블록 정리 실패', e));
        }
        return false;
      }
      serverContentRef.current[createdId] = text;
      replaceBlockId(page, tempId, createdId);
      clearSaveState(tempId);
      return true;
    },
    [workingJobId, auth.token, elementType, replaceBlockId, clearSaveState],
  );

  // 블록 편집을 서버에 저장. 블록에서 포커스가 벗어나거나 초안을 선택할 때 호출된다.
  //  - 서버에 이미 있는 요소: 내용 교체(PATCH)
  //  - 아직 서버에 없는 블록(추가 직후 생성 실패 등): 생성(POST) 재시도
  const persistBlock = useCallback(
    (page: number, id: string, text: string) => {
      if (!workingJobId || !auth.token) return;

      if (id in serverContentRef.current) {
        if (serverContentRef.current[id] === text) return; // 변경 없음
        setBlockSaveStates((prev) => ({ ...prev, [id]: 'saving' }));
        patchElement(
          workingJobId,
          page,
          id,
          elementType,
          text.split('\n'),
          auth.token,
        )
          .then(() => {
            serverContentRef.current[id] = text;
            clearSaveState(id);
          })
          .catch((e) => {
            console.error('블록 저장 실패', e);
            setBlockSaveStates((prev) => ({ ...prev, [id]: 'error' }));
          });
        return;
      }

      // 서버에 없는 블록 → 생성(POST). 추가 시 생성이 실패했던 블록의 재시도 경로다.
      if (creatingRef.current.has(id)) return;
      const blocks = blocksRef.current[page] || [];
      const index = blocks.findIndex((b) => b.id === id);
      if (index === -1) return; // 이미 삭제된 블록
      const afterElementId =
        blocks
          .slice(0, index)
          .reverse()
          .find((b) => b.id in serverContentRef.current)?.id ?? null;

      creatingRef.current.add(id);
      setBlockSaveStates((prev) => ({ ...prev, [id]: 'saving' }));
      createElement(
        workingJobId,
        page,
        elementType,
        text.split('\n'),
        afterElementId,
        auth.token,
      )
        .then((created) => {
          if (!adoptCreatedElement(page, id, created.id, text)) return;
          // 삽입 위치가 로컬 순서와 어긋날 수 있으므로 최종 순서를 한 번 맞춘다.
          const ids = (blocksRef.current[page] || []).map((b) =>
            b.id === id ? created.id : b.id,
          );
          scheduleOrderSync(page, ids);
        })
        .catch((e) => {
          console.error('블록 추가 저장 실패', e);
          setBlockSaveStates((prev) => ({ ...prev, [id]: 'error' }));
        })
        .finally(() => {
          creatingRef.current.delete(id);
        });
    },
    [
      workingJobId,
      auth.token,
      elementType,
      clearSaveState,
      adoptCreatedElement,
      scheduleOrderSync,
    ],
  );

  // 블록 추가 — 화면에 먼저 빈 블록을 넣고(즉시 편집 가능) 서버에 생성(POST)한다.
  // 서버가 발급한 요소 ID로 교체해야 이후 수정/삭제/순서변경이 저장된다.
  const handleAddBlock = useCallback(
    (page: number, index: number) => {
      const tempId = addBlock(page, index);
      if (!workingJobId || !auth.token) return;

      // addBlock은 index 뒤에 삽입하므로, index 이하에서 가장 가까운 "서버에 있는" 블록 뒤.
      const blocks = blocksRef.current[page] || [];
      const afterElementId =
        blocks
          .slice(0, index + 1)
          .reverse()
          .find((b) => b.id in serverContentRef.current)?.id ?? null;

      creatingRef.current.add(tempId);
      setBlockSaveStates((prev) => ({ ...prev, [tempId]: 'saving' }));
      createElement(
        workingJobId,
        page,
        elementType,
        [''],
        afterElementId,
        auth.token,
      )
        .then((created) => {
          adoptCreatedElement(page, tempId, created.id, '');
        })
        .catch((e) => {
          // 실패해도 블록은 화면에 남긴다 — 내용을 쓰고 blur하면 persistBlock이 재시도한다.
          console.error('블록 추가 실패', e);
          setBlockSaveStates((prev) => ({ ...prev, [tempId]: 'error' }));
        })
        .finally(() => {
          creatingRef.current.delete(tempId);
        });
    },
    [addBlock, workingJobId, auth.token, elementType, adoptCreatedElement],
  );

  // 블록 삭제 — 화면에서 먼저 지우고 서버에 DELETE. 실패하면 원래 자리로 되돌려
  // 서버 상태와 어긋나지 않게 하고, 블록에 "삭제 실패" 재시도를 표시한다.
  const handleRemoveBlock = useCallback(
    (page: number, id: string) => {
      const blocks = blocksRef.current[page] || [];
      const index = blocks.findIndex((b) => b.id === id);
      const removed = index === -1 ? null : blocks[index];

      removeBlock(page, id);
      clearSaveState(id);

      if (!workingJobId || !auth.token) return;
      if (!(id in serverContentRef.current)) return; // 서버에 아직 없는 블록

      deleteElement(workingJobId, page, id, elementType, auth.token)
        .then(() => {
          delete serverContentRef.current[id];
        })
        .catch((e) => {
          console.error('블록 삭제 실패', e);
          if (removed) insertBlockAt(page, index, removed);
          setBlockSaveStates((prev) => ({ ...prev, [id]: 'delete-error' }));
        });
    },
    [
      removeBlock,
      clearSaveState,
      workingJobId,
      auth.token,
      elementType,
      insertBlockAt,
    ],
  );

  // 메인 측에서 직접 호출되는 액션 처리기. 팝업은 BroadcastChannel을 통해 메인에 위임.
  const applyAction = useCallback(
    (action: SyncAction) => {
      switch (action.type) {
        case 'updateBlock':
          updateBlock(action.page, action.id, action.text);
          break;
        case 'applyCandidate':
          applyCandidate(action.page, action.id, action.text);
          break;
        case 'removeBlock':
          handleRemoveBlock(action.page, action.id);
          break;
        case 'addBlock':
          handleAddBlock(action.page, action.index);
          break;
        case 'reorderBlocks':
          reorderBlocks(action.page, action.reordered);
          scheduleOrderSync(
            action.page,
            action.reordered.map((b) => b.id),
          );
          break;
        case 'setSelected':
          setSelectedBlockId(action.id);
          break;
        case 'setPage':
          setPage(action.page);
          break;
        case 'persistBlock':
          persistBlock(action.page, action.id, action.text);
          break;
        case 'reset':
          handleReset();
          break;
      }
    },
    [
      updateBlock,
      applyCandidate,
      handleRemoveBlock,
      handleAddBlock,
      reorderBlocks,
      scheduleOrderSync,
      setPage,
      persistBlock,
      handleReset,
    ],
  );

  useEffect(() => {
    if (isPopup) return;
    if (!fileState.file || isUploading) return;
    // 이미 업로드한 그 File이면(탭 복원 등으로 다시 마운트된 경우 포함) 재업로드하지 않는다.
    if (fileState.file === lastUploadedFileRef.current) return;
    lastUploadedFileRef.current = fileState.file;
    uploadFile(fileState.file, activeTab, auth.token);
  }, [isPopup, fileState.file, activeTab, uploadFile, isUploading, auth.token]);

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
      blockSaveStates,
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
      blockSaveStates,
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
      setBlockSaveStates(s.blockSaveStates ?? {});
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

  const handleJobLoaded = useCallback(
    (job: JobDetail) => {
      handleReset();
      setActiveTab(job.mode);
      setAllBlocks(job.blocksByPage);
      // 복원된 블록의 서버 기준값을 기록하고, 이 Job을 편집 저장 대상으로 등록한다.
      Object.values(job.blocksByPage).forEach((blocks) =>
        blocks.forEach((b) => {
          serverContentRef.current[b.id] = b.currentText;
        }),
      );
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
      setPage(1);
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

  // 데스크톱 앱: 시작 시 새 버전을 조용히 확인·설치(다음 실행 시 적용).
  // 웹/팝업/테스트 환경에서는 no-op(updater 유틸 내부에서 Tauri 여부를 가드).
  useEffect(() => {
    if (isPopup) return;
    checkForUpdates().catch((e) => console.warn('업데이트 확인 실패', e));
  }, [isPopup]);

  const handleDownload = () => {
    const allPages = Object.keys(blocksByPage)
      .map(Number)
      .sort((a, b) => a - b);
    if (allPages.length === 0) return;

    const content = allPages
      .map((page) => {
        const pageContent = blocksByPage[page]
          .map((b) => b.currentText)
          .join('\n\n');
        return activeTab === TABS.OCR
          ? `\n${pageContent}\n--- Page ${page} ---\n`
          : `\n${pageContent}`;
      })
      .join('\n\n\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const fileName =
      activeTab === TABS.BRAILLE
        ? `braille_result_${dateStr}.brf`
        : `result_${dateStr}.txt`;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const tabs = TAB_VALUES;

  // 인증 게이트 — 결과 전용 팝업이 아닌 메인 창에서는 로그인해야 앱을 쓸 수 있다.
  // 마운트 시 저장된 refreshToken으로 자동 로그인을 시도하고(auth.isInitializing),
  // 끝나면 로그인 여부에 따라 앱 또는 로그인 화면을 보여준다. (웹/데스크톱 공통)
  if (!isPopup && auth.isInitializing) {
    return (
      <div className="min-h-screen bg-[#F0F4F8] flex flex-col items-center justify-center gap-4 text-gray-500">
        <Loader2 className="animate-spin text-[#407FAC]" size={36} />
        <p className="text-sm font-medium">로그인 정보를 확인하는 중...</p>
      </div>
    );
  }

  if (!isPopup && !auth.isAuthenticated) {
    // AuthModal이 Figma 로그인/회원가입 디자인을 전체화면으로 렌더한다.
    return (
      <AuthModal
        isOpen
        dismissible={false}
        onClose={() => {}}
        onLogin={auth.login}
        onSignup={auth.signup}
        onOAuthLogin={startOAuthLogin}
        isAuthorizing={isAuthorizing}
        externalError={oauthError}
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
                  {auth.user?.name}
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
          <nav className="flex gap-12 border-b border-white/20 relative">
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
            className={
              panelMode === 'both'
                ? 'flex-1 min-w-0'
                : 'w-full'
            }
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
                      지원 형식: {TAB_ALLOWED_FILE_LABEL[activeTab]}
                    </p>
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
              panelMode === 'both'
                ? 'flex-1 md:flex-[1.4] min-w-0'
                : 'w-full'
            }
          >
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white rounded-[2.5rem] p-8 shadow-xl border border-white/10 h-[600px] flex flex-col"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-[#407FAC]">
                  점역/번역 결과
                </h2>
                {Object.keys(blocksByPage).length > 0 && (
                  <div className="flex items-center gap-2">
                    {!isPopup && activeTab === TABS.OCR && (
                      <button
                        onClick={handleSendOcrToBraille}
                        className="flex items-center gap-1.5 border border-[#407FAC] text-[#407FAC] px-3 py-1.5 rounded-lg hover:bg-[#407FAC]/10 transition-colors shadow-sm text-sm font-medium"
                        title="이 OCR 결과를 점역 변환 입력으로 보내 자동 점역합니다"
                      >
                        <ArrowRightCircle size={16} />{' '}
                        <span>점역으로 보내기</span>
                      </button>
                    )}
                    <button
                      onClick={handleDownload}
                      className="flex items-center gap-1.5 bg-[#407FAC] text-white px-3 py-1.5 rounded-lg hover:bg-[#356a91] transition-colors shadow-sm text-sm font-medium"
                    >
                      <Download size={16} /> <span>다운로드</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
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
                  <div className="h-full flex flex-col items-center justify-center space-y-4">
                    <Loader2 className="w-10 h-10 text-[#407FAC] animate-spin" />
                    <p className="font-medium text-gray-500">분석 중...</p>
                  </div>
                ) : currentBlocks.length > 0 ? (
                  <div className="pb-10">
                    <Reorder.Group
                      axis="y"
                      values={currentBlocks}
                      onReorder={(newOrder) =>
                        dispatchAction({
                          type: 'reorderBlocks',
                          page: currentPage,
                          reordered: newOrder,
                        })
                      }
                      className="flex flex-col gap-1"
                    >
                      {currentBlocks.map((block, index) => (
                        <BlockItem
                          key={block.id}
                          block={block}
                          index={index}
                          mode={activeTab}
                          isSelected={block.id === selectedBlockId}
                          onSelect={(id) =>
                            dispatchAction({ type: 'setSelected', id })
                          }
                          onUpdate={(id, text) =>
                            dispatchAction({
                              type: 'updateBlock',
                              page: currentPage,
                              id,
                              text,
                            })
                          }
                          onApplyCandidate={(id, text) =>
                            dispatchAction({
                              type: 'applyCandidate',
                              page: currentPage,
                              id,
                              text,
                            })
                          }
                          saveState={blockSaveStates[block.id]}
                          onPersist={(id, text) =>
                            dispatchAction({
                              type: 'persistBlock',
                              page: currentPage,
                              id,
                              text,
                            })
                          }
                          onRemove={(id) =>
                            dispatchAction({
                              type: 'removeBlock',
                              page: currentPage,
                              id,
                            })
                          }
                          onAdd={(idx) =>
                            dispatchAction({
                              type: 'addBlock',
                              page: currentPage,
                              index: idx,
                            })
                          }
                        />
                      ))}
                    </Reorder.Group>
                  </div>
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
                onPageChange={(page) =>
                  dispatchAction({ type: 'setPage', page })
                }
              />
            </motion.div>
        </AnimatePresence>
      </main>

      {!isPopup && auth.token && (
        <MyPageModal
          isOpen={isMyPageOpen}
          onClose={() => setIsMyPageOpen(false)}
          token={auth.token}
          user={auth.user}
          onSelect={handleSelectJob}
        />
      )}
    </div>
  );
};

export default BrailleMate;
