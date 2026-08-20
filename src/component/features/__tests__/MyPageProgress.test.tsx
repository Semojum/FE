import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';

// 목록 응답의 progress는 뒤늦게 따라온다 — 변환 내내 0으로 굳어 "변환 중 0%"로 보였다
// (2026-08-17 실서버 실측: 목록 0 · /api/users/jobs/active 50).
// 그래서 변환 중 카드가 있는 동안에는 /active 값을 카드에 얹는다.

vi.mock('../../../api/HistoryService', () => ({
  listJobs: vi.fn(),
  listRecentJobs: vi.fn(),
  listActiveJobs: vi.fn(),
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
import {
  listActiveJobs,
  listJobs,
  listRecentJobs,
} from '../../../api/HistoryService';
import { getFolderContents, getFolderTree } from '../../../api/FolderService';

const converting = {
  jobId: 'j1',
  originalFileName: '변환중.pdf',
  mode: 'a' as const,
  status: 'IN_PROGRESS' as const,
  totalPages: 10,
  isFavorite: false,
  displayDate: '방금',
  thumbnailUrl: null,
  // 목록이 준 값 — 실서버에서 한참 0에 머문다.
  progress: 0,
  lastEditedPage: null,
  folderId: null,
  folderPath: null,
};

const contents = {
  folders: [],
  files: { items: [converting], nextCursor: null, hasMore: false },
};

const renderMyPage = () =>
  render(
    <MyPage
      isOpen
      onClose={() => undefined}
      onLogout={() => undefined}
      token="tk"
      user={{ loginId: 'org0102' } as never}
      onSelect={() => undefined}
      onToast={() => undefined}
    />,
  );

describe('마이페이지 · 변환 중 진행률', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getFolderTree).mockResolvedValue({ folders: [] } as never);
    vi.mocked(getFolderContents).mockResolvedValue(contents as never);
    vi.mocked(listJobs).mockResolvedValue(contents as never);
    vi.mocked(listRecentJobs).mockResolvedValue({
      items: [converting],
      nextCursor: null,
      hasMore: false,
    } as never);
  });

  it('목록이 0%여도 /active의 진행률로 맞춘다', async () => {
    vi.mocked(listActiveJobs).mockResolvedValue([
      { jobId: 'j1', progress: 50 },
    ] as never);

    renderMyPage();

    await waitFor(() =>
      expect(screen.getAllByText(/변환 중 50%/).length).toBeGreaterThan(0),
    );
    // 스트립 카드에도 같은 값이 실린다.
    const strip = screen.getByRole('region', { name: '최근 작업' });
    expect(within(strip).getByText(/변환 중 50%/)).toBeTruthy();
  });

  it('/active가 실패해도 목록에 실려 온 값을 그대로 둔다', async () => {
    vi.mocked(listActiveJobs).mockRejectedValue(new Error('네트워크'));

    renderMyPage();

    await waitFor(() =>
      expect(screen.getAllByText(/변환 중 0%/).length).toBeGreaterThan(0),
    );
  });

  it('진행률이 null로 오면(Redis 장애) 덮어쓰지 않는다', async () => {
    vi.mocked(listActiveJobs).mockResolvedValue([
      { jobId: 'j1', progress: null },
    ] as never);

    renderMyPage();

    await waitFor(() =>
      expect(screen.getAllByText(/변환 중 0%/).length).toBeGreaterThan(0),
    );
  });
});
