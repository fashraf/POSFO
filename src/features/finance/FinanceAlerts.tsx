import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useI18n, useTranslation } from '@/i18n';
import { formatCurrency, formatDate } from '@/lib/format';
import {
  customerService,
  drawerService,
  payrollService,
  recurringService,
  safeCall,
  settlementService,
} from '@/services';
import { dueUrgency } from '@/types/finance';
import { useSession } from '@/contexts/SessionContext';

interface FinanceAlert {
  id: string;
  tone: 'warning' | 'danger' | 'info';
  text: string;
  to: string;
}

/**
 * What needs attention, gathered from wherever it lives.
 *
 * Deliberately a strip rather than a panel: these are prompts to act, and an
 * owner who has dealt with them should see the row disappear, not a permanent
 * fixture that always looks the same.
 */
export function FinanceAlerts({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { language } = useI18n();
  const { activeBranch } = useSession();

  const [alerts, setAlerts] = useState<FinanceAlert[]>([]);

  const load = useCallback(async () => {
    const found: FinanceAlert[] = [];

    const [upcoming, drawer, unsettled, customers, runs] = await Promise.all([
      safeCall(() => recurringService.upcoming(30)),
      safeCall(() => drawerService.current(activeBranch?.id ?? null)),
      safeCall(() => settlementService.outstandingH()),
      safeCall(() => customerService.list()),
      safeCall(() => payrollService.list()),
    ]);

    if (upcoming.ok) {
      const overdue = upcoming.data.filter(
        (payment) => dueUrgency(payment.nextDueOn) === 'overdue',
      );
      const soon = upcoming.data.filter((payment) =>
        ['soon', 'today'].includes(dueUrgency(payment.nextDueOn)),
      );

      if (overdue.length > 0) {
        found.push({
          id: 'overdue',
          tone: 'danger',
          text: t('financeAlerts.overduePayment', { count: overdue.length }),
          to: '/finance/recurring',
        });
      }
      if (soon.length > 0) {
        found.push({
          id: 'due',
          tone: 'warning',
          text: t('financeAlerts.duePayment', { count: soon.length }),
          to: '/finance/recurring',
        });
      }
    }

    /* Payroll for a month that has ended and was never paid. */
    if (runs.ok) {
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      const period = lastMonth.toISOString().slice(0, 7);

      if (!runs.data.some((run) => run.period === period && run.status === 'paid')) {
        found.push({
          id: 'payroll',
          tone: 'warning',
          text: t('financeAlerts.payrollDue', { period }),
          to: '/finance/payroll',
        });
      }
    }

    if (drawer.ok && drawer.data) {
      found.push({
        id: 'drawer',
        tone: 'info',
        text: t('financeAlerts.drawerOpen', {
          time: formatDate(drawer.data.openedAt, { language, withTime: true }),
        }),
        to: '/finance/cash',
      });
    }

    if (unsettled.ok && unsettled.data > 0) {
      found.push({
        id: 'settlement',
        tone: 'info',
        text: t('financeAlerts.unsettledCard', {
          amount: formatCurrency(unsettled.data, { language }),
        }),
        to: '/finance/settlements',
      });
    }

    if (customers.ok) {
      const over = customers.data.filter(
        (customer) => customer.balanceH > customer.creditLimitH,
      );
      if (over.length > 0) {
        found.push({
          id: 'overlimit',
          tone: 'warning',
          text: t('financeAlerts.overLimitCustomers', { count: over.length }),
          to: '/finance/receivables',
        });
      }
    }

    setAlerts(found);
  }, [t, language, activeBranch]);

  useEffect(() => {
    void load();
  }, [load]);

  if (alerts.length === 0) {
    return (
      <p
        className={cn(
          'flex items-center gap-2 rounded-md border border-success-100 bg-success-50 px-3 py-1.5 text-xs text-success-700',
          className,
        )}
      >
        <CheckCircle2 aria-hidden className="h-3.5 w-3.5 shrink-0" />
        {t('financeAlerts.none')}
      </p>
    );
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-400">
        <AlertTriangle aria-hidden className="h-3 w-3" />
        {t('financeAlerts.title')}
      </p>

      <div className="flex flex-wrap gap-1.5">
        {alerts.map((alert) => (
          <Link
            key={alert.id}
            to={alert.to}
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
              alert.tone === 'danger' &&
                'border-danger-100 bg-danger-50 text-danger-700 hover:bg-danger-100',
              alert.tone === 'warning' &&
                'border-warning-100 bg-warning-50 text-warning-700 hover:bg-warning-100',
              alert.tone === 'info' &&
                'border-info-100 bg-info-50 text-info-700 hover:bg-info-100',
            )}
          >
            {alert.text}
            <ArrowRight aria-hidden className="h-3 w-3 shrink-0 flip-rtl" />
          </Link>
        ))}
      </div>
    </div>
  );
}
