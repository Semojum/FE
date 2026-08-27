import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getFolderContents, getFolderTree } from '../api/FolderService';
import { logDiag } from '../utils/diagLog';
import {
  listActiveJobs,
  listJobs,
  listRecentJobs,
} from '../api/HistoryService';
import { toUserMessage } from '../api/errorMessages';
import {
  FileCard,
  FolderSummary,
  FolderTreeNode,
  isInProgress,
  JobStatus,
  ListQuery,
  PAGE_SIZE,
  RECENT_STRIP_SIZE,
} from '../types/mypage';
import { JobMode } from '../types/apiTypes';

// 마이페이지 화면 상태 (기능정의서 3-2 화면 구성)
//  browse : S1 마이페이지 메인 / S2 폴더 내부 / S7 검색 결과 — 조회 경로만 다르고 화면은 같다
//  recent : S9 최근 작업 전체 (위치와 함께 전역 최신순)
//  trash  : S8 휴지통
export type MyPageView = 'browse' | 'recent' | 'trash';

export interface Breadcrumb {
  folderId: string | null;
  name: string;
}

// 생성 중 카드가 있는 동안의 목록 갱신 주기 (D-9).
const POLL_INTERVAL_MS = 10_000;

// 진행률만 따로, 더 자주 맞춘다. 목록 응답의 progress는 뒤늦게 따라와 변환 내내 0에
// 머무는 반면(2026-08-17 실측: 목록 0 · /active 50), /api/users/jobs/active는 지금 값을 준다.
const PROGRESS_POLL_INTERVAL_MS = 3_000;

// 진행 중 작업의 진행률을 목록 카드에 얹는다. 바뀐 게 없으면 같은 배열을 그대로
// 돌려줘 헛렌더를 막는다.
const withLiveProgress = (
  list: FileCard[],
  progressById: Map<string, number>,
): FileCard[] => {
  let changed = false;
  const next = list.map((f) => {
    const progress = progressById.get(f.jobId);
    if (progress == null || progress === f.progress) return f;
    changed = true;
    return { ...f, progress };
  });
  return changed ? next : list;
};

// 폴더 트리에서 folderId까지의 경로를 찾는다. 브레드크럼은 별도 API가 없어
// 트리에서 계산한다(폴더는 계정당 200개라 트리 한 번이면 충분하다).
const findPath = (
  nodes: FolderTreeNode[],
  folderId: string,
  acc: Breadcrumb[] = [],
): Breadcrumb[] | null => {
  for (const node of nodes) {
    const next = [...acc, { folderId: node.folderId, name: node.name }];
    if (node.folderId === folderId) return next;
    const found = findPath(node.children ?? [], folderId, next);
    if (found) return found;
  }
  return null;
};

export const flattenTree = (
  nodes: FolderTreeNode[],
  depth = 0,
): { node: FolderTreeNode; depth: number }[] =>
  nodes.flatMap((n) => [
    { node: n, depth },
    ...flattenTree(n.children ?? [], depth + 1),
  ]);

interface UseMyPageOptions {
  token: string | null;
  isOpen: boolean;
  // 지금 에디터에서 변환이 돌고 있는지 — 그 작업이 목록에 뜨도록 열려 있는 동안 갱신한다.
  isConverting?: boolean;
  onError?: (message: string) => void;
}

export const useMyPage = ({
  token,
  isOpen,
  isConverting,
  onError,
}: UseMyPageOptions) => {
  const [view, setView] = useState<MyPageView>('browse');
  const [folderId, setFolderId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'latest' | 'oldest'>('latest');
  const [statusFilter, setStatusFilter] = useState<JobStatus[]>([]);
  const [modeFilter, setModeFilter] = useState<JobMode[]>([]);
  const [favoriteOnly, setFavoriteOnly] = useState(false);

  const [folders, setFolders] = useState<FolderSummary[]>([]);
  const [files, setFiles] = useState<FileCard[]>([]);
  // 첫 화면 위쪽 '최근 작업' 스트립 — 아래 목록과 별개로 전역 최신순 몇 건만 들고 있다.
  const [recent, setRecent] = useState<FileCard[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const [tree, setTree] = useState<FolderTreeNode[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<Breadcrumb[]>([]);

  // 목록을 다시 불러오게 만드는 신호. 생성·이동·삭제 후 증가시킨다.
  //
  // silent=true면 "불러오는 중..." 자리 표시를 띄우지 않고 조용히 갈아 끼운다.
  // 변환 중 10초 폴링처럼 사용자가 시키지 않은 갱신에서 목록이 통째로 사라졌다
  // 다시 나타나면 화면이 계속 리프레시되는 것처럼 보인다(2026-08-20 QA).
  const [reloadToken, setReloadToken] = useState({ n: 0, silent: false });
  const reload = useCallback(
    (opts?: { silent?: boolean }) =>
      setReloadToken((prev) => ({ n: prev.n + 1, silent: !!opts?.silent })),
    [],
  );

  const reportError = useCallback(
    (err: unknown, fallback: string) => {
      const message = toUserMessage(err, fallback);
      if (onError) onError(message);
      else logDiag('마이페이지', message, err);
    },
    [onError],
  );

  const query = useMemo<ListQuery>(
    () => ({
      search: search.trim() || undefined,
      status: statusFilter.length ? statusFilter : undefined,
      mode: modeFilter.length ? modeFilter : undefined,
      favorite: favoriteOnly || undefined,
      sort,
      size: PAGE_SIZE,
    }),
    [search, statusFilter, modeFilter, favoriteOnly, sort],
  );

  // 검색어가 있으면 위치와 무관한 전역 검색(S7), 없으면 현재 위치 조회(S1/S2).
  // S9(최근 작업 전체)도 전역 경로를 쓴다.
  const isGlobalScope = view === 'recent' || !!search.trim();

  const fetchPage = useCallback(
    async (cursor: string | null) => {
      if (!token) return null;
      const q: ListQuery = { ...query, cursor };
      return isGlobalScope
        ? listJobs(token, q)
        : getFolderContents(folderId, q, token);
    },
    [token, query, isGlobalScope, folderId],
  );

  // ─── 목록 로드 ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen || !token || view === 'trash') return;
    let cancelled = false;
    // 조용한 갱신은 이미 그려진 목록을 그대로 둔 채 값만 바꿔 끼운다.
    const silent = reloadToken.silent;
    if (!silent) setIsLoading(true);
    fetchPage(null)
      .then((res) => {
        if (cancelled || !res) return;
        setFolders(res.folders ?? []);
        setFiles(res.files?.items ?? []);
        setNextCursor(res.files?.nextCursor ?? null);
        setHasMore(res.files?.hasMore ?? false);
      })
      .catch((err) => {
        // 조용한 갱신은 실패도 조용히 넘긴다 — 10초마다 토스트가 뜨면 더 시끄럽다.
        if (!cancelled && !silent)
          reportError(err, '목록을 불러오지 못했습니다.');
      })
      .finally(() => {
        if (!cancelled && !silent) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, token, view, fetchPage, reloadToken, reportError]);

  const loadMore = useCallback(async () => {
    if (!hasMore || isLoadingMore || !nextCursor) return;
    setIsLoadingMore(true);
    try {
      const res = await fetchPage(nextCursor);
      if (!res) return;
      setFiles((prev) => [...prev, ...(res.files?.items ?? [])]);
      setNextCursor(res.files?.nextCursor ?? null);
      setHasMore(res.files?.hasMore ?? false);
    } catch (err) {
      reportError(err, '목록을 더 불러오지 못했습니다.');
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMore, isLoadingMore, nextCursor, fetchPage, reportError]);

  // ─── 최근 작업 스트립 (S1 위쪽) ──────────────────────────────────────
  // 첫 화면 위쪽에 최근 작업 몇 건만 미리 보여 준다. 아래 목록은 '지금 위치'
  // 기준이라 폴더 안에 넣어 둔 최근 작업이 보이지 않으므로 전역 조회를 따로 쓴다.

  const isMainScreen = view === 'browse' && !folderId && !search.trim();

  useEffect(() => {
    if (!isOpen || !token || !isMainScreen) return;
    let cancelled = false;
    listRecentJobs(token, { size: RECENT_STRIP_SIZE })
      // 전용 API가 아직 배포 전이면 전역 조회(최신순)로 대신한다.
      .catch(() =>
        listJobs(token, { sort: 'latest', size: RECENT_STRIP_SIZE }).then(
          (res) => res.files,
        ),
      )
      .then((page) => {
        if (!cancelled) setRecent(page.items.slice(0, RECENT_STRIP_SIZE));
      })
      // 스트립은 곁다리라 실패해도 화면을 막지 않는다 — 조용히 감춘다.
      .catch(() => {
        if (!cancelled) setRecent([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, token, isMainScreen, reloadToken]);

  // ─── 폴더 트리 (브레드크럼 · 이동 모달) ──────────────────────────────

  const refreshTree = useCallback(async () => {
    if (!token) return;
    try {
      const res = await getFolderTree(token);
      setTree(res.folders ?? []);
    } catch (err) {
      reportError(err, '폴더 목록을 불러오지 못했습니다.');
    }
  }, [token, reportError]);

  // 폴더 트리는 변환 진행률과 무관하다 — 조용한 갱신(폴링)에서는 건드리지 않는다.
  useEffect(() => {
    if (!isOpen || reloadToken.silent) return;
    void refreshTree();
  }, [isOpen, refreshTree, reloadToken]);

  useEffect(() => {
    if (!folderId) {
      setBreadcrumb([]);
      return;
    }
    const path = findPath(tree, folderId);
    // 트리를 아직 못 받았으면 다음 갱신에서 채워진다.
    if (path) setBreadcrumb(path);
  }, [folderId, tree]);

  // ─── 변환 중 카드 폴링 (D-9) ────────────────────────────────────────
  // 목록에 이미 변환 중 카드가 있으면 진행률을 따라가느라 갱신하고,
  // 에디터에서 변환이 돌고 있으면 그 작업이 아직 목록에 없더라도 갱신한다 —
  // 예전에는 후자가 빠져 있어, 마이페이지를 열어 둔 채 파일을 올리면 그 작업이
  // 목록에 나타나지 않았다(닫았다 다시 열어야 보였다).

  const hasPendingCard = files.some((f) => isInProgress(f.status));
  const shouldPoll = hasPendingCard || !!isConverting;
  const reloadRef = useRef(reload);
  useEffect(() => {
    reloadRef.current = reload;
  }, [reload]);

  useEffect(() => {
    if (!isOpen || !shouldPoll || view === 'trash') return;
    const id = window.setInterval(
      () => reloadRef.current({ silent: true }),
      POLL_INTERVAL_MS,
    );
    return () => window.clearInterval(id);
  }, [isOpen, shouldPoll, view]);

  // 진행률만 3초마다 /active로 맞춘다. 목록 자체는 10초 폴링이 갱신한다 —
  // 여기서는 이미 그려 둔 카드의 progress만 갈아 끼워 "변환 중 0%"로 굳는 것을 막는다.
  // 값이 null로 오면(Redis 장애) 덮어쓰지 않고 직전 값을 남긴다.
  useEffect(() => {
    if (!isOpen || !token || !shouldPoll || view === 'trash') return;
    let cancelled = false;
    const pull = async () => {
      try {
        const active = await listActiveJobs(token);
        if (cancelled) return;
        const progressById = new Map(
          active
            .filter((j) => typeof j.progress === 'number')
            .map((j) => [j.jobId, j.progress]),
        );
        if (progressById.size === 0) return;
        setFiles((prev) => withLiveProgress(prev, progressById));
        setRecent((prev) => withLiveProgress(prev, progressById));
      } catch {
        // 진행률은 곁다리다 — 실패하면 목록에 실려 온 값을 그대로 둔다.
      }
    };
    void pull();
    const id = window.setInterval(() => void pull(), PROGRESS_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [isOpen, token, shouldPoll, view]);

  // 열어 둔 채로 변환이 시작·종료되면 다음 폴링(10초)까지 기다리지 않고 바로 갱신한다.
  const wasConvertingRef = useRef(isConverting);
  useEffect(() => {
    if (!isOpen || wasConvertingRef.current === isConverting) {
      wasConvertingRef.current = isConverting;
      return;
    }
    wasConvertingRef.current = isConverting;
    reloadRef.current({ silent: true });
  }, [isOpen, isConverting]);

  // 카드 하나의 값만 그 자리에서 바꾼다(즐겨찾기 등) — 목록 전체를 다시 부르면
  // 화면이 껌뻑이고 스크롤도 튄다. 서버 호출이 실패하면 호출부가 되돌린다.
  const patchFile = useCallback((jobId: string, patch: Partial<FileCard>) => {
    const apply = (list: FileCard[]) =>
      list.map((f) => (f.jobId === jobId ? { ...f, ...patch } : f));
    setFiles(apply);
    setRecent(apply);
  }, []);

  const patchFolder = useCallback(
    (id: string, patch: Partial<FolderSummary>) => {
      setFolders((prev) =>
        prev.map((f) => (f.folderId === id ? { ...f, ...patch } : f)),
      );
    },
    [],
  );

  // ─── 이동 ──────────────────────────────────────────────────────────

  const openFolder = useCallback((id: string, name: string) => {
    setView('browse');
    setSearch('');
    setFolderId(id);
    // 트리 조회가 늦어도 경로가 바로 보이도록 낙관적으로 이어 붙인다.
    setBreadcrumb((prev) => [...prev, { folderId: id, name }]);
  }, []);

  // 브레드크럼의 특정 지점으로 이동. index가 -1이면 최상위(전체).
  const goToCrumb = useCallback(
    (index: number) => {
      setView('browse');
      setSearch('');
      if (index < 0) {
        setFolderId(null);
        setBreadcrumb([]);
        return;
      }
      setBreadcrumb((prev) => prev.slice(0, index + 1));
      setFolderId(breadcrumb[index]?.folderId ?? null);
    },
    [breadcrumb],
  );

  const goRoot = useCallback(() => {
    setView('browse');
    setFolderId(null);
    setSearch('');
    setBreadcrumb([]);
  }, []);

  // ─── 주소와 뒤로 가기 ────────────────────────────────────────────────
  // 폴더에 들어갈 때마다 주소가 바뀐다(폴더 id 기준 — 이름을 바꿔도 주소 유지).
  // 검색어도 주소에 남기고, 모달은 남기지 않는다. 지워진 폴더 주소는 전체로 보낸다
  // (조회가 FOLDER4001이면 아래 목록 로드가 에러를 내고 사용자가 전체로 돌아간다).

  // popstate로 되돌아온 변경을 다시 pushState 하지 않도록 하는 가드
  const fromHistoryRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    if (fromHistoryRef.current) {
      fromHistoryRef.current = false;
      return;
    }
    const params = new URLSearchParams(window.location.search);
    params.delete('folder');
    params.delete('q');
    params.delete('view');
    if (folderId) params.set('folder', folderId);
    if (search.trim()) params.set('q', search.trim());
    if (view !== 'browse') params.set('view', view);
    const next = `${window.location.pathname}?${params.toString()}`;
    if (next !== `${window.location.pathname}${window.location.search}`) {
      window.history.pushState({ folderId, search, view }, '', next);
    }
  }, [isOpen, folderId, search, view]);

  useEffect(() => {
    if (!isOpen) return;
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search);
      fromHistoryRef.current = true;
      setFolderId(params.get('folder'));
      setSearch(params.get('q') ?? '');
      const v = params.get('view');
      setView(v === 'trash' || v === 'recent' ? v : 'browse');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [isOpen]);

  return {
    // 상태
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
    isGlobalScope,
    isMainScreen,

    // 데이터
    folders,
    files,
    recent,
    setFiles,
    setFolders,
    tree,
    isLoading,
    isLoadingMore,
    hasMore,
    loadMore,
    reload,
    patchFile,
    patchFolder,
    refreshTree,

    // 이동
    openFolder,
    goToCrumb,
    goRoot,
  };
};
