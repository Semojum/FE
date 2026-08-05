import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildListQuery,
  createFolder,
  deleteFolder,
  getFolderContents,
  getFolderTree,
  toggleFolderFavorite,
  updateFolder,
} from '../FolderService';
import { API_BASE_URL } from '../apiClient';

const envelope = (
  result: unknown,
  overrides: Record<string, unknown> = {},
) => ({
  isSuccess: true,
  code: 'COMMON2000',
  message: '성공입니다.',
  result,
  ...overrides,
});

const makeJsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const emptyContents = {
  folders: [],
  files: { items: [], nextCursor: null, hasMore: false },
};

describe('buildListQuery', () => {
  it('빈 쿼리는 빈 문자열', () => {
    expect(buildListQuery({})).toBe('');
  });

  it('status·mode는 같은 키를 반복해 직렬화한다', () => {
    const qs = buildListQuery({ status: ['COMPLETED', 'FAILED'], mode: ['a'] });
    const params = new URLSearchParams(qs.slice(1));
    expect(params.getAll('status')).toEqual(['COMPLETED', 'FAILED']);
    expect(params.getAll('mode')).toEqual(['a']);
  });

  it('favorite는 true일 때만 붙인다', () => {
    expect(buildListQuery({ favorite: false })).toBe('');
    expect(buildListQuery({ favorite: true })).toBe('?favorite=true');
  });
});

describe('FolderService', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('folderId가 null이면 최상위(S1) 경로로 조회한다', async () => {
    fetchSpy.mockResolvedValue(makeJsonResponse(200, envelope(emptyContents)));
    await getFolderContents(null, {}, 'tok');
    expect(fetchSpy.mock.calls[0][0]).toBe(
      `${API_BASE_URL}/api/folders/contents`,
    );
  });

  it('folderId가 있으면 폴더 내부(S2) 경로로 조회한다', async () => {
    fetchSpy.mockResolvedValue(makeJsonResponse(200, envelope(emptyContents)));
    await getFolderContents('f1', { sort: 'oldest' }, 'tok');
    expect(fetchSpy.mock.calls[0][0]).toBe(
      `${API_BASE_URL}/api/folders/f1/contents?sort=oldest`,
    );
  });

  it('getFolderTree는 favorite 필터를 쿼리로 넘긴다', async () => {
    fetchSpy.mockResolvedValue(
      makeJsonResponse(200, envelope({ folders: [] })),
    );
    await getFolderTree('tok', { favorite: true });
    expect(fetchSpy.mock.calls[0][0]).toBe(
      `${API_BASE_URL}/api/folders/tree?favorite=true`,
    );
  });

  it('createFolder는 parentFolderId=null로 루트에 만든다', async () => {
    fetchSpy.mockResolvedValue(
      makeJsonResponse(
        200,
        envelope({ folderId: 'f9', name: '새 폴더', parentFolderId: null }),
      ),
    );
    await createFolder('새 폴더', null, 'tok');
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/api/folders`);
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      name: '새 폴더',
      parentFolderId: null,
    });
  });

  it('createFolder는 같은 이름 충돌 시 FOLDER4002를 던진다', async () => {
    fetchSpy.mockResolvedValue(
      makeJsonResponse(
        409,
        envelope(null, {
          isSuccess: false,
          code: 'FOLDER4002',
          message: '이미 존재하는 폴더입니다.',
        }),
      ),
    );
    await expect(createFolder('중복', null, 'tok')).rejects.toMatchObject({
      code: 'FOLDER4002',
      status: 409,
    });
  });

  it('updateFolder는 보낸 필드만 담는다 (이름만 변경)', async () => {
    fetchSpy.mockResolvedValue(
      makeJsonResponse(200, envelope({ folderId: 'f1', name: '수학' })),
    );
    await updateFolder('f1', { name: '수학' }, 'tok');
    const [, init] = fetchSpy.mock.calls[0];
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      name: '수학',
    });
  });

  it('updateFolder는 parentFolderId=null로 루트 이동을 표현한다', async () => {
    fetchSpy.mockResolvedValue(
      makeJsonResponse(200, envelope({ folderId: 'f1', name: '수학' })),
    );
    await updateFolder('f1', { parentFolderId: null }, 'tok');
    const [, init] = fetchSpy.mock.calls[0];
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      parentFolderId: null,
    });
  });

  it('deleteFolder는 변환 중 작업이 있으면 JOB4010', async () => {
    fetchSpy.mockResolvedValue(
      makeJsonResponse(
        409,
        envelope(null, {
          isSuccess: false,
          code: 'JOB4010',
          message: '변환 중인 작업이 있습니다.',
        }),
      ),
    );
    await expect(deleteFolder('f1', 'tok')).rejects.toMatchObject({
      code: 'JOB4010',
    });
  });

  it('toggleFolderFavorite는 본문 없이 PATCH한다', async () => {
    fetchSpy.mockResolvedValue(
      makeJsonResponse(200, envelope({ folderId: 'f1', isFavorite: true })),
    );
    const res = await toggleFolderFavorite('f1', 'tok');
    expect(res.isFavorite).toBe(true);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/api/folders/f1/favorite`);
    expect((init as RequestInit).method).toBe('PATCH');
    expect((init as RequestInit).body).toBeUndefined();
  });
});
