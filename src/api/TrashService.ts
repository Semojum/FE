import { apiRequest } from './apiClient';
import { TrashItem } from '../types/mypage';

// GET /api/trash — 삭제일 최신순. 폴더째 삭제된 경우 폴더 한 줄로만 나온다.
export const listTrash = (token: string): Promise<{ items: TrashItem[] }> =>
  apiRequest<{ items: TrashItem[] }>('/api/trash', { token });

// POST /api/trash/{id}/restore — {id}는 폴더 UUID 또는 jobId(job_ 접두사).
// 원래 위치로, 원래 폴더가 없으면 루트로 복원된다. 409 FOLDER4002=이름 충돌.
export const restoreTrashItem = (
  id: string,
  token: string,
): Promise<{ restoredTo: string | null }> =>
  apiRequest(`/api/trash/${id}/restore`, { method: 'POST', token });

// DELETE /api/trash/{id} — 30일을 기다리지 않고 즉시 완전 삭제(DB·S3). 복구 불가.
export const purgeTrashItem = (id: string, token: string): Promise<null> =>
  apiRequest<null>(`/api/trash/${id}`, { method: 'DELETE', token });
