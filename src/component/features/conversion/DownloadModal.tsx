import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import Modal, { ModalButton, modalInputCls } from '../../shared/Modal';
import { ConversionTab, TABS } from '../../../types';

// Figma V3-04 다운로드 모달 — 파일명 지정 + 조판 처리.
// 점역 결과(.brf)와 OCR 결과(.txt)의 기본 파일명 규칙은 결과 다운로드 기능정의서 3장.

interface Props {
  isOpen: boolean;
  mode: ConversionTab;
  onClose: () => void;
  // 서버가 파일을 만들어 내려줄 때까지 기다린다(수정본이 있으면 AI 조판 재처리).
  onDownload: (fileName: string) => Promise<void>;
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

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('파일 이름을 입력해 주세요.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onDownload(trimmed);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '다운로드에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

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
        수정한 내용이 있어 다운로드 전에 조판 처리를 진행합니다.
        <br />
        수정하지 않은 경우 바로 다운로드됩니다.
      </p>

      {busy && (
        <p className="mt-3 flex items-center gap-2 rounded-[10px] bg-[#eef3fc] px-3 py-2 text-[12px] font-medium text-[#5b8ce6]">
          <Loader2 size={14} className="animate-spin" />
          조판 처리 중... 잠시만 기다려 주세요
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
