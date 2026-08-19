import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// V3-06 진입 경로 — 기관 관리와 사용량은 마이페이지에서 들어간다.
// 기관 관리는 ROLE_ORG_ADMIN에게만 보인다(다른 역할은 서버가 COMMON4003으로 막으므로
// 버튼을 띄워 봐야 권한 오류만 보게 된다).

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
vi.mock('../../../api/UsageService', () => ({
  getUsageSummary: vi.fn(),
  listUsageJobs: vi.fn(),
}));

import MyPage from '../mypage/MyPage';
import { listJobs, listRecentJobs } from '../../../api/HistoryService';
import { getFolderContents, getFolderTree } from '../../../api/FolderService';
import { getUsageSummary, listUsageJobs } from '../../../api/UsageService';
import { User } from '../../../types/auth';

const emptyContents = {
  folders: [],
  files: { items: [], nextCursor: null, hasMore: false },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getFolderContents).mockResolvedValue(emptyContents);
  vi.mocked(getFolderTree).mockResolvedValue({ folders: [] });
  vi.mocked(listJobs).mockResolvedValue(emptyContents);
  vi.mocked(listRecentJobs).mockResolvedValue({
    items: [],
    nextCursor: null,
    hasMore: false,
  });
  vi.mocked(getUsageSummary).mockResolvedValue({
    month: '2026-08',
    myCredits: 1140,
    orgAllocated: 10000,
    orgUsed: 4600,
    orgRemaining: 5400,
  });
  vi.mocked(listUsageJobs).mockResolvedValue({
    from: '2026-07-20',
    to: '2026-08-19',
    items: [],
    totalCredits: 0,
  });
});

const renderMyPage = (user: User) =>
  render(
    <MyPage
      isOpen
      onClose={vi.fn()}
      token="tk"
      user={user}
      onSelect={vi.fn()}
      onToast={vi.fn()}
    />,
  );

describe('마이페이지 → V3-06 진입', () => {
  it('사용량은 모든 계정에 보이고, 기관 관리는 기관 담당자에게만 보인다', async () => {
    const { unmount } = renderMyPage({ loginId: 'kblib02', role: 'ROLE_USER' });
    expect(screen.getByText('사용량')).toBeTruthy();
    expect(screen.queryByText('기관 관리')).toBeNull();
    unmount();

    renderMyPage({ loginId: 'kblib01', role: 'ROLE_ORG_ADMIN' });
    expect(screen.getByText('기관 관리')).toBeTruthy();
  });

  it('사용량을 누르면 사용량 화면이 열린다', async () => {
    renderMyPage({ loginId: 'kblib02', role: 'ROLE_USER' });

    await userEvent.click(screen.getByText('사용량'));

    expect(await screen.findByText('내가 쓴 크레딧')).toBeTruthy();
    await waitFor(() => expect(getUsageSummary).toHaveBeenCalled());
  });
});
