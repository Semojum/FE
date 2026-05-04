import { describe, it, expect } from 'vitest';
import { mockBackend, MockBackendError } from '../MockBackend';
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

describe('mockBackend.signup', () => {
  it('creates a new user and returns token + user', async () => {
    const res = await mockBackend.signup('a@b.com', 'pw', 'Alice');
    expect(res.token).toEqual(expect.any(String));
    expect(res.user).toMatchObject({
      email: 'a@b.com',
      name: 'Alice',
    });
    expect(res.user.id).toEqual(expect.any(String));
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

  it('persists user across calls (localStorage)', async () => {
    await mockBackend.signup('a@b.com', 'pw', 'Alice');
    const res = await mockBackend.login('a@b.com', 'pw');
    expect(res.user.email).toBe('a@b.com');
  });
});

describe('mockBackend.login', () => {
  it('returns auth response on valid credentials', async () => {
    await mockBackend.signup('a@b.com', 'pw', 'Alice');
    const res = await mockBackend.login('a@b.com', 'pw');
    expect(res.user.email).toBe('a@b.com');
    expect(res.token).toEqual(expect.any(String));
  });

  it('issues a different token than signup', async () => {
    const signupRes = await mockBackend.signup('a@b.com', 'pw', 'Alice');
    const loginRes = await mockBackend.login('a@b.com', 'pw');
    expect(loginRes.token).not.toBe(signupRes.token);
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

describe('mockBackend.me', () => {
  it('returns user profile for valid token', async () => {
    const { token } = await mockBackend.signup('a@b.com', 'pw', 'Alice');
    const me = await mockBackend.me(token);
    expect(me).toMatchObject({ email: 'a@b.com', name: 'Alice' });
  });

  it('rejects invalid token with 401', async () => {
    await expect(mockBackend.me('bogus-token')).rejects.toMatchObject({
      status: 401,
    });
  });
});

describe('mockBackend.logout', () => {
  it('invalidates the token so subsequent me() fails', async () => {
    const { token } = await mockBackend.signup('a@b.com', 'pw', 'Alice');
    await mockBackend.logout(token);
    await expect(mockBackend.me(token)).rejects.toMatchObject({ status: 401 });
  });

  it('is idempotent (logout already-invalid token does not throw)', async () => {
    await expect(mockBackend.logout('any')).resolves.toBeUndefined();
  });
});

describe('mockBackend.saveJob / listJobs / getJob / deleteJob', () => {
  it('saves a job and returns it via list and get', async () => {
    const { token } = await mockBackend.signup('a@b.com', 'pw', 'Alice');
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
    const { token } = await mockBackend.signup('a@b.com', 'pw', 'Alice');
    const a = await mockBackend.saveJob(token, {
      ...sampleJobInput,
      title: 'first',
    });
    // Slight delay so createdAt strictly differs
    await new Promise((r) => setTimeout(r, 5));
    const b = await mockBackend.saveJob(token, {
      ...sampleJobInput,
      title: 'second',
    });

    const list = await mockBackend.listJobs(token);
    expect(list.map((j) => j.id)).toEqual([b.id, a.id]);
  });

  it('isolates jobs across users', async () => {
    const a = await mockBackend.signup('a@b.com', 'pw', 'Alice');
    const b = await mockBackend.signup('b@b.com', 'pw', 'Bob');

    await mockBackend.saveJob(a.token, { ...sampleJobInput, title: 'A의 일' });

    expect(await mockBackend.listJobs(a.token)).toHaveLength(1);
    expect(await mockBackend.listJobs(b.token)).toHaveLength(0);
  });

  it('rejects getJob for jobs owned by other user (404)', async () => {
    const a = await mockBackend.signup('a@b.com', 'pw', 'Alice');
    const b = await mockBackend.signup('b@b.com', 'pw', 'Bob');
    const saved = await mockBackend.saveJob(a.token, sampleJobInput);

    await expect(mockBackend.getJob(b.token, saved.id)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('deleteJob removes the job', async () => {
    const { token } = await mockBackend.signup('a@b.com', 'pw', 'Alice');
    const saved = await mockBackend.saveJob(token, sampleJobInput);

    await mockBackend.deleteJob(token, saved.id);

    expect(await mockBackend.listJobs(token)).toHaveLength(0);
    await expect(mockBackend.getJob(token, saved.id)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('deleteJob 404s on unknown id', async () => {
    const { token } = await mockBackend.signup('a@b.com', 'pw', 'Alice');
    await expect(
      mockBackend.deleteJob(token, 'no-such'),
    ).rejects.toMatchObject({ status: 404 });
  });

  it.each(['listJobs', 'getJob', 'saveJob', 'deleteJob'] as const)(
    '%s rejects expired token with 401',
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
