import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// 앱 안 어디서나 뜨는 문의 FAB — 접수 경로는 기관 관리와 같은 POST /api/org/requests.
// 서버가 아직 ROLE_ORG_ADMIN으로 막고 있어(COMMON4003) 403 안내 문구도 함께 검증한다.

vi.mock('../../../api/OrgService', () => ({
  createOrgRequest: vi.fn(),
  listOrgRequests: vi.fn(),
  cancelOrgRequest: vi.fn(),
}));

import InquiryFab from '../support/InquiryFab';
import {
  cancelOrgRequest,
  createOrgRequest,
  listOrgRequests,
} from '../../../api/OrgService';
import { ApiError } from '../../../api/apiClient';

const onToast = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listOrgRequests).mockResolvedValue([]);
  vi.mocked(createOrgRequest).mockResolvedValue({
    id: 'req-1',
    type: 'CREDIT_ADD',
    status: 'OPEN',
    message: '크레딧이 부족합니다',
    createdAt: null,
  });
});

const openModal = async () => {
  render(<InquiryFab token="tk" onToast={onToast} />);
  await userEvent.click(screen.getByLabelText('문의하기'));
};

describe('문의 FAB', () => {
  it('FAB을 누르면 문의 창이 열리고, 유형과 내용을 보낸다', async () => {
    await openModal();

    await userEvent.click(screen.getByText('계정 발급'));
    await userEvent.type(screen.getByLabelText('문의 내용'), '계정 1개 부탁');
    await userEvent.click(screen.getByText('문의 보내기'));

    await waitFor(() =>
      expect(createOrgRequest).toHaveBeenCalledWith(
        'ACCOUNT_ISSUE',
        '계정 1개 부탁',
        'tk',
      ),
    );
    expect(onToast).toHaveBeenCalledWith(expect.stringContaining('접수'));
  });

  it('내용이 비면 보내지 않는다', async () => {
    await openModal();

    await userEvent.click(screen.getByText('문의 보내기'));

    expect(createOrgRequest).not.toHaveBeenCalled();
    expect(onToast).toHaveBeenCalledWith('문의 내용을 적어 주세요.');
  });

  // 서버가 권한을 풀기 전까지 일반 계정은 403을 받는다 — 무슨 일인지 그대로 알려 준다.
  it('권한이 아직 안 열렸으면 그 사정을 안내한다', async () => {
    vi.mocked(createOrgRequest).mockRejectedValue(
      new ApiError('권한이 없습니다.', 'COMMON4003', 403),
    );
    await openModal();

    await userEvent.type(screen.getByLabelText('문의 내용'), '오류 신고합니다');
    await userEvent.click(screen.getByText('문의 보내기'));

    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(
        expect.stringContaining('기관 담당자 계정만'),
      ),
    );
  });

  it('지난 문의와 처리 상태를 보여 주고, 접수 전이면 취소할 수 있다', async () => {
    vi.mocked(listOrgRequests).mockResolvedValue([
      {
        id: 'req-9',
        type: 'CREDIT_ADD',
        status: 'OPEN',
        message: '크레딧이 부족합니다',
        createdAt: '2026-08-20T09:12:00',
      },
      {
        id: 'req-8',
        type: 'ACCOUNT_ISSUE',
        status: 'ANSWERED',
        message: '계정 발급 완료 문의',
        createdAt: '2026-08-18T09:12:00',
      },
    ]);
    vi.mocked(cancelOrgRequest).mockResolvedValue(null);
    await openModal();

    expect(await screen.findByText('크레딧이 부족합니다')).toBeTruthy();
    expect(screen.getByText('답변 완료')).toBeTruthy();

    await userEvent.click(screen.getByLabelText('크레딧 추가 문의 취소'));
    await waitFor(() =>
      expect(cancelOrgRequest).toHaveBeenCalledWith('req-9', 'tk'),
    );
    // 답변 완료된 문의에는 취소 버튼이 없다(서버도 OPEN에서만 허용).
    expect(screen.queryByLabelText('계정 발급 문의 취소')).toBeNull();
  });

  // 조회 권한이 없으면 빈 목록 상자를 두지 않고 아예 그리지 않는다.
  it('지난 문의 조회가 막히면 목록을 숨긴다', async () => {
    vi.mocked(listOrgRequests).mockRejectedValue(
      new ApiError('권한이 없습니다.', 'COMMON4003', 403),
    );
    await openModal();

    await waitFor(() => expect(listOrgRequests).toHaveBeenCalled());
    expect(screen.queryByText('지난 문의')).toBeNull();
  });
});
