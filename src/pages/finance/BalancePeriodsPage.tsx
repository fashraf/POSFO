import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarRange, Plus } from 'lucide-react';
import {
  Badge,
  Button,
  CurrencyDisplay,
  EmptyState,
  PageHeader,
  SkeletonTable,
  Table,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui';
import { FinanceTabs } from '@/features/finance/FinanceTabs';
import { ScopeBanner } from '@/features/finance/ScopeBanner';
import { useSession } from '@/contexts/SessionContext';
import { useI18n, useTranslation } from '@/i18n';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import { balancePeriodService, safeCall } from '@/services';
import { methodTotalH } from '@/types/finance';
import type { BalancePeriod } from '@/types/finance';

export default function BalancePeriodsPage() {
  const { t } = useTranslation();
  const { language } = useI18n();
  const { branches, scopeBranchId } = useSession();

  const [periods, setPeriods] = useState<BalancePeriod[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await safeCall(() => balancePeriodService.list(scopeBranchId));
    if (result.ok) setPeriods(result.data);
    setLoading(false);
  }, [scopeBranchId]);

  useEffect(() => {
    void load();
  }, [load]);

  const branchName = (id: string | null) => {
    if (!id) return '—';
    const branch = branches.find((candidate) => candidate.id === id);
    if (!branch) return '—';
    return language === 'ar' ? branch.nameAr : branch.nameEn;
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('periods.title')}
        description={t('periods.description')}
        actions={
          <Link to="/finance/periods/new">
            <Button leadingIcon={<Plus />}>{t('periods.open')}</Button>
          </Link>
        }
      />

      <FinanceTabs />

      <ScopeBanner />

      {loading ? (
        <div className="overflow-hidden rounded-lg border border-ink-200 bg-surface">
          <SkeletonTable rows={4} columns={5} />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-ink-200 bg-surface">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{t('periods.columns.period')}</TableHeaderCell>
                <TableHeaderCell>{t('periods.columns.branch')}</TableHeaderCell>
                <TableHeaderCell numeric>{t('periods.columns.opening')}</TableHeaderCell>
                <TableHeaderCell numeric>{t('periods.columns.closing')}</TableHeaderCell>
                <TableHeaderCell numeric>{t('periods.columns.difference')}</TableHeaderCell>
                <TableHeaderCell>{t('periods.columns.status')}</TableHeaderCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {periods.length === 0 ? (
                <TableEmptyRow colSpan={6}>
                  <EmptyState
                    icon={<CalendarRange />}
                    title={t('periods.empty.title')}
                    description={t('periods.empty.description')}
                    action={
                      <Link to="/finance/periods/new">
                        <Button>{t('periods.open')}</Button>
                      </Link>
                    }
                  />
                </TableEmptyRow>
              ) : (
                periods.map((period) => {
                  const openingH = methodTotalH(period.opening);
                  const closingH = period.closing ? methodTotalH(period.closing) : null;
                  const deltaH = closingH === null ? null : closingH - openingH;

                  return (
                    <TableRow key={period.id} interactive>
                      <TableCell>
                        <Link
                          to={`/finance/periods/${period.id}`}
                          className="font-medium text-ink-900 hover:text-brand-700"
                        >
                          {period.label}
                        </Link>
                        <span className="block text-2xs text-ink-400">
                          {formatDate(period.openedOn, { language })}
                          {period.closedOn && ` → ${formatDate(period.closedOn, { language })}`}
                        </span>
                      </TableCell>

                      <TableCell className="text-ink-600">
                        {branchName(period.branchId)}
                      </TableCell>

                      <TableCell numeric className="text-ink-700">
                        <CurrencyDisplay amount={openingH} />
                      </TableCell>

                      <TableCell numeric>
                        {closingH === null ? (
                          <span className="text-ink-300">—</span>
                        ) : (
                          <CurrencyDisplay amount={closingH} className="font-medium text-ink-900" />
                        )}
                      </TableCell>

                      {/* The number the owner actually wants: did the period
                          leave the business better off or worse. */}
                      <TableCell numeric>
                        {deltaH === null ? (
                          <span className="text-ink-300">—</span>
                        ) : (
                          <CurrencyDisplay
                            amount={deltaH}
                            signed
                            className={cn(
                              'font-semibold',
                              deltaH < 0 ? 'text-danger-600' : 'text-success-600',
                            )}
                          />
                        )}
                      </TableCell>

                      <TableCell>
                        <Badge tone={period.status === 'open' ? 'info' : 'neutral'} dot>
                          {t(`periods.status.${period.status}`)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
