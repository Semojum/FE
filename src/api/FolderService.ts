import { apiRequest } from './apiClient';
import {
  DirectoryContents,
  FolderSummary,
  FolderTreeNode,
  ListQuery,
} from '../types/mypage';

// 목록 조회 공통 쿼리 직렬화. status/mode는 복수 지정이 가능해 같은 키를 반복한다.
export const buildListQuery = (q: ListQuery = {}): string => {
  const p = new URLSearchParams();
  if (q.search) p.set('search', q.search);
  q.status?.forEach((s) => p.append('status', s));
  q.mode?.forEach((m) => p.append('mode', m));
  if (q.favorite) p.set('favorite', 'true');
  if (q.sort) p.set('sort', q.sort);
  // 커서는 불투명한 값이므로 그대로 넣되 URL 인코딩은 URLSearchParams가 처리한다.
  if (q.cursor) p.set('cursor', q.cursor);
  if (q.size) p.set('size', String(q.size));
  const s = p.toString();
  return s ? `?${s}` : '';
};

// GET /api/folders/contents — 최상위 폴더 + 루트 파일 (마이페이지 첫 화면 S1)
// GET /api/folders/{folderId}/contents — 폴더 내부 (S2)
// 조회 범위는 경로가 정한다. folderId를 쿼리로 보내면 무시된다.
export const getFolderContents = (
  folderId: string | null,
  query: ListQuery,
  token: string,
): Promise<DirectoryContents> =>
  apiRequest<DirectoryContents>(
    folderId
      ? `/api/folders/${folderId}/contents${buildListQuery(query)}`
      : `/api/folders/contents${buildListQuery(query)}`,
    { token },
  );

// GET /api/folders/tree — 폴더 트리 전체(휴지통 제외). '폴더로 이동' 모달용.
export const getFolderTree = (
  token: string,
  opts: { favorite?: boolean; sort?: 'latest' | 'oldest' } = {},
): Promise<{ folders: FolderTreeNode[] }> => {
  const p = new URLSearchParams();
  if (opts.favorite) p.set('favorite', 'true');
  if (opts.sort) p.set('sort', opts.sort);
  const qs = p.toString();
  return apiRequest<{ folders: FolderTreeNode[] }>(
    `/api/folders/tree${qs ? `?${qs}` : ''}`,
    { token },
  );
};

// POST /api/folders — parentFolderId가 null이면 루트에 생성.
// 400 COMMON4000(이름) / 409 FOLDER4002(중복) / 400 FOLDER4003(깊이) / 400 FOLDER4004(개수)
export const createFolder = (
  name: string,
  parentFolderId: string | null,
  token: string,
): Promise<
  Pick<FolderSummary, 'folderId' | 'name'> & {
    parentFolderId: string | null;
  }
> =>
  apiRequest('/api/folders', {
    method: 'POST',
    token,
    body: { name, parentFolderId },
  });

// PATCH /api/folders/{folderId} — 보낸 필드만 반영된다.
// parentFolderId를 생략하면 이동하지 않고, null로 보내면 루트로 이동한다.
export const updateFolder = (
  folderId: string,
  patch: { name?: string; parentFolderId?: string | null },
  token: string,
): Promise<{ folderId: string; name: string }> =>
  apiRequest(`/api/folders/${folderId}`, {
    method: 'PATCH',
    token,
    body: patch as Record<string, unknown>,
  });

// DELETE /api/folders/{folderId} — 하위 폴더·작업까지 통째로 휴지통으로.
// 폴더 안에 변환 중 작업이 있으면 409 JOB4010.
export const deleteFolder = (folderId: string, token: string): Promise<null> =>
  apiRequest<null>(`/api/folders/${folderId}`, { method: 'DELETE', token });

// PATCH /api/folders/{folderId}/favorite — 현재 값의 반대로 전환
export const toggleFolderFavorite = (
  folderId: string,
  token: string,
): Promise<{ folderId: string; isFavorite: boolean }> =>
  apiRequest(`/api/folders/${folderId}/favorite`, { method: 'PATCH', token });
