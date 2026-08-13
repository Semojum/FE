import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  createFolder,
  deleteFolder,
  toggleFolderFavorite,
  updateFolder,
} from '../../../api/FolderService';
import {
  moveJobs,
  renameJob,
  toggleJobFavorite,
  trashJobs,
  downloadJobResult,
} from '../../../api/JobService';
import { toUserMessage } from '../../../api/errorMessages';
import { saveBlob } from '../../../utils/download';
import { useMyPage } from '../../../hooks/UseMyPage';
import { useCardSelection } from '../../../hooks/UseCardSelection';
import {
  FileCard,
  FolderSummary,
  isInProgress,
  JobStatus,
} from '../../../types/mypage';
import { JobMode } from '../../../types/apiTypes';
import { JobRef, User } from '../../../types/auth';
import { DetailList, PreviewPane } from './DetailView';
import ContextMenu, { MenuItem } from '../../shared/ContextMenu';
import TrashView from './TrashView';
import {
  DeleteConfirmModal,
  locationLabelOf,
  MoveToFolderModal,
  NewFolderModal,
  RenameModal,
} from './MyPageModals';

// Figma V3-05 마이페이지 (S1 메인 · S2 폴더 내부 · S7 검색 결과 · S8 휴지통 · S9 최근 작업 전체)

interface Props {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  user?: User | null;
  onSelect: (job: JobRef) => void;
  onToast: (message: string) => void;
}

// 카드 하나를 가리키는 대상 — 이름 변경·이동·삭제는 항상 카드가 대상이다.
type CardTarget =
  | { kind: 'folder'; folder: FolderSummary; x: number; y: number }
  | { kind: 'file'; file: FileCard; x: number; y: number };

// 우클릭 메뉴는 카드가 아닌 빈 곳에서도 열린다(지금 위치에 새 폴더).
type MenuTarget = CardTarget | { kind: 'blank'; x: number; y: number };

// 끌고 있는 것 — 파일 여러 건(다중 선택)이거나 폴더 한 건.
interface DragPayload {
  jobIds: string[];
  folderIds: string[];
}

const STATUS_OPTIONS: { value: JobStatus; label: string }[] = [
  { value: 'COMPLETED', label: '완료' },
  { value: 'IN_PROGRESS', label: '변환 중' },
  { value: 'FAILED', label: '실패' },
];

const MODE_OPTIONS: { value: JobMode; label: string }[] = [
  { value: 'a', label: '초안 생성' },
  { value: 'b', label: '텍스트 점자 번역' },
  { value: 'c', label: '이미지 점자 번역' },
];

const MyPage: React.FC<Props> = ({
  isOpen,
  onClose,
  token,
  user,
  onSelect,
  onToast,
}) => {
  const mp = useMyPage({ token, isOpen, onError: onToast });
  const {
    view,
    setView,
    folderId,
    breadcrumb,
    search,
    setSearch,
    sort,
    setSort,
    statusFilter,
    setStatusFilter,
    modeFilter,
    setModeFilter,
    favoriteOnly,
    setFavoriteOnly,
    folders,
    files,
    tree,
    isLoading,
    isLoadingMore,
    hasMore,
    loadMore,
    reload,
    openFolder,
    goToCrumb,
    goRoot,
  } = mp;

  const fileIds = useMemo(() => files.map((f) => f.jobId), [files]);
  const selection = useCardSelection(fileIds, isOpen && view !== 'trash');

  const [menu, setMenu] = useState<MenuTarget | null>(null);
  const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<CardTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CardTarget | null>(null);
  // 이동 대상: 메뉴에서 고른 한 건이거나, 툴바에서 고른 다중 선택 파일들
  const [moveTarget, setMoveTarget] = useState<CardTarget | 'selection' | null>(
    null,
  );
  // 끌고 있는 대상과, 지금 올라가 있는 드롭 대상 폴더(null이면 없음).
  // dataTransfer는 dragover 중에 값을 읽을 수 없어(브라우저 제약) ref로 들고 있는다.
  const dragRef = useRef<DragPayload | null>(null);
  const [dropFolderId, setDropFolderId] = useState<string | null>(null);
  // 오른쪽 미리보기에 띄운 파일 — 목록에서 한 줄을 누르면 바뀐다.
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  // 검색어는 입력할 때마다 요청하지 않고 잠깐 기다렸다 반영한다.
  const [searchInput, setSearchInput] = useState(search);
  useEffect(() => setSearchInput(search), [search]);
  useEffect(() => {
    const id = window.setTimeout(() => setSearch(searchInput), 300);
    return () => window.clearTimeout(id);
  }, [searchInput, setSearch]);

  // 무한 스크롤 — 바닥 근처에 닿으면 다음 30개를 이어 붙인다.
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !hasMore || isLoadingMore) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 240) void loadMore();
  }, [hasMore, isLoadingMore, loadMore]);

  const run = useCallback(
    async (fn: () => Promise<unknown>, fallback: string) => {
      try {
        await fn();
        reload();
      } catch (err) {
        onToast(toUserMessage(err, fallback));
        throw err;
      }
    },
    [reload, onToast],
  );

  // ─── 동작 ──────────────────────────────────────────────────────────

  const handleOpenFile = useCallback(
    (file: FileCard) => {
      if (isInProgress(file.status)) {
        onToast('변환이 끝나면 열 수 있습니다.');
        return;
      }
      if (file.status === 'FAILED') {
        onToast('변환에 실패한 작업입니다. 파일을 다시 올려 주세요.');
        return;
      }
      onSelect({
        jobId: file.jobId,
        mode: file.mode,
        totalPages: file.totalPages,
        thumbnailUrl: file.thumbnailUrl,
        startPage: file.lastEditedPage ?? 1,
      });
    },
    [onSelect, onToast],
  );

  const handleDownloadFile = useCallback(
    async (file: FileCard) => {
      try {
        const { blob, fileName } = await downloadJobResult(
          file.jobId,
          undefined,
          token,
        );
        const saved = await saveBlob(blob, fileName ?? file.originalFileName);
        if (saved) onToast(`저장했습니다 — ${saved}`);
      } catch (err) {
        onToast(toUserMessage(err, '다운로드하지 못했습니다.'));
      }
    },
    [token, onToast],
  );

  // ─── 끌어 옮기기 ────────────────────────────────────────────────────
  // 파일·폴더를 폴더 카드 위로 끌어다 놓으면 그 폴더로 옮긴다.
  // 파일이 다중 선택돼 있고 그중 하나를 끌면 선택한 것 전부가 함께 간다.

  const startDragFile = (file: FileCard) => {
    const ids = selection.selected.has(file.jobId)
      ? [...selection.selected]
      : [file.jobId];
    dragRef.current = { jobIds: ids, folderIds: [] };
  };

  const startDragFolder = (folder: FolderSummary) => {
    dragRef.current = { jobIds: [], folderIds: [folder.folderId] };
  };

  const endDrag = () => {
    dragRef.current = null;
    setDropFolderId(null);
  };

  const dropInto = (targetFolderId: string | null) => {
    const payload = dragRef.current;
    endDrag();
    if (!payload) return;
    // 폴더를 자기 자신 안에 넣을 수는 없다. (더 깊은 순환은 서버가 막는다)
    if (targetFolderId && payload.folderIds.includes(targetFolderId)) return;
    if (payload.jobIds.length === 0 && payload.folderIds.length === 0) return;
    // 이미 그 폴더 안에 있는 것을 같은 폴더로 끌면 아무 일도 하지 않는다.
    if (targetFolderId === folderId && payload.folderIds.length === 0) return;

    void run(async () => {
      if (payload.jobIds.length > 0) {
        await moveJobs(payload.jobIds, targetFolderId, token);
      }
      for (const id of payload.folderIds) {
        await updateFolder(id, { parentFolderId: targetFolderId }, token);
      }
      selection.clear();
    }, '옮기지 못했습니다.').catch(() => undefined);
  };

  const menuItemsFor = (target: MenuTarget): MenuItem[] => {
    if (target.kind === 'blank') {
      return [{ label: '새 폴더', onSelect: () => setIsNewFolderOpen(true) }];
    }
    if (target.kind === 'folder') {
      const f = target.folder;
      return [
        { label: '열기', onSelect: () => openFolder(f.folderId, f.name) },
        { label: '이름 변경', onSelect: () => setRenameTarget(target) },
        { label: '폴더로 이동', onSelect: () => setMoveTarget(target) },
        {
          label: '삭제',
          danger: true,
          onSelect: () => setDeleteTarget(target),
        },
      ];
    }
    const file = target.file;
    // 생성 중 파일은 이동·이름 변경·삭제·다운로드가 모두 막힌다(BE도 JOB4010으로 검증).
    const busy = isInProgress(file.status);
    const busyTitle = busy ? '변환이 끝난 뒤에 할 수 있습니다' : undefined;
    return [
      { label: '열기', onSelect: () => handleOpenFile(file) },
      {
        label: '이름 변경',
        disabled: busy,
        title: busyTitle,
        onSelect: () => setRenameTarget(target),
      },
      {
        label: '폴더로 이동',
        disabled: busy,
        title: busyTitle,
        onSelect: () => setMoveTarget(target),
      },
      {
        label: '다운로드',
        disabled: busy || file.status !== 'COMPLETED',
        title: busyTitle,
        onSelect: () => void handleDownloadFile(file),
      },
      {
        label: '삭제',
        danger: true,
        disabled: busy,
        title: busyTitle,
        onSelect: () => setDeleteTarget(target),
      },
    ];
  };

  const selectedCount = selection.selected.size;
  const crumbNames = breadcrumb.map((c) => c.name);

  // ─── 렌더 ──────────────────────────────────────────────────────────

  if (!isOpen) return null;

  const showRecentRow =
    view === 'browse' && !folderId && !search.trim() && files.length > 0;
  const showLocation = view === 'recent' || !!search.trim();
  // '최근 작업 전체'(S9)는 작업만 나열한다. 전역 조회 응답에는 폴더도 실려 오므로
  // 화면에서 걸러 준다 (QA 2026-08-09).
  const visibleFolders = view === 'recent' ? [] : folders;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-[#f8f9fa]">
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col">
        {/* 헤더 */}
        <div className="flex items-end justify-between px-6 pt-8">
          <div className="flex items-end gap-4">
            <button
              onClick={onClose}
              className="mb-1 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-200/70 hover:text-[#5b8ce6]"
              aria-label="닫기"
            >
              <ArrowLeft size={18} />
              <span>돌아가기</span>
            </button>
            <h3 className="border-b-2 border-[#5b8ce6] pb-2 text-lg font-bold tracking-[0.18px] text-[#5b8ce6]">
              마이페이지
            </h3>
          </div>
          {user?.loginId && (
            <span className="hidden pb-2 text-sm text-gray-500 sm:inline">
              {user.loginId}
            </span>
          )}
        </div>
        <div className="mx-6 border-b border-gray-200" />

        {view === 'trash' ? (
          <div className="custom-scrollbar flex-1 overflow-y-auto">
            <TrashView
              token={token}
              onBack={() => setView('browse')}
              onError={onToast}
              onChanged={reload}
            />
          </div>
        ) : (
          <>
            {/* 툴바 */}
            <div className="flex items-center gap-2 px-6 py-4">
              <div className="relative flex-1 max-w-[300px]">
                <Search
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="검색"
                  aria-label="작업 검색"
                  className="h-[38px] w-full rounded-[10px] border border-gray-200 bg-white pl-9 pr-8 text-sm outline-none transition-colors focus:border-[#5b8ce6]"
                />
                {searchInput && (
                  <button
                    type="button"
                    onClick={() => setSearchInput('')}
                    aria-label="검색어 지우기"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-600"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* 정렬 */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setIsSortOpen((v) => !v);
                    setIsFilterOpen(false);
                  }}
                  className="h-[38px] rounded-[10px] border border-gray-200 bg-white px-3 text-sm text-gray-600 transition-colors hover:border-[#5b8ce6]/50"
                >
                  {sort === 'latest' ? '최신순' : '오래된순'} ▾
                </button>
                {isSortOpen && (
                  <div className="absolute left-0 top-[42px] z-20 w-[120px] overflow-hidden rounded-[10px] border border-gray-100 bg-white py-1 shadow-xl">
                    {(['latest', 'oldest'] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => {
                          setSort(s);
                          setIsSortOpen(false);
                        }}
                        className={`block w-full px-4 py-1.5 text-left text-[13px] transition-colors hover:bg-[#eef3fc] ${
                          sort === s
                            ? 'font-semibold text-[#5b8ce6]'
                            : 'text-gray-700'
                        }`}
                      >
                        {s === 'latest' ? '최신순' : '오래된순'}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 통합 필터 (상태 · 모드 · 즐겨찾기) */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setIsFilterOpen((v) => !v);
                    setIsSortOpen(false);
                  }}
                  className="h-[38px] rounded-[10px] border border-gray-200 bg-white px-3 text-sm text-gray-600 transition-colors hover:border-[#5b8ce6]/50"
                >
                  {statusFilter.length +
                    modeFilter.length +
                    (favoriteOnly ? 1 : 0) >
                  0
                    ? '필터 적용됨'
                    : '전체'}{' '}
                  ▾
                </button>
                {isFilterOpen && (
                  <div className="absolute left-0 top-[42px] z-20 w-[190px] rounded-[10px] border border-gray-100 bg-white p-3 shadow-xl">
                    <p className="mb-1.5 text-[11px] font-semibold text-gray-400">
                      상태
                    </p>
                    {STATUS_OPTIONS.map((o) => (
                      <label
                        key={o.value}
                        className="flex cursor-pointer items-center gap-2 py-0.5 text-[13px] text-gray-700"
                      >
                        <input
                          type="checkbox"
                          checked={statusFilter.includes(o.value)}
                          onChange={(e) =>
                            setStatusFilter(
                              e.target.checked
                                ? [...statusFilter, o.value]
                                : statusFilter.filter((v) => v !== o.value),
                            )
                          }
                        />
                        {o.label}
                      </label>
                    ))}
                    <p className="mb-1.5 mt-3 text-[11px] font-semibold text-gray-400">
                      작업 종류
                    </p>
                    {MODE_OPTIONS.map((o) => (
                      <label
                        key={o.value}
                        className="flex cursor-pointer items-center gap-2 py-0.5 text-[13px] text-gray-700"
                      >
                        <input
                          type="checkbox"
                          checked={modeFilter.includes(o.value)}
                          onChange={(e) =>
                            setModeFilter(
                              e.target.checked
                                ? [...modeFilter, o.value]
                                : modeFilter.filter((v) => v !== o.value),
                            )
                          }
                        />
                        {o.label}
                      </label>
                    ))}
                    <label className="mt-3 flex cursor-pointer items-center gap-2 border-t border-gray-100 pt-2 text-[13px] text-gray-700">
                      <input
                        type="checkbox"
                        checked={favoriteOnly}
                        onChange={(e) => setFavoriteOnly(e.target.checked)}
                      />
                      즐겨찾기만
                    </label>
                  </div>
                )}
              </div>

              <div className="ml-auto flex items-center gap-2">
                {selectedCount > 0 ? (
                  // 파일을 여러 개 고르면 툴바 오른쪽이 이동·삭제로 바뀐다.
                  <>
                    <span className="text-sm font-semibold text-[#5b8ce6]">
                      {selectedCount}개 선택
                    </span>
                    <button
                      type="button"
                      onClick={() => setMoveTarget('selection')}
                      className="h-[38px] rounded-[10px] border border-[#5b8ce6] bg-white px-4 text-sm font-semibold text-[#5b8ce6] transition-colors hover:bg-[#eef3fc]"
                    >
                      폴더로 이동
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void run(
                          () => trashJobs([...selection.selected], token),
                          '삭제하지 못했습니다.',
                        )
                          .then(selection.clear)
                          .catch(() => undefined)
                      }
                      className="h-[38px] rounded-[10px] border border-[#5b8ce6] bg-white px-4 text-sm font-semibold text-[#5b8ce6] transition-colors hover:bg-[#eef3fc]"
                    >
                      삭제
                    </button>
                    <button
                      type="button"
                      onClick={selection.clear}
                      aria-label="선택 해제"
                      className="flex size-[38px] items-center justify-center rounded-[10px] border border-gray-200 bg-white text-gray-500 transition-colors hover:text-gray-700"
                    >
                      <X size={16} />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setView('trash')}
                      aria-label="휴지통"
                      title="휴지통"
                      className="flex size-[38px] items-center justify-center rounded-[10px] border border-gray-200 bg-white text-gray-500 transition-colors hover:text-[#5b8ce6]"
                    >
                      <Trash2 size={16} />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* 브레드크럼 (S2) */}
            {view === 'browse' && folderId && !search.trim() && (
              <div className="flex items-center gap-1.5 px-6 pb-3 text-sm">
                <button
                  type="button"
                  onClick={() => goToCrumb(breadcrumb.length - 2)}
                  aria-label="상위 폴더로"
                  className="mr-1 flex size-7 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition-colors hover:text-[#5b8ce6]"
                >
                  <ChevronLeft size={15} />
                </button>
                <button
                  type="button"
                  onClick={goRoot}
                  className="text-gray-500 transition-colors hover:text-[#5b8ce6]"
                >
                  전체
                </button>
                {breadcrumb.map((c, i) => (
                  <React.Fragment key={c.folderId ?? i}>
                    <ChevronRight size={14} className="text-gray-300" />
                    <button
                      type="button"
                      onClick={() => goToCrumb(i)}
                      className={
                        i === breadcrumb.length - 1
                          ? 'font-bold text-gray-800'
                          : 'text-gray-500 transition-colors hover:text-[#5b8ce6]'
                      }
                    >
                      {c.name}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            )}

            {/* 최근 작업 전체(S9) 헤더 */}
            {view === 'recent' && (
              <div className="flex items-center gap-3 px-6 pb-3">
                <button
                  type="button"
                  onClick={goRoot}
                  aria-label="뒤로"
                  className="flex size-7 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition-colors hover:text-[#5b8ce6]"
                >
                  <ChevronLeft size={15} />
                </button>
                <h4 className="text-sm font-bold text-gray-800">
                  최근 작업 전체
                </h4>
              </div>
            )}

            {/* 검색 결과 건수 (S7) */}
            {search.trim() && !isLoading && (
              <p className="px-6 pb-2 text-sm text-gray-500">
                검색 결과 {folders.length + files.length}건 — 폴더{' '}
                {folders.length} · 작업 {files.length}
              </p>
            )}

            {/* 본문 — 왼쪽 목록 · 오른쪽 미리보기 */}
            <div className="flex min-h-0 flex-1">
              <div
                ref={scrollRef}
                onScroll={onScroll}
                onClick={(e) => {
                  // 빈 곳을 클릭하면 선택이 풀린다.
                  if (e.target === e.currentTarget) selection.clear();
                }}
                // 빈 곳 우클릭 — 지금 위치에 새 폴더를 만든다.
                // 카드 위 우클릭은 카드가 stopPropagation으로 막아 여기까지 오지 않는다.
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ kind: 'blank', x: e.clientX, y: e.clientY });
                }}
                // 빈 곳에 떨어뜨리면 지금 보고 있는 폴더(루트면 전체)로 옮긴다.
                onDragOver={(e) => {
                  if (dragRef.current) e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  dropInto(folderId);
                }}
                className="custom-scrollbar min-w-0 flex-1 overflow-y-auto px-6 pb-10"
              >
                {isLoading ? (
                  <div className="flex flex-col items-center gap-2 py-24 text-gray-400">
                    <Loader2 className="animate-spin" size={30} />
                    <p className="text-sm">불러오는 중...</p>
                  </div>
                ) : visibleFolders.length === 0 && files.length === 0 ? (
                  <p className="py-24 text-center text-sm text-gray-400">
                    {search.trim()
                      ? '검색 결과가 없습니다'
                      : folderId
                        ? '폴더가 비어 있습니다'
                        : '저장된 작업이 없습니다'}
                  </p>
                ) : (
                  <>
                    {/* 최근 작업 바로가기 — 메인(S1)에만 있다 */}
                    {showRecentRow && (
                      <div className="mb-2 flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => setView('recent')}
                          className="text-[12px] font-semibold text-[#f47726] transition-opacity hover:opacity-80"
                        >
                          최근 작업 전체 보기 ›
                        </button>
                      </div>
                    )}

                    {/* 자세히 보기 — 이름·모드·작성일 */}
                    <DetailList
                      folders={visibleFolders}
                      files={files}
                      selectedIds={selection.selected}
                      previewId={previewId}
                      showLocation={showLocation}
                      dropFolderId={dropFolderId}
                      onOpenFolder={(f) => openFolder(f.folderId, f.name)}
                      onOpenFile={handleOpenFile}
                      onClickFile={(f, e) => {
                        setPreviewId(f.jobId);
                        selection.handleClick(f.jobId, e);
                      }}
                      onClickFolder={() => {
                        setPreviewId(null);
                        selection.clear();
                      }}
                      onToggleFolderFavorite={(f) =>
                        void run(
                          () => toggleFolderFavorite(f.folderId, token),
                          '즐겨찾기를 바꾸지 못했습니다.',
                        ).catch(() => undefined)
                      }
                      onToggleFileFavorite={(f) =>
                        void run(
                          () => toggleJobFavorite(f.jobId, token),
                          '즐겨찾기를 바꾸지 못했습니다.',
                        ).catch(() => undefined)
                      }
                      onFolderMenu={(folder, x, y) =>
                        setMenu({ kind: 'folder', folder, x, y })
                      }
                      onFileMenu={(file, x, y) =>
                        setMenu({ kind: 'file', file, x, y })
                      }
                      onDragStartFolder={startDragFolder}
                      onDragStartFile={startDragFile}
                      onDragEnd={endDrag}
                      onDragEnterFolder={setDropFolderId}
                      onDragLeaveFolder={(id) =>
                        setDropFolderId((cur) => (cur === id ? null : cur))
                      }
                      onDropOnFolder={dropInto}
                    />

                    {isLoadingMore && (
                      <div className="flex justify-center py-6 text-gray-400">
                        <Loader2 className="animate-spin" size={20} />
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* 오른쪽 미리보기 — 목록에서 고른 파일 한 건 */}
              <aside className="hidden w-[260px] shrink-0 border-l border-gray-200 bg-white lg:block">
                <PreviewPane
                  file={files.find((f) => f.jobId === previewId) ?? null}
                  onOpen={handleOpenFile}
                  onDownload={(f) => void handleDownloadFile(f)}
                />
              </aside>
            </div>
          </>
        )}
      </div>

      {/* 우클릭 · ⋯ 메뉴 */}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItemsFor(menu)}
          onClose={() => setMenu(null)}
        />
      )}

      {/* S3 새 폴더 */}
      <NewFolderModal
        isOpen={isNewFolderOpen}
        locationLabel={locationLabelOf(crumbNames)}
        onClose={() => setIsNewFolderOpen(false)}
        onCreate={(name) =>
          run(
            () => createFolder(name, folderId, token),
            '폴더를 만들지 못했습니다.',
          )
        }
      />

      {/* S5 이름 변경 */}
      <RenameModal
        isOpen={!!renameTarget}
        kind={renameTarget?.kind ?? 'file'}
        currentName={
          renameTarget?.kind === 'folder'
            ? renameTarget.folder.name
            : (renameTarget?.file.originalFileName ?? '')
        }
        onClose={() => setRenameTarget(null)}
        onRename={(name) => {
          const t = renameTarget;
          if (!t) return Promise.resolve();
          return run(
            () =>
              t.kind === 'folder'
                ? updateFolder(t.folder.folderId, { name }, token)
                : renameJob(t.file.jobId, name, token),
            '이름을 바꾸지 못했습니다.',
          );
        }}
      />

      {/* S4 폴더로 이동 */}
      <MoveToFolderModal
        isOpen={!!moveTarget}
        tree={tree}
        excludeFolderId={
          moveTarget &&
          moveTarget !== 'selection' &&
          moveTarget.kind === 'folder'
            ? moveTarget.folder.folderId
            : null
        }
        itemCountLabel={
          moveTarget === 'selection'
            ? `${selectedCount}개`
            : moveTarget?.kind === 'folder'
              ? moveTarget.folder.name
              : (moveTarget?.file.originalFileName ?? '')
        }
        onClose={() => setMoveTarget(null)}
        onMove={(target) => {
          const t = moveTarget;
          if (!t) return Promise.resolve();
          if (t === 'selection') {
            return run(
              () => moveJobs([...selection.selected], target, token),
              '이동하지 못했습니다.',
            ).then(selection.clear);
          }
          return run(
            () =>
              t.kind === 'folder'
                ? updateFolder(
                    t.folder.folderId,
                    { parentFolderId: target },
                    token,
                  )
                : moveJobs([t.file.jobId], target, token),
            '이동하지 못했습니다.',
          );
        }}
        onCreateFolder={(name, parentFolderId) =>
          run(
            () => createFolder(name, parentFolderId, token),
            '폴더를 만들지 못했습니다.',
          )
        }
      />

      {/* S6 삭제 확인 */}
      <DeleteConfirmModal
        isOpen={!!deleteTarget}
        kind={deleteTarget?.kind ?? 'file'}
        targetLabel={
          deleteTarget?.kind === 'folder'
            ? deleteTarget.folder.name
            : (deleteTarget?.file.originalFileName ?? '')
        }
        onClose={() => setDeleteTarget(null)}
        onDelete={() => {
          const t = deleteTarget;
          if (!t) return Promise.resolve();
          return run(
            () =>
              t.kind === 'folder'
                ? deleteFolder(t.folder.folderId, token)
                : trashJobs([t.file.jobId], token),
            '삭제하지 못했습니다.',
          );
        }}
      />
    </div>
  );
};

export default MyPage;
