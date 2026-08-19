import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { getUsageSummary, listUsageJobs } from '../../../api/UsageService';
import { toUserMessage } from '../../../api/errorMessages';
import { UsageJob, UsageJobs, UsageSummary } from '../../../types/org';
import { isInProgress } from '../../../types/mypage';
import { ConversionTab, TAB_LABEL, TAB_VALUES } from '../../../types';
import {
  BrailleDefaults,
  loadBrailleDefaults,
  saveBrailleDefaults,
} from '../../../utils/brailleDefaults';
import { FOOTER_TEXT_MAX_LENGTH } from '../../../utils/fileValidation';
import { ROWS_PER_PAGE, CELLS_PER_ROW } from '../../../utils/brailleLayout';
import { rangeOf } from './AccountDetailPanel';
import {
  DASH,
  EmptyRow,
  formatNumber,
  JobStatusPill,
  monthKey,
  orDash,
  percentOf,
  Panel,
  ProgressBar,
  shortDateTime,
  SmallButton,
  Table,
  Td,
  Th,
  UsageLine,
} from './OrgUi';

// Figma V3-06 사용량 (T3 · 마이페이지에서 들어온다). 로그인한 모든 계정이 본다.
//
// 열람 범위(기획 확정): 내 사용량과 기관 전체·잔여까지. 다른 계정이 각각 얼마를
// 썼는지는 서버가 주지 않으므로 화면에도 없다.

interface Props {
  token: string;
  loginId?: string;
  onBack: () => void;
  // 작업을 에디터로 연다 — 마이페이지의 열기와 같은 규칙을 쓴다.
  onOpenJob: (job: UsageJob) => void;
  onToast: (message: string) => void;
}

type MonthTab = 'this' | 'last';
type RangeKey = 'recent30' | 'thisMonth' | 'lastMonth';

const RANGE_LABEL: Record<RangeKey, string> = {
  recent30: '최근 30일',
  thisMonth: '이번 달',
  lastMonth: '지난달',
};

const UsageView: React.FC<Props> = ({
  token,
  loginId,
  onBack,
  onOpenJob,
  onToast,
}) => {
  const [monthTab, setMonthTab] = useState<MonthTab>('this');
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [range, setRange] = useState<RangeKey>('recent30');
  const [jobs, setJobs] = useState<UsageJobs | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [defaults, setDefaults] = useState<BrailleDefaults>(() =>
    loadBrailleDefaults(),
  );
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    let alive = true;
    setIsLoading(true);
    // '이번 달'은 month를 비워 서버(KST)가 정하게 둔다.
    getUsageSummary(token, monthTab === 'last' ? monthKey(-1) : undefined)
      .then((res) => {
        if (alive) setSummary(res);
      })
      .catch((err) => {
        if (alive) onToast(toUserMessage(err, '사용량을 불러오지 못했습니다.'));
      })
      .finally(() => {
        if (alive) setIsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [token, monthTab, onToast]);

  useEffect(() => {
    let alive = true;
    listUsageJobs(token, rangeOf(range))
      .then((res) => {
        if (alive) setJobs(res);
      })
      .catch((err) => {
        if (alive) onToast(toUserMessage(err, '작업을 불러오지 못했습니다.'));
      });
    return () => {
      alive = false;
    };
  }, [token, range, onToast]);

  const saveDefaults = useCallback(() => {
    saveBrailleDefaults(defaults);
    setSavedNotice(true);
    window.setTimeout(() => setSavedNotice(false), 2000);
  }, [defaults]);

  const allocated = summary?.orgAllocated ?? 0;
  const orgUsed = summary?.orgUsed ?? 0;
  const myCredits = summary?.myCredits ?? 0;
  const hasOrg = summary?.orgAllocated != null;

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
        <h2 className="text-[17px] font-bold text-gray-700">사용량</h2>
        {loginId && <p className="text-[11.5px] text-gray-500">{loginId}</p>}
        {isLoading && (
          <Loader2 size={16} className="animate-spin text-gray-400" />
        )}

        {/* 이번 달 / 지난달 */}
        <div
          role="tablist"
          aria-label="조회할 달"
          className="ml-auto flex gap-0.5 rounded-[7px] bg-[#f0f4f8] p-[3px]"
        >
          {(['this', 'last'] as MonthTab[]).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={monthTab === t}
              onClick={() => setMonthTab(t)}
              className={`rounded-[5px] px-[11px] py-1 text-[11px] font-bold transition-colors ${
                monthTab === t
                  ? 'bg-white text-[#5b8ce6]'
                  : 'text-gray-500 hover:text-[#5b8ce6]'
              }`}
            >
              {t === 'this' ? '이번 달' : '지난달'}
            </button>
          ))}
        </div>
      </div>

      {/* 내가 쓴 크레딧 · 우리 기관 남은 크레딧 */}
      <div className="flex flex-col gap-3 lg:flex-row">
        <Panel title="내가 쓴 크레딧" className="flex-1">
          <p className="text-[23px] font-bold text-gray-700">
            {formatNumber(myCredits)}
          </p>
          <div className="mt-3 flex flex-col gap-2">
            <ProgressBar
              value={myCredits}
              max={allocated}
              label="기관 할당 대비 내 사용량"
            />
            <UsageLine used={myCredits} total={allocated} />
            <p className="text-[10.5px] text-gray-500">
              {hasOrg
                ? `기관 할당 ${formatNumber(allocated)} 중 ${percentOf(
                    myCredits,
                    allocated,
                  )}`
                : '기관에 소속되지 않은 계정입니다.'}
            </p>
          </div>
        </Panel>

        <Panel title="우리 기관 남은 크레딧" className="flex-1">
          <p className="text-[23px] font-bold text-gray-700">
            {hasOrg ? formatNumber(summary?.orgRemaining ?? 0) : DASH}
          </p>
          <div className="mt-3 flex flex-col gap-2">
            <ProgressBar
              value={orgUsed}
              max={allocated}
              label="기관 전체 크레딧 사용률"
            />
            <UsageLine used={orgUsed} total={allocated} />
            <p className="text-[10.5px] text-gray-500">
              기관 전체 기준 (계정별 소모량은 표시하지 않음)
            </p>
          </div>
        </Panel>
      </div>

      {/* 내 작업별 크레딧 */}
      <Panel
        className="mt-3"
        title="내 작업별 크레딧"
        right={
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as RangeKey)}
            aria-label="조회 기간"
            className="rounded-[6px] border border-[#e2e8f0] bg-white px-[10px] py-[5px] text-[11px] text-gray-700 outline-none focus:border-[#5b8ce6]"
          >
            {(Object.keys(RANGE_LABEL) as RangeKey[]).map((k) => (
              <option key={k} value={k}>
                {RANGE_LABEL[k]}
              </option>
            ))}
          </select>
        }
      >
        <Table
          caption="내 작업별 크레딧"
          head={
            <tr>
              <Th>작업명</Th>
              <Th>모드</Th>
              <Th align="right">쪽수</Th>
              <Th align="right">크레딧</Th>
              <Th>완료</Th>
              <Th>상태</Th>
              <Th>
                <span className="sr-only">열기</span>
              </Th>
            </tr>
          }
        >
          {!jobs || jobs.items.length === 0 ? (
            <EmptyRow colSpan={7}>이 기간에 한 작업이 없습니다.</EmptyRow>
          ) : (
            jobs.items.map((job) => {
              const busy = isInProgress(job.status);
              return (
                <tr key={job.jobId}>
                  <Td className="max-w-[200px] truncate">{job.fileName}</Td>
                  <Td>{TAB_LABEL[job.mode as ConversionTab] ?? job.mode}</Td>
                  <Td align="right">{formatNumber(job.totalPages)}</Td>
                  <Td align="right">{orDash(job.credits)}</Td>
                  <Td>{shortDateTime(job.finishedAt)}</Td>
                  <Td>
                    <JobStatusPill
                      status={job.status}
                      totalPages={job.totalPages}
                      donePages={job.donePages}
                      failedPages={job.failedPages}
                    />
                  </Td>
                  <Td>
                    {job.status === 'FAILED' ? (
                      DASH
                    ) : (
                      <SmallButton
                        disabled={busy}
                        title={
                          busy ? '변환이 끝나면 열 수 있습니다' : undefined
                        }
                        onClick={() => onOpenJob(job)}
                      >
                        열기
                      </SmallButton>
                    )}
                  </Td>
                </tr>
              );
            })
          )}
        </Table>
        {jobs && jobs.items.length > 0 && (
          <p className="mt-2 text-right text-[11px] text-gray-500">
            기간 합계 {formatNumber(jobs.totalCredits)} 크레딧
          </p>
        )}
      </Panel>

      {/* 점역 기본 설정 — 새 작업이 이 값으로 시작한다 */}
      <Panel
        className="mt-3"
        title="점역 기본 설정"
        right={
          <span className="text-[10.5px] text-gray-500">
            {savedNotice ? '저장했습니다' : '새 작업이 이 값으로 시작합니다'}
          </span>
        }
      >
        <div className="flex flex-col gap-4 lg:flex-row">
          <div className="flex flex-1 flex-col gap-[7px]">
            <SettingRow label="면 규격">
              <ReadonlyValue>
                {ROWS_PER_PAGE}줄 × {CELLS_PER_ROW}칸
              </ReadonlyValue>
            </SettingRow>
            <SettingRow label="페이지행">
              <select
                value={defaults.insertPageNumber ? 'on' : 'off'}
                onChange={(e) =>
                  setDefaults((d) => ({
                    ...d,
                    insertPageNumber: e.target.value === 'on',
                  }))
                }
                aria-label="페이지행"
                className={fieldCls}
              >
                <option value="off">넣지 않음</option>
                <option value="on">마지막 줄에 쪽번호</option>
              </select>
            </SettingRow>
            <SettingRow label="기본 변환 모드">
              <select
                value={defaults.defaultMode}
                onChange={(e) =>
                  setDefaults((d) => ({
                    ...d,
                    defaultMode: e.target.value as ConversionTab,
                  }))
                }
                aria-label="기본 변환 모드"
                className={fieldCls}
              >
                {TAB_VALUES.map((t) => (
                  <option key={t} value={t}>
                    {TAB_LABEL[t]}
                  </option>
                ))}
              </select>
            </SettingRow>
            <SettingRow label="꼬리말 기본 문구">
              <input
                value={defaults.footerText}
                maxLength={FOOTER_TEXT_MAX_LENGTH}
                onChange={(e) =>
                  setDefaults((d) => ({ ...d, footerText: e.target.value }))
                }
                placeholder="예) 도서명 · 권 번호"
                aria-label="꼬리말 기본 문구"
                className={fieldCls}
              />
            </SettingRow>
          </div>

          {/* 조판 규칙은 서버·AI가 정한다 — 앱에서 바꿀 수 있는 값이 아니라 읽기 전용 */}
          <div className="flex flex-1 flex-col gap-[7px]">
            <SettingRow label="표·글상자 테두리">
              <ReadonlyValue>사용함</ReadonlyValue>
            </SettingRow>
            <SettingRow label="그림 생략 표시">
              <ReadonlyValue>&quot;그림 생략&quot;을 적음</ReadonlyValue>
            </SettingRow>
            <SettingRow label="점역자 주 시작">
              <ReadonlyValue>3칸</ReadonlyValue>
            </SettingRow>
            <p className="pl-[106px] text-[10.5px] text-gray-400">
              조판 규칙은 서버에서 정합니다. 앱에서는 바꿀 수 없습니다.
            </p>
            <div className="mt-auto flex justify-end pt-2">
              <SmallButton variant="accent" onClick={saveDefaults}>
                설정 저장
              </SmallButton>
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
};

const fieldCls =
  'h-[29px] flex-1 rounded-[6px] border border-[#e2e8f0] bg-white px-[10px] text-[11.5px] text-gray-700 outline-none focus:border-[#5b8ce6]';

const SettingRow: React.FC<{ label: string; children: React.ReactNode }> = ({
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

export default UsageView;
