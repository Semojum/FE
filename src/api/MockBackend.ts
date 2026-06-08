import {
  JobDetail,
  JobSummary,
  LoginResponse,
  RefreshResponse,
  SaveJobInput,
  SignupResponse,
} from '../types/auth';
import { decodeJwt, encodeMockJwt, isExpired } from '../utils/jwt';

const STORAGE_KEY = 'braillemate-mock-db';

interface StoredUser {
  id: string;
  email: string;
  password: string;
  name: string;
}

interface StoredJob extends JobDetail {
  userId: string;
}

interface MockDb {
  users: StoredUser[];
  jobs: StoredJob[];
}

const loadDb = (): MockDb => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<MockDb>;
      return { users: parsed.users ?? [], jobs: parsed.jobs ?? [] };
    }
  } catch {
    // fall through to default
  }
  return { users: [], jobs: [] };
};

const saveDb = (db: MockDb) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
};

const delay = (ms = 200) => new Promise((r) => setTimeout(r, ms));
const genId = () => crypto.randomUUID();

const ACCESS_TTL_SEC = 60 * 60; // 1h
const REFRESH_TTL_SEC = 60 * 60 * 24; // 24h

export class MockBackendError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// 명세에 GET /me가 없으므로, mock도 실제 API처럼 accessToken(JWT)을 발급하고
// 보호 자원 접근 시 토큰의 sub(userId)를 디코드해 사용자를 식별한다.
const issueTokens = (user: StoredUser): LoginResponse => {
  const now = Math.floor(Date.now() / 1000);
  return {
    accessToken: encodeMockJwt({
      sub: user.id,
      email: user.email,
      name: user.name,
      exp: now + ACCESS_TTL_SEC,
    }),
    refreshToken: encodeMockJwt({
      sub: user.id,
      type: 'refresh',
      exp: now + REFRESH_TTL_SEC,
    }),
  };
};

const requireUserId = (token: string): string => {
  const payload = decodeJwt(token);
  if (!payload?.sub || isExpired(payload)) {
    throw new MockBackendError('인증이 만료되었습니다.', 401);
  }
  return payload.sub;
};

const stripUserId = (job: StoredJob): JobDetail => {
  const { userId: _ignored, ...rest } = job;
  void _ignored;
  return rest;
};

export const mockBackend = {
  async signup(
    email: string,
    password: string,
    name: string,
  ): Promise<SignupResponse> {
    await delay();
    const db = loadDb();
    if (db.users.some((u) => u.email === email)) {
      throw new MockBackendError('이미 가입된 이메일입니다.', 409);
    }
    db.users.push({ id: genId(), email, password, name });
    saveDb(db);
    return { email, name };
  },

  async login(email: string, password: string): Promise<LoginResponse> {
    await delay();
    const db = loadDb();
    const u = db.users.find(
      (x) => x.email === email && x.password === password,
    );
    if (!u) {
      throw new MockBackendError(
        '이메일 또는 비밀번호가 올바르지 않습니다.',
        401,
      );
    }
    return issueTokens(u);
  },

  // 명세상 result는 null. mock은 서버 세션이 없으므로 사실상 no-op.
  async logout(): Promise<null> {
    await delay(80);
    return null;
  },

  // refreshToken(JWT)의 sub로 사용자를 찾아 accessToken만 재발급한다.
  async refresh(refreshToken: string): Promise<RefreshResponse> {
    await delay(80);
    const payload = decodeJwt(refreshToken);
    if (!payload?.sub || isExpired(payload)) {
      throw new MockBackendError('refresh token이 만료되었습니다.', 401);
    }
    const db = loadDb();
    const u = db.users.find((x) => x.id === payload.sub);
    if (!u) throw new MockBackendError('존재하지 않는 회원입니다.', 404);
    const now = Math.floor(Date.now() / 1000);
    return {
      accessToken: encodeMockJwt({
        sub: u.id,
        email: u.email,
        name: u.name,
        exp: now + ACCESS_TTL_SEC,
      }),
    };
  },

  async listJobs(token: string): Promise<JobSummary[]> {
    await delay(150);
    const db = loadDb();
    const userId = requireUserId(token);
    return db.jobs
      .filter((j) => j.userId === userId)
      .map(({ userId: _u, blocksByPage: _b, bboxDataByPage: _x, originalTextsByPage: _o, imgResolution: _r, totalPages: _t, ...rest }) => {
        void _u; void _b; void _x; void _o; void _r; void _t;
        return rest;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async getJob(token: string, id: string): Promise<JobDetail> {
    await delay(150);
    const db = loadDb();
    const userId = requireUserId(token);
    const job = db.jobs.find((j) => j.id === id && j.userId === userId);
    if (!job) throw new MockBackendError('작업을 찾을 수 없습니다.', 404);
    return stripUserId(job);
  },

  async saveJob(token: string, input: SaveJobInput): Promise<JobDetail> {
    await delay(200);
    const db = loadDb();
    const userId = requireUserId(token);
    const job: StoredJob = {
      id: genId(),
      userId,
      createdAt: new Date().toISOString(),
      ...input,
    };
    db.jobs.push(job);
    saveDb(db);
    return stripUserId(job);
  },

  async deleteJob(token: string, id: string): Promise<void> {
    await delay(120);
    const db = loadDb();
    const userId = requireUserId(token);
    const idx = db.jobs.findIndex((j) => j.id === id && j.userId === userId);
    if (idx < 0) throw new MockBackendError('작업을 찾을 수 없습니다.', 404);
    db.jobs.splice(idx, 1);
    saveDb(db);
  },
};
