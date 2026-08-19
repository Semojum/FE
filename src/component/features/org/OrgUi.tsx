import React from 'react';
import { isInProgress, JobStatus } from '../../../types/mypage';

// Figma V3-06 공통 조각 — 기관 관리(T2) · 계정 상세(T2-2) · 사용량(T3)이 같은
// 패널/표/알약/막대를 반복해서 쓴다. 디자인의 고정폭 프레임 대신 실제 <table>로
// 그린다 — 화면 낭독기 사용자가 주 사용자층이라 표는 표로 읽혀야 한다.

// ─── 패널 ───────────────────────────────────────────────────────────

export const Panel: React.FC<{
  title?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}> = ({ title, right, className = '', children }) => (
  <section
    className={`rounded-[12px] border border-[#dfe8f2] bg-white p-4 shadow-[0_2px_10px_0_rgba(23,43,77,0.07)] ${className}`}
  >
    {(title || right) && (
      <div className="mb-3 flex items-center gap-2">
        {title && (
          <h3 className="text-[13px] font-bold text-gray-700">{title}</h3>
        )}
        {right && (
          <div className="ml-auto flex items-center gap-2">{right}</div>
        )}
      </div>
    )}
    {children}
  </section>
);

// 위쪽 요약 카드(할당 크레딧 · 남은 크레딧 · 계약)
export const StatCard: React.FC<{
  label: string;
  children: React.ReactNode;
}> = ({ label, children }) => (
  <div className="flex flex-1 flex-col gap-1.5 rounded-[10px] border border-[#e2e8f0] bg-white px-[15px] py-[13px] shadow-[0_2px_10px_0_rgba(15,23,41,0.05)]">
    <p className="text-[11px] font-bold text-gray-500">{label}</p>
    {children}
  </div>
);

export const StatValue: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => <p className="text-[21px] font-bold text-gray-700">{children}</p>;

// ─── 진행 막대 ──────────────────────────────────────────────────────

export const ProgressBar: React.FC<{
  value: number;
  max: number;
  label?: string;
}> = ({ value, max, label }) => {
  const ratio = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-[#e2e8f0]"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label}
    >
      <div
        className="h-2 rounded-full bg-[#5b8ce6]"
        style={{ width: `${ratio * 100}%` }}
      />
    </div>
  );
};

// "4,600 / 10,000 크레딧 … 46%" 한 줄
export const UsageLine: React.FC<{ used: number; total: number }> = ({
  used,
  total,
}) => (
  <div className="flex w-full items-center gap-1 text-[11px]">
    <span className="font-bold text-gray-700">{formatNumber(used)}</span>
    <span className="text-gray-500">/ {formatNumber(total)} 크레딧</span>
    <span className="ml-auto text-gray-500">{percentOf(used, total)}</span>
  </div>
);

// ─── 알약(상태 배지) ────────────────────────────────────────────────

export type PillTone = 'green' | 'red' | 'amber' | 'blue' | 'gray';

const PILL_TONE: Record<PillTone, string> = {
  green: 'bg-[#ecfdf5] text-[#10b981]',
  red: 'bg-[#fef2f2] text-[#ef4444]',
  amber: 'bg-[#fffbeb] text-[#b45309]',
  blue: 'bg-[#f0f9ff] text-[#0369a1]',
  gray: 'bg-[#f0f4f8] text-gray-500',
};

export const Pill: React.FC<{ tone: PillTone; children: React.ReactNode }> = ({
  tone,
  children,
}) => (
  <span
    className={`inline-block rounded-[5px] px-2 py-[3px] text-[10.5px] font-bold ${PILL_TONE[tone]}`}
  >
    {children}
  </span>
);

// ─── 버튼 ───────────────────────────────────────────────────────────

// 오렌지는 행동·주의, 흰색은 부수 동작 (마이페이지 UX 원칙과 같은 규칙).
export const SmallButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'ghost' | 'accent';
  }
> = ({ variant = 'ghost', className = '', ...props }) => (
  <button
    type="button"
    {...props}
    className={`rounded-[6px] px-[11px] py-[5px] text-[11px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
      variant === 'accent'
        ? 'bg-[#f47726] text-white hover:brightness-95'
        : 'border border-[#e2e8f0] bg-white text-gray-700 hover:border-[#5b8ce6]/50 hover:text-[#5b8ce6]'
    } ${className}`}
  />
);

// 표 안에서 다른 화면을 여는 링크형 텍스트(계정 ID · 공지 제목 · 내려받기)
export const LinkButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement>
> = ({ className = '', ...props }) => (
  <button
    type="button"
    {...props}
    className={`text-[11.5px] font-bold text-[#5b8ce6] underline underline-offset-2 transition-colors hover:text-[#4a7bd4] ${className}`}
  />
);

// ─── 표 ─────────────────────────────────────────────────────────────

export const Table: React.FC<{
  head: React.ReactNode;
  children: React.ReactNode;
  caption?: string;
}> = ({ head, children, caption }) => (
  <div className="w-full overflow-x-auto">
    <table className="w-full min-w-[520px] border-collapse text-left">
      {caption && <caption className="sr-only">{caption}</caption>}
      <thead className="bg-[#f0f4f8]">{head}</thead>
      <tbody>{children}</tbody>
    </table>
  </div>
);

export const Th: React.FC<{
  children: React.ReactNode;
  align?: 'left' | 'right';
  className?: string;
}> = ({ children, align = 'left', className = '' }) => (
  <th
    scope="col"
    className={`h-[34px] px-2 text-[11px] font-bold text-gray-500 ${
      align === 'right' ? 'text-right' : 'text-left'
    } ${className}`}
  >
    {children}
  </th>
);

export const Td: React.FC<{
  children: React.ReactNode;
  align?: 'left' | 'right';
  className?: string;
}> = ({ children, align = 'left', className = '' }) => (
  <td
    className={`h-[34px] border-t border-[#f1f5f9] px-2 text-[11.5px] text-gray-700 ${
      align === 'right' ? 'text-right' : 'text-left'
    } ${className}`}
  >
    {children}
  </td>
);

// 본문이 없을 때 표 자리를 지키는 한 줄
export const EmptyRow: React.FC<{ colSpan: number; children: string }> = ({
  colSpan,
  children,
}) => (
  <tr>
    <td
      colSpan={colSpan}
      className="border-t border-[#f1f5f9] px-2 py-6 text-center text-[11.5px] text-gray-400"
    >
      {children}
    </td>
  </tr>
);

// ─── 표시 형식 ──────────────────────────────────────────────────────

export const formatNumber = (n: number): string => n.toLocaleString('ko-KR');

// 값이 아직 없는 칸은 디자인대로 —(em dash)로 채운다.
export const DASH = '—';

export const orDash = (n: number | null | undefined): string =>
  n == null ? DASH : formatNumber(n);

export const percentOf = (value: number, total: number): string =>
  total > 0 ? `${Math.round((value / total) * 100)}%` : `0%`;

// '2026-08-13T10:24:25' → '08-13'
export const shortDate = (iso: string | null | undefined): string => {
  if (!iso) return DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(5, 10) || DASH;
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
};

// '2026-08-13T10:24:25' → '08-13 10:24'
export const shortDateTime = (iso: string | null | undefined): string => {
  if (!iso) return DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return shortDate(iso);
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes(),
  ).padStart(2, '0')}`;
  return `${shortDate(iso)} ${time}`;
};

// 마지막 로그인은 가까울수록 사람 말로 — '오늘 09:12' / '어제' / '07-22'
export const lastLoginLabel = (iso: string | null | undefined): string => {
  if (!iso) return DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return DASH;
  const today = new Date();
  const dayStart = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((dayStart(today) - dayStart(d)) / 86400000);
  if (diffDays === 0) {
    return `오늘 ${String(d.getHours()).padStart(2, '0')}:${String(
      d.getMinutes(),
    ).padStart(2, '0')}`;
  }
  if (diffDays === 1) return '어제';
  return shortDate(iso);
};

// 계약 만료까지 남은 날. 만료일 당일은 0일, 지난 뒤는 음수.
export const daysUntil = (dateOnly: string, now: Date = new Date()): number => {
  const [y, m, d] = dateOnly.split('-').map(Number);
  if (!y || !m || !d) return NaN;
  const target = new Date(y, m - 1, d).getTime();
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  return Math.round((target - today) / 86400000);
};

export const ddayLabel = (dateOnly: string, now?: Date): string => {
  const left = daysUntil(dateOnly, now);
  if (Number.isNaN(left)) return '';
  if (left < 0) return `${Math.abs(left)}일 지남`;
  if (left === 0) return '오늘 만료';
  return `${left}일 남음`;
};

// 이번 달(KST 기준 로컬) 'YYYY-MM'. offset -1이면 지난달.
export const monthKey = (offset = 0, now: Date = new Date()): string => {
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// 남은 크레딧이 최근 사용 속도로 언제 바닥나는지 — "9월 중순 소진 예상".
// 서버는 계산해 주지 않는다(명세: FE 계산). 근거가 부족하면 빈 문자열.
export const depletionLabel = (
  remaining: number,
  monthlyUsage: { credits: number }[],
  now: Date = new Date(),
): string => {
  if (remaining <= 0) return '크레딧을 모두 썼습니다';
  const recent = monthlyUsage.slice(-3).map((m) => m.credits);
  const avg = recent.length
    ? recent.reduce((a, b) => a + b, 0) / recent.length
    : 0;
  if (avg <= 0) return '';
  const monthsLeft = remaining / avg;
  if (monthsLeft > 12) return '1년 이상 여유';
  // 남은 달 수를 오늘 날짜에 더해 "N월 초·중순·하순"으로 읽어 준다.
  const target = new Date(now.getTime() + monthsLeft * 30.4 * 86400000);
  const day = target.getDate();
  const part = day <= 10 ? '초' : day <= 20 ? '중순' : '하순';
  return `${target.getMonth() + 1}월 ${part} 소진 예상`;
};

// ─── 작업 상태 배지 ─────────────────────────────────────────────────
// 계정 상세(T2-2)와 사용량(T3)이 같은 규칙으로 상태를 읽는다.
//  · 끝난 작업에 failedPages가 있으면 "부분 실패 n쪽"이 완료보다 앞선다
//  · 변환 중에는 donePages가 있으면 진척(n/m), 없으면(Redis 장애) "변환 중"
export const JobStatusPill: React.FC<{
  status: JobStatus;
  totalPages: number;
  donePages: number | null;
  failedPages: number | null;
}> = ({ status, totalPages, donePages, failedPages }) => {
  if (status === 'FAILED') return <Pill tone="red">실패</Pill>;
  if (isInProgress(status)) {
    return (
      <Pill tone="amber">
        {donePages == null ? '변환 중' : `진행 중 ${donePages}/${totalPages}`}
      </Pill>
    );
  }
  if (failedPages && failedPages > 0) {
    return <Pill tone="red">부분 실패 {failedPages}쪽</Pill>;
  }
  return <Pill tone="green">완료</Pill>;
};
