import { describe, expect, it } from 'vitest';
import { api, ApiError, errorMessage } from '../lib/api';
import { readSession } from '../lib/session';
import { json, mockApi, storeSession } from './helpers';

describe('api client', () => {
  it('unwraps { success, data }', async () => {
    mockApi({ 'GET /doctors': () => json(200, { success: true, data: [{ _id: 'd1' }] }) });
    await expect(api.doctors.listPublic()).resolves.toEqual([{ _id: 'd1' }]);
  });

  it('turns backend errors into ApiError with field errors', async () => {
    mockApi({
      'POST /auth/register': () =>
        json(400, {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details: { email: ['Enter a valid email address'] }, requestId: 'r1' },
        }),
    });
    const err = await api.auth
      .register({ fullName: 'A B', email: 'x', phone: '1', password: 'p', privacyPolicyAccepted: true })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).fieldErrors()).toEqual({ email: 'Enter a valid email address' });
    expect((err as ApiError).requestId).toBe('r1');
    expect(errorMessage(err)).toBe('Enter a valid email address');
  });

  it('reports network failures clearly', async () => {
    const { vi } = await import('vitest');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const err = (await api.doctors.listPublic().catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe('NETWORK_ERROR');
  });

  it('refreshes an expired access token once and retries', async () => {
    storeSession('PATIENT', 'old-access', 'refresh-1');
    const calls: string[] = [];
    mockApi({
      'GET /patient/summary': (init) => {
        const auth = new Headers(init?.headers).get('Authorization');
        calls.push(auth ?? '');
        return auth === 'Bearer new-access'
          ? json(200, { success: true, data: { upcoming: 1, pending: 0, completed: 2 } })
          : json(401, { success: false, error: { code: 'TOKEN_EXPIRED', message: 'expired' } });
      },
      'POST /auth/refresh': (init) => {
        expect(JSON.parse(String(init?.body))).toEqual({ refreshToken: 'refresh-1' });
        return json(200, { success: true, data: { accessToken: 'new-access' } });
      },
    });
    await expect(api.patient.summary()).resolves.toEqual({ upcoming: 1, pending: 0, completed: 2 });
    expect(calls).toEqual(['Bearer old-access', 'Bearer new-access']);
    expect(readSession()?.accessToken).toBe('new-access');
  });

  it('clears the session when the refresh token is rejected', async () => {
    storeSession('PATIENT');
    mockApi({
      'GET /patient/summary': () => json(401, { success: false, error: { code: 'TOKEN_EXPIRED', message: 'expired' } }),
      'POST /auth/refresh': () => json(401, { success: false, error: { code: 'INVALID_REFRESH_TOKEN', message: 'bad' } }),
    });
    await expect(api.patient.summary()).rejects.toMatchObject({ status: 401 });
    expect(readSession()).toBeNull();
  });

  it('sends the Idempotency-Key header when booking', async () => {
    let key: string | null = null;
    mockApi({
      'POST /patient/appointments': (init) => {
        key = new Headers(init?.headers).get('Idempotency-Key');
        return json(201, { success: true, data: { id: 'a1' } });
      },
    });
    await api.patient.book({ doctorId: 'd', date: '2030-01-01', startTime: '10:00', mode: 'IN_PERSON' }, 'key-12345678');
    expect(key).toBe('key-12345678');
  });
});
