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

describe('Users (E2E)', () => {
  let app: INestApplication;
  let token = '';
  let tenantId = '';
  let adminUserId = '';

  beforeAll(async () => {
    app = await createTestingApp();
    const email = randEmail();
    const res = await http(app)
      .post('/auth/register')
      .send({
        email,
        password: 'Password123!',
        organizationName: 'Org Users ' + rand(),
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
    adminUserId = String(me.body?.user?.id ?? '');
    if (!adminUserId) throw new Error('Missing userId from /auth/me');
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

  let user1: { id: string; email: string };
  let user2: { id: string; email: string };

  it('POST /users creates user1 with roles and password (no hash leak)', async () => {
    const email = randEmail();
    const payload = {
      email,
      password: 'User1Pass!23',
      displayName: 'John One',
      roles: ['VIEWER'],
    } as const;
    const res = await authed().post('/users').send(payload).expect(201);
    expect(typeof res.body?.id).toBe('string');
    expect(res.body?.email).toBe(email.toLowerCase());
    expect(res.body?.status).toBe('active');
    expect(res.body?.defaultTenantId).toBe(tenantId);
    expect(res.body?.passwordHash).toBeUndefined();
    user1 = { id: res.body.id, email };

    // Verify roles were assigned
    const r = await authed().get(`/users/${user1.id}/roles`).expect(200);
    expect(Array.isArray(r.body)).toBe(true);
    expect(r.body).toEqual(expect.arrayContaining(['VIEWER']));
  });

  it('POST /users creates user2 (will use for pagination and delete)', async () => {
    const email = randEmail();
    const res = await authed()
      .post('/users')
      .send({ email, password: 'User2Pass!23', displayName: 'Jane Two' })
      .expect(201);
    expect(res.body?.passwordHash).toBeUndefined();
    user2 = { id: res.body.id, email };
    // Ensure membership in current tenant so list/delete work
    await authed()
      .put(`/rbac/users/${user2.id}/memberships/${tenantId}/roles`)
      .send({ roles: [] })
      .expect(200);
  });

  it('POST /users duplicate email returns 409', async () => {
    await authed()
      .post('/users')
      .send({ email: user1.email, password: 'AnotherPass!23' })
      .expect(409);
  });

  it('GET /users lists users with pagination and search and no hash leak', async () => {
    const list = await authed().get('/users').expect(200);
    expect(Array.isArray(list.body?.items)).toBe(true);
    expect(typeof list.body?.total).toBe('number');
    // all items must not leak passwordHash
    for (const it of list.body.items as Array<Record<string, unknown>>) {
      expect((it as any).passwordHash).toBeUndefined();
    }

    const paged = await authed().get('/users?limit=1&offset=1').expect(200);
    expect(paged.body?.items?.length).toBe(1);

    const searchJane = await authed().get('/users?q=Jane').expect(200);
    const emails = new Set(
      (searchJane.body.items as any[]).map((x) => x.email),
    );
    expect(emails.has(user2.email.toLowerCase())).toBe(true);
  });

  it('GET /users/:id returns safe user (no hash), then PATCH updates and normalizes', async () => {
    const one = await authed().get(`/users/${user1.id}`).expect(200);
    expect(one.body?.passwordHash).toBeUndefined();

    const upd = await authed()
      .patch(`/users/${user1.id}`)
      .send({
        displayName: '  John   Updated  ',
        phone: '  +100  ',
        locale: ' fr ',
        timezone: ' Africa/Kinshasa ',
      })
      .expect(200);
    expect(upd.body?.displayName).toBe('John   Updated'); // preserves inner spaces, trims outer
    expect(upd.body?.phone).toBe('+100');
    expect(upd.body?.locale).toBe('fr');
    expect(upd.body?.timezone).toBe('Africa/Kinshasa');
  });

  it('GET /users/:id/roles then PUT to change roles', async () => {
    const before = await authed().get(`/users/${user1.id}/roles`).expect(200);
    expect(Array.isArray(before.body)).toBe(true);

    const set = await authed()
      .put(`/users/${user1.id}/roles`)
      .send({ roles: ['ADMIN'] })
      .expect(200);
    expect(set.body?.roles).toEqual(['ADMIN']);

    const after = await authed().get(`/users/${user1.id}/roles`).expect(200);
    expect(after.body).toEqual(expect.arrayContaining(['ADMIN']));
  });

  it('PUT /users/:id/status updates status and guards self-lock', async () => {
    const res = await authed()
      .put(`/users/${user1.id}/status`)
      .send({ status: 'locked' })
      .expect(200);
    expect(res.body?.status).toBe('locked');

    // cannot lock yourself
    await authed()
      .put(`/users/${adminUserId}/status`)
      .send({ status: 'locked' })
      .expect(400);

    // list filter by status should include user1
    const locked = await authed().get('/users?status=locked').expect(200);
    const ids = new Set((locked.body.items as any[]).map((x) => x.id));
    expect(ids.has(user1.id)).toBe(true);
  });

  it('PUT /users/:id/default-tenant switches default tenant after cross-tenant membership', async () => {
    // Create another tenant/org
    const other = await http(app)
      .post('/auth/register')
      .send({
        email: randEmail(),
        password: 'Tenant2Pass!23',
        organizationName: 'Org Two ' + rand(),
      })
      .expect(201);
    if (!isRegisterResponse(other.body))
      throw new Error('Invalid register response');
    const tenant2 = other.body.tenantId;

    // Ensure user1 is member of tenant2 (assign VIEWER in tenant2)
    await authed()
      .put(`/rbac/users/${user1.id}/memberships/${tenant2}/roles`)
      .send({ roles: ['VIEWER'] })
      .expect(200);

    const res = await authed()
      .put(`/users/${user1.id}/default-tenant`)
      .send({ tenantId: tenant2 })
      .expect(200);
    expect(res.body?.defaultTenantId).toBe(tenant2);
  });

  it('DELETE /users/:id soft-deletes user2 and hides from fetch/list', async () => {
    await authed()
      .delete(`/users/${user2.id}`)
      .expect(200)
      .expect({ deleted: true });

    await authed().get(`/users/${user2.id}`).expect(404);

    const list = await authed().get('/users').expect(200);
    const ids = new Set((list.body.items as any[]).map((x) => x.id));
    expect(ids.has(user2.id)).toBe(false);
  });
});
