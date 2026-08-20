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
vi.mock('../../../api/OrgService', () => ({
  getOrgDashboard: vi.fn(),
  listOrgAccounts: vi.fn(),
  listOrgNotices: vi.fn(),
  listOrgOrders: vi.fn(),
  listOrgRequests: vi.fn(),
  setAccountLock: vi.fn(),
  createOrgRequest: vi.fn(),
  cancelOrgRequest: vi.fn(),
  updateReceiptEmail: vi.fn(),
  getOrderReceipt: vi.fn(),
  fetchReceiptBlob: vi.fn(),
  listOrgAccountJobs: vi.fn(),
  updateAccountAlias: vi.fn(),
}));

import MyPage from '../mypage/MyPage';
import { listJobs, listRecentJobs } from '../../../api/HistoryService';
import { getFolderContents, getFolderTree } from '../../../api/FolderService';
import { getUsageSummary, listUsageJobs } from '../../../api/UsageService';
import {
  getOrgDashboard,
  listOrgAccounts,
  listOrgNotices,
  listOrgOrders,
  listOrgRequests,
} from '../../../api/OrgService';
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
  vi.mocked(getOrgDashboard).mockResolvedValue({
    orgName: '검증용기관',
    orgCode: 'org01',
    contractType: 'BASIC',
    contractStartedAt: '2026-08-01',
    contractExpiresAt: '2027-12-31',
    creditAllocated: 10000,
    creditUsed: 63,
    creditRemaining: 9937,
    monthlyUsage: [{ month: '2026-08', credits: 64 }],
  });
  vi.mocked(listOrgAccounts).mockResolvedValue({
    usageSince: '2026-08-01',
    items: [],
  });
  vi.mocked(listOrgNotices).mockResolvedValue([]);
  vi.mocked(listOrgOrders).mockResolvedValue({ receiptEmail: null, items: [] });
  vi.mocked(listOrgRequests).mockResolvedValue([]);
});

const renderMyPage = (user: User, initialSubView: 'org' | null = null) =>
  render(
    <MyPage
      isOpen
      initialSubView={initialSubView}
      onClose={vi.fn()}
      onLogout={vi.fn()}
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

  // 기관 담당자 업무가 내 파일 목록 위에 얹힌 패널처럼 보이면 안 된다 — 단독 화면.
  it('기관 관리는 마이페이지 껍데기 없이 단독 화면으로 열린다', async () => {
    renderMyPage({ loginId: 'org0105', role: 'ROLE_ORG_ADMIN' });

    await userEvent.click(screen.getByText('기관 관리'));

    expect(
      await screen.findByRole('heading', { name: '기관 관리' }),
    ).toBeTruthy();
    // 마이페이지 헤더(돌아가기 · 사용량 탭)는 함께 뜨지 않는다.
    expect(screen.queryByText('돌아가기')).toBeNull();
    expect(screen.queryByText('사용량')).toBeNull();
    // 마이페이지로 나가는 길도 없다 — 기관 담당자에게는 이 화면이 홈이다.
    expect(screen.queryByText('마이페이지')).toBeNull();
  });

  // 기관 담당자는 점역 작업자가 아니라 관리자다 — 로그인 직후 착지 화면이 기관 관리다.
  // (App이 로그인 시 마이페이지를 initialSubView='org'로 마운트한다.)
  it('initialSubView="org"면 기관 관리부터 보여 준다', async () => {
    renderMyPage({ loginId: 'org0105', role: 'ROLE_ORG_ADMIN' }, 'org');

    expect(
      await screen.findByRole('heading', { name: '기관 관리' }),
    ).toBeTruthy();
    expect(screen.queryByText('돌아가기')).toBeNull();
  });

  it('사용량을 누르면 사용량 화면이 열린다', async () => {
    renderMyPage({ loginId: 'kblib02', role: 'ROLE_USER' });

    await userEvent.click(screen.getByText('사용량'));

    expect(await screen.findByText('내가 쓴 크레딧')).toBeTruthy();
    await waitFor(() => expect(getUsageSummary).toHaveBeenCalled());
  });
});
