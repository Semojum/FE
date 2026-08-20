import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// 목록 응답의 progress는 뒤늦게 따라온다 — 변환 내내 0으로 굳어 "변환 중 0%"로 보였다
// (2026-08-17 실서버 실측: 목록 0 · /api/users/jobs/active 50).
// 그래서 변환 중 카드가 있는 동안에는 /active 값을 카드에 얹는다.

vi.mock('../../../api/HistoryService', () => ({
  listJobs: vi.fn(),
  listRecentJobs: vi.fn(),
  listActiveJobs: vi.fn(),
}));
vi.mock('../../../api/JobService', () => ({
  toggleJobFavorite: vi.fn(),
  renameJob: vi.fn(),
  trashJobs: vi.fn(),
  moveJobs: vi.fn(),
  downloadJobResult: vi.fn(),
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
import { toggleJobFavorite } from '../../../api/JobService';

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

// 변환 중에는 10초마다 목록을 다시 부르는데, 그때마다 "불러오는 중..."으로 목록이
// 사라졌다 나타나 화면이 계속 리프레시되는 것처럼 보였다(2026-08-20 QA).
// 즐겨찾기도 누를 때마다 목록을 통째로 다시 불렀다.
describe('마이페이지 · 조용한 갱신', () => {
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
    vi.mocked(listActiveJobs).mockResolvedValue([] as never);
  });

  it('변환 중 폴링은 목록을 지우지 않는다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderMyPage();
      await waitFor(() =>
        expect(screen.getAllByText('변환중.pdf').length).toBeGreaterThan(0),
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });

      // 폴링이 돌아도 목록이 자리 표시로 바뀌지 않는다.
      expect(screen.queryByText('불러오는 중...')).toBeNull();
      expect(screen.getAllByText('변환중.pdf').length).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('즐겨찾기는 그 자리에서 바뀌고 목록을 다시 부르지 않는다', async () => {
    vi.mocked(toggleJobFavorite).mockResolvedValue(null as never);
    renderMyPage();
    await waitFor(() =>
      expect(screen.getAllByText('변환중.pdf').length).toBeGreaterThan(0),
    );
    const before = vi.mocked(getFolderContents).mock.calls.length;

    const star = screen.getAllByLabelText(/즐겨찾기/)[0];
    await userEvent.click(star);

    await waitFor(() =>
      expect(toggleJobFavorite).toHaveBeenCalledWith('j1', 'tk'),
    );
    expect(screen.queryByText('불러오는 중...')).toBeNull();
    expect(vi.mocked(getFolderContents).mock.calls.length).toBe(before);
  });
});
