import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  listOrgAccountJobs,
  updateAccountAlias,
} from '../../../api/OrgService';
import { toUserMessage } from '../../../api/errorMessages';
import {
  OrgAccountJob,
  OrgAccountJobs,
  ORG_ALIAS_MAX_LENGTH,
} from '../../../types/org';
import {
  DASH,
  EmptyRow,
  formatNumber,
  JobStatusPill,
  orDash,
  percentOf,
  ProgressBar,
  shortDate,
  SmallButton,
  Table,
  Td,
  Th,
} from './OrgUi';

// Figma V3-06 계정 상세 (T2-2 · T2에서 계정 ID를 눌러 연다).
//
// 디자인은 별도 창이지만 앱 안 패널로 띄운다 — 토큰이 메모리에만 있어(자동 로그인
// 없음) 새 웹뷰 창에 세션을 넘기려면 창 간 동기화 채널을 늘려야 하고, 이 화면 하나
// 때문에 그 위험을 지지 않는다. 창 모양(제목줄 · 닫기 · 그림자)은 그대로 살렸다.
//
// 열람 범위(기획 확정): 목록·상태·크레딧까지만. 파일 내용과 접속 정보는 서버가
// 내려주지 않으므로 화면에도 없다.

interface Props {
  token: string;
  loginId: string;
  alias: string | null;
  orgName: string;
  // 기관 할당 크레딧 — "기관 할당 대비 이 계정" 막대의 분모
  orgAllocated: number | null;
  onClose: () => void;
  // 별칭을 바꾸면 뒤쪽 소속 계정 표도 같이 고쳐야 한다.
  onAliasSaved: (loginId: string, alias: string) => void;
  onToast: (message: string) => void;
}

type RangeKey = 'recent30' | 'thisMonth' | 'lastMonth';

const RANGE_LABEL: Record<RangeKey, string> = {
  recent30: '최근 30일',
  thisMonth: '이번 달',
  lastMonth: '지난달',
};

const iso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;

// 기간 미지정(recent30)은 서버 기본값(최근 30일)에 맡긴다.
export const rangeOf = (
  key: RangeKey,
  now: Date = new Date(),
): { from?: string; to?: string } => {
  if (key === 'thisMonth') {
    return {
      from: iso(new Date(now.getFullYear(), now.getMonth(), 1)),
      to: iso(now),
    };
  }
  if (key === 'lastMonth') {
    return {
      from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      to: iso(new Date(now.getFullYear(), now.getMonth(), 0)),
    };
  }
  return {};
};

const AccountDetailPanel: React.FC<Props> = ({
  token,
  loginId,
  alias,
  orgName,
  orgAllocated,
  onClose,
  onAliasSaved,
  onToast,
}) => {
  const [range, setRange] = useState<RangeKey>('recent30');
  const [data, setData] = useState<OrgAccountJobs | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [aliasInput, setAliasInput] = useState(alias ?? '');
  const [isSavingAlias, setIsSavingAlias] = useState(false);

  useEffect(() => setAliasInput(alias ?? ''), [alias, loginId]);

  useEffect(() => {
    let alive = true;
    setIsLoading(true);
    listOrgAccountJobs(loginId, token, rangeOf(range))
      .then((res) => {
        if (alive) setData(res);
      })
      .catch((err) => {
        if (alive) onToast(toUserMessage(err, '작업을 불러오지 못했습니다.'));
      })
      .finally(() => {
        if (alive) setIsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [loginId, token, range, onToast]);

  // ESC로 닫는다 (모달 공통 규칙).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const saveAlias = useCallback(async () => {
    const next = aliasInput.trim();
    if (next === (alias ?? '')) return;
    if (next.length > ORG_ALIAS_MAX_LENGTH) {
      onToast(`별칭은 ${ORG_ALIAS_MAX_LENGTH}자까지 쓸 수 있습니다.`);
      return;
    }
    setIsSavingAlias(true);
    try {
      await updateAccountAlias(loginId, next, token);
      onAliasSaved(loginId, next);
      onToast(next ? '별칭을 바꿨습니다.' : '별칭을 지웠습니다.');
    } catch (err) {
      setAliasInput(alias ?? '');
      onToast(toUserMessage(err, '별칭을 바꾸지 못했습니다.'));
    } finally {
      setIsSavingAlias(false);
    }
  }, [aliasInput, alias, loginId, token, onAliasSaved, onToast]);

  const items: OrgAccountJob[] = useMemo(() => data?.items ?? [], [data]);

  const title = `계정 상세 — ${loginId}${alias ? ` · ${alias}` : ''}`;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[90vh] w-full max-w-[560px] overflow-hidden rounded-[10px] border border-[#e2e8f0] bg-white shadow-[0_12px_36px_0_rgba(15,23,41,0.16)]"
      >
        {/* 제목줄 */}
        <div className="flex h-[42px] items-center gap-2 border-b border-[#e2e8f0] bg-[#f0f4f8] px-[14px]">
          <h2 className="text-[12.5px] font-bold text-gray-700">{title}</h2>
          <SmallButton className="ml-auto" onClick={onClose}>
            닫기
          </SmallButton>
        </div>

        <div className="custom-scrollbar max-h-[calc(90vh-42px)] overflow-y-auto p-[14px]">
          {/* 기관 · 계정 ID · 별칭 */}
          <div className="flex flex-col gap-[7px]">
            <Field label="기관">
              <ReadonlyValue>{orgName || DASH}</ReadonlyValue>
            </Field>
            <Field label="계정 ID">
              <ReadonlyValue>{loginId}</ReadonlyValue>
            </Field>
            <Field label="별칭">
              <div className="flex flex-1 items-center gap-2">
                <input
                  value={aliasInput}
                  maxLength={ORG_ALIAS_MAX_LENGTH}
                  onChange={(e) => setAliasInput(e.target.value)}
                  onBlur={() => void saveAlias()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                  }}
                  placeholder="역할명 (예: 수학 담당)"
                  aria-label="별칭"
                  className="h-[29px] flex-1 rounded-[6px] border border-[#e2e8f0] bg-white px-[10px] text-[11.5px] text-gray-700 outline-none focus:border-[#5b8ce6]"
                />
                {isSavingAlias && (
                  <Loader2
                    size={14}
                    className="animate-spin text-gray-400"
                    aria-label="저장 중"
                  />
                )}
              </div>
            </Field>
            <p className="pl-[106px] text-[10.5px] text-gray-400">
              실명 대신 역할명을 권장합니다.
            </p>
          </div>

          {/* 기관 할당 대비 이 계정 */}
          <div className="mt-3 flex flex-col gap-[7px]">
            <p className="text-[11.5px] font-bold text-gray-700">
              기관 할당 대비 이 계정
            </p>
            <ProgressBar
              value={data?.totalCredits ?? 0}
              max={orgAllocated ?? 0}
              label="기관 할당 대비 이 계정의 사용 크레딧"
            />
            <div className="flex items-center gap-1 text-[11px]">
              <span className="font-bold text-gray-700">
                {formatNumber(data?.totalCredits ?? 0)}
              </span>
              <span className="text-gray-500">
                / {orgAllocated == null ? DASH : formatNumber(orgAllocated)}{' '}
                크레딧
              </span>
              <span className="ml-auto text-gray-500">
                {orgAllocated
                  ? percentOf(data?.totalCredits ?? 0, orgAllocated)
                  : DASH}
              </span>
            </div>
          </div>

          {/* 이 계정의 작업 */}
          <div className="mt-3 rounded-[8px] border border-[#e2e8f0] bg-[#f0f4f8] p-[13px]">
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-[12px] font-bold text-gray-700">
                이 계정의 작업
              </h3>
              <select
                value={range}
                onChange={(e) => setRange(e.target.value as RangeKey)}
                aria-label="조회 기간"
                className="ml-auto rounded-[6px] border border-[#e2e8f0] bg-white px-[10px] py-[5px] text-[11px] text-gray-700 outline-none focus:border-[#5b8ce6]"
              >
                {(Object.keys(RANGE_LABEL) as RangeKey[]).map((k) => (
                  <option key={k} value={k}>
                    {RANGE_LABEL[k]}
                  </option>
                ))}
              </select>
            </div>
            {data && (
              <p className="mb-2 text-[10.5px] text-gray-500">
                {data.from} ~ {data.to}
              </p>
            )}

            <Table
              caption={`${loginId} 계정의 작업 목록`}
              head={
                <tr>
                  <Th>작업명</Th>
                  <Th>상태</Th>
                  <Th align="right">쪽수</Th>
                  <Th align="right">크레딧</Th>
                  <Th>완료</Th>
                </tr>
              }
            >
              {isLoading ? (
                <EmptyRow colSpan={5}>불러오는 중…</EmptyRow>
              ) : items.length === 0 ? (
                <EmptyRow colSpan={5}>이 기간에 한 작업이 없습니다.</EmptyRow>
              ) : (
                <>
                  {items.map((job) => (
                    <tr key={job.jobId}>
                      <Td className="max-w-[160px] truncate">{job.fileName}</Td>
                      <Td>
                        <JobStatusPill
                          status={job.status}
                          totalPages={job.totalPages}
                          donePages={job.donePages}
                          failedPages={job.failedPages}
                        />
                      </Td>
                      <Td align="right">{formatNumber(job.totalPages)}</Td>
                      <Td align="right">{orDash(job.credits)}</Td>
                      <Td>{shortDate(job.finishedAt)}</Td>
                    </tr>
                  ))}
                  <tr className="bg-[#f0f4f8]">
                    <Td className="font-bold">기간 합계</Td>
                    <Td>{DASH}</Td>
                    <Td align="right" className="font-bold">
                      {formatNumber(data?.totalPages ?? 0)}
                    </Td>
                    <Td align="right" className="font-bold">
                      {formatNumber(data?.totalCredits ?? 0)}
                    </Td>
                    <Td>{DASH}</Td>
                  </tr>
                </>
              )}
            </Table>
          </div>

          <p className="mt-3 rounded-[8px] border border-[#e2e8f0] bg-[#f0f4f8] px-[13px] py-[11px] text-[11px] text-[#475569]">
            기관 담당자는 목록과 크레딧까지 봅니다. 파일 내용과 접속 정보는
            보이지 않습니다.
          </p>
        </div>
      </div>
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <div className="flex items-center gap-[10px]">
    <span className="w-[96px] shrink-0 text-[11.5px] font-bold text-gray-500">
      {label}
    </span>
    {children}
  </div>
);

const ReadonlyValue: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <span className="flex-1 rounded-[6px] bg-[#f0f4f8] px-[10px] py-[6px] text-[11.5px] text-gray-700">
    {children}
  </span>
);

export default AccountDetailPanel;
