import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Figma V3-06 기관 관리(T2). 이 화면이 직접 바꾸는 것은 별칭과 잠금뿐이고,
// 크레딧 충전·계정 발급은 요청으로 접수한다. 처리 중인 발급 요청은 소속 계정 표에
// 줄로 함께 보여, 담당자가 "요청했는지"를 다른 화면에서 찾지 않게 한다.

vi.mock('../../../api/OrgService', () => ({
  getOrgDashboard: vi.fn(),
  listOrgAccounts: vi.fn(),
  listOrgNotices: vi.fn(),
  listOrgOrders: vi.fn(),
  listOrgRequests: vi.fn(),
  createOrgRequest: vi.fn(),
  cancelOrgRequest: vi.fn(),
  setAccountLock: vi.fn(),
  updateReceiptEmail: vi.fn(),
  updateAccountAlias: vi.fn(),
  getOrderReceipt: vi.fn(),
  fetchReceiptBlob: vi.fn(),
  listOrgAccountJobs: vi.fn(),
}));

import OrgAdminView from '../org/OrgAdminView';
import {
  cancelOrgRequest,
  createOrgRequest,
  getOrgDashboard,
  listOrgAccountJobs,
  listOrgAccounts,
  listOrgNotices,
  listOrgOrders,
  listOrgRequests,
  setAccountLock,
} from '../../../api/OrgService';

const dashboard = {
  orgName: '한국점자도서관',
  orgCode: 'kblib',
  contractType: 'PAID' as const,
  contractStartedAt: '2026-02-24',
  contractExpiresAt: '2026-08-24',
  creditAllocated: 10000,
  creditUsed: 4600,
  creditRemaining: 5400,
  monthlyUsage: [
    { month: '2026-07', credits: 3900 },
    { month: '2026-08', credits: 4600 },
  ],
};

const accounts = {
  month: '2026-08',
  items: [
    {
      loginId: 'kblib01',
      alias: '관리자',
      status: 'ACTIVE' as const,
      role: 'ROLE_ORG_ADMIN',
      lastLoginAt: '2026-08-19T09:12:00',
      monthCredits: 820,
      self: true,
    },
    {
      loginId: 'kblib02',
      alias: '수학 담당',
      status: 'ACTIVE' as const,
      role: 'ROLE_USER',
      lastLoginAt: '2026-08-18T09:12:00',
      monthCredits: 1140,
      self: false,
    },
    {
      loginId: 'kblib03',
      alias: null,
      status: 'INACTIVE' as const,
      role: 'ROLE_USER',
      lastLoginAt: '2026-07-22T09:12:00',
      monthCredits: 0,
      self: false,
    },
  ],
};

const requests = [
  {
    id: 'req-1',
    type: 'ACCOUNT_ISSUE' as const,
    status: 'OPEN' as const,
    message: '국어 담당',
    createdAt: '2026-08-12T00:00:00',
  },
];

const orders = {
  receiptEmail: 'account@kblib.or.kr',
  items: [
    {
      id: 'o1',
      orderDate: '2026-02-24',
      description: '연간 계약 · 10,000 크레딧',
      amountKrw: 2400000,
      creditAmount: 10000,
      paidAt: '2026-02-25',
      invoiceStatus: 'ISSUED' as const,
      receiptFileName: '계산서_2월.pdf',
    },
    {
      id: 'o2',
      orderDate: '2026-06-02',
      description: '크레딧 추가 · 3,000',
      amountKrw: 780000,
      creditAmount: 3000,
      paidAt: null,
      invoiceStatus: 'PENDING' as const,
      receiptFileName: null,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getOrgDashboard).mockResolvedValue(dashboard);
  vi.mocked(listOrgAccounts).mockResolvedValue(accounts);
  vi.mocked(listOrgNotices).mockResolvedValue([
    {
      id: 'n1',
      scope: 'ORG' as const,
      title: '크레딧 소진 임박 안내',
      body: '이번 달 안에 소진될 수 있습니다.',
      startsOn: '2026-08-13',
      endsOn: '2026-08-20',
      createdAt: '2026-08-13T00:00:00',
    },
  ]);
  vi.mocked(listOrgOrders).mockResolvedValue(orders);
  vi.mocked(listOrgRequests).mockResolvedValue(requests);
  vi.mocked(listOrgAccountJobs).mockResolvedValue({
    loginId: 'kblib02',
    alias: '수학 담당',
    from: '2026-07-20',
    to: '2026-08-19',
    items: [],
    totalPages: 0,
    totalCredits: 0,
  });
});

const renderView = () =>
  render(<OrgAdminView token="tk" onBack={vi.fn()} onToast={vi.fn()} />);

describe('기관 관리 (V3-06 T2)', () => {
  it('계약·크레딧 요약과 소속 계정을 보여 준다', async () => {
    renderView();

    expect(
      await screen.findByText('한국점자도서관 · kblib · 유료'),
    ).toBeTruthy();
    expect(screen.getByText('10,000')).toBeTruthy();
    expect(screen.getByText('5,400')).toBeTruthy();
    expect(screen.getByText('2026-08-24')).toBeTruthy();

    expect(await screen.findByText('kblib01')).toBeTruthy();
    expect(screen.getByText('수학 담당')).toBeTruthy();
  });

  it('본인 계정에는 잠금 버튼이 없다 (서버도 COMMON4000으로 막는다)', async () => {
    renderView();
    const selfRow = (await screen.findByText('kblib01')).closest('tr');
    expect(within(selfRow as HTMLElement).queryByText('잠금')).toBeNull();

    const otherRow = screen.getByText('kblib02').closest('tr');
    expect(within(otherRow as HTMLElement).getByText('잠금')).toBeTruthy();
  });

  it('잠긴 계정에는 잠금 해제가 뜨고, 누르면 locked=false로 보낸다', async () => {
    vi.mocked(setAccountLock).mockResolvedValue({
      loginId: 'kblib03',
      status: 'ACTIVE',
      canceledJobs: 0,
    });
    renderView();

    const row = (await screen.findByText('kblib03')).closest('tr');
    await userEvent.click(within(row as HTMLElement).getByText('잠금 해제'));

    await waitFor(() =>
      expect(setAccountLock).toHaveBeenCalledWith('kblib03', false, 'tk'),
    );
  });

  it('잠금은 확인을 받은 뒤에 보낸다 — 진행 중이던 변환이 중단되기 때문', async () => {
    vi.mocked(setAccountLock).mockResolvedValue({
      loginId: 'kblib02',
      status: 'INACTIVE',
      canceledJobs: 1,
    });
    renderView();

    const row = (await screen.findByText('kblib02')).closest('tr');
    await userEvent.click(within(row as HTMLElement).getByText('잠금'));
    expect(setAccountLock).not.toHaveBeenCalled();

    const dialog = await screen.findByRole('dialog', {
      name: '계정을 잠글까요?',
    });
    await userEvent.click(within(dialog).getByText('잠금'));

    await waitFor(() =>
      expect(setAccountLock).toHaveBeenCalledWith('kblib02', true, 'tk'),
    );
  });

  it('처리 중인 계정 발급 요청은 소속 계정 표에 줄로 붙고 취소할 수 있다', async () => {
    vi.mocked(cancelOrgRequest).mockResolvedValue(null);
    renderView();

    expect(await screen.findByText('발급 요청 1건 처리 중')).toBeTruthy();
    const row = screen.getByText('발급 요청 중').closest('tr');
    expect(within(row as HTMLElement).getByText('국어 담당')).toBeTruthy();

    await userEvent.click(within(row as HTMLElement).getByText('요청 취소'));
    await waitFor(() =>
      expect(cancelOrgRequest).toHaveBeenCalledWith('req-1', 'tk'),
    );
    await waitFor(() => expect(screen.queryByText('발급 요청 중')).toBeNull());
  });

  it('크레딧 추가 요청을 접수한다', async () => {
    vi.mocked(createOrgRequest).mockResolvedValue({
      id: 'req-2',
      type: 'CREDIT_ADD',
      status: 'OPEN',
      message: '3,000 크레딧',
      createdAt: null,
    });
    renderView();

    await userEvent.click(await screen.findByText('＋ 크레딧 추가 요청'));
    const dialog = await screen.findByRole('dialog', {
      name: '크레딧 추가 요청',
    });
    await userEvent.type(
      within(dialog).getByLabelText('요청 내용'),
      '3,000 크레딧',
    );
    await userEvent.click(within(dialog).getByText('요청 보내기'));

    await waitFor(() =>
      expect(createOrgRequest).toHaveBeenCalledWith(
        'CREDIT_ADD',
        '3,000 크레딧',
        'tk',
      ),
    );
  });

  it('증빙이 없는 주문에는 내려받기가 없다', async () => {
    renderView();
    const paid = (await screen.findByText('연간 계약 · 10,000 크레딧')).closest(
      'tr',
    );
    expect(within(paid as HTMLElement).getByText('내려받기')).toBeTruthy();

    const unpaid = screen.getByText('크레딧 추가 · 3,000').closest('tr');
    expect(within(unpaid as HTMLElement).queryByText('내려받기')).toBeNull();
    expect(within(unpaid as HTMLElement).getByText('미납')).toBeTruthy();
  });

  it('계정 ID를 누르면 계정 상세(T2-2)가 열린다', async () => {
    renderView();
    await userEvent.click(await screen.findByText('kblib02'));

    expect(
      await screen.findByRole('dialog', {
        name: '계정 상세 — kblib02 · 수학 담당',
      }),
    ).toBeTruthy();
    await waitFor(() =>
      expect(listOrgAccountJobs).toHaveBeenCalledWith('kblib02', 'tk', {}),
    );
  });
});
