import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  cancelOrgRequest,
  createOrgRequest,
  getOrderReceipt,
  getOrgDashboard,
  listOrgAccountJobs,
  listOrgAccounts,
  setAccountLock,
  updateAccountAlias,
  updateReceiptEmail,
} from '../OrgService';
import { getUsageSummary, listUsageJobs } from '../UsageService';
import { API_BASE_URL } from '../apiClient';

const envelope = (result: unknown) => ({
  isSuccess: true,
  code: 'COMMON2000',
  message: '성공입니다.',
  result,
});

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // Response는 본문을 한 번만 읽을 수 있어, 호출마다 새로 만들어 준다.
  fetchSpy = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(() => Promise.resolve(jsonResponse(envelope(null))));
});

afterEach(() => vi.restoreAllMocks());

const lastCall = () => {
  const [url, init] = fetchSpy.mock.calls.at(-1) as [string, RequestInit];
  return { url, init };
};

describe('OrgService', () => {
  it('대시보드는 GET /api/org/dashboard에 토큰을 붙인다', async () => {
    await getOrgDashboard('tk');
    const { url, init } = lastCall();
    expect(url).toBe(`${API_BASE_URL}/api/org/dashboard`);
    expect(init.method ?? 'GET').toBe('GET');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer tk',
    );
  });

  it('소속 계정 조회는 파라미터 없이 부른다 (사용량은 계약 시작일 이후 누적)', async () => {
    await listOrgAccounts('tk');
    expect(lastCall().url).toBe(`${API_BASE_URL}/api/org/accounts`);
  });

  // 2026-08-20 명세 정정으로 필드 이름이 셋 바뀌었다(monthCredits→usedCredits 등).
  // 옛 이름을 주는 배포본이 남아 있어도 숫자 칸이 undefined가 되어 화면이 죽으면 안 된다.
  it('소속 계정 응답은 신·구 필드 이름을 모두 흡수한다', async () => {
    fetchSpy.mockImplementation(() =>
      Promise.resolve(
        jsonResponse(
          envelope({
            month: '2026-08',
            items: [
              {
                loginId: 'kblib01',
                alias: null,
                status: 'ACTIVE',
                role: 'ROLE_ORG_ADMIN',
                lastLoginAt: null,
                monthCredits: 820,
                self: true,
              },
            ],
          }),
        ),
      ),
    );

    const old = await listOrgAccounts('tk');
    expect(old.items[0].usedCredits).toBe(820);
    expect(old.items[0].isSelf).toBe(true);
    expect(old.usageSince).toBeNull();

    fetchSpy.mockImplementation(() =>
      Promise.resolve(
        jsonResponse(
          envelope({
            usageSince: '2026-02-24',
            items: [
              {
                loginId: 'kblib01',
                alias: '관리자',
                status: 'ACTIVE',
                role: 'ROLE_ORG_ADMIN',
                lastLoginAt: '2026-08-20T00:12:00Z',
                usedCredits: 820,
                isSelf: true,
              },
            ],
          }),
        ),
      ),
    );

    const now = await listOrgAccounts('tk');
    expect(now.usageSince).toBe('2026-02-24');
    expect(now.items[0].usedCredits).toBe(820);
    expect(now.items[0].isSelf).toBe(true);
  });

  it('items가 없어도 빈 목록으로 떨어뜨린다', async () => {
    fetchSpy.mockImplementation(() =>
      Promise.resolve(jsonResponse(envelope({}))),
    );
    await expect(listOrgAccounts('tk')).resolves.toEqual({
      usageSince: null,
      items: [],
    });
  });

  it('계정 작업 조회는 from·to를 그대로 넘긴다', async () => {
    await listOrgAccountJobs('kblib02', 'tk', {
      from: '2026-07-01',
      to: '2026-08-13',
    });
    expect(lastCall().url).toBe(
      `${API_BASE_URL}/api/org/accounts/kblib02/jobs?from=2026-07-01&to=2026-08-13`,
    );
  });

  it('별칭은 앞뒤 공백을 잘라 보내고, 빈 값이면 null로 지운다', async () => {
    await updateAccountAlias('kblib02', '  수학 담당  ', 'tk');
    let { init } = lastCall();
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ alias: '수학 담당' });

    await updateAccountAlias('kblib02', '   ', 'tk');
    ({ init } = lastCall());
    expect(JSON.parse(init.body as string)).toEqual({ alias: null });
  });

  it('잠금은 PATCH .../lock 에 locked를 보낸다', async () => {
    await setAccountLock('kblib02', true, 'tk');
    const { url, init } = lastCall();
    expect(url).toBe(`${API_BASE_URL}/api/org/accounts/kblib02/lock`);
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ locked: true });
  });

  it('요청 생성은 type과 message를 보내고, 빈 메시지는 null이다', async () => {
    await createOrgRequest('CREDIT_ADD', ' 3,000 크레딧 ', 'tk');
    const { url, init } = lastCall();
    expect(url).toBe(`${API_BASE_URL}/api/org/requests`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      type: 'CREDIT_ADD',
      message: '3,000 크레딧',
    });

    await createOrgRequest('ACCOUNT_ISSUE', '', 'tk');
    const { init: second } = lastCall();
    expect(JSON.parse(second.body as string)).toEqual({
      type: 'ACCOUNT_ISSUE',
      message: null,
    });
  });

  it('요청 취소는 DELETE /api/org/requests/{id}', async () => {
    await cancelOrgRequest('req-1', 'tk');
    const { url, init } = lastCall();
    expect(url).toBe(`${API_BASE_URL}/api/org/requests/req-1`);
    expect(init.method).toBe('DELETE');
  });

  it('증빙 받는 사람은 빈 값이면 null로 지운다', async () => {
    await updateReceiptEmail('  ', 'tk');
    const { url, init } = lastCall();
    expect(url).toBe(`${API_BASE_URL}/api/org/receipt-email`);
    expect(JSON.parse(init.body as string)).toEqual({ email: null });
  });

  it('증빙 링크는 주문 id 경로로 받는다 (presigned·15분이라 캐시하지 않는다)', async () => {
    fetchSpy.mockImplementationOnce(() =>
      Promise.resolve(
        jsonResponse(envelope({ fileName: '계산서.pdf', url: 'https://s3/x' })),
      ),
    );
    const link = await getOrderReceipt('order-1', 'tk');
    expect(lastCall().url).toBe(
      `${API_BASE_URL}/api/org/orders/order-1/receipt`,
    );
    expect(link.url).toBe('https://s3/x');
  });
});

describe('UsageService', () => {
  it('이번 달은 month 없이, 지난달은 month를 붙여 부른다', async () => {
    await getUsageSummary('tk');
    expect(lastCall().url).toBe(`${API_BASE_URL}/api/users/usage`);

    await getUsageSummary('tk', '2026-07');
    expect(lastCall().url).toBe(
      `${API_BASE_URL}/api/users/usage?month=2026-07`,
    );
  });

  it('작업별 크레딧은 기간을 지정하지 않으면 쿼리가 비어 있다 (서버 기본 30일)', async () => {
    await listUsageJobs('tk');
    expect(lastCall().url).toBe(`${API_BASE_URL}/api/users/usage/jobs`);

    await listUsageJobs('tk', { from: '2026-08-01', to: '2026-08-19' });
    expect(lastCall().url).toBe(
      `${API_BASE_URL}/api/users/usage/jobs?from=2026-08-01&to=2026-08-19`,
    );
  });
});
