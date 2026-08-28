import React from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  COLS_MAX,
  COLS_MIN,
  isNonStandardSize,
  ROWS_MAX,
  ROWS_MIN,
  type FooterAlign,
  type PageRowOn,
  type TypesetOptions,
} from '../../../utils/typesetOptions';
import { FOOTER_TEXT_MAX_LENGTH } from '../../../utils/fileValidation';

// 조판 설정 편집 조각 — 변환 설정 모달과 마이페이지 기본 설정이 같은 화면을 쓴다.
// 두 곳의 문구·순서가 갈리면 "어디서 바꾼 값이 적용된 건지" 물어보게 된다.
//
// 1차 PoC(2026-08-26) 요청 그대로다:
//   · 32×26 규격 변경 (상장 등 비도서 문서)
//   · 페이지행 전체/홀수 · 표지 제외 (필요성 최상)
//   · 꼬리말 정렬 (중앙/우측 — 단원명을 주로 쓴다)

const boxCls =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-[#5b8ce6] focus:outline-none';
const labelCls = 'text-[12px] font-medium text-gray-600';
const hintCls = 'mt-0.5 text-[11px] leading-snug text-gray-400';

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
    <input
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={boxCls}
    />
    {hint && <span className={hintCls}>{hint}</span>}
  </label>
);

interface Props {
  value: TypesetOptions;
  onChange: (next: TypesetOptions) => void;
  /** 변환 설정 모달처럼 좁은 자리에서는 설명을 줄인다. */
  compact?: boolean;
}

const TypesetSettings: React.FC<Props> = ({ value, onChange, compact }) => {
  const set = <K extends keyof TypesetOptions>(
    key: K,
    v: TypesetOptions[K],
  ) => onChange({ ...value, [key]: v });

  return (
    <div className="flex flex-col gap-3.5">
      {/* 판면 규격 */}
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2.5">
          <NumberField
            label="한 줄 칸 수"
            value={value.cols}
            min={COLS_MIN}
            max={COLS_MAX}
            onChange={(v) => set('cols', v)}
          />
          <NumberField
            label="한 면 줄 수"
            value={value.rows}
            min={ROWS_MIN}
            max={ROWS_MAX}
            onChange={(v) => set('rows', v)}
          />
        </div>
        {!compact && (
          <p className={hintCls}>
            점자 도서 기본은 32칸 × 26줄입니다. 상장·안내문처럼 규격이 다른 문서에만
            바꿔 주세요.
          </p>
        )}
        {isNonStandardSize(value) && (
          <p className="flex items-start gap-1.5 rounded-md bg-[#fbf1de] px-2 py-1.5 text-[11px] leading-snug text-[#8a5a00]">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            기본 규격(32칸 × 26줄)이 아닙니다. 점자 도서로 낼 파일이면 되돌려 주세요.
          </p>
        )}
      </div>

      {/* 페이지행 */}
      <div className="flex flex-col gap-1">
        <span className={labelCls}>페이지 번호 표시줄</span>
        <div className="flex gap-1.5">
          {(
            [
              ['odd', '홀수 면만'],
              ['every', '모든 면'],
              ['none', '넣지 않음'],
            ] as Array<[PageRowOn, string]>
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => set('pageRowOn', v)}
              aria-pressed={value.pageRowOn === v}
              className={`flex-1 rounded-lg border px-2 py-1.5 text-[12px] transition-colors ${
                value.pageRowOn === v
                  ? 'border-[#5b8ce6] bg-[#eef3fc] font-semibold text-[#407FAC]'
                  : 'border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {!compact && (
          <p className={hintCls}>
            지침·실물 관행은 홀수 면입니다. 전체 면에 넣는 곳도 많아 함께 둡니다.
          </p>
        )}
      </div>

      {/* 표지 제외 */}
      <NumberField
        label="표지로 건너뛸 면 수"
        value={value.coverPages}
        min={0}
        max={99}
        onChange={(v) => set('coverPages', v)}
        hint={
          compact
            ? undefined
            : '앞에서 이 수만큼은 페이지 번호를 매기지 않습니다. 표지·속표지가 있을 때 씁니다.'
        }
      />

      {/* 쪽번호 종류 */}
      <div className="flex flex-col gap-1.5">
        <span className={labelCls}>페이지행에 넣을 번호</span>
        <label className="flex items-center gap-2 text-[12px] text-gray-600">
          <input
            type="checkbox"
            checked={value.showOrigPage}
            onChange={(e) => set('showOrigPage', e.target.checked)}
          />
          원본 쪽 번호 (왼쪽)
        </label>
        <label className="flex items-center gap-2 text-[12px] text-gray-600">
          <input
            type="checkbox"
            checked={value.showBraillePage}
            onChange={(e) => set('showBraillePage', e.target.checked)}
          />
          점자 면 번호 (오른쪽)
        </label>
      </div>

      {/* 꼬리말 */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <span className={labelCls}>꼬리말</span>
          <span className="text-[11px] text-gray-400">
            {value.footerText.length} / {FOOTER_TEXT_MAX_LENGTH}
          </span>
        </div>
        <input
          type="text"
          value={value.footerText}
          maxLength={FOOTER_TEXT_MAX_LENGTH}
          onChange={(e) => set('footerText', e.target.value)}
          placeholder="예: 수학 익힘책 1"
          className={boxCls}
        />
        <div className="flex gap-1.5">
          {(
            [
              ['center', '가운데 정렬'],
              ['right', '우측 정렬'],
            ] as Array<[FooterAlign, string]>
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => set('footerAlign', v)}
              aria-pressed={value.footerAlign === v}
              className={`flex-1 rounded-lg border px-2 py-1.5 text-[12px] transition-colors ${
                value.footerAlign === v
                  ? 'border-[#5b8ce6] bg-[#eef3fc] font-semibold text-[#407FAC]'
                  : 'border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {value.footerAlign === 'right' && (
          <p className="flex items-start gap-1.5 rounded-md bg-[#fbf1de] px-2 py-1.5 text-[11px] leading-snug text-[#8a5a00]">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            우측 정렬은 아직 조판 라이브러리에 없습니다. 지금은 가운데로 나옵니다 —
            설정만 저장해 둡니다.
          </p>
        )}
      </div>
    </div>
  );
};

export default TypesetSettings;
