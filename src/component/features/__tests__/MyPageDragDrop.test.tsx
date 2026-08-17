import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// 마이페이지: 빈 곳 우클릭으로 새 폴더를 만들고, 카드를 폴더로 끌어다 옮긴다.

vi.mock('../../../api/HistoryService', () => ({
  listJobs: vi.fn(),
  listRecentJobs: vi.fn(),
}));
vi.mock('../../../api/FolderService', () => ({
  getFolderContents: vi.fn(),
  getFolderTree: vi.fn(),
  createFolder: vi.fn(),
  deleteFolder: vi.fn(),
  toggleFolderFavorite: vi.fn(),
  updateFolder: vi.fn(),
}));
vi.mock('../../../api/JobService', () => ({
  moveJobs: vi.fn(),
  renameJob: vi.fn(),
  toggleJobFavorite: vi.fn(),
  trashJobs: vi.fn(),
  downloadJobResult: vi.fn(),
}));

import MyPage from '../mypage/MyPage';
import { listJobs, listRecentJobs } from '../../../api/HistoryService';
import {
  getFolderContents,
  getFolderTree,
  updateFolder,
} from '../../../api/FolderService';
import { moveJobs } from '../../../api/JobService';

const folder = {
  folderId: 'f1',
  name: '수학',
  isFavorite: false,
  itemCount: 2,
  lastModifiedAt: '2026-08-09T00:00:00Z',
};

const file = {
  jobId: 'j1',
  originalFileName: '테스트.pdf',
  mode: 'a' as const,
  status: 'COMPLETED' as const,
  totalPages: 1,
  isFavorite: false,
  lastModifiedAt: '2026-08-09T00:00:00Z',
  thumbnailUrl: null,
  progress: 100,
  lastEditedPage: 1,
  folderPath: null,
};

const contents = {
  folders: [folder],
  files: { items: [file], nextCursor: null, hasMore: false },
};

const renderMyPage = () =>
  render(
    <MyPage
      isOpen
      onClose={() => undefined}
      token="tk"
      user={{ loginId: 'org0102' } as never}
      onSelect={() => undefined}
      onToast={() => undefined}
    />,
  );

// 드래그 이벤트는 dataTransfer가 있어야 핸들러가 돈다.
const dt = () => ({
  setData: vi.fn(),
  getData: vi.fn(() => ''),
  effectAllowed: '',
  dropEffect: '',
});

const rowOf = (text: string) =>
  screen.getAllByText(text)[0].closest('[role="row"]')!;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getFolderTree).mockResolvedValue({ folders: [] } as never);
  vi.mocked(getFolderContents).mockResolvedValue(contents as never);
  vi.mocked(listJobs).mockResolvedValue(contents as never);
  // 여기 관심사는 목록의 끌어 옮기기다 — 위쪽 최근 작업 스트립은 비워 둔다.
  vi.mocked(listRecentJobs).mockResolvedValue({
    items: [],
    nextCursor: null,
    hasMore: false,
  } as never);
  vi.mocked(moveJobs).mockResolvedValue({
    movedCount: 1,
    targetFolderId: 'f1',
  } as never);
  vi.mocked(updateFolder).mockResolvedValue({
    folderId: 'f1',
    name: '수학',
  } as never);
});

describe('마이페이지 · 빈 곳 우클릭', () => {
  it('빈 곳을 우클릭하면 새 폴더 메뉴가 뜬다', async () => {
    const user = userEvent.setup();
    renderMyPage();
    await screen.findByText('수학');

    // 줄이 아닌 본문 영역
    const body = rowOf('수학').closest('.custom-scrollbar')!;
    fireEvent.contextMenu(body);

    const item = await screen.findByRole('menuitem', { name: '새 폴더' });
    await user.click(item);
    expect(screen.getByRole('dialog', { name: '새 폴더' })).toBeTruthy();
  });

  it('줄을 우클릭하면 빈 곳 메뉴가 아니라 그 항목 메뉴가 뜬다', async () => {
    renderMyPage();
    await screen.findByText('수학');

    fireEvent.contextMenu(rowOf('수학'));

    expect(await screen.findByRole('menuitem', { name: '열기' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: '새 폴더' })).toBeNull();
  });
});

describe('마이페이지 · 끌어 옮기기', () => {
  it('파일을 폴더에 떨어뜨리면 그 폴더로 옮긴다', async () => {
    renderMyPage();
    await screen.findByText('수학');

    fireEvent.dragStart(rowOf('테스트.pdf'), { dataTransfer: dt() });
    fireEvent.drop(rowOf('수학'), { dataTransfer: dt() });

    await waitFor(() =>
      expect(moveJobs).toHaveBeenCalledWith(['j1'], 'f1', 'tk'),
    );
  });

  it('폴더를 자기 자신 위에 떨어뜨리면 아무 일도 하지 않는다', async () => {
    renderMyPage();
    await screen.findByText('수학');

    fireEvent.dragStart(rowOf('수학'), { dataTransfer: dt() });
    fireEvent.drop(rowOf('수학'), { dataTransfer: dt() });

    expect(updateFolder).not.toHaveBeenCalled();
    expect(moveJobs).not.toHaveBeenCalled();
  });

  it('변환 중 파일은 끌 수 없다', async () => {
    vi.mocked(getFolderContents).mockResolvedValue({
      folders: [],
      files: {
        items: [{ ...file, jobId: 'j2', status: 'IN_PROGRESS', progress: 40 }],
        nextCursor: null,
        hasMore: false,
      },
    } as never);
    renderMyPage();
    await screen.findByText('테스트.pdf');

    expect(rowOf('테스트.pdf').getAttribute('draggable')).toBe('false');
  });
});
