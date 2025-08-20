// dgi-constants.ts
// Enumerations & validation helpers for DGI Normalized Invoicing (SFE)
// Generated on demand. Keep this file versioned and in sync with DGI specs.

export const INVOICE_TYPES = ['FV', 'FT', 'FA', 'EV', 'ET', 'EA'] as const;
export type InvoiceType = (typeof INVOICE_TYPES)[number];

export const TAX_GROUPS = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
  'K',
  'L',
  'M',
  'N',
] as const;
export type TaxGroup = (typeof TAX_GROUPS)[number];

export const CLIENT_TYPES = ['PP', 'PM', 'PC', 'PL', 'AO'] as const;
export type ClientType = (typeof CLIENT_TYPES)[number];

export const ITEM_TYPES = ['BIE', 'SER', 'TAX'] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const AVOIR_NATURE = ['COR', 'RAN', 'RAM', 'RRR'] as const;
export type AvoirNature = (typeof AVOIR_NATURE)[number];

export const TaxGroupMeta: Record<
  TaxGroup,
  { label: string; notes: string; vatRate?: number | null }
> = {
  A: {
    label: 'Exonéré',
    notes: 'Opération non soumise à la TVA par un assujetti',
    vatRate: 0,
  },
  B: { label: 'Taxable 16%', notes: 'TVA au taux standard', vatRate: 16 },
  C: { label: 'Taxable 8%', notes: 'TVA au taux réduit', vatRate: 8 },
  D: {
    label: 'Régimes dérogatoires TVA',
    notes: 'TVA prise en charge par l’État',
    vatRate: null,
  },
  E: {
    label: 'Exportation',
    notes: 'TVA à 0% (export et assimilées)',
    vatRate: 0,
  },
  F: {
    label: 'Marché public 16%',
    notes: 'TVA facturée à 16%, payée par crédit d’impôt',
    vatRate: 16,
  },
  G: {
    label: 'Marché public 8%',
    notes: 'TVA facturée à 8%, payée par crédit d’impôt',
    vatRate: 8,
  },
  H: {
    label: 'Consignation d’emballage',
    notes: 'Hors champ TVA',
    vatRate: null,
  },
  I: { label: 'Garantie & caution', notes: 'Hors champ TVA', vatRate: null },
  J: {
    label: 'Débours',
    notes: 'Remboursements au franc le franc, hors champ',
    vatRate: null,
  },
  K: {
    label: 'Non-assujettis',
    notes: 'Opérations par non-redevables TVA',
    vatRate: null,
  },
  L: {
    label: 'Prélèvements sur ventes',
    notes: 'Taxes parafiscales; n’entrent pas dans base TVA',
    vatRate: null,
  },
  M: {
    label: 'Ventes réglementées (HT)',
    notes: 'TVA spécifique facturée séparément (voir N)',
    vatRate: null,
  },
  N: {
    label: 'TVA spécifique',
    notes: 'Montant TVA spécifique lié à M',
    vatRate: null,
  },
};

// Constraints
export const ITEM_ALLOWED_GROUPS: Record<ItemType, TaxGroup[]> = {
  BIE: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'M'],
  SER: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'M'],
  TAX: ['L', 'N'],
};

export const CLIENT_REQUIRED_FIELDS: Record<ClientType, string[]> = {
  PP: [],
  PM: ['denomination', 'nif'],
  PC: ['name', 'nif'],
  PL: ['name', 'nif'],
  AO: ['name', 'refExo'],
};

export const INVOICE_HAVE_ORIGIN_REQUIRED: Record<AvoirNature, boolean> = {
  COR: true,
  RAN: true,
  RAM: true,
  RRR: false, // Référence "RRR" possible quand non liée à une facture
};

// Helper guards
export function isInvoiceType(v: string): v is InvoiceType {
  return (INVOICE_TYPES as readonly string[]).includes(v);
}
export function isTaxGroup(v: string): v is TaxGroup {
  return (TAX_GROUPS as readonly string[]).includes(v);
}
export function isClientType(v: string): v is ClientType {
  return (CLIENT_TYPES as readonly string[]).includes(v);
}
export function isItemType(v: string): v is ItemType {
  return (ITEM_TYPES as readonly string[]).includes(v);
}
export function isAvoirNature(v: string): v is AvoirNature {
  return (AVOIR_NATURE as readonly string[]).includes(v);
}

// Validation rules (business)
export const RULES = {
  tax: {
    itemGroupAllowed: (itemType: ItemType, group: TaxGroup) =>
      ITEM_ALLOWED_GROUPS[itemType].includes(group),
    groupVatRate: (group: TaxGroup) => TaxGroupMeta[group].vatRate,
    requiresSpecificPresentation: (group: TaxGroup) =>
      group === 'M' || group === 'N',
  },
  client: {
    requiredFields: (clientType: ClientType) =>
      CLIENT_REQUIRED_FIELDS[clientType],
    isAO: (clientType: ClientType) => clientType === 'AO',
  },
  avoir: {
    originRequired: (nature: AvoirNature) =>
      INVOICE_HAVE_ORIGIN_REQUIRED[nature],
  },
} as const;

export const DGI_INVOICE_TYPES = ['FV', 'FT', 'FA', 'EV', 'ET', 'EA'] as const;
export const DGI_CLIENT_TYPES = ['PP', 'PM', 'PC', 'PL', 'AO'] as const;
export const DGI_ITEM_TYPES = ['BIE', 'SER', 'TAX'] as const;

export const DGI_TAX_GROUPS = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
  'K',
  'L',
  'M',
  'N',
  'O',
  'P',
] as const;

export const DGI_GROUP_LABELS: Record<string, string> = {
  A: 'Exonéré',
  B: 'Taxable 16%',
  C: 'Taxable 8%',
  D: 'Dérogatoire TVA',
  E: 'Exportation 0%',
  F: 'MP financement ext. 16%',
  G: 'MP financement ext. 8%',
  H: 'Consignation',
  I: 'Garantie/Caution',
  J: 'Débours',
  K: 'Non-assujettis',
  L: 'Prélèvements sur ventes',
  M: 'Ventes à TVA spécifique',
  N: 'TVA spécifique',
  O: '(réservé)',
  P: '(réservé)',
};

export const DGI_ITEM_GROUP_CONSTRAINTS = {
  TAX_ALLOWED_GROUPS: ['L', 'N'], // TAX ⇢ L|N uniquement
};

export const DGI_QR_FORMAT = 'RDCDEF01;{MID};{SIG};{NIF};{DT}';

export const E_MCF_LIMITS = {
  PENDING_MAX: 10,
  PENDING_EXPIRY_SECONDS: 120, // ~2 min si non finalisé
};

export const MCF_SERIAL_DEFAULT = {
  baud: 115200,
  dataBits: 8,
  parity: 'none',
  stopBits: 1 as const,
};

export type CurrencyCode = string;
export const BASE_CURRENCY: CurrencyCode = 'CDF';
export const DEFAULT_ALT_CURRENCY: CurrencyCode = 'USD';
