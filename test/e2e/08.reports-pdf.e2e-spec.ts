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

describe('Reports & PDF (E2E)', () => {
  let app: INestApplication;
  let token = '';
  let tenantId = '';

  beforeAll(async () => {
    app = await createTestingApp();
    const res = await http(app)
      .post('/auth/register')
      .send({
        email: randEmail(),
        password: 'Password123!',
        organizationName: 'Org Reports ' + rand(),
      })
      .expect(201);
    if (!isRegisterResponse(res.body))
      throw new Error('Invalid register response');
    token = res.body.accessToken;
    tenantId = res.body.tenantId;
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

  const createdIds: string[] = [];

  it('creates and confirms a few invoices for reporting', async () => {
    for (let i = 0; i < 3; i++) {
      const draft = await authed()
        .post('/invoices/draft')
        .send({
          modePrix: 'TTC',
          type: 'FV',
          client: { type: 'PM', denomination: `Client ${i}`, nif: 'A0000000' },
          lines: [
            {
              kind: 'BIE',
              group: 'B',
              label: `Stylo ${i}`,
              qty: '1.000',
              unitPrice: '1160.00',
            },
          ],
        })
        .expect(201);
      const id = String(draft.body?._id ?? '');
      expect(id).not.toBe('');

      const idem = 'idem-' + rand();
      const confirm = await authed()
        .post(`/invoices/${id}/confirm`)
        .set('X-Idempotency-Key', idem)
        .send({})
        .expect(201);
      expect(confirm.body?.status).toBe('CONFIRMED');
      createdIds.push(id);
    }
  });

  it('GET /reports/mcf-journal returns a page with items', async () => {
    const res = await authed()
      .get('/reports/mcf-journal')
      .query({ page: 1, limit: 50 })
      .expect(200);
    expect(typeof res.body?.page).toBe('number');
    expect(typeof res.body?.limit).toBe('number');
    expect(typeof res.body?.total).toBe('number');
    expect(Array.isArray(res.body?.items)).toBe(true);
    expect(res.body.items.length).toBeGreaterThan(0);
    const it = res.body.items[0];
    expect(typeof it?.id).toBe('string');
    expect(typeof it?.status).toBe('string');
    expect(['pending', 'ack', 'rejected']).toContain(it?.state);
    expect(typeof it?.attempts).toBe('number');
  });

  it('GET /reports/sales-summary supports day/type/group groupBy and returns shapes', async () => {
    const common = {} as const;
    const byDay = await authed()
      .get('/reports/sales-summary')
      .query({ ...common, groupBy: 'day' })
      .expect(200);
    expect(Array.isArray(byDay.body?.summary)).toBe(true);
    expect(typeof byDay.body?.totals?.totalTTC).toBe('string');
    expect(typeof byDay.body?.totals?.count).toBe('number');

    const byType = await authed()
      .get('/reports/sales-summary')
      .query({ ...common, groupBy: 'type' })
      .expect(200);
    expect(Array.isArray(byType.body?.summary)).toBe(true);
    expect(typeof byType.body?.totals?.totalTTC).toBe('string');

    const byGroup = await authed()
      .get('/reports/sales-summary')
      .query({ ...common, groupBy: 'group' })
      .expect(200);
    expect(Array.isArray(byGroup.body?.summary)).toBe(true);
    expect(Array.isArray(byGroup.body?.topItems)).toBe(true);
    expect(Array.isArray(byGroup.body?.topClients)).toBe(true);
  });

  it('GET /invoices/:id/pdf returns a PDF binary with headers', async () => {
    const anyId = createdIds[0];
    const res = await authed()
      .get(`/invoices/${anyId}/pdf`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(Buffer.from(c)));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);

    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.headers['content-disposition']).toMatch(
      new RegExp(`inline; filename="invoice-${anyId}\\.pdf"`),
    );
    expect(Buffer.isBuffer(res.body)).toBe(true);
    const buf: Buffer = res.body as Buffer;
    expect(buf.byteLength).toBeGreaterThan(1000); // some reasonable size
    const head = buf.subarray(0, 4).toString('utf8');
    expect(head.startsWith('%PDF')).toBe(true);
  });
});
