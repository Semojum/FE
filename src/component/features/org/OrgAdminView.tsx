import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Modal, { ModalButton } from '../../shared/Modal';
import { toUserMessage } from '../../../api/errorMessages';
import {
  cancelOrgRequest,
  createOrgRequest,
  fetchReceiptBlob,
  getOrderReceipt,
  getOrgDashboard,
  listOrgAccounts,
  listOrgNotices,
  listOrgOrders,
  listOrgRequests,
  setAccountLock,
  updateReceiptEmail,
} from '../../../api/OrgService';
import {
  CONTRACT_TYPE_LABEL,
  INVOICE_STATUS_LABEL,
  isCancelableRequest,
  NOTICE_SCOPE_LABEL,
  OrgAccount,
  OrgDashboard,
  OrgNotice,
  OrgOrders,
  OrgRequest,
  OrgRequestType,
  ORG_REQUEST_MESSAGE_MAX_LENGTH,
} from '../../../types/org';
import { saveBlob } from '../../../utils/download';
import AccountDetailPanel from './AccountDetailPanel';
import UsageChart from './UsageChart';
import {
  DASH,
  ddayLabel,
  daysUntil,
  depletionLabel,
  EmptyRow,
  formatNumber,
  lastLoginLabel,
  LinkButton,
  orDash,
  Panel,
  Pill,
  ProgressBar,
  shortDate,
  SmallButton,
  StatCard,
  StatValue,
  Table,
  Td,
  Th,
  UsageLine,
} from './OrgUi';

// Figma V3-06 기관 관리 (T2 · ROLE_ORG_ADMIN 로그인 시 마이페이지에서 들어온다).
//
// 이 화면이 직접 바꾸는 것은 별칭과 잠금 둘뿐이다. 계정 발급·삭제·비밀번호
// 재발급·크레딧 충전은 세모점(운영자) 소관이라, 화면에서는 "요청"으로 접수하고
// 처리 상태만 보여 준다 (POST/GET/DELETE /api/org/requests).

interface Props {
  token: string;
  onBack: () => void;
  onToast: (message: string) => void;
}

const REQUEST_TITLE: Record<OrgRequestType, string> = {
  CREDIT_ADD: '크레딧 추가 요청',
  ACCOUNT_ISSUE: '계정 발급 요청',
};

const REQUEST_PLACEHOLDER: Record<OrgRequestType, string> = {
  CREDIT_ADD: '예) 3,000 크레딧 추가 요청드립니다.',
  ACCOUNT_ISSUE: '예) 국어 담당 계정 1개 발급 부탁드립니다.',
};

const OrgAdminView: React.FC<Props> = ({ token, onBack, onToast }) => {
  const [dashboard, setDashboard] = useState<OrgDashboard | null>(null);
  const [accounts, setAccounts] = useState<OrgAccount[]>([]);
  // 계정 표의 "사용"이 언제부터 쌓인 값인지(=계약 시작일). 서버가 함께 준다.
  const [usageSince, setUsageSince] = useState<string | null>(null);
  const [notices, setNotices] = useState<OrgNotice[]>([]);
  const [orders, setOrders] = useState<OrgOrders | null>(null);
  const [requests, setRequests] = useState<OrgRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [detailTarget, setDetailTarget] = useState<OrgAccount | null>(null);
  const [noticeTarget, setNoticeTarget] = useState<OrgNotice | null>(null);
  const [lockTarget, setLockTarget] = useState<OrgAccount | null>(null);
  const [requestType, setRequestType] = useState<OrgRequestType | null>(null);
  const [requestMessage, setRequestMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [receiptEmail, setReceiptEmail] = useState('');

  // 계정 목록과 요청 목록은 조작 뒤 다시 부른다.
  const reloadAccounts = useCallback(async () => {
    const [list, reqs] = await Promise.all([
      listOrgAccounts(token),
      listOrgRequests(token).catch(() => [] as OrgRequest[]),
    ]);
    setAccounts(list.items);
    setUsageSince(list.usageSince);
    setRequests(reqs ?? []);
  }, [token]);

  useEffect(() => {
    let alive = true;
    setIsLoading(true);
    // 대시보드만 필수다 — 주문·공지·요청은 실패해도 화면의 나머지는 보여 준다.
    getOrgDashboard(token)
      .then((d) => {
        if (alive) setDashboard(d);
      })
      .catch((err) => {
        if (alive)
          setLoadError(toUserMessage(err, '기관 정보를 불러오지 못했습니다.'));
      })
      .finally(() => {
        if (alive) setIsLoading(false);
      });

    void listOrgAccounts(token)
      .then((list) => {
        if (!alive) return;
        setAccounts(list.items);
        setUsageSince(list.usageSince);
      })
      .catch(() => undefined);
    void listOrgNotices(token)
      .then((n) => {
        if (alive) setNotices(n ?? []);
      })
      .catch(() => undefined);
    void listOrgOrders(token)
      .then((o) => {
        if (!alive) return;
        setOrders(o);
        setReceiptEmail(o.receiptEmail ?? '');
      })
      .catch(() => undefined);
    void listOrgRequests(token)
      .then((r) => {
        if (alive) setRequests(r ?? []);
      })
      .catch(() => undefined);

    return () => {
      alive = false;
    };
  }, [token]);

  // 아직 처리되지 않은 계정 발급 요청 — 소속 계정 표 아래에 줄로 붙는다.
  const pendingAccountRequests = useMemo(
    () =>
      requests.filter(
        (r) => r.type === 'ACCOUNT_ISSUE' && r.status !== 'ANSWERED',
      ),
    [requests],
  );

  const openRequest = (type: OrgRequestType) => {
    setRequestType(type);
    setRequestMessage('');
  };

  const submitRequest = async () => {
    if (!requestType) return;
    setBusy(true);
    try {
      await createOrgRequest(requestType, requestMessage, token);
      setRequests(await listOrgRequests(token).catch(() => requests));
      onToast(`${REQUEST_TITLE[requestType]}을 접수했습니다.`);
      setRequestType(null);
    } catch (err) {
      onToast(toUserMessage(err, '요청을 보내지 못했습니다.'));
    } finally {
      setBusy(false);
    }
  };

  const cancelRequest = async (request: OrgRequest) => {
    try {
      await cancelOrgRequest(request.id, token);
      setRequests((prev) => prev.filter((r) => r.id !== request.id));
      onToast('요청을 취소했습니다.');
    } catch (err) {
      onToast(toUserMessage(err, '요청을 취소하지 못했습니다.'));
    }
  };

  const applyLock = async (account: OrgAccount, locked: boolean) => {
    setBusy(true);
    try {
      const res = await setAccountLock(account.loginId, locked, token);
      await reloadAccounts();
      onToast(
        locked
          ? `${account.loginId} 계정을 잠갔습니다.${
              res.canceledJobs > 0
                ? ` 진행 중이던 변환 ${res.canceledJobs}건이 중단됐습니다.`
                : ''
            }`
          : `${account.loginId} 계정의 잠금을 풀었습니다.`,
      );
      setLockTarget(null);
    } catch (err) {
      onToast(toUserMessage(err, '계정 상태를 바꾸지 못했습니다.'));
    } finally {
      setBusy(false);
    }
  };

  const saveReceiptEmail = async () => {
    const next = receiptEmail.trim();
    if (next === (orders?.receiptEmail ?? '')) return;
    try {
      await updateReceiptEmail(next, token);
      setOrders((prev) =>
        prev ? { ...prev, receiptEmail: next || null } : prev,
      );
      onToast(
        next ? '증빙 받는 사람을 바꿨습니다.' : '증빙 받는 사람을 지웠습니다.',
      );
    } catch (err) {
      setReceiptEmail(orders?.receiptEmail ?? '');
      onToast(toUserMessage(err, '증빙 받는 사람을 바꾸지 못했습니다.'));
    }
  };

  const downloadReceipt = async (orderId: string) => {
    try {
      // presigned URL은 15분짜리라 누를 때마다 새로 받는다.
      const link = await getOrderReceipt(orderId, token);
      const blob = await fetchReceiptBlob(link.url);
      const saved = await saveBlob(blob, link.fileName);
      if (saved) onToast(`저장했습니다 — ${saved}`);
    } catch (err) {
      onToast(toUserMessage(err, '증빙을 내려받지 못했습니다.'));
    }
  };

  const remaining = dashboard?.creditRemaining ?? 0;
  const allocated = dashboard?.creditAllocated ?? 0;
  const used = dashboard?.creditUsed ?? 0;
  const monthlyUsage = dashboard?.monthlyUsage ?? [];
  const contractLeft = dashboard?.contractExpiresAt
    ? daysUntil(dashboard.contractExpiresAt)
    : NaN;

  return (
    <div className="custom-scrollbar flex-1 overflow-y-auto px-6 pb-8">
      <div className="flex items-center gap-3 py-4">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-200/70 hover:text-[#5b8ce6]"
        >
          <ArrowLeft size={18} />
          <span>마이페이지</span>
        </button>
        <h2 className="text-[17px] font-bold text-gray-700">기관 관리</h2>
        {dashboard && (
          <p className="text-[11.5px] text-gray-500">
            {dashboard.orgName} · {dashboard.orgCode} ·{' '}
            {CONTRACT_TYPE_LABEL[dashboard.contractType] ??
              dashboard.contractType}
          </p>
        )}
        {isLoading && (
          <Loader2 size={16} className="animate-spin text-gray-400" />
        )}
      </div>

      {loadError && (
        <p className="mb-3 rounded-[10px] border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-[12px] text-[#ef4444]">
          {loadError}
        </p>
      )}

      {/* 요약 카드 3종 */}
      <div className="flex flex-col gap-3 md:flex-row">
        <StatCard label="할당 크레딧">
          <StatValue>{formatNumber(allocated)}</StatValue>
          <ProgressBar
            value={used}
            max={allocated}
            label="기관 크레딧 사용률"
          />
          <UsageLine used={used} total={allocated} />
        </StatCard>

        <StatCard label="남은 크레딧">
          <StatValue>{formatNumber(remaining)}</StatValue>
          <p className="text-[11px] text-gray-500">
            {dashboard ? depletionLabel(remaining, monthlyUsage) || ' ' : ' '}
          </p>
          <SmallButton
            variant="accent"
            className="w-full"
            onClick={() => openRequest('CREDIT_ADD')}
          >
            ＋ 크레딧 추가 요청
          </SmallButton>
        </StatCard>

        <StatCard label="계약">
          <p className="text-[17px] font-bold text-gray-700">
            {dashboard?.contractExpiresAt ?? DASH}
          </p>
          {dashboard?.contractExpiresAt && (
            <p
              className={`text-[11px] font-bold ${
                contractLeft <= 30 ? 'text-[#ef4444]' : 'text-gray-500'
              }`}
            >
              {ddayLabel(dashboard.contractExpiresAt)}
            </p>
          )}
          <p className="text-[11px] text-gray-500">
            시작 {dashboard?.contractStartedAt ?? DASH}
          </p>
        </StatCard>
      </div>

      {/* 월별 사용 추이 · 공지 */}
      <div className="mt-3 flex flex-col gap-3 lg:flex-row">
        <Panel title="월별 사용 추이" className="flex-1">
          {monthlyUsage.length > 0 ? (
            <UsageChart points={monthlyUsage} />
          ) : (
            <p className="py-6 text-center text-[11.5px] text-gray-400">
              아직 사용 기록이 없습니다.
            </p>
          )}
        </Panel>

        <Panel title="공지" className="flex-1">
          <Table
            caption="기관 공지 목록"
            head={
              <tr>
                <Th>받은 날</Th>
                <Th>분류</Th>
                <Th>제목</Th>
              </tr>
            }
          >
            {notices.length === 0 ? (
              <EmptyRow colSpan={3}>표시할 공지가 없습니다.</EmptyRow>
            ) : (
              notices.map((n) => (
                <tr key={n.id}>
                  <Td>{shortDate(n.createdAt ?? n.startsOn)}</Td>
                  <Td>
                    <Pill tone={n.scope === 'ORG' ? 'red' : 'blue'}>
                      {NOTICE_SCOPE_LABEL[n.scope] ?? n.scope}
                    </Pill>
                  </Td>
                  <Td>
                    <LinkButton onClick={() => setNoticeTarget(n)}>
                      {n.title}
                    </LinkButton>
                  </Td>
                </tr>
              ))
            )}
          </Table>
        </Panel>
      </div>

      {/* 소속 계정 */}
      <Panel
        className="mt-3"
        title="소속 계정"
        right={
          <>
            {usageSince && (
              <span className="text-[10.5px] text-gray-500">
                {usageSince}부터 누적
              </span>
            )}
            {pendingAccountRequests.length > 0 && (
              <span className="text-[10.5px] text-gray-500">
                발급 요청 {pendingAccountRequests.length}건 처리 중
              </span>
            )}
            <SmallButton onClick={() => openRequest('ACCOUNT_ISSUE')}>
              ＋ 계정 발급 요청
            </SmallButton>
          </>
        }
      >
        <Table
          caption="소속 계정 목록"
          head={
            <tr>
              <Th>계정 ID</Th>
              <Th>별칭</Th>
              <Th>상태</Th>
              <Th>마지막 로그인</Th>
              <Th align="right">사용(누적)</Th>
              <Th>제어</Th>
            </tr>
          }
        >
          {accounts.length === 0 && pendingAccountRequests.length === 0 ? (
            <EmptyRow colSpan={6}>소속 계정이 없습니다.</EmptyRow>
          ) : (
            <>
              {accounts.map((a) => (
                <tr key={a.loginId}>
                  <Td>
                    <span className="flex items-center gap-1.5">
                      <LinkButton onClick={() => setDetailTarget(a)}>
                        {a.loginId}
                      </LinkButton>
                      {a.isSelf && (
                        <span className="text-[10.5px] text-gray-500">
                          본인
                        </span>
                      )}
                    </span>
                  </Td>
                  <Td>{a.alias || DASH}</Td>
                  <Td>
                    {a.status === 'ACTIVE' ? (
                      <Pill tone="green">활성</Pill>
                    ) : (
                      <Pill tone="gray">잠김</Pill>
                    )}
                  </Td>
                  <Td>{lastLoginLabel(a.lastLoginAt)}</Td>
                  <Td align="right">{orDash(a.usedCredits)}</Td>
                  <Td>
                    {a.isSelf ? (
                      DASH
                    ) : a.status === 'ACTIVE' ? (
                      <SmallButton onClick={() => setLockTarget(a)}>
                        잠금
                      </SmallButton>
                    ) : (
                      <SmallButton onClick={() => void applyLock(a, false)}>
                        잠금 해제
                      </SmallButton>
                    )}
                  </Td>
                </tr>
              ))}
              {pendingAccountRequests.map((r) => (
                <tr key={r.id}>
                  <Td className="text-gray-500">발급 요청 중</Td>
                  <Td className="max-w-[160px] truncate">
                    {r.message || DASH}
                  </Td>
                  <Td>
                    <Pill tone="amber">
                      {r.createdAt
                        ? `${shortDate(r.createdAt)} 요청`
                        : '요청 접수'}
                    </Pill>
                  </Td>
                  <Td>{DASH}</Td>
                  <Td align="right">{DASH}</Td>
                  <Td>
                    {isCancelableRequest(r) ? (
                      <SmallButton onClick={() => void cancelRequest(r)}>
                        요청 취소
                      </SmallButton>
                    ) : (
                      DASH
                    )}
                  </Td>
                </tr>
              ))}
            </>
          )}
        </Table>
      </Panel>

      {/* 주문 내역 */}
      <Panel className="mt-3" title="주문 내역">
        <Table
          caption="주문 내역"
          head={
            <tr>
              <Th>일자</Th>
              <Th>내용</Th>
              <Th align="right">금액</Th>
              <Th>결제</Th>
              <Th>계산서</Th>
              <Th>증빙</Th>
            </tr>
          }
        >
          {!orders?.items?.length ? (
            <EmptyRow colSpan={6}>주문 내역이 없습니다.</EmptyRow>
          ) : (
            orders.items.map((o) => (
              <tr key={o.id}>
                <Td>{o.orderDate}</Td>
                <Td>{o.description}</Td>
                <Td align="right">₩{formatNumber(o.amountKrw)}</Td>
                <Td>
                  {o.paidAt ? (
                    <Pill tone="green">완납</Pill>
                  ) : (
                    <Pill tone="amber">미납</Pill>
                  )}
                </Td>
                <Td>
                  {INVOICE_STATUS_LABEL[o.invoiceStatus] ?? o.invoiceStatus}
                </Td>
                <Td>
                  {o.receiptFileName ? (
                    <LinkButton onClick={() => void downloadReceipt(o.id)}>
                      내려받기
                    </LinkButton>
                  ) : (
                    DASH
                  )}
                </Td>
              </tr>
            ))
          )}
        </Table>

        <div className="mt-3 flex items-center gap-2">
          <label
            htmlFor="receipt-email"
            className="text-[11px] font-bold text-gray-500"
          >
            증빙 받는 사람
          </label>
          <input
            id="receipt-email"
            type="email"
            value={receiptEmail}
            onChange={(e) => setReceiptEmail(e.target.value)}
            onBlur={() => void saveReceiptEmail()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            placeholder="account@example.or.kr"
            className="w-[240px] rounded-[6px] border border-[#e2e8f0] bg-white px-[10px] py-[6px] text-[11.5px] text-gray-700 outline-none focus:border-[#5b8ce6]"
          />
        </div>
      </Panel>

      {/* 계정 상세 (T2-2) */}
      {detailTarget && (
        <AccountDetailPanel
          token={token}
          loginId={detailTarget.loginId}
          alias={detailTarget.alias}
          orgName={dashboard?.orgName ?? ''}
          orgAllocated={dashboard?.creditAllocated ?? null}
          usageSince={usageSince ?? dashboard?.contractStartedAt}
          onClose={() => setDetailTarget(null)}
          onAliasSaved={(loginId, nextAlias) => {
            setAccounts((prev) =>
              prev.map((a) =>
                a.loginId === loginId ? { ...a, alias: nextAlias || null } : a,
              ),
            );
            setDetailTarget((prev) =>
              prev ? { ...prev, alias: nextAlias || null } : prev,
            );
          }}
          onToast={onToast}
        />
      )}

      {/* 공지 본문 */}
      <Modal
        isOpen={!!noticeTarget}
        title={noticeTarget?.title ?? ''}
        onClose={() => setNoticeTarget(null)}
        footer={
          <ModalButton onClick={() => setNoticeTarget(null)}>닫기</ModalButton>
        }
      >
        <p className="text-[11.5px] text-gray-400">
          {noticeTarget && NOTICE_SCOPE_LABEL[noticeTarget.scope]} ·{' '}
          {shortDate(noticeTarget?.createdAt ?? noticeTarget?.startsOn)}
        </p>
        <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-gray-700">
          {noticeTarget?.body}
        </p>
      </Modal>

      {/* 요청 보내기 */}
      <Modal
        isOpen={!!requestType}
        busy={busy}
        title={requestType ? REQUEST_TITLE[requestType] : ''}
        onClose={() => setRequestType(null)}
        footer={
          <>
            <ModalButton disabled={busy} onClick={() => setRequestType(null)}>
              취소
            </ModalButton>
            <ModalButton
              variant="danger"
              disabled={busy}
              onClick={() => void submitRequest()}
            >
              요청 보내기
            </ModalButton>
          </>
        }
      >
        <p className="text-[13px] text-gray-500">
          세모점 운영자에게 접수됩니다. 처리 상태는 이 화면에서 확인할 수
          있습니다.
        </p>
        <textarea
          value={requestMessage}
          maxLength={ORG_REQUEST_MESSAGE_MAX_LENGTH}
          onChange={(e) => setRequestMessage(e.target.value)}
          placeholder={requestType ? REQUEST_PLACEHOLDER[requestType] : ''}
          aria-label="요청 내용"
          className="mt-3 h-[96px] w-full resize-none rounded-[10px] border border-[#5b8ce6] bg-white p-3 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-[#5b8ce6]/20"
        />
      </Modal>

      {/* 잠금 확인 — 진행 중이던 변환이 중단되므로 되돌릴 수 없는 동작으로 다룬다 */}
      <Modal
        isOpen={!!lockTarget}
        busy={busy}
        title="계정을 잠글까요?"
        onClose={() => setLockTarget(null)}
        footer={
          <>
            <ModalButton disabled={busy} onClick={() => setLockTarget(null)}>
              취소
            </ModalButton>
            <ModalButton
              variant="danger"
              disabled={busy}
              onClick={() => lockTarget && void applyLock(lockTarget, true)}
            >
              잠금
            </ModalButton>
          </>
        }
      >
        <p className="text-[13px] text-gray-600">
          {lockTarget?.loginId}
          {lockTarget?.alias ? ` · ${lockTarget.alias}` : ''} 계정이 즉시
          로그인할 수 없게 됩니다. 진행 중이던 변환도 함께 중단됩니다.
        </p>
      </Modal>
    </div>
  );
};

export default OrgAdminView;
