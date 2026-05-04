import {
  AuthResponse,
  JobDetail,
  JobSummary,
  SaveJobInput,
  User,
} from '../types/auth';

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
  tokens: Record<string, string>; // token → userId
  jobs: StoredJob[];
}

const loadDb = (): MockDb => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as MockDb;
  } catch {
    // fall through to default
  }
  return { users: [], tokens: {}, jobs: [] };
};

const saveDb = (db: MockDb) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
};

const delay = (ms = 200) => new Promise((r) => setTimeout(r, ms));
const genId = () => crypto.randomUUID();

export class MockBackendError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const requireUserId = (db: MockDb, token: string): string => {
  const userId = db.tokens[token];
  if (!userId) throw new MockBackendError('인증이 만료되었습니다.', 401);
  return userId;
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
  ): Promise<AuthResponse> {
    await delay();
    const db = loadDb();
    if (db.users.some((u) => u.email === email)) {
      throw new MockBackendError('이미 가입된 이메일입니다.', 409);
    }
    const id = genId();
    db.users.push({ id, email, password, name });
    const token = genId();
    db.tokens[token] = id;
    saveDb(db);
    return { token, user: { id, email, name } };
  },

  async login(email: string, password: string): Promise<AuthResponse> {
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
    const token = genId();
    db.tokens[token] = u.id;
    saveDb(db);
    return { token, user: { id: u.id, email: u.email, name: u.name } };
  },

  async me(token: string): Promise<User> {
    await delay(100);
    const db = loadDb();
    const userId = requireUserId(db, token);
    const u = db.users.find((x) => x.id === userId);
    if (!u) throw new MockBackendError('사용자를 찾을 수 없습니다.', 404);
    return { id: u.id, email: u.email, name: u.name };
  },

  async logout(token: string): Promise<void> {
    await delay(80);
    const db = loadDb();
    delete db.tokens[token];
    saveDb(db);
  },

  async listJobs(token: string): Promise<JobSummary[]> {
    await delay(150);
    const db = loadDb();
    const userId = requireUserId(db, token);
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
    const userId = requireUserId(db, token);
    const job = db.jobs.find((j) => j.id === id && j.userId === userId);
    if (!job) throw new MockBackendError('작업을 찾을 수 없습니다.', 404);
    return stripUserId(job);
  },

  async saveJob(token: string, input: SaveJobInput): Promise<JobDetail> {
    await delay(200);
    const db = loadDb();
    const userId = requireUserId(db, token);
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
    const userId = requireUserId(db, token);
    const idx = db.jobs.findIndex((j) => j.id === id && j.userId === userId);
    if (idx < 0) throw new MockBackendError('작업을 찾을 수 없습니다.', 404);
    db.jobs.splice(idx, 1);
    saveDb(db);
  },
};
