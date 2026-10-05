import {
  Boxes,
  ClipboardCheck,
  ChefHat,
  Building2,
  Contact,
  FileText,
  LayoutGrid,
  Package,
  Landmark,
  Receipt,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Store,
  Tags,
  Users,
  type LucideIcon,
  ScrollText,
  Smartphone,
  Gauge,
} from 'lucide-react';
import type { TranslationKey } from '@/i18n';
import type { PermissionKey, PermissionModule } from '@/types/permissions';
import { ROUTES } from '@/routes/paths';

export interface NavItem {
  id: string;
  /** Nested entries, rendered as a submenu under this one. */
  children?: { id: string; to: string; labelKey: TranslationKey }[];
  to: string;
  labelKey: TranslationKey;
  icon: LucideIcon;
  end?: boolean;
  /**
   * The module this entry belongs to. The entry appears only when the user
   * holds `<module>.view`, so the menu is derived from permissions rather than
   * maintained as a second list that drifts out of step.
   */
  module: PermissionModule;
  /**
   * A specific permission that gates the entry instead of `<module>.view`,
   * for a screen that is a single action within a module (stocktake).
   */
  permission?: PermissionKey;
}

export interface NavSection {
  id: string;
  labelKey?: TranslationKey;
  items: NavItem[];
}

/**
 * The full menu. Everything here is filtered by permission before it renders —
 * see `visibleNavigation` below.
 */
export const NAVIGATION: NavSection[] = [
  {
    id: 'operate',
    labelKey: 'nav.groupOperate',
    items: [
      { id: 'dashboard', to: ROUTES.dashboard, labelKey: 'nav.dashboard', icon: LayoutGrid, module: 'dashboard' },
      { id: 'pos', to: ROUTES.pos, labelKey: 'nav.pos', icon: ShoppingCart, module: 'pos' },
      { id: 'sales', to: ROUTES.sales, labelKey: 'nav.sales', icon: Receipt, module: 'sales' },
    ],
  },
  {
    id: 'manage',
    labelKey: 'nav.groupManage',
    items: [
      { id: 'catalog', to: ROUTES.catalog, labelKey: 'nav.catalog', icon: Package, module: 'products' },
      { id: 'inventory', to: ROUTES.inventory, labelKey: 'nav.inventory', icon: Boxes, module: 'inventory' },
      {
        id: 'stocktake',
        to: ROUTES.stocktake,
        labelKey: 'stocktake.nav',
        icon: ClipboardCheck,
        module: 'inventory',
        permission: 'inventory.stocktake',
      },
      { id: 'kitchen', to: ROUTES.kitchen, labelKey: 'nav.kitchen', icon: ChefHat, module: 'pos' },
      { id: 'vendors', to: ROUTES.vendors, labelKey: 'nav.vendors', icon: Building2, module: 'vendors' },
      { id: 'customers', to: ROUTES.customers, labelKey: 'nav.customers', icon: Contact, module: 'customers' },
      { id: 'discounts', to: ROUTES.discounts, labelKey: 'nav.discounts', icon: Tags, module: 'discounts' },
      {
        id: 'finance',
        to: ROUTES.finance,
        labelKey: 'nav.finance',
        icon: Landmark,
        module: 'finance',
        /* Finance has eleven sections; a flat list of them in the sidebar
           would drown every other menu entry. */
        children: [
          { id: 'finance-overview', to: '/finance', labelKey: 'finance.tabs.overview' },
          { id: 'finance-branches', to: '/finance/branches', labelKey: 'branch.compare' },
          { id: 'finance-expenses', to: '/finance/expenses', labelKey: 'finance.tabs.expenses' },
          { id: 'finance-recurring', to: '/finance/recurring', labelKey: 'finance.tabs.recurring' },
          { id: 'finance-cash', to: '/finance/cash', labelKey: 'finance.tabs.cash' },
          { id: 'finance-credit', to: '/finance/credit', labelKey: 'finance.tabs.credit' },
          { id: 'finance-receivables', to: '/finance/receivables', labelKey: 'finance.tabs.receivables' },
          { id: 'finance-payables', to: '/finance/payables', labelKey: 'finance.tabs.payables' },
          { id: 'finance-payroll', to: '/finance/payroll', labelKey: 'finance.tabs.payroll' },
          { id: 'finance-commission', to: '/finance/commission', labelKey: 'commissionPage.title' },
          { id: 'finance-pnl', to: '/finance/profit-loss', labelKey: 'finance.tabs.pnl' },
          { id: 'finance-periods', to: '/finance/periods', labelKey: 'finance.tabs.opening' },
          { id: 'finance-ledger', to: '/finance/ledger', labelKey: 'finance.tabs.ledger' },
        ],
      },
    ],
  },
  {
    id: 'administer',
    labelKey: 'nav.groupAdminister',
    items: [
      { id: 'users', to: ROUTES.users, labelKey: 'nav.users', icon: Users, module: 'users' },
      { id: 'roles', to: ROUTES.roles, labelKey: 'nav.roles', icon: ShieldCheck, module: 'roles' },
      { id: 'company', to: ROUTES.company, labelKey: 'nav.company', icon: Store, module: 'company' },
      { id: 'bills', to: '/bills', labelKey: 'nav.billBuilder', icon: FileText, module: 'bill_builder' },
      { id: 'settings', to: ROUTES.settings, labelKey: 'nav.settings', icon: Settings, module: 'settings' },
      /* `module` selects the permission that gates the entry, so both hide
         themselves from anyone without the audit permissions. */
      { id: 'devices', to: ROUTES.devices, labelKey: 'nav.devices', icon: Smartphone, module: 'devices' },
      { id: 'audit', to: ROUTES.audit, labelKey: 'nav.audit', icon: ScrollText, module: 'audit' },
      { id: 'apiPerformance', to: ROUTES.apiPerformance, labelKey: 'nav.apiPerformance', icon: Gauge, module: 'audit' },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAVIGATION.flatMap((section) => section.items);

/**
 * Filter the menu down to what a set of permissions actually unlocks. Sections
 * left with no items disappear entirely rather than rendering a bare heading.
 */
export function visibleNavigation(permissions: PermissionKey[]): NavSection[] {
  const held = new Set(permissions);

  return NAVIGATION.map((section) => ({
    ...section,
    items: section.items.filter((item) =>
      held.has(item.permission ?? (`${item.module}.view` as PermissionKey)),
    ),
  })).filter((section) => section.items.length > 0);
}
