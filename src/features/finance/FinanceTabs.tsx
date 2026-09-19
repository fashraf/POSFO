import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { useTranslation } from '@/i18n';
import type { TranslationKey } from '@/i18n';

const TABS: { to: string; labelKey: TranslationKey; end?: boolean }[] = [
  { to: '/finance', labelKey: 'finance.tabs.overview', end: true },
  { to: '/finance/expenses', labelKey: 'finance.tabs.expenses' },
  { to: '/finance/recurring', labelKey: 'finance.tabs.recurring' },
  { to: '/finance/cash', labelKey: 'finance.tabs.cash' },
  { to: '/finance/receivables', labelKey: 'finance.tabs.receivables' },
  { to: '/finance/payables', labelKey: 'finance.tabs.payables' },
  { to: '/finance/settlements', labelKey: 'finance.tabs.settlement' },
  { to: '/finance/profit-loss', labelKey: 'finance.tabs.pnl' },
  { to: '/finance/branches', labelKey: 'branch.compare' },
  { to: '/finance/credit', labelKey: 'finance.tabs.credit' },
  { to: '/finance/payroll', labelKey: 'finance.tabs.payroll' },
  { to: '/finance/commission', labelKey: 'finance.tabs.commissionRules' },
  { to: '/finance/periods', labelKey: 'finance.tabs.opening' },
  { to: '/finance/ledger', labelKey: 'finance.tabs.ledger' },
];

/**
 * Section navigation for Finance.
 *
 * Real routes rather than local tab state, so a link to the ledger or a
 * refresh on the cash page lands where it should.
 */
export function FinanceTabs() {
  const { t } = useTranslation();

  return (
    <nav
      aria-label={t('finance.title')}
      className="flex items-center gap-1 overflow-x-auto border-b border-ink-200 pb-px no-scrollbar"
    >
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            cn(
              'shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-ink-500 hover:text-ink-800',
            )
          }
        >
          {t(tab.labelKey)}
        </NavLink>
      ))}
    </nav>
  );
}
