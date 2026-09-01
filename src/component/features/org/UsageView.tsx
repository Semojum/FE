import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import TypesetSettings from '../conversion/TypesetSettings';
import UnfinishedModal from '../../shared/UnfinishedModal';
import { useIsDevBuild } from '../../../hooks/UseIsDevBuild';
import type { UnfinishedId } from '../../../utils/unfinished';
import {
  DASH,
  EmptyRow,
  formatNumber,
  JobStatusPill,
  monthKey,
  monthOptions,
  monthRange,
  MonthSelect,
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

// 아직 완성되지 않은 설정을 감싼다. 감추지 않고 흐리게만 두는 것은, 없어진 줄
// 알고 묻는 것보다 "곧 열린다"를 보여 주는 편이 낫기 때문이다.
const Locked: React.FC<{
  locked: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ locked, onClick, children }) =>
  locked ? (
    <div className="relative">
      <div className="pointer-events-none select-none opacity-50" aria-hidden>
        {children}
      </div>
      <button
        type="button"
        onClick={onClick}
        aria-label="아직 준비 중인 설정 — 눌러서 안내 보기"
        className="absolute inset-0 rounded-lg"
      />
    </div>
  ) : (
    <>{children}</>
  );

const UsageView: React.FC<Props> = ({
  token,
  loginId,
  onBack,
  onOpenJob,
  onToast,
}) => {
  // 조판 설정·점역 옵션은 아직 결과물에 반영되지 않는다 — 개발 빌드에서만 연다.
  const isDevBuild = useIsDevBuild();
  const [notice, setNotice] = useState<UnfinishedId | null>(null);
  // 기본은 이번 달. 드롭다운으로 지난 달들을 골라 본다(요약·작업 목록이 함께 움직인다).
  const [month, setMonth] = useState(() => monthKey());
  const months = useMemo(() => monthOptions(), []);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [jobs, setJobs] = useState<UsageJobs | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [defaults, setDefaults] = useState<BrailleDefaults>(() =>
    loadBrailleDefaults(),
  );
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    let alive = true;
    setIsLoading(true);
    // 이번 달은 month를 비워 서버(KST)가 정하게 둔다 — 자정 근처 경계는 서버가 옳다.
    getUsageSummary(token, month === monthKey() ? undefined : month)
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
  }, [token, month, onToast]);

  useEffect(() => {
    let alive = true;
    listUsageJobs(token, monthRange(month))
      .then((res) => {
        if (alive) setJobs(res);
      })
      .catch((err) => {
        if (alive) onToast(toUserMessage(err, '작업을 불러오지 못했습니다.'));
      });
    return () => {
      alive = false;
    };
  }, [token, month, onToast]);

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

        {/* 월 선택 — 요약과 작업 목록이 같은 달을 본다 */}
        <MonthSelect
          className="ml-auto"
          value={month}
          months={months}
          onChange={setMonth}
        />
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
          jobs && (
            <span className="text-[10.5px] text-gray-500">
              {jobs.from} ~ {jobs.to}
            </span>
          )
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

          {/* 조판 설정 — 1차 PoC(2026-08-26) 요청으로 앱에서 바꿀 수 있게 열었다.
              규칙 자체는 여전히 braille-assist가 소유하고, 여기서는 그 라이브러리가
              이미 받는 옵션(규격·페이지행 범위·표지 제외·쪽번호 종류)만 넘긴다. */}
          <div className="flex flex-1 flex-col gap-[7px]">
            <TypesetSettings
              value={defaults.typeset}
              onChange={(typeset) => setDefaults((d) => ({ ...d, typeset }))}
            />

            {/* 점역 옵션 — 1차 PoC 부가 기능. 서버가 받을 준비가 되기 전이라
                고르고 저장만 되고 변환에는 아직 반영되지 않는다. */}
            <Locked
              locked={!isDevBuild}
              onClick={() => setNotice('translation')}
            >
              <div className="mt-1 flex flex-col gap-1.5 border-t border-gray-100 pt-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-[12px] font-medium text-gray-600">
                    점역 옵션
                  </span>
                  <span className="rounded bg-[#fbf1de] px-1.5 py-0.5 text-[10px] font-medium text-[#8a5a00]">
                    준비 중
                  </span>
                </div>
                <SettingRow label="점자 등급">
                  <select
                    value={defaults.translation.grade}
                    onChange={(e) =>
                      setDefaults((d) => ({
                        ...d,
                        translation: {
                          ...d.translation,
                          grade: Number(e.target.value) === 2 ? 2 : 1,
                        },
                      }))
                    }
                    aria-label="점자 등급"
                    className={fieldCls}
                  >
                    <option value={1}>1급 (정자)</option>
                    <option value={2}>2급 (약자)</option>
                  </select>
                </SettingRow>
                <SettingRow label="한영 혼용 규정">
                  <select
                    value={defaults.translation.mixedScriptRule}
                    onChange={(e) =>
                      setDefaults((d) => ({
                        ...d,
                        translation: {
                          ...d.translation,
                          mixedScriptRule:
                            e.target.value === 'en' ? 'en' : 'ko',
                        },
                      }))
                    }
                    aria-label="한영 혼용 규정"
                    className={fieldCls}
                  >
                    <option value="ko">한국어 점자 규정</option>
                    <option value="en">영어 점자 규정</option>
                  </select>
                </SettingRow>
                <p className="pl-[106px] text-[10.5px] leading-snug text-gray-400">
                  앞뒤 단어가 각각 한국어·영어인 자리처럼 규정에 없는 경우에
                  어느 쪽을 따를지 정합니다.
                </p>
                <p className="text-[10.5px] leading-snug text-[#8a5a00]">
                  점역 옵션은 저장만 됩니다 — 변환에 반영하려면 서버가 이 값을
                  받아야 합니다.
                </p>
              </div>
            </Locked>

            <UnfinishedModal id={notice} onClose={() => setNotice(null)} />

            <p className="text-[10.5px] leading-snug text-gray-400">
              표·글상자 테두리, 그림 생략 표시, 점역자 주 시작 칸은 서버·AI가
              정합니다.
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

export default UsageView;
