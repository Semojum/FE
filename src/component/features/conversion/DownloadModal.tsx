import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import Modal, { ModalButton, modalInputCls } from '../../shared/Modal';
import { ConversionTab, TABS } from '../../../types';
import type { PendingMarks } from '../../../utils/localBrf';

// Figma V3-04 다운로드 모달 — 파일명 지정 + 조판 처리.
// 점역 결과(.brf)와 OCR 결과(.txt)의 기본 파일명 규칙은 결과 다운로드 기능정의서 3장.

interface Props {
  isOpen: boolean;
  mode: ConversionTab;
  onClose: () => void;
  // 서버가 파일을 만들어 내려줄 때까지 기다린다. 조판은 로컬 연산이라 재처리 분기가 없고,
  // 항상 DB의 현재 편집본으로 즉시 만들어진다 — 대신 호출 전에 저장을 밀어내야 한다.
  onDownload: (fileName: string) => Promise<void>;
  // 서버가 아직 해석하지 못하는 표식 수(쪽바꿈·구간 꼬리말). 있으면 미리 알린다.
  pendingMarks?: PendingMarks;
  // 개발 빌드 전용 임시 경로 — 화면 판면을 그대로 .brf로 떨군다(S-1 대기).
  onDownloadLocal?: (fileName: string) => Promise<void>;
}

const today = () => new Date().toISOString().slice(0, 10).replace(/-/g, '');

export const defaultDownloadName = (mode: ConversionTab): string =>
  mode === TABS.OCR ? `result_${today()}` : `braille_result_${today()}`;

const extensionOf = (mode: ConversionTab) =>
  mode === TABS.OCR ? '.txt' : '.brf';

const DownloadModal: React.FC<Props> = ({
  isOpen,
  mode,
  onClose,
  onDownload,
  pendingMarks,
  onDownloadLocal,
}) => {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName(defaultDownloadName(mode));
      setError(null);
      setBusy(false);
    }
  }, [isOpen, mode]);

  const run = async (fn: (fileName: string) => Promise<void>) => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('파일 이름을 입력해 주세요.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await fn(trimmed);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '다운로드에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const submit = () => run(onDownload);

  return (
    <Modal
      isOpen={isOpen}
      title="다운로드"
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <ModalButton onClick={onClose} disabled={busy}>
            취소
          </ModalButton>
          {onDownloadLocal && (
            <ModalButton
              onClick={() => void run(onDownloadLocal)}
              disabled={busy}
              title="서버를 거치지 않고 지금 화면의 판면을 그대로 파일로 만듭니다 (개발 빌드 전용)"
            >
              화면 그대로 (임시)
            </ModalButton>
          )}
          <ModalButton variant="primary" onClick={submit} disabled={busy}>
            다운로드
          </ModalButton>
        </>
      }
    >
      <label className="mb-1.5 block text-[12px] text-gray-500">
        파일 이름
      </label>
      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit();
          }}
          disabled={busy}
          className={modalInputCls}
          aria-label="파일 이름"
        />
        <span className="shrink-0 text-sm text-gray-400">
          {extensionOf(mode)}
        </span>
      </div>

      <p className="mt-3 text-[12px] leading-relaxed text-gray-500">
        지금까지 수정한 내용을 저장한 뒤 파일을 만듭니다.
        {mode !== TABS.OCR && (
          <>
            <br />
            쪽번호·꼬리말은 업로드할 때 정한 값으로 조판됩니다.
          </>
        )}
      </p>

      {/* 서버가 아직 모르는 표식 — 그대로 두면 파일에 글자로 찍힌다(L-2·L-3). */}
      {!!pendingMarks &&
        pendingMarks.pageBreaks + pendingMarks.footerMarks > 0 && (
          <p className="mt-3 rounded-[10px] bg-[#fbf1de] px-3 py-2 text-[12px] leading-relaxed text-[#8a5a00]">
            이 작업에는 서버가 아직 읽지 못하는 표식이{' '}
            {pendingMarks.pageBreaks > 0 && `쪽바꿈 ${pendingMarks.pageBreaks}개`}
            {pendingMarks.pageBreaks > 0 && pendingMarks.footerMarks > 0 && ' · '}
            {pendingMarks.footerMarks > 0 &&
              `구간 꼬리말 ${pendingMarks.footerMarks}개`}{' '}
            있습니다. 서버가 만든 파일에는 <b>표식이 글자로 찍히고</b> 면도 갈리지
            않습니다.
            {onDownloadLocal && ' 확인만 하려면 [화면 그대로 (임시)]를 쓰세요.'}
          </p>
        )}

      {busy && (
        <p className="mt-3 flex items-center gap-2 rounded-[10px] bg-[#eef3fc] px-3 py-2 text-[12px] font-medium text-[#5b8ce6]">
          <Loader2 size={14} className="animate-spin" />
          파일을 만드는 중... 잠시만 기다려 주세요
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-[12px] text-[#ff3b30]">
          {error}
        </p>
      )}
    </Modal>
  );
};

export default DownloadModal;
