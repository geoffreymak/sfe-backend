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

describe('Integrations - MCF (E2E)', () => {
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
        organizationName: 'Org MCF ' + rand(),
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

  let invId = '';

  it('PUT /settings sets integration mode to mcf', async () => {
    const payload = {
      integration: {
        mode: 'mcf',
        mcf: {
          port: 1,
          baud: 9600,
          isf: 'ACME-ISF',
          nif: 'A1234567',
        },
        safety: {
          subtotalCheck: true,
          confirmDeadlineSec: 120,
          pendingMax: 10,
        },
      },
    } as const;
    const res = await authed().put('/settings').send(payload).expect(200);
    expect(res.body?.integration?.mode).toBe('mcf');
  });

  it('creates and confirms an invoice', async () => {
    const draft = await authed()
      .post('/invoices/draft')
      .send({
        modePrix: 'TTC',
        type: 'FV',
        client: { type: 'PM', denomination: 'Test SARL', nif: 'A0000000' },
        lines: [
          {
            kind: 'BIE',
            group: 'B',
            label: 'Stylo bleu',
            qty: '1.000',
            unitPrice: '1160.00',
          },
        ],
      })
      .expect(201);
    invId = String(draft.body?._id ?? '');
    expect(invId).not.toBe('');

    const idem = 'idem-' + rand();
    const confirm = await authed()
      .post(`/invoices/${invId}/confirm`)
      .set('X-Idempotency-Key', idem)
      .send({})
      .expect(201);
    expect(confirm.body?.status).toBe('CONFIRMED');
    expect(typeof confirm.body?.number).toBe('string');
  });

  it('POST /invoices/:id/normalize (idempotent) and updates security (mcf)', async () => {
    const idem = 'norm-' + rand();
    const first = await authed()
      .post(`/invoices/${invId}/normalize`)
      .set('X-Idempotency-Key', idem)
      .expect(201);

    const second = await authed()
      .post(`/invoices/${invId}/normalize`)
      .set('X-Idempotency-Key', idem)
      .expect(201);

    expect(second.body).toEqual(first.body);

    expect(first.body?.mode).toBe('mcf');
    expect(first.body?.invoiceId).toBe(invId);
    expect(first.body?.source).toBe('mcf');
    expect(first.body?.normalized).toBe(true);
    expect(typeof first.body?.totals?.ht).toBe('string');
    expect(typeof first.body?.totals?.ttc).toBe('string');
    expect(typeof first.body?.security?.codeDefDgi).toBe('string');
    expect(typeof first.body?.security?.nimOrMid).toBe('string');
    expect(typeof first.body?.security?.certifiedAt).toBe('string');
    expect(typeof first.body?.security?.qr?.payload).toBe('string');

    const inv = await authed().get(`/invoices/${invId}`).expect(200);
    expect(inv.body?.security?.source).toBe('mcf');
    expect(typeof inv.body?.security?.codeDefDgi).toBe('string');
  });

  it('GET /integrations/status returns mcf status', async () => {
    const res = await authed().get('/integrations/status').expect(200);
    expect(res.body?.mode).toBe('mcf');
    expect(res.body?.mcf?.ok).toBe(false);
    expect(typeof res.body?.mcf?.reason).toBe('string');
  });
});
