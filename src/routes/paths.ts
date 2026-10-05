/**
 * Every route path in one place. Import from here instead of writing string
 * literals, so renaming a route is a single edit.
 */
export const ROUTES = {
  overview: '/',
  dashboard: '/dashboard',
  pos: '/pos',
  sales: '/sales',
  catalog: '/catalog',
  inventory: '/inventory',
  restock: '/inventory/restock',
  stocktake: '/inventory/stocktake',
  kitchen: '/kitchen',
  profile: '/profile',
  vendors: '/vendors',
  customers: '/customers',
  users: '/users',
  discounts: '/discounts',
  discountNew: '/discounts/new',
  userNew: '/users/new',
  roles: '/roles',
  roleNew: '/roles/new',
  company: '/company-profile',
  billBuilder: '/bill-builder',
  settings: '/settings',
  audit: '/audit',
  devices: '/devices',
  deviceNew: '/devices/new',
  deviceDetail: '/devices/:id',
  deviceEdit: '/devices/:id/edit',
  apiPerformance: '/api-performance',
  finance: '/finance',
  expenses: '/finance/expenses',
  ledger: '/finance/ledger',
  reports: '/reports',
} as const;

export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES];
