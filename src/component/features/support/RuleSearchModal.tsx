import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import Modal, { ModalButton, modalInputCls } from '../../shared/Modal';
import { searchRules } from '../../../utils/ruleLibrary';

// 점자 규정 · 제작 지침 찾아보기.
//
// 1차 PoC(2026-08-26) 부가 기능 — "규정 검색하는 일이 빈번해 구현 시 유용함"(필요성 중).
// 지금 담긴 것은 **조판 규칙 발췌**뿐이다. 전체 원문 검색은 서버 몫이라
// (docs/SERVER-REQUIREMENTS-3.3.0.md S-6) 그 사실을 화면에서 밝힌다 — 없는 규정을
// 찾다가 "이 앱에는 없다"고 오해하지 않게 하는 것이 목적이다.

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const RuleSearchModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const found = useMemo(() => searchRules(query), [query]);

  return (
    <Modal
      isOpen={isOpen}
      title="점자 규정 찾아보기"
      onClose={onClose}
      footer={
        <ModalButton variant="primary" onClick={onClose}>
          닫기
        </ModalButton>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="꼬리말, 32칸, 변경선…"
            aria-label="규정 검색"
            className={`${modalInputCls} pl-9`}
          />
        </div>

        <div className="flex max-h-[46vh] flex-col gap-2 overflow-y-auto">
          {found.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-gray-400">
              찾는 규정이 없습니다.
            </p>
          ) : (
            found.map((rule) => (
              <div
                key={rule.id}
                className="rounded-[10px] border border-gray-100 bg-white px-3 py-2.5"
              >
                <p className="text-[13px] font-semibold text-gray-700">
                  {rule.title}
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-gray-600">
                  {rule.body}
                </p>
                <p className="mt-1.5 text-[11px] text-gray-400">{rule.cite}</p>
              </div>
            ))
          )}
        </div>

        <p className="rounded-[10px] bg-[#eef3fc] px-3 py-2 text-[11px] leading-relaxed text-[#5b8ce6]">
          지금은 <b>조판 규칙</b>만 실려 있습니다({found.length}건 표시 · 전체{' '}
          {searchRules('').length}건). 점자 규정·제작 지침 원문 전체 검색은 서버가
          자료를 내주면 이어집니다.
        </p>
      </div>
    </Modal>
  );
};

export default RuleSearchModal;
