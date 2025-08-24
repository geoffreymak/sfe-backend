import { INestApplication } from '@nestjs/common';
import { createTestingApp, http } from '../utils/app-bootstrap';
import type { Test as SupertestTest } from 'supertest';
import { rand, randEmail } from '../utils/factories';

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

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isNaN(n) ? 0 : n;
  }
  if (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as { toString?: () => string }).toString === 'function'
  ) {
    const s = (v as { toString: () => string }).toString();
    const n = Number(s);
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
}

describe('Invoices core (E2E)', () => {
  let app: INestApplication;
  let token = '';
  let tenantId = '';

  let fv1Id = '';
  let fv1Number = '';
  let fv2Id = '';
  let fv2Number = '';
  let lastConfirmedId = '';

  beforeAll(async () => {
    app = await createTestingApp();
    const res = await http(app)
      .post('/auth/register')
      .send({
        email: randEmail(),
        password: 'Password123!',
        organizationName: 'Org INV ' + rand(),
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

  it('creates TTC FV draft and computes totals', async () => {
    const draft = await authed()
      .post('/invoices/draft')
      .send({
        modePrix: 'TTC',
        type: 'FV',
        client: { type: 'PM', denomination: 'ACME SARL', nif: 'A0000000' },
        lines: [
          {
            kind: 'BIE',
            group: 'B',
            label: 'Stylo',
            qty: '1.000',
            unitPrice: '1160.00',
          },
        ],
      })
      .expect(201);
    {
      const id1: unknown = draft.body?._id;
      expect(typeof id1).toBe('string');
      fv1Id = typeof id1 === 'string' ? id1 : '';
    }
    expect(fv1Id).not.toBe('');

    // status & totals checks
    expect(draft.body?.status).toBe('DRAFT');
    const ttc = toNum(draft.body?.totals?.ttc);
    const vat = toNum(draft.body?.totals?.vat);
    const ht = toNum(draft.body?.totals?.ht);
    expect(ttc).toBeCloseTo(1160, 6);
    expect(vat).toBeCloseTo(160, 6);
    expect(ht).toBeCloseTo(1000, 6);

    const line0 = Array.isArray(draft.body?.lines)
      ? draft.body.lines[0]
      : undefined;
    expect(toNum(line0?.totalTTC)).toBeCloseTo(1160, 6);
    expect(toNum(line0?.totalVAT)).toBeCloseTo(160, 6);
    expect(toNum(line0?.totalHT)).toBeCloseTo(1000, 6);
  });

  it('confirms FV draft; assigns number and sets status CONFIRMED', async () => {
    const conf = await authed()
      .post(`/invoices/${fv1Id}/confirm`)
      .send({})
      .expect(201);
    expect(conf.body?.status).toBe('CONFIRMED');

    const num: unknown = conf.body?.number;
    expect(typeof num).toBe('string');
    fv1Number = typeof num === 'string' ? num : '';

    const year = new Date().getFullYear();
    expect(fv1Number.startsWith(`FV${year}-`)).toBe(true);
    expect(/^FV\d{4}-\d{6}$/.test(fv1Number)).toBe(true);

    {
      const confId: unknown = conf.body?._id;
      lastConfirmedId = typeof confId === 'string' ? confId : fv1Id;
    }
  });

  it('idempotent confirm with X-Idempotency-Key returns 200 on replay and keeps the same response', async () => {
    // Create another draft
    const draft = await authed()
      .post('/invoices/draft')
      .send({
        modePrix: 'TTC',
        type: 'FV',
        client: { type: 'PM', denomination: 'BETA SARL', nif: 'A0000001' },
        lines: [
          {
            kind: 'BIE',
            group: 'B',
            label: 'Produit',
            qty: '2.000',
            unitPrice: '1160.00',
          },
        ],
      })
      .expect(201);
    {
      const id2: unknown = draft.body?._id;
      expect(typeof id2).toBe('string');
      fv2Id = typeof id2 === 'string' ? id2 : '';
    }
    expect(fv2Id).not.toBe('');

    const idem = 'idem-' + rand();
    const first = await authed()
      .post(`/invoices/${fv2Id}/confirm`)
      .set('X-Idempotency-Key', idem)
      .send({})
      .expect(201);
    expect(first.body?.status).toBe('CONFIRMED');
    {
      const num2: unknown = first.body?.number;
      expect(typeof num2).toBe('string');
      fv2Number = typeof num2 === 'string' ? num2 : '';
    }
    expect(/^FV\d{4}-\d{6}$/.test(fv2Number)).toBe(true);

    const second = await authed()
      .post(`/invoices/${fv2Id}/confirm`)
      .set('X-Idempotency-Key', idem)
      .send({})
      .expect(200);
    expect(second.body?.status).toBe('CONFIRMED');
    {
      const num2b: unknown = second.body?.number;
      expect(typeof num2b).toBe('string');
      expect(num2b).toBe(fv2Number);
    }

    // numbering should increment by +1 between first and second confirmed FV (same tenant)
    const seq = (n: string) => {
      const m = n.match(/-(\d{6})$/);
      return m ? Number(m[1]) : NaN;
    };
    const s1 = seq(fv1Number);
    const s2 = seq(fv2Number);
    expect(Number.isNaN(s1)).toBe(false);
    expect(Number.isNaN(s2)).toBe(false);
    expect(s2).toBe(s1 + 1);

    lastConfirmedId = String(first.body?._id ?? fv2Id);
  });

  it('creates FX rate and confirms invoice with equivalentCurrency USD', async () => {
    // Seed FX rate for USD
    await authed()
      .post('/fx-rates')
      .send({
        base: 'CDF',
        quote: 'USD',
        rate: '2800.00',
        validFrom: new Date().toISOString(),
      })
      .expect(201);

    const draft = await authed()
      .post('/invoices/draft')
      .send({
        modePrix: 'TTC',
        type: 'FV',
        client: { type: 'PM', denomination: 'GAMMA SARL', nif: 'A0000002' },
        lines: [
          {
            kind: 'BIE',
            group: 'B',
            label: 'Prod',
            qty: '1.000',
            unitPrice: '1160.00',
          },
        ],
      })
      .expect(201);
    let id = '';
    {
      const id3: unknown = draft.body?._id;
      expect(typeof id3).toBe('string');
      id = typeof id3 === 'string' ? id3 : '';
    }

    const conf = await authed()
      .post(`/invoices/${id}/confirm`)
      .send({ equivalentCurrency: { code: 'USD' } })
      .expect(201);
    expect(conf.body?.status).toBe('CONFIRMED');
    expect(conf.body?.equivalentCurrency?.code).toBe('USD');
    const rateNum = toNum(conf.body?.equivalentCurrency?.rate);
    expect(rateNum).toBeGreaterThan(0);

    {
      const confId2: unknown = conf.body?._id;
      lastConfirmedId = typeof confId2 === 'string' ? confId2 : id;
    }
  });

  it('normalized endpoint returns sha256 and normalized summary', async () => {
    const res = await authed()
      .get(`/invoices/${lastConfirmedId}/normalized`)
      .expect(200);
    const sha: unknown = res.body?.sha256;
    expect(typeof sha).toBe('string');
    expect((sha as string).length).toBe(64);

    const normalized = res.body?.normalized as Record<string, unknown>;
    expect(isObject(normalized)).toBe(true);
    const normId: unknown = normalized?.id;
    expect(typeof normId).toBe('string');
    expect(normId).toBe(lastConfirmedId);
    expect(
      normalized?.status === 'CONFIRMED' || normalized?.status === 'DRAFT',
    ).toBe(true);
    expect(typeof normalized?.type).toBe('string');
    expect(
      normalized?.modePrix === 'HT' || normalized?.modePrix === 'TTC',
    ).toBe(true);
  });
});
