import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Folder, FolderPlus } from 'lucide-react';
import Modal, { ModalButton, modalInputCls } from '../../shared/Modal';
import { FOLDER_LIMITS, FolderTreeNode } from '../../../types/mypage';
import { flattenTree } from '../../../hooks/UseMyPage';

// 마이페이지 S3~S6 모달. 공통 규칙: 바깥 클릭·ESC로 닫히고, 요청 중에는 버튼이 비활성.

// ─── S3. 새 폴더 ──────────────────────────────────────────────────────

interface NewFolderProps {
  isOpen: boolean;
  // 생성 위치 안내 문구 (예: "전체 › 2026 수능특강")
  locationLabel: string;
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
}

export const NewFolderModal: React.FC<NewFolderProps> = ({
  isOpen,
  locationLabel,
  onClose,
  onCreate,
}) => {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setError(null);
      setBusy(false);
    }
  }, [isOpen]);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('폴더 이름을 입력해 주세요.');
      return;
    }
    if (trimmed.length > FOLDER_LIMITS.nameMaxLength) {
      setError(
        `폴더 이름은 ${FOLDER_LIMITS.nameMaxLength}자까지 쓸 수 있습니다.`,
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onCreate(trimmed);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : '폴더를 만들지 못했습니다.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      title="새 폴더"
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <ModalButton onClick={onClose} disabled={busy}>
            취소
          </ModalButton>
          <ModalButton variant="primary" onClick={submit} disabled={busy}>
            만들기
          </ModalButton>
        </>
      }
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void submit();
        }}
        maxLength={FOLDER_LIMITS.nameMaxLength}
        disabled={busy}
        placeholder="폴더 이름"
        aria-label="폴더 이름"
        className={modalInputCls}
      />
      <p className="mt-2 text-[12px] text-gray-400">위치: {locationLabel}</p>
      {error && (
        <p role="alert" className="mt-2 text-[12px] text-[#ff3b30]">
          {error}
        </p>
      )}
    </Modal>
  );
};

// ─── S5. 이름 변경 ────────────────────────────────────────────────────

interface RenameProps {
  isOpen: boolean;
  currentName: string;
  // 폴더는 안내 문구가 없고, 파일은 원본 파일명 안내를 붙인다.
  kind: 'folder' | 'file';
  onClose: () => void;
  onRename: (name: string) => Promise<void>;
}

export const RenameModal: React.FC<RenameProps> = ({
  isOpen,
  currentName,
  kind,
  onClose,
  onRename,
}) => {
  const [name, setName] = useState(currentName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName(currentName);
      setError(null);
      setBusy(false);
    }
  }, [isOpen, currentName]);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('이름을 입력해 주세요.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onRename(trimmed);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : '이름을 바꾸지 못했습니다.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      title="이름 변경"
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <ModalButton onClick={onClose} disabled={busy}>
            취소
          </ModalButton>
          <ModalButton variant="primary" onClick={submit} disabled={busy}>
            저장
          </ModalButton>
        </>
      }
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void submit();
        }}
        maxLength={kind === 'folder' ? FOLDER_LIMITS.nameMaxLength : 100}
        disabled={busy}
        aria-label="새 이름"
        className={modalInputCls}
      />
      {kind === 'file' && (
        <p className="mt-2 text-[12px] text-gray-400">
          파일 이름만 바뀌며 변환 결과에는 영향이 없습니다.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-[12px] text-[#ff3b30]">
          {error}
        </p>
      )}
    </Modal>
  );
};

// ─── S4. 폴더로 이동 ──────────────────────────────────────────────────

interface MoveProps {
  isOpen: boolean;
  tree: FolderTreeNode[];
  // 이동 대상이 폴더면 자기 자신·하위로는 갈 수 없어 목록에서 뺀다.
  excludeFolderId?: string | null;
  itemCountLabel: string;
  onClose: () => void;
  onMove: (targetFolderId: string | null) => Promise<void>;
  onCreateFolder: (
    name: string,
    parentFolderId: string | null,
  ) => Promise<void>;
}

// 제외 대상과 그 하위를 트리에서 걷어낸다(순환 이동 방지).
const pruneSubtree = (
  nodes: FolderTreeNode[],
  excludeId: string | null | undefined,
): FolderTreeNode[] =>
  excludeId
    ? nodes
        .filter((n) => n.folderId !== excludeId)
        .map((n) => ({
          ...n,
          children: pruneSubtree(n.children ?? [], excludeId),
        }))
    : nodes;

export const MoveToFolderModal: React.FC<MoveProps> = ({
  isOpen,
  tree,
  excludeFolderId,
  itemCountLabel,
  onClose,
  onMove,
  onCreateFolder,
}) => {
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    if (isOpen) {
      setTarget(null);
      setError(null);
      setBusy(false);
      setIsCreating(false);
      setNewName('');
    }
  }, [isOpen]);

  const rows = useMemo(
    () => flattenTree(pruneSubtree(tree, excludeFolderId)),
    [tree, excludeFolderId],
  );

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onMove(target);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '이동하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const createHere = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      await onCreateFolder(trimmed, target);
      setIsCreating(false);
      setNewName('');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : '폴더를 만들지 못했습니다.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      title={`폴더로 이동 · ${itemCountLabel}`}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <ModalButton onClick={onClose} disabled={busy}>
            취소
          </ModalButton>
          <ModalButton variant="primary" onClick={submit} disabled={busy}>
            이동
          </ModalButton>
        </>
      }
    >
      <div className="max-h-[220px] overflow-y-auto rounded-[10px] border border-gray-200">
        <button
          type="button"
          onClick={() => setTarget(null)}
          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
            target === null
              ? 'bg-[#eef3fc] font-semibold text-[#5b8ce6]'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Folder size={15} /> 전체
        </button>
        {rows.map(({ node, depth }) => (
          <button
            key={node.folderId}
            type="button"
            onClick={() => setTarget(node.folderId)}
            style={{ paddingLeft: 12 + (depth + 1) * 16 }}
            className={`flex w-full items-center gap-2 py-2 pr-3 text-left text-sm transition-colors ${
              target === node.folderId
                ? 'bg-[#eef3fc] font-semibold text-[#5b8ce6]'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Folder size={15} /> {node.name}
          </button>
        ))}
      </div>

      {isCreating ? (
        <div className="mt-2 flex items-center gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void createHere();
            }}
            maxLength={FOLDER_LIMITS.nameMaxLength}
            placeholder="새 폴더 이름"
            aria-label="새 폴더 이름"
            className={modalInputCls}
          />
          <ModalButton
            variant="primary"
            onClick={createHere}
            disabled={busy}
            className="shrink-0"
          >
            추가
          </ModalButton>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsCreating(true)}
          disabled={busy}
          className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold text-[#f47726] transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          <FolderPlus size={14} /> 새 폴더
        </button>
      )}

      {error && (
        <p role="alert" className="mt-2 text-[12px] text-[#ff3b30]">
          {error}
        </p>
      )}
    </Modal>
  );
};

// ─── S6. 삭제 확인 ────────────────────────────────────────────────────

interface DeleteProps {
  isOpen: boolean;
  // 폴더는 하위 내용이 함께 간다는 안내가 필요하다.
  kind: 'folder' | 'file';
  targetLabel: string;
  onClose: () => void;
  onDelete: () => Promise<void>;
}

export const DeleteConfirmModal: React.FC<DeleteProps> = ({
  isOpen,
  kind,
  targetLabel,
  onClose,
  onDelete,
}) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setBusy(false);
    }
  }, [isOpen]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onDelete();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      title="삭제"
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <ModalButton onClick={onClose} disabled={busy}>
            취소
          </ModalButton>
          <ModalButton variant="danger" onClick={submit} disabled={busy}>
            삭제
          </ModalButton>
        </>
      }
    >
      <p className="text-[13px] leading-relaxed text-gray-500">
        {targetLabel}을(를) 휴지통으로 옮깁니다.
        {kind === 'folder' && ' 폴더 안의 내용도 함께 이동합니다.'}
        <br />
        30일 이내에는 휴지통에서 복원할 수 있습니다.
      </p>
      {error && (
        <p role="alert" className="mt-2 text-[12px] text-[#ff3b30]">
          {error}
        </p>
      )}
    </Modal>
  );
};

// 브레드크럼 문자열 — 새 폴더 모달의 "위치" 안내에 쓴다.
export const locationLabelOf = (names: string[]): string =>
  ['전체', ...names].join(' › ');

export const CrumbSeparator: React.FC = () => (
  <ChevronRight size={14} className="text-gray-300" />
);
