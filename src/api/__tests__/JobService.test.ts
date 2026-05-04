import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startJob, API_BASE_URL } from '../JobService';

const makeJsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const makeTextResponse = (status: number, body: string): Response =>
  new Response(body, {
    status,
    headers: { 'content-type': 'text/html' },
  });

describe('JobService.startJob', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('POSTs multipart formdata to /job/start with file + mode', async () => {
    fetchSpy.mockResolvedValue(
      makeJsonResponse(200, {
        job_id: 'j1',
        status: 'PROCESSING',
        message: 'ok',
        mode: 'a',
      }),
    );

    const file = new File(['hi'], 'test.txt', { type: 'text/plain' });
    const res = await startJob(file, 'a');

    expect(res).toEqual({
      job_id: 'j1',
      status: 'PROCESSING',
      message: 'ok',
      mode: 'a',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/job/start`);
    expect((init as RequestInit).method).toBe('POST');
    const body = (init as RequestInit).body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('mode')).toBe('a');
    expect((body.get('file') as File).name).toBe('test.txt');
  });

  it('throws on non-2xx response with status info', async () => {
    fetchSpy.mockResolvedValue(makeJsonResponse(500, { error: 'fail' }));

    const file = new File(['x'], 'x.pdf', { type: 'application/pdf' });
    await expect(startJob(file, 'c')).rejects.toThrow(/500/);
  });

  it('throws when response is not JSON (SPA fallback HTML)', async () => {
    fetchSpy.mockResolvedValue(
      makeTextResponse(200, '<!DOCTYPE html><html>bad</html>'),
    );

    const file = new File(['x'], 'x.png', { type: 'image/png' });
    await expect(startJob(file, 'a')).rejects.toThrow(/JSON/);
  });

  it('propagates network error', async () => {
    fetchSpy.mockRejectedValue(new TypeError('Network error'));
    const file = new File(['x'], 'x.txt');
    await expect(startJob(file, 'a')).rejects.toThrow('Network error');
  });
});
