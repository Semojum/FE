import { describe, expect, it } from 'vitest';
import {
  daysUntil,
  ddayLabel,
  depletionLabel,
  lastLoginLabel,
  monthKey,
  orDash,
  percentOf,
  shortDate,
  shortDateTime,
} from '../org/OrgUi';

// D-day와 소진 예상은 서버가 주지 않는다(명세: FE 계산).

describe('계약 만료 표기', () => {
  const now = new Date(2026, 7, 13); // 2026-08-13

  it('남은 날을 세어 준다', () => {
    expect(daysUntil('2026-08-24', now)).toBe(11);
    expect(ddayLabel('2026-08-24', now)).toBe('11일 남음');
  });

  it('당일과 지난 계약을 구분한다', () => {
    expect(ddayLabel('2026-08-13', now)).toBe('오늘 만료');
    expect(ddayLabel('2026-08-10', now)).toBe('3일 지남');
  });
});

describe('소진 예상', () => {
  const usage = [{ credits: 3000 }, { credits: 3000 }, { credits: 3000 }];

  it('최근 사용 속도로 몇 달 뒤인지 읽어 준다', () => {
    expect(depletionLabel(3000, usage, new Date(2026, 7, 13))).toMatch(
      /소진 예상$/,
    );
  });

  it('이미 다 썼거나 근거가 없으면 예상을 지어내지 않는다', () => {
    expect(depletionLabel(0, usage)).toBe('크레딧을 모두 썼습니다');
    expect(depletionLabel(5000, [{ credits: 0 }])).toBe('');
  });
});

describe('날짜·숫자 표기', () => {
  it('마지막 로그인은 오늘·어제를 말로 바꾼다', () => {
    const today = new Date();
    today.setHours(9, 12, 0, 0);
    expect(lastLoginLabel(today.toISOString())).toBe('오늘 09:12');

    const yesterday = new Date(today.getTime() - 86400000);
    expect(lastLoginLabel(yesterday.toISOString())).toBe('어제');
    expect(lastLoginLabel(null)).toBe('—');
  });

  it('작업 시각은 월-일과 시:분까지만 보여 준다', () => {
    expect(shortDate('2026-08-13T10:24:25')).toBe('08-13');
    expect(shortDateTime('2026-08-13T10:24:25')).toBe('08-13 10:24');
    expect(shortDateTime(null)).toBe('—');
  });

  it('확정되지 않은 크레딧은 —로 둔다 (진행 중이면 null)', () => {
    expect(orDash(null)).toBe('—');
    expect(orDash(1140)).toBe('1,140');
  });

  it('분모가 0이면 비율을 0%로 둔다 (무소속 계정)', () => {
    expect(percentOf(1140, 10000)).toBe('11%');
    expect(percentOf(0, 0)).toBe('0%');
  });

  it('지난달 키를 연말에도 맞게 넘긴다', () => {
    expect(monthKey(-1, new Date(2027, 0, 5))).toBe('2026-12');
    expect(monthKey(0, new Date(2026, 7, 19))).toBe('2026-08');
  });
});
