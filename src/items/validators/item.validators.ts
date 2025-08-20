import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'PricesXor', async: false })
export class PricesXorValidator implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments) {
    const o = args.object as { priceHT?: string; priceTTC?: string };
    const hasHT = o.priceHT != null && o.priceHT !== '';
    const hasTTC = o.priceTTC != null && o.priceTTC !== '';
    // exactly one must be provided
    return (hasHT && !hasTTC) || (!hasHT && hasTTC);
  }
  defaultMessage() {
    return 'Either priceHT or priceTTC must be provided (mutually exclusive)';
  }
}

@ValidatorConstraint({ name: 'TaxGroupForTax', async: false })
export class TaxGroupForTaxValidator implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments) {
    const o = args.object as { type?: string; taxGroupDefault?: string };
    if (o.type === 'TAX') {
      return o.taxGroupDefault === 'L' || o.taxGroupDefault === 'N';
    }
    return true;
  }
  defaultMessage() {
    return "For TAX items, taxGroupDefault must be one of ['L','N']";
  }
}
