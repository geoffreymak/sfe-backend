import { INestApplication } from '@nestjs/common';
import { createTestingApp, http } from '../utils/app-bootstrap';
import { randEmail, rand } from '../utils/factories';
import type { Test as SupertestTest } from 'supertest';

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

function hasStringProp(o: Record<string, unknown>, k: string): boolean {
  return typeof o[k] === 'string';
}

type RegisterResponse = { accessToken: string; tenantId: string };
function isRegisterResponse(x: unknown): x is RegisterResponse {
  return (
    isObject(x) &&
    hasStringProp(x, 'accessToken') &&
    hasStringProp(x, 'tenantId')
  );
}

describe('RBAC & Profile (E2E)', () => {
  let app: INestApplication;
  let token = '';
  let tenantId = '';
  let userId = '';
  const email = randEmail();

  beforeAll(async () => {
    app = await createTestingApp();
    const res = await http(app)
      .post('/auth/register')
      .send({
        email,
        password: 'Password123!',
        organizationName: 'Org RBAC ' + rand(),
      })
      .expect(201);
    if (!isRegisterResponse(res.body))
      throw new Error('Invalid register response');
    token = res.body.accessToken;
    tenantId = res.body.tenantId;

    const me = await http(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    userId = String(me.body?.user?.id ?? '');
    if (!userId) throw new Error('Missing userId from /auth/me');
  });

  afterAll(async () => {
    await app.close();
  });

  function authed() {
    const agent = http(app);
    const withHeaders = (req: SupertestTest): SupertestTest =>
      req.set('Authorization', `Bearer ${token}`).set('X-Tenant-Id', tenantId);
    return {
      get: (url: string): SupertestTest => withHeaders(agent.get(url)),
      post: (url: string): SupertestTest => withHeaders(agent.post(url)),
      put: (url: string): SupertestTest => withHeaders(agent.put(url)),
      patch: (url: string): SupertestTest => withHeaders(agent.patch(url)),
      delete: (url: string): SupertestTest => withHeaders(agent.delete(url)),
    };
  }

  describe('RBAC basics', () => {
    it('GET /rbac/permissions/catalog exposes known keys', async () => {
      const res = await authed().get('/rbac/permissions/catalog').expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      const keys = new Set<string>(
        (res.body as Array<{ key?: string }>).map((x) => String(x.key)),
      );
      expect(keys.has('roles:create')).toBe(true);
      expect(keys.has('invoices:pdf')).toBe(true);
      expect(keys.has('settings:read')).toBe(true);
    });

    it('GET /rbac/roles has default seeded roles', async () => {
      const res = await authed().get('/rbac/roles').expect(200);
      const roleKeys = new Set<string>(
        (res.body as Array<{ key?: string }>).map((r) => String(r.key)),
      );
      for (const k of ['OWNER', 'ADMIN', 'MANAGER', 'CASHIER', 'VIEWER']) {
        expect(roleKeys.has(k)).toBe(true);
      }
    });

    it('POST /rbac/roles creates SUPERVISOR with subset permissions', async () => {
      const payload = {
        key: 'SUPERVISOR',
        name: 'Supervisor',
        description: 'Supervisory role',
        permissions: [
          'items:read',
          'invoices:read',
          'invoices:pdf',
          'settings:read',
        ],
      } as const;
      const res = await authed().post('/rbac/roles').send(payload).expect(201);
      expect(res.body?.key).toBe('SUPERVISOR');
      expect(Array.isArray(res.body?.permissions)).toBe(true);
    });

    it('PUT membership roles assigns OWNER + SUPERVISOR', async () => {
      const res = await authed()
        .put(`/rbac/users/${userId}/memberships/${tenantId}/roles`)
        .send({ roles: ['OWNER', 'SUPERVISOR'] })
        .expect(200);
      expect(Array.isArray(res.body?.roles)).toBe(true);
      expect(res.body.roles).toEqual(
        expect.arrayContaining(['OWNER', 'SUPERVISOR']),
      );
    });

    it('GET /me/roles reflects assigned roles', async () => {
      const res = await authed().get('/me/roles').expect(200);
      expect(res.body?.roles).toEqual(
        expect.arrayContaining(['OWNER', 'SUPERVISOR']),
      );
    });

    it('GET /me/permissions aggregates permissions from roles', async () => {
      const res = await authed().get('/me/permissions').expect(200);
      expect(Array.isArray(res.body?.permissions)).toBe(true);
      // At least includes one known permission from SUPERVISOR
      expect(res.body.permissions).toEqual(
        expect.arrayContaining(['invoices:pdf']),
      );
    });
  });

  describe('Profile flows', () => {
    it('GET /me/profile returns current user profile', async () => {
      const res = await authed().get('/me/profile').expect(200);
      expect(typeof res.body?.id).toBe('string');
      expect(res.body?.email).toBe(email);
    });

    it('PUT /me/profile updates and normalizes fields', async () => {
      const payload = {
        displayName: '  Jane Doe  ',
        phone: '  +243000  ',
        avatarUrl: 'https://example.com/a.png',
        locale: ' fr ',
        timezone: ' Africa/Kinshasa ',
      } as const;
      const res = await authed().put('/me/profile').send(payload).expect(200);
      expect(res.body?.displayName).toBe('Jane Doe');
      expect(res.body?.phone).toBe('+243000');
      expect(res.body?.avatarUrl).toBe('https://example.com/a.png');
      expect(res.body?.locale).toBe('fr');
      expect(res.body?.timezone).toBe('Africa/Kinshasa');
    });

    it('PATCH /me/password rejects invalid current password with RFC7807', async () => {
      const res = await authed()
        .patch('/me/password')
        .send({ currentPassword: 'WrongPass', newPassword: 'NewPassword123!' })
        .expect(400);
      expect(String(res.headers['content-type'])).toContain(
        'application/problem+json',
      );
      expect(res.body?.status).toBe(400);
      expect(res.body?.title).toBe('Bad Request');
      expect(String(res.body?.detail ?? '')).toMatch(/invalid/i);
    });

    it('PATCH /me/password changes password and returns 204', async () => {
      await authed()
        .patch('/me/password')
        .send({
          currentPassword: 'Password123!',
          newPassword: 'BetterPass123!@#',
        })
        .expect(204);
    });

    it('login fails with old password, succeeds with new password', async () => {
      // old password should fail
      const fail = await http(app)
        .post('/auth/login')
        .send({ email, password: 'Password123!' })
        .expect(403);
      expect(String(fail.headers['content-type'])).toContain(
        'application/problem+json',
      );
      expect(fail.body?.status).toBe(403);

      // new password should succeed
      const ok = await http(app)
        .post('/auth/login')
        .send({ email, password: 'BetterPass123!@#' })
        .expect(200);
      expect(isObject(ok.body) && hasStringProp(ok.body, 'accessToken')).toBe(
        true,
      );
    });
  });
});
