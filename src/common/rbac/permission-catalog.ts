export type PermissionKey =
  | 'users:read'
  | 'users:invite'
  | 'users:manage_roles'
  | 'roles:read'
  | 'roles:create'
  | 'roles:update'
  | 'roles:delete'
  | 'clients:read'
  | 'clients:create'
  | 'clients:update'
  | 'clients:delete'
  | 'loyalty:redeem'
  | 'items:read'
  | 'items:create'
  | 'items:update'
  | 'items:delete'
  | 'stock:read'
  | 'stock:receipt'
  | 'stock:transfer'
  | 'stock:adjust'
  | 'invoices:read'
  | 'invoices:create'
  | 'invoices:confirm'
  | 'invoices:cancel'
  | 'invoices:pdf'
  | 'currencies:manage'
  | 'fx:manage'
  | 'settings:read'
  | 'settings:write'
  | 'integration:test'
  | 'reports:view'
  | 'audit:view';

export type PermissionEntry = {
  key: PermissionKey;
  label: string; // French label
  category: string; // Bucket: Users, Roles, Clients, Loyalty, Items, Stock, Invoices, Currencies, FX, Settings, Integrations, Reports, Audit
};

export const PERMISSION_CATALOG: ReadonlyArray<PermissionEntry> = Object.freeze(
  [
    // Users
    { key: 'users:read', label: 'Voir les utilisateurs', category: 'Users' },
    {
      key: 'users:invite',
      label: 'Inviter des utilisateurs',
      category: 'Users',
    },
    {
      key: 'users:manage_roles',
      label: 'Gérer les rôles des utilisateurs',
      category: 'Users',
    },

    // Roles
    { key: 'roles:read', label: 'Voir les rôles', category: 'Roles' },
    { key: 'roles:create', label: 'Créer des rôles', category: 'Roles' },
    {
      key: 'roles:update',
      label: 'Mettre à jour des rôles',
      category: 'Roles',
    },
    { key: 'roles:delete', label: 'Supprimer des rôles', category: 'Roles' },

    // Clients & Loyalty
    { key: 'clients:read', label: 'Voir les clients', category: 'Clients' },
    { key: 'clients:create', label: 'Créer des clients', category: 'Clients' },
    {
      key: 'clients:update',
      label: 'Mettre à jour des clients',
      category: 'Clients',
    },
    {
      key: 'clients:delete',
      label: 'Supprimer des clients',
      category: 'Clients',
    },
    {
      key: 'loyalty:redeem',
      label: 'Utiliser les points de fidélité',
      category: 'Loyalty',
    },

    // Items
    { key: 'items:read', label: 'Voir les articles', category: 'Items' },
    { key: 'items:create', label: 'Créer des articles', category: 'Items' },
    {
      key: 'items:update',
      label: 'Mettre à jour des articles',
      category: 'Items',
    },
    { key: 'items:delete', label: 'Supprimer des articles', category: 'Items' },

    // Stock
    { key: 'stock:read', label: 'Voir le stock', category: 'Stock' },
    {
      key: 'stock:receipt',
      label: 'Enregistrer une entrée en stock',
      category: 'Stock',
    },
    { key: 'stock:transfer', label: 'Transférer du stock', category: 'Stock' },
    { key: 'stock:adjust', label: 'Ajuster le stock', category: 'Stock' },

    // Invoices
    { key: 'invoices:read', label: 'Voir les factures', category: 'Invoices' },
    {
      key: 'invoices:create',
      label: 'Créer des factures',
      category: 'Invoices',
    },
    {
      key: 'invoices:confirm',
      label: 'Confirmer des factures',
      category: 'Invoices',
    },
    {
      key: 'invoices:cancel',
      label: 'Annuler des factures',
      category: 'Invoices',
    },
    {
      key: 'invoices:pdf',
      label: 'Télécharger le PDF des factures',
      category: 'Invoices',
    },

    // Currencies & FX
    {
      key: 'currencies:manage',
      label: 'Gérer les devises',
      category: 'Currencies',
    },
    { key: 'fx:manage', label: 'Gérer les taux de change', category: 'FX' },

    // Settings
    {
      key: 'settings:read',
      label: 'Voir les paramètres',
      category: 'Settings',
    },
    {
      key: 'settings:write',
      label: 'Modifier les paramètres',
      category: 'Settings',
    },

    // Integrations
    {
      key: 'integration:test',
      label: "Tester l'intégration",
      category: 'Integrations',
    },

    // Reports & Audit
    { key: 'reports:view', label: 'Voir les rapports', category: 'Reports' },
    { key: 'audit:view', label: "Voir l'audit", category: 'Audit' },
  ],
);
