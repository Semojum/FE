import { JobDetail, JobSummary, SaveJobInput } from '../types/auth';
import { mockBackend } from './MockBackend';

const USE_MOCK =
  (import.meta.env.VITE_USE_MOCK_API ?? 'true') !== 'false';

export const listJobs = (token: string): Promise<JobSummary[]> => {
  if (USE_MOCK) return mockBackend.listJobs(token);
  throw new Error('실제 작업 이력 API가 아직 구현되지 않았습니다.');
};

export const getJob = (token: string, id: string): Promise<JobDetail> => {
  if (USE_MOCK) return mockBackend.getJob(token, id);
  throw new Error('실제 작업 이력 API가 아직 구현되지 않았습니다.');
};

export const saveJob = (
  token: string,
  input: SaveJobInput,
): Promise<JobDetail> => {
  if (USE_MOCK) return mockBackend.saveJob(token, input);
  throw new Error('실제 작업 이력 API가 아직 구현되지 않았습니다.');
};

export const deleteJob = (token: string, id: string): Promise<void> => {
  if (USE_MOCK) return mockBackend.deleteJob(token, id);
  throw new Error('실제 작업 이력 API가 아직 구현되지 않았습니다.');
};
