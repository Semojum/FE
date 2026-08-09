import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// '최근 작업 전체'(S9)는 작업만 나열한다. 전역 조회 응답에는 폴더도 실려 오기 때문에
// 화면에서 걸러 주지 않으면 폴더 카드가 같이 떴다 (QA 2026-08-09).

vi.mock('../../../api/HistoryService', () => ({
  listJobs: vi.fn(),
}));
vi.mock('../../../api/FolderService', () => ({
  getFolderContents: vi.fn(),
  getFolderTree: vi.fn(),
  createFolder: vi.fn(),
  deleteFolder: vi.fn(),
  toggleFolderFavorite: vi.fn(),
  updateFolder: vi.fn(),
}));

import MyPage from '../mypage/MyPage';
import { listJobs } from '../../../api/HistoryService';
import { getFolderContents, getFolderTree } from '../../../api/FolderService';

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

describe('마이페이지 · 최근 작업 전체', () => {
  beforeEach(() => {
    vi.mocked(getFolderTree).mockResolvedValue({ folders: [] } as never);
    vi.mocked(getFolderContents).mockResolvedValue(contents as never);
    vi.mocked(listJobs).mockResolvedValue(contents as never);
  });

  it('메인(S1)에서는 폴더가 보인다', async () => {
    renderMyPage();
    expect(await screen.findByText('수학')).toBeTruthy();
  });

  it('최근 작업 전체로 들어가면 폴더는 빠지고 작업만 남는다', async () => {
    const user = userEvent.setup();
    renderMyPage();
    await screen.findByText('수학');

    await user.click(screen.getByRole('button', { name: /전체 보기/ }));

    await waitFor(() => expect(screen.getByText('최근 작업 전체')).toBeTruthy());
    expect(screen.queryByText('수학')).toBeNull();
    expect(screen.getAllByText('테스트.pdf').length).toBeGreaterThan(0);
  });
});
