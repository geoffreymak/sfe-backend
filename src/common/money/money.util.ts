import { Types } from 'mongoose';

// Money helpers operating on integers to avoid FP errors.
// - Amounts are represented as cents (scale 2) using BigInt
// - Quantities are represented as thousandths (scale 3) using BigInt

export type Cents = bigint; // scale 2
export type Thousandths = bigint; // scale 3

export function parseMoneyToCents(
  v: string | number | Types.Decimal128,
): Cents {
  if (v instanceof Types.Decimal128) return parseMoneyToCents(v.toString());
  if (typeof v === 'number') return parseMoneyToCents(v.toString());
  const s = v.trim();
  if (!s) return 0n;
  const neg = s.startsWith('-');
  const t = neg ? s.slice(1) : s;
  const [intPart, fracPartRaw = ''] = t.split('.');
  const fracPart = (fracPartRaw + '00').slice(0, 2);
  const centsStr = `${intPart}${fracPart}`.replace(/^0+(?=\d)/, '');
  const cents = BigInt(centsStr || '0');
  return neg ? -cents : cents;
}

export function parseQtyToThousandths(
  v: string | number | Types.Decimal128,
): Thousandths {
  if (v instanceof Types.Decimal128) return parseQtyToThousandths(v.toString());
  if (typeof v === 'number') return parseQtyToThousandths(v.toString());
  const s = v.trim();
  if (!s) return 0n;
  const neg = s.startsWith('-');
  const t = neg ? s.slice(1) : s;
  const [intPart, fracPartRaw = ''] = t.split('.');
  const fracPart = (fracPartRaw + '000').slice(0, 3);
  const thStr = `${intPart}${fracPart}`.replace(/^0+(?=\d)/, '');
  const th = BigInt(thStr || '0');
  return neg ? -th : th;
}

export function centsToString(cents: Cents): string {
  const neg = cents < 0n;
  const abs = neg ? -cents : cents;
  const s = abs.toString();
  const intPart = s.length > 2 ? s.slice(0, -2) : '0';
  const fracPart = s.length > 2 ? s.slice(-2) : s.padStart(2, '0');
  return `${neg ? '-' : ''}${intPart}.${fracPart}`;
}

export function mulQtyPriceToCents(qTh: Thousandths, unitCents: Cents): Cents {
  // Round half up: (q * price + 500) / 1000
  const prod = qTh * unitCents; // scale 3 + 2 = 5
  const half = 500n * (unitCents < 0n ? -1n : 1n);
  const adjusted = prod >= 0n ? prod + half : prod - half;
  return adjusted / 1000n;
}

export function vatFromHtCents(ht: Cents, ratePercent: number): Cents {
  if (!ratePercent || ratePercent <= 0) return 0n;
  const r = BigInt(Math.round(ratePercent));
  const prod = ht * r; // cents * percent
  const half = 50n * (ht < 0n ? -1n : 1n);
  const adjusted = prod >= 0n ? prod + half : prod - half;
  return adjusted / 100n; // back to cents
}

export function splitFromTtcCents(
  ttc: Cents,
  ratePercent: number,
): { ht: Cents; vat: Cents } {
  if (!ratePercent || ratePercent <= 0) return { ht: ttc, vat: 0n };
  const denom = BigInt(100 + Math.round(ratePercent));
  const num = ttc * 100n; // compute ht = round(ttc * 100 / (100 + rate))
  const twiceRem = (num % denom) * 2n;
  let ht = num / denom; // floor
  if (ttc >= 0n) {
    if (twiceRem >= denom) ht += 1n;
  } else {
    if (twiceRem <= -denom) ht -= 1n;
  }
  const vat = ttc - ht;
  return { ht, vat };
}

export function addCents(a: Cents, b: Cents): Cents {
  return a + b;
}
