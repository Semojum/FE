import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import Modal, { ModalButton, modalInputCls } from '../../shared/Modal';
import {
  searchRules,
  type Rule,
  type RulePublisher,
  type RuleSearchResult,
} from '../../../api/RuleService';

// 점자 규정 찾아보기 — GET /api/rules (2026-09-01 명세 신설).
//
// 1차 PoC 부가 기능 "앱 자체에서 점자 규정·제작 지침 검색"(필요성 중). 종전에는
// 레포에 발췌 14건을 심어 두고 그것만 찾았는데, 이제 서버가 전체 239건을 준다.
//
// 검색어 없이 열면 원문 순서 그대로 와서 목차처럼 훑을 수 있다(명세).

// 거르개는 **문서 이름**으로 고른다. 점역사가 찾는 단위는 발행처가 아니라 문서다 —
// "문화체육관광부"보다 "한국 점자 규정"이 어느 책인지 바로 읽힌다.
//
// 다만 서버가 거르는 열쇠는 여전히 publisher다(GET /api/rules?publisher=). 그래서
// 코드는 그대로 보내고 **이름만** 응답의 source에서 받아 붙인다 — 문서 이름이 개정으로
// 바뀌어도 앱을 고칠 것이 없다. 이름을 아직 못 받았을 때만 발행처 이름으로 버틴다.
const PUBLISHER_CODES = ['MCST', 'NLD', 'NISE'] as const;

const PUBLISHER_FALLBACK: Record<RulePublisher, string> = {
  MCST: '문화체육관광부',
  NLD: '국립장애인도서관',
  NISE: '국립특수교육원',
};

/** "한국점자규정.txt" 같은 확장자는 버튼에서 떼어 낸다. */
const documentLabel = (source: string): string =>
  source.replace(/\.(txt|md|pdf|hwpx?|docx?)$/i, '').trim();

const PAGE_SIZE = 20;

interface Props {
  isOpen: boolean;
  token?: string | null;
  onClose: () => void;
}

const RuleSearchModal: React.FC<Props> = ({ isOpen, token, onClose }) => {
  const [query, setQuery] = useState('');
  const [publisher, setPublisher] = useState<RulePublisher | null>(null);
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<RuleSearchResult | null>(null);
  const [loading, setLoading] = useState(false);

  // 거르개 버튼에 적을 문서 이름. 발행처마다 한 건만 받아 source를 읽는다.
  const [docNames, setDocNames] = useState<Partial<Record<RulePublisher, string>>>(
    {},
  );

  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    void Promise.all(
      PUBLISHER_CODES.map(async (code) => {
        const res = await searchRules({ publisher: code, page: 0, size: 1 }, token);
        return [code, res.items[0]?.source ?? ''] as const;
      }),
    ).then((pairs) => {
      if (!alive) return;
      setDocNames(
        Object.fromEntries(
          pairs
            .filter(([, source]) => source)
            .map(([code, source]) => [code, documentLabel(source)]),
        ),
      );
    });
    return () => {
      alive = false;
    };
  }, [isOpen, token]);

  // 검색어를 칠 때마다 부르지 않는다 — 한 글자마다 요청이 나가면 목록이 흔들린다.
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query.trim()), 250);
    return () => window.clearTimeout(id);
  }, [query]);

  // 검색어·발행처가 바뀌면 첫 쪽부터 다시 본다.
  useEffect(() => setPage(0), [debounced, publisher]);

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    let alive = true;
    setLoading(true);
    void searchRules(
      { q: debounced, publisher, page, size: PAGE_SIZE },
      token,
      controller.signal,
    ).then((res) => {
      if (!alive) return;
      setResult(res);
      setLoading(false);
    });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [isOpen, debounced, publisher, page, token]);

  const items = result?.items ?? [];
  const total = result?.totalElements ?? 0;
  const lastPage = Math.max(0, (result?.totalPages ?? 1) - 1);

  const summary = useMemo(() => {
    if (loading && !result) return '불러오는 중…';
    if (total === 0) return debounced ? '찾는 규정이 없습니다.' : '';
    const from = page * PAGE_SIZE + 1;
    const to = Math.min(total, from + items.length - 1);
    return `${total}건 중 ${from}–${to}`;
  }, [loading, result, total, debounced, page, items.length]);

  return (
    <Modal
      isOpen={isOpen}
      title="점자 규정 찾아보기"
      // 조문 본문이 두세 줄로 접혀 훑기 어려웠다 — 목록 창은 넓게 둔다.
      maxWidth={720}
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
            placeholder="약자, 페이지행, 띄어쓰기…"
            aria-label="규정 검색"
            maxLength={100}
            className={`${modalInputCls} pl-9`}
          />
          {loading && (
            <Loader2
              size={14}
              className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400"
            />
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {([null, ...PUBLISHER_CODES] as Array<RulePublisher | null>).map(
            (code) => {
              const label =
                code === null
                  ? '전체'
                  : (docNames[code] ?? PUBLISHER_FALLBACK[code]);
              return (
                <button
                  key={code ?? 'all'}
                  type="button"
                  onClick={() => setPublisher(code)}
                  aria-pressed={publisher === code}
                  className={`rounded-lg border px-2 py-1 text-[11px] transition-colors ${
                    publisher === code
                      ? 'border-[#5b8ce6] bg-[#eef3fc] font-semibold text-[#407FAC]'
                      : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {label}
                </button>
              );
            },
          )}
        </div>

        <div className="flex max-h-[44vh] flex-col gap-2 overflow-y-auto">
          {items.length === 0 && !loading ? (
            <p className="py-6 text-center text-[13px] text-gray-400">
              {debounced ? '찾는 규정이 없습니다.' : '규정을 불러오지 못했습니다.'}
            </p>
          ) : (
            items.map((rule: Rule) => (
              <div
                key={rule.ruleId}
                className="rounded-[10px] border border-gray-100 bg-white px-3 py-2.5"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[13px] font-semibold text-gray-700">
                    {rule.ruleName}
                  </p>
                  <span className="shrink-0 font-mono text-[10px] text-gray-400">
                    {rule.ruleId}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-gray-600">
                  {rule.contents}
                </p>
                {/* 조문 경로와 출처만 남긴다 — 발행처·판은 위 거르개가 이미 말해
                    주고, 여기서는 "어느 문서 어디"만 알면 원문을 찾아갈 수 있다. */}
                <p className="mt-1.5 text-[11px] text-gray-400">
                  {[rule.section, rule.source].filter(Boolean).join(' · ')}
                </p>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[11px] text-gray-400">{summary}</span>
          {lastPage > 0 && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="rounded px-2 py-1 text-[12px] text-gray-500 transition-colors hover:bg-gray-100 disabled:opacity-30"
              >
                이전
              </button>
              <span className="text-[11px] tabular-nums text-gray-400">
                {page + 1} / {lastPage + 1}
              </span>
              <button
                type="button"
                disabled={page >= lastPage}
                onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
                className="rounded px-2 py-1 text-[12px] text-gray-500 transition-colors hover:bg-gray-100 disabled:opacity-30"
              >
                다음
              </button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default RuleSearchModal;
