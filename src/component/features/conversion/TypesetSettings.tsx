import React from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  COLS_MAX,
  COLS_MIN,
  footerCellBudget,
  footerOverflowHint,
  isNonStandardSize,
  ROWS_MAX,
  ROWS_MIN,
  START_PAGE_MAX,
  START_PAGE_MIN,
  type FooterAlign,
  type FooterScope,
  type PageRowOn,
  type TypesetOptions,
} from '../../../utils/typesetOptions';
import { FOOTER_TEXT_MAX_LENGTH } from '../../../utils/fileValidation';

// 조판 설정 — 파일을 올릴 때 정한다(2026-09-01 설계).
//
// 옛 화면은 같은 개념을 면·쪽·페이지 세 가지로 불렀고, 어디에 적히는 값인지 라벨만
// 보고는 알 수 없었다. 용어를 **페이지**로 통일하고, 값이 실제로 찍히는 자리를
// 라벨에 적는다.
//
//   페이지행           점자 페이지의 맨 아랫줄.
//                      원본 페이지 번호(왼쪽) · 꼬리말(가운데) · 점자 페이지 번호(오른쪽)
//   원본 페이지 변경선   원본 한 페이지가 끝나는 바로 다음 줄. 오른쪽 끝에 새 원본 번호만
//
// 규칙 자체는 braille-assist가 단일 출처다. 여기서는 그 라이브러리가 받는 옵션을
// 화면에 노출하기만 한다(README: "조판 규칙을 FE에서 고치지 말 것").

const boxCls =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm tabular-nums text-gray-700 focus:border-[#5b8ce6] focus:outline-none';
const labelCls = 'text-[12px] font-semibold text-gray-700';
const hintCls = 'mt-0.5 text-[11px] leading-snug text-gray-400';
const groupTitleCls =
  'mb-2.5 text-[10.5px] font-bold uppercase tracking-wider text-gray-400';
const warnCls =
  'flex items-start gap-1.5 rounded-md bg-[#fbf1de] px-2 py-1.5 text-[11px] leading-snug text-[#8a5a00]';

const NumberField: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  hint?: string;
}> = ({ label, value, min, max, onChange, hint }) => (
  <label className="flex flex-col gap-1">
    <span className={labelCls}>{label}</span>
    {hint && <span className={`${hintCls} mb-0.5 mt-0`}>{hint}</span>}
    <input
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={boxCls}
    />
  </label>
);

/** 두 갈래 중 하나를 고르는 띠. 값이 둘뿐일 때 드롭다운보다 읽기 쉽다. */
function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<[T, string]>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1.5">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className={`flex-1 rounded-lg border px-2 py-1.5 text-[12px] transition-colors ${
            value === v
              ? 'border-[#5b8ce6] bg-[#eef3fc] font-semibold text-[#407FAC]'
              : 'border-gray-200 text-gray-500 hover:bg-gray-50'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

const CheckRow: React.FC<{
  checked: boolean;
  label: string;
  onChange: (v: boolean) => void;
}> = ({ checked, label, onChange }) => (
  <label className="flex items-center gap-2 py-1 text-[13px] text-gray-700">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="h-3.5 w-3.5 accent-[#5b8ce6]"
    />
    {label}
  </label>
);

/** 그룹 머리의 켜기/끄기 — 끄면 그 그룹의 나머지가 숨는다. */
const GroupSwitch: React.FC<{
  checked: boolean;
  label: string;
  hint?: string;
  onChange: (v: boolean) => void;
}> = ({ checked, label, hint, onChange }) => (
  <label className="flex items-start justify-between gap-3">
    <span className="flex flex-col">
      <span className={labelCls}>{label}</span>
      {hint && <span className={hintCls}>{hint}</span>}
    </span>
    <input
      type="checkbox"
      role="switch"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      aria-label={label}
      className="mt-0.5 h-4 w-4 shrink-0 accent-[#5b8ce6]"
    />
  </label>
);

interface Props {
  value: TypesetOptions;
  onChange: (next: TypesetOptions) => void;
  /** 변환 설정 모달처럼 좁은 자리에서는 설명을 줄인다. */
  compact?: boolean;
}

const TypesetSettings: React.FC<Props> = ({ value, onChange, compact }) => {
  const set = <K extends keyof TypesetOptions>(key: K, v: TypesetOptions[K]) =>
    onChange({ ...value, [key]: v });

  // 페이지행을 끄면 그 안에서 정할 것이 없다.
  const pageRowOn = value.pageRowOn !== 'none';
  const footerHint = footerOverflowHint(value);

  return (
    <div className="flex flex-col divide-y divide-gray-100">
      {/* ── 페이지행 ───────────────────────────────────────── */}
      <section className="flex flex-col gap-3 pb-4">
        <GroupSwitch
          checked={pageRowOn}
          label="페이지행"
          hint="점자 페이지 하단 표시줄"
          // 켤 때는 지침 기본값인 홀수 페이지로 돌아간다.
          onChange={(on) => set('pageRowOn', on ? 'odd' : 'none')}
        />

        {pageRowOn && (
          <>
            <div className="flex flex-col gap-1.5">
              <span className={labelCls}>넣을 페이지</span>
              <Segmented<Exclude<PageRowOn, 'none'>>
                value={value.pageRowOn === 'every' ? 'every' : 'odd'}
                options={[
                  ['odd', '홀수 페이지만'],
                  ['every', '모든 페이지'],
                ]}
                onChange={(v) => set('pageRowOn', v)}
              />
              {!compact && (
                <p className={hintCls}>
                  지침·실물 관행은 홀수 페이지입니다. 모든 페이지에 넣는 곳도 있어
                  함께 둡니다.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-0.5">
              <span className={labelCls}>함께 넣을 번호</span>
              <CheckRow
                checked={value.showOrigPage}
                label="원본 페이지 번호 (왼쪽)"
                onChange={(v) =>
                  onChange({
                    ...value,
                    showOrigPage: v,
                    // 번호를 끄면 변경선에 적을 것이 없다 — 함께 꺼진다.
                    showChangeLine: v ? value.showChangeLine : false,
                  })
                }
              />
              <CheckRow
                checked={value.showBraillePage}
                label="점자 페이지 번호 (오른쪽)"
                onChange={(v) => set('showBraillePage', v)}
              />
            </div>
          </>
        )}
      </section>

      {/* ── 꼬리말 ─────────────────────────────────────────── */}
      <section className="flex flex-col gap-3 py-4">
        <p className={groupTitleCls}>꼬리말</p>

        <div className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between">
            <span className={labelCls}>내용</span>
            <span className="text-[11px] tabular-nums text-gray-400">
              {value.footerText.length} / {FOOTER_TEXT_MAX_LENGTH}
            </span>
          </div>
          <input
            type="text"
            value={value.footerText}
            maxLength={FOOTER_TEXT_MAX_LENGTH}
            onChange={(e) => set('footerText', e.target.value)}
            placeholder="예: 수학1-2. 다항함수"
            className={boxCls}
          />
          {/* 페이지행에 다 들어가는지 — 넘치면 라이브러리가 뒤를 자른다.
              FE는 점역을 하지 않으므로 한글을 넉넉히 3칸으로 잡은 어림값이다. */}
          {footerHint ? (
            <p className="mt-0.5 flex items-start gap-1 text-[11px] leading-snug text-[#f47726]">
              <AlertTriangle size={12} className="mt-px shrink-0" />
              {footerHint}
            </p>
          ) : (
            <p className={hintCls}>
              페이지행의 가운데에 들어갑니다. 쓸 수 있는 자리는 약{' '}
              {footerCellBudget(value)}칸입니다(한글은 한 글자에 2~3칸).
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className={labelCls}>정렬</span>
          <Segmented<FooterAlign>
            value={value.footerAlign}
            options={[
              ['center', '가운데'],
              ['right', '오른쪽'],
            ]}
            onChange={(v) => set('footerAlign', v)}
          />
          {value.footerAlign === 'right' && !compact && (
            <p className={hintCls}>
              점자 페이지 번호에서 두 칸 띄운 자리가 오른쪽 끝입니다.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className={labelCls}>수정할 때 적용 범위</span>
          <Segmented<FooterScope>
            value={value.footerScope}
            options={[
              ['rest', '이 페이지부터 끝까지'],
              ['page', '이 페이지만'],
            ]}
            onChange={(v) => set('footerScope', v)}
          />
          {!compact && (
            <p className={hintCls}>
              판면에서 꼬리말을 고칠 때 미리 골라 둘 값입니다. 단원마다 꼬리말이
              다를 때 씁니다.
            </p>
          )}
        </div>
      </section>

      {/* ── 원본 페이지 변경선 ─────────────────────────────── */}
      <section className="flex flex-col gap-2 py-4">
        <p className={groupTitleCls}>원본 페이지 변경선</p>
        <GroupSwitch
          checked={value.showChangeLine && value.showOrigPage}
          label="변경선 넣기"
          hint="원본 페이지가 바뀌는 자리의 구분선"
          // 원본 페이지 번호가 꺼져 있으면 변경선에 적을 번호가 없다 — 라이브러리도
          // 같은 규칙으로 함께 끈다(결정 D). 여기서는 켜는 길만 막는다.
          onChange={(on) => value.showOrigPage && set('showChangeLine', on)}
        />
        {!value.showOrigPage && (
          <p className={hintCls}>
            원본 페이지 번호를 끄면 변경선에 적을 번호가 없어 함께 꺼집니다.
          </p>
        )}
      </section>

      {/* ── 페이지 번호 ────────────────────────────────────── */}
      <section className="flex flex-col gap-3 py-4">
        <p className={groupTitleCls}>페이지 번호</p>

        <NumberField
          label="표지 페이지 수"
          value={value.coverPages}
          min={0}
          max={99}
          onChange={(v) => set('coverPages', v)}
          hint={
            compact
              ? undefined
              : '앞에서 이만큼을 표지로 봅니다. 표지에는 페이지행을 넣지 않고, 본문 번호가 그다음부터 시작합니다.'
          }
        />

        <div className="flex gap-2.5">
          <div className="flex-1">
            <NumberField
              label="원본 페이지 번호 시작"
              value={value.origPageStart}
              min={START_PAGE_MIN}
              max={START_PAGE_MAX}
              onChange={(v) => set('origPageStart', v)}
            />
          </div>
          <div className="flex-1">
            <NumberField
              label="점자 페이지 번호 시작"
              value={value.startBraillePage}
              min={START_PAGE_MIN}
              max={START_PAGE_MAX}
              onChange={(v) => set('startBraillePage', v)}
            />
          </div>
        </div>
        {!compact && (
          <p className={hintCls}>
            책의 5페이지부터 점역하면 원본 시작을 5로, 앞 권에서 이어 만들면 점자
            시작을 그 뒤 번호로 둡니다.
          </p>
        )}
      </section>

      {/* ── 용지 규격 ──────────────────────────────────────── */}
      <section className="flex flex-col gap-2 py-4">
        <p className={groupTitleCls}>용지 규격</p>
        <div className="flex gap-2.5">
          <div className="flex-1">
            <NumberField
              label="칸 수"
              value={value.cols}
              min={COLS_MIN}
              max={COLS_MAX}
              onChange={(v) => set('cols', v)}
            />
          </div>
          <div className="flex-1">
            <NumberField
              label="줄 수"
              value={value.rows}
              min={ROWS_MIN}
              max={ROWS_MAX}
              onChange={(v) => set('rows', v)}
            />
          </div>
        </div>
        {isNonStandardSize(value) ? (
          <p className={warnCls}>
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            한국 점자 도서 규격(32칸 26줄)이 아닙니다. 상장처럼 규격이 다른 문서에만
            쓰세요.
          </p>
        ) : (
          !compact && (
            <p className={hintCls}>
              한국 점자 도서는 32칸 26줄입니다. 페이지행이 들어가는 페이지는 본문이
              25줄이 됩니다.
            </p>
          )
        )}
      </section>

      {/* ── 점역 방식 ──────────────────────────────────────── */}
      <section className="flex flex-col gap-1 pt-4">
        <p className={groupTitleCls}>점역 방식</p>
        <CheckRow
          checked={value.advancedAi}
          label="고급 점역"
          onChange={(v) => set('advancedAi', v)}
        />
        <p className={hintCls}>
          표와 그림이 많은 지면을 더 큰 모델로 읽습니다. 변환이 느려집니다.
        </p>
      </section>
    </div>
  );
};

export default TypesetSettings;
