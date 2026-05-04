import { describe, it, expect, beforeEach } from 'vitest';
import * as historyService from '../HistoryService';
import { mockBackend } from '../MockBackend';
import type { SaveJobInput } from '../../types/auth';

const newJob = (overrides: Partial<SaveJobInput> = {}): SaveJobInput => ({
  title: '제목',
  mode: 'OCR 변환',
  fileName: 'file.pdf',
  totalPages: 1,
  blocksByPage: {},
  bboxDataByPage: {},
  originalTextsByPage: {},
  imgResolution: { width: 0, height: 0 },
  ...overrides,
});

describe('HistoryService (mock-backed)', () => {
  let token: string;

  beforeEach(async () => {
    const res = await mockBackend.signup('hist@x.com', 'pw', 'Hist');
    token = res.token;
  });

  it('saveJob → listJobs → getJob 전 흐름', async () => {
    const saved = await historyService.saveJob(
      token,
      newJob({ title: '히스토리1' }),
    );

    const list = await historyService.listJobs(token);
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe('히스토리1');

    const detail = await historyService.getJob(token, saved.id);
    expect(detail.id).toBe(saved.id);
  });

  it('deleteJob 후 listJobs 결과가 비워짐', async () => {
    const saved = await historyService.saveJob(token, newJob());
    await historyService.deleteJob(token, saved.id);
    expect(await historyService.listJobs(token)).toHaveLength(0);
  });

  it('잘못된 토큰은 401', async () => {
    await expect(historyService.listJobs('bad')).rejects.toMatchObject({
      status: 401,
    });
  });
});
