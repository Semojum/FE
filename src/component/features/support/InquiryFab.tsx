import React, { useCallback, useEffect, useState } from 'react';
import { MessageCircleQuestion, X } from 'lucide-react';
import Modal, { ModalButton } from '../../shared/Modal';
import { ApiError } from '../../../api/apiClient';
import { toUserMessage } from '../../../api/errorMessages';
import {
  cancelOrgRequest,
  createOrgRequest,
  listOrgRequests,
} from '../../../api/OrgService';
import {
  isCancelableRequest,
  OrgRequest,
  OrgRequestType,
  ORG_REQUEST_MESSAGE_MAX_LENGTH,
  ORG_REQUEST_STATUS_LABEL,
  ORG_REQUEST_TYPE_LABEL,
} from '../../../types/org';
import { Pill, shortDateTime } from '../org/OrgUi';

// 앱 안 어디서나 운영자에게 문의한다 (POST /api/org/requests → T1-9 문의 목록).
//
// 접수 경로는 기관 관리(V3-06 T2) 화면과 같은 API다. 그 화면은 기관 담당자만
// 들어가지만 문의는 모든 계정이 할 수 있어야 해서, 화면에 매이지 않는 FAB으로 뺐다.
//
// ⚠️ 서버는 아직 이 엔드포인트를 ROLE_ORG_ADMIN으로 막고 있다(COMMON4003). 권한을
// 풀어 달라고 요청해 둔 상태라, 화면은 모든 계정에 열어 두고 403이 오면 그 사정을
// 그대로 안내한다. 서버가 열리는 순간 코드 수정 없이 동작한다.

interface Props {
  token: string;
  onToast: (message: string) => void;
  // 결과 전용 팝업 창처럼 띄우면 안 되는 곳에서 숨기기 위한 스위치.
  hidden?: boolean;
}

const TYPE_HINT: Record<OrgRequestType, string> = {
  CREDIT_ADD: '예) 3,000 크레딧 추가 요청드립니다.',
  ACCOUNT_ISSUE: '예) 국어 담당 계정 1개 발급 부탁드립니다.',
};

// 권한이 아직 안 풀린 서버에서 돌아오는 응답 — 문구를 따로 준다.
const isForbidden = (err: unknown): boolean =>
  err instanceof ApiError && (err.code === 'COMMON4003' || err.status === 403);

const InquiryFab: React.FC<Props> = ({ token, onToast, hidden = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [type, setType] = useState<OrgRequestType>('CREDIT_ADD');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  // 지난 문의와 처리 상태. 조회 권한이 없으면(403) 목록 자체를 감춘다.
  const [history, setHistory] = useState<OrgRequest[] | null>(null);

  const reloadHistory = useCallback(async () => {
    try {
      setHistory(await listOrgRequests(token));
    } catch {
      setHistory(null);
    }
  }, [token]);

  useEffect(() => {
    if (!isOpen) return;
    void reloadHistory();
  }, [isOpen, reloadHistory]);

  const open = () => {
    setMessage('');
    setIsOpen(true);
  };

  const submit = async () => {
    const body = message.trim();
    if (!body) {
      onToast('문의 내용을 적어 주세요.');
      return;
    }
    setBusy(true);
    try {
      await createOrgRequest(type, body, token);
      onToast('문의를 접수했습니다. 처리 상태는 이 창에서 확인할 수 있습니다.');
      setMessage('');
      await reloadHistory();
    } catch (err) {
      onToast(
        isForbidden(err)
          ? '아직 기관 담당자 계정만 문의를 보낼 수 있습니다. 담당자에게 전달해 주세요.'
          : toUserMessage(err, '문의를 보내지 못했습니다.'),
      );
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (request: OrgRequest) => {
    try {
      await cancelOrgRequest(request.id, token);
      setHistory((prev) => prev?.filter((r) => r.id !== request.id) ?? null);
      onToast('문의를 취소했습니다.');
    } catch (err) {
      onToast(toUserMessage(err, '문의를 취소하지 못했습니다.'));
    }
  };

  if (hidden) return null;

  return (
    <>
      {/* 토스트(z-70)·모달(z-60)보다는 아래, 마이페이지 오버레이(z-50)보다는 위에 뜬다. */}
      <button
        type="button"
        onClick={open}
        aria-label="문의하기"
        title="문의하기"
        className="fixed bottom-6 right-6 z-[55] flex size-14 items-center justify-center rounded-full bg-[#f47726] text-white shadow-[0_6px_20px_0_rgba(23,43,77,0.25)] transition-transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-[#f47726]/30"
      >
        <MessageCircleQuestion size={24} aria-hidden />
      </button>

      <Modal
        isOpen={isOpen}
        busy={busy}
        title="문의하기"
        onClose={() => setIsOpen(false)}
        footer={
          <>
            <ModalButton disabled={busy} onClick={() => setIsOpen(false)}>
              닫기
            </ModalButton>
            <ModalButton
              variant="danger"
              disabled={busy}
              onClick={() => void submit()}
            >
              문의 보내기
            </ModalButton>
          </>
        }
      >
        <p className="text-[13px] text-gray-500">
          세모점 운영자에게 접수됩니다. 답변은 기관 담당자에게 전달됩니다.
        </p>

        <fieldset className="mt-3">
          <legend className="text-[11px] font-bold text-gray-500">
            문의 유형
          </legend>
          <div className="mt-1.5 flex gap-2">
            {(Object.keys(ORG_REQUEST_TYPE_LABEL) as OrgRequestType[]).map(
              (t) => (
                <label
                  key={t}
                  className={`cursor-pointer rounded-[6px] border px-3 py-1.5 text-[12px] font-bold transition-colors ${
                    type === t
                      ? 'border-[#5b8ce6] bg-[#f0f6ff] text-[#5b8ce6]'
                      : 'border-[#e2e8f0] bg-white text-gray-600 hover:border-[#5b8ce6]/50'
                  }`}
                >
                  <input
                    type="radio"
                    name="inquiry-type"
                    value={t}
                    checked={type === t}
                    onChange={() => setType(t)}
                    className="sr-only"
                  />
                  {ORG_REQUEST_TYPE_LABEL[t]}
                </label>
              ),
            )}
          </div>
        </fieldset>

        <textarea
          value={message}
          maxLength={ORG_REQUEST_MESSAGE_MAX_LENGTH}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={TYPE_HINT[type]}
          aria-label="문의 내용"
          className="mt-3 h-[96px] w-full resize-none rounded-[10px] border border-[#5b8ce6] bg-white p-3 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-[#5b8ce6]/20"
        />
        <p className="mt-1 text-right text-[11px] text-gray-400">
          {message.length}/{ORG_REQUEST_MESSAGE_MAX_LENGTH}
        </p>

        {/* 지난 문의 — 조회 권한이 없으면 아예 그리지 않는다(빈 상자도 두지 않는다). */}
        {history && history.length > 0 && (
          <div className="mt-3 border-t border-[#f1f5f9] pt-3">
            <p className="text-[11px] font-bold text-gray-500">지난 문의</p>
            <ul className="custom-scrollbar mt-1.5 max-h-[140px] space-y-1.5 overflow-y-auto">
              {history.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center gap-2 text-[11.5px]"
                >
                  <Pill tone={r.status === 'ANSWERED' ? 'green' : 'amber'}>
                    {ORG_REQUEST_STATUS_LABEL[r.status] ?? r.status}
                  </Pill>
                  <span className="truncate text-gray-700">
                    {r.message || ORG_REQUEST_TYPE_LABEL[r.type]}
                  </span>
                  <span className="ml-auto shrink-0 text-gray-400">
                    {shortDateTime(r.createdAt)}
                  </span>
                  {isCancelableRequest(r) && (
                    <button
                      type="button"
                      onClick={() => void cancel(r)}
                      aria-label={`${ORG_REQUEST_TYPE_LABEL[r.type]} 문의 취소`}
                      className="shrink-0 rounded p-1 text-gray-400 transition-colors hover:text-[#ef4444]"
                    >
                      <X size={13} aria-hidden />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Modal>
    </>
  );
};

export default InquiryFab;
