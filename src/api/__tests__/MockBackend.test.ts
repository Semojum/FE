import { describe, it, expect } from 'vitest';
import { mockBackend, MockBackendError } from '../MockBackend';
import { decodeJwt } from '../../utils/jwt';
import type { SaveJobInput } from '../../types/auth';

const sampleJobInput: SaveJobInput = {
  title: '샘플',
  mode: 'OCR 변환',
  fileName: 'sample.pdf',
  totalPages: 1,
  blocksByPage: { 1: [{ id: 'a', currentText: 'hello', candidates: [] }] },
  bboxDataByPage: {},
  originalTextsByPage: {},
  imgResolution: { width: 0, height: 0 },
};

// 가입 후 로그인하여 accessToken을 얻는 헬퍼 (명세상 signup은 토큰을 발급하지 않음)
const tokenFor = async (email: string, pw = 'pw', name = 'User') => {
  await mockBackend.signup(email, pw, name);
  const { accessToken } = await mockBackend.login(email, pw);
  return accessToken;
};

describe('mockBackend.signup', () => {
  it('creates a new user and returns { email, name } (no token)', async () => {
    const res = await mockBackend.signup('a@b.com', 'pw', 'Alice');
    expect(res).toEqual({ email: 'a@b.com', name: 'Alice' });
  });

  it('rejects duplicate email with 409', async () => {
    await mockBackend.signup('a@b.com', 'pw', 'Alice');
    await expect(
      mockBackend.signup('a@b.com', 'pw2', 'Bob'),
    ).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(/이미 가입/),
    });
  });
});

describe('mockBackend.login', () => {
  it('returns decodable accessToken/refreshToken on valid credentials', async () => {
    await mockBackend.signup('a@b.com', 'pw', 'Alice');
    const res = await mockBackend.login('a@b.com', 'pw');
    expect(res.accessToken).toEqual(expect.any(String));
    expect(res.refreshToken).toEqual(expect.any(String));

    const payload = decodeJwt(res.accessToken);
    expect(payload?.email).toBe('a@b.com');
    expect(payload?.name).toBe('Alice');
  });

  it('rejects wrong password with 401', async () => {
    await mockBackend.signup('a@b.com', 'pw', 'Alice');
    await expect(
      mockBackend.login('a@b.com', 'wrong'),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('rejects unknown email with 401', async () => {
    await expect(mockBackend.login('nope@x.com', 'pw')).rejects.toMatchObject(
      { status: 401 },
    );
  });
});

describe('mockBackend.saveJob / listJobs / getJob / deleteJob', () => {
  it('saves a job and returns it via list and get', async () => {
    const token = await tokenFor('a@b.com');
    const saved = await mockBackend.saveJob(token, sampleJobInput);

    const list = await mockBackend.listJobs(token);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: saved.id,
      title: '샘플',
      mode: 'OCR 변환',
      fileName: 'sample.pdf',
    });

    const detail = await mockBackend.getJob(token, saved.id);
    expect(detail.blocksByPage).toEqual(sampleJobInput.blocksByPage);
    expect(detail.totalPages).toBe(1);
  });

  it('lists user jobs sorted newest first', async () => {
    const token = await tokenFor('a@b.com');
    const a = await mockBackend.saveJob(token, {
      ...sampleJobInput,
      title: 'first',
    });
    await new Promise((r) => setTimeout(r, 5));
    const b = await mockBackend.saveJob(token, {
      ...sampleJobInput,
      title: 'second',
    });

    const list = await mockBackend.listJobs(token);
    expect(list.map((j) => j.id)).toEqual([b.id, a.id]);
  });

  it('isolates jobs across users', async () => {
    const aTok = await tokenFor('a@b.com', 'pw', 'Alice');
    const bTok = await tokenFor('b@b.com', 'pw', 'Bob');

    await mockBackend.saveJob(aTok, { ...sampleJobInput, title: 'A의 일' });

    expect(await mockBackend.listJobs(aTok)).toHaveLength(1);
    expect(await mockBackend.listJobs(bTok)).toHaveLength(0);
  });

  it('rejects getJob for jobs owned by other user (404)', async () => {
    const aTok = await tokenFor('a@b.com', 'pw', 'Alice');
    const bTok = await tokenFor('b@b.com', 'pw', 'Bob');
    const saved = await mockBackend.saveJob(aTok, sampleJobInput);

    await expect(mockBackend.getJob(bTok, saved.id)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('deleteJob removes the job', async () => {
    const token = await tokenFor('a@b.com');
    const saved = await mockBackend.saveJob(token, sampleJobInput);

    await mockBackend.deleteJob(token, saved.id);

    expect(await mockBackend.listJobs(token)).toHaveLength(0);
    await expect(mockBackend.getJob(token, saved.id)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('deleteJob 404s on unknown id', async () => {
    const token = await tokenFor('a@b.com');
    await expect(
      mockBackend.deleteJob(token, 'no-such'),
    ).rejects.toMatchObject({ status: 404 });
  });

  it.each(['listJobs', 'getJob', 'saveJob', 'deleteJob'] as const)(
    '%s rejects invalid token with 401',
    async (method) => {
      const fn = mockBackend[method] as (
        token: string,
        ...args: unknown[]
      ) => Promise<unknown>;
      const args =
        method === 'saveJob'
          ? [sampleJobInput]
          : method === 'getJob' || method === 'deleteJob'
            ? ['some-id']
            : [];
      await expect(fn('expired', ...args)).rejects.toMatchObject({
        status: 401,
      });
    },
  );
});

describe('MockBackendError', () => {
  it('exposes status code', () => {
    const err = new MockBackendError('boom', 418);
    expect(err.status).toBe(418);
    expect(err.message).toBe('boom');
    expect(err).toBeInstanceOf(Error);
  });
});
