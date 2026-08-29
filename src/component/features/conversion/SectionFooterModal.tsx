import React, { useState } from 'react';
import Modal, { ModalButton, modalInputCls } from '../../shared/Modal';
import { FOOTER_TEXT_MAX_LENGTH } from '../../../utils/fileValidation';
import type { FooterScope } from '../../../utils/typesetOptions';

// 구간 꼬리말 — "여기서부터 이 꼬리말을 쓴다".
//
// 1차 PoC(2026-08-26) 피드백: "단원마다 꼬리말이 달라야 하므로 페이지별 위치 지정
// 기능 필요". 작업 전체에 하나뿐이던 꼬리말을 판면 안에서 구간마다 바꾼다.
//
// 꼬리말은 면마다 하나(페이지행 한 줄)이므로 **바꾸는 자리에서 면이 갈린다.**
// 단원이 시작하는 자리에서 쓰는 기능이라 실제 쓰임과도 맞지만, 모르고 쓰면
// 면이 늘어난 것처럼 보이므로 여기서 미리 알린다.

// 호출부는 자리를 고를 때마다 새로 마운트한다(key = 그 블록). 그래서 처음 값만
// 잡으면 되고, 직전에 다른 자리에서 친 문구가 남아 엉뚱한 단원명이 들어갈 일이 없다.
interface Props {
  // 지금 이 자리에 걸려 있는 꼬리말. 없으면 null(= 작업 전체 꼬리말을 따른다).
  current: string | null;
  // 작업 전체 꼬리말 — 구간 꼬리말을 지웠을 때 무엇으로 돌아가는지 보여 준다.
  base: string;
  // 조판 설정에 정해 둔 기본 적용 범위(마이페이지 점역 기본 설정에서 바꾼다).
  defaultScope: FooterScope;
  onSubmit: (footer: string, scope: FooterScope) => void;
  onClose: () => void;
}

const SectionFooterModal: React.FC<Props> = ({
  current,
  base,
  defaultScope,
  onSubmit,
  onClose,
}) => {
  const [text, setText] = useState(current ?? base);
  const [scope, setScope] = useState<FooterScope>(defaultScope);

  return (
    <Modal
      isOpen
      title="여기서부터 꼬리말"
      onClose={onClose}
      footer={
        <>
          <ModalButton onClick={onClose}>취소</ModalButton>
          {current !== null && (
            <ModalButton onClick={() => onSubmit('', scope)}>
              꼬리말 빼기
            </ModalButton>
          )}
          <ModalButton
            variant="primary"
            onClick={() => onSubmit(text.trim(), scope)}
          >
            적용
          </ModalButton>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <input
          autoFocus
          className={modalInputCls}
          value={text}
          maxLength={FOOTER_TEXT_MAX_LENGTH}
          placeholder="예: 제3장 함수"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSubmit(text.trim(), scope);
          }}
        />

        {/* 어디까지 적용할지 — 1차 PoC 1-3 기능2가 요청한 선택지 그대로다. */}
        <div className="flex gap-1.5">
          {(
            [
              ['rest', '이후 페이지 전부'],
              ['page', '이 면만'],
            ] as Array<[FooterScope, string]>
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setScope(v)}
              aria-pressed={scope === v}
              className={`flex-1 rounded-lg border px-2 py-1.5 text-[12px] transition-colors ${
                scope === v
                  ? 'border-[#5b8ce6] bg-[#eef3fc] font-semibold text-[#407FAC]'
                  : 'border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-[12px] leading-relaxed text-gray-500">
          이 자리부터 새 면이 시작되고,{' '}
          {scope === 'page'
            ? '그 면 하나에만 이 꼬리말을 씁니다.'
            : '그 뒤 모든 면에 이 꼬리말을 씁니다.'}
          {base && (
            <>
              {' '}
              앞 구간은 작업 전체 꼬리말(&ldquo;{base}&rdquo;)을 그대로 씁니다.
            </>
          )}
        </p>
        {/* 화면 판면에는 아직 점자로 찍히지 않는다 — 묵자를 점역해 주는 것은
            서버 몫이다(SERVER-REQUIREMENTS-3.3.0.md S-4). 모르고 "안 들어갔다"고
            읽지 않도록 그 자리에서 알린다. */}
        <p className="text-[11px] leading-relaxed text-gray-400">
          꼬리말이 어느 면에 걸렸는지는 면 아래에 표시됩니다. 페이지행에 점자로
          찍히는 것은 서버가 꼬리말을 점역해 주기 시작한 뒤입니다.
        </p>
      </div>
    </Modal>
  );
};

export default SectionFooterModal;
