import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getFolderContents, getFolderTree } from '../api/FolderService';
import { listJobs } from '../api/HistoryService';
import { toUserMessage } from '../api/errorMessages';
import {
  FileCard,
  FolderSummary,
  FolderTreeNode,
  isInProgress,
  JobStatus,
  ListQuery,
  PAGE_SIZE,
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

// 생성 중 카드가 있는 동안의 목록 갱신 주기 (D-9). 초 단위 실시간 표시는 에디터가 맡는다.
const POLL_INTERVAL_MS = 10_000;

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
  onError?: (message: string) => void;
}

export const useMyPage = ({ token, isOpen, onError }: UseMyPageOptions) => {
  const [view, setView] = useState<MyPageView>('browse');
  const [folderId, setFolderId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'latest' | 'oldest'>('latest');
  const [statusFilter, setStatusFilter] = useState<JobStatus[]>([]);
  const [modeFilter, setModeFilter] = useState<JobMode[]>([]);
  const [favoriteOnly, setFavoriteOnly] = useState(false);

  const [folders, setFolders] = useState<FolderSummary[]>([]);
  const [files, setFiles] = useState<FileCard[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const [tree, setTree] = useState<FolderTreeNode[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<Breadcrumb[]>([]);

  // 목록을 다시 불러오게 만드는 신호. 생성·이동·삭제 후 증가시킨다.
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((v) => v + 1), []);

  const reportError = useCallback(
    (err: unknown, fallback: string) => {
      const message = toUserMessage(err, fallback);
      if (onError) onError(message);
      else console.error(message, err);
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
    setIsLoading(true);
    fetchPage(null)
      .then((res) => {
        if (cancelled || !res) return;
        setFolders(res.folders ?? []);
        setFiles(res.files?.items ?? []);
        setNextCursor(res.files?.nextCursor ?? null);
        setHasMore(res.files?.hasMore ?? false);
      })
      .catch((err) => {
        if (!cancelled) reportError(err, '목록을 불러오지 못했습니다.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
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

  useEffect(() => {
    if (!isOpen) return;
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

  const hasPendingCard = files.some((f) => isInProgress(f.status));
  const reloadRef = useRef(reload);
  useEffect(() => {
    reloadRef.current = reload;
  }, [reload]);

  useEffect(() => {
    if (!isOpen || !hasPendingCard || view === 'trash') return;
    const id = window.setInterval(() => reloadRef.current(), POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [isOpen, hasPendingCard, view]);

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

    // 데이터
    folders,
    files,
    setFiles,
    setFolders,
    tree,
    isLoading,
    isLoadingMore,
    hasMore,
    loadMore,
    reload,
    refreshTree,

    // 이동
    openFolder,
    goToCrumb,
    goRoot,
  };
};
