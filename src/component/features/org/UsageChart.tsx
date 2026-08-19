import React from 'react';
import { MonthlyUsagePoint } from '../../../types/org';
import { formatNumber } from './OrgUi';

// Figma V3-06 T2 "월별 사용 추이" — 최근 6개월 막대.
// 값이 그림에만 있으면 낭독기 사용자에게 아무것도 아니므로, 표 형태의 대체 텍스트를
// 함께 둔다(막대는 aria-hidden, 값은 sr-only 목록으로).

interface Props {
  points: MonthlyUsagePoint[];
}

const monthLabel = (month: string): string => {
  const m = Number(month.slice(5, 7));
  return Number.isNaN(m) ? month : `${m}월`;
};

const UsageChart: React.FC<Props> = ({ points }) => {
  const max = Math.max(1, ...points.map((p) => p.credits));
  const average = points.length
    ? Math.round(points.reduce((a, b) => a + b.credits, 0) / points.length)
    : 0;

  return (
    <div>
      <div
        aria-hidden
        className="flex h-[140px] items-end gap-3 border-b border-[#e2e8f0] pl-1"
      >
        {points.map((p) => (
          <div
            key={p.month}
            className="flex flex-1 flex-col items-center justify-end gap-1"
          >
            <span className="text-[9.5px] font-bold text-gray-700">
              {formatNumber(p.credits)}
            </span>
            <div
              className="w-full max-w-[46px] rounded-t-[4px] bg-[#5b8ce6]"
              style={{ height: `${Math.max((p.credits / max) * 100, 2)}px` }}
            />
          </div>
        ))}
      </div>
      <div aria-hidden className="mt-1 flex gap-3 pl-1">
        {points.map((p) => (
          <span
            key={p.month}
            className="flex-1 text-center text-[9.5px] text-gray-500"
          >
            {monthLabel(p.month)}
          </span>
        ))}
      </div>

      <ul className="sr-only">
        {points.map((p) => (
          <li key={p.month}>
            {monthLabel(p.month)} {formatNumber(p.credits)} 크레딧
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center gap-1.5 text-[10.5px] text-gray-500">
        <span
          aria-hidden
          className="inline-block size-2 rounded-[2px] bg-[#5b8ce6]"
        />
        <span>월 사용 크레딧</span>
        <span className="ml-auto">
          {points.length}개월 평균 {formatNumber(average)}
        </span>
      </div>
    </div>
  );
};

export default UsageChart;
