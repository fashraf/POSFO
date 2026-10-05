import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, HandCoins, UserPlus, Users, Wallet } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  CurrencyDisplay,
  EmptyState,
  ErrorState,
  InfoHint,
  KpiCard,
  PageHeader,
  SearchInput,
  SkeletonTable,
  Table,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeaderCell,
  TableRow,
  Tabs,
  Tooltip,
} from '@/components/ui';
import { CustomerDetail } from '@/features/customers/CustomerDetail';
import { CustomerWizard } from '@/features/customers/CustomerWizard';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useSearchParamSeed } from '@/hooks/useSearchParamSeed';
import { useDisclosure } from '@/hooks/useDisclosure';
import { useToast } from '@/contexts/ToastContext';
import { useI18n, useTranslation } from '@/i18n';
import { useSession } from '@/contexts/SessionContext';
import { cn } from '@/lib/cn';
import { formatNumber, fromMinorUnits } from '@/lib/format';
import { customerService, safeCall, type CustomerInput } from '@/services';
import { useDataVersion } from '@/services/dataVersion';
import { availableCreditH, creditUtilisation } from '@/types/sales';
import type { Customer, StatementEntry } from '@/types/sales';

type FilterValue = 'all' | 'owing' | 'settled' | 'overLimit';

export default function CustomersPage() {
  const { t } = useTranslation();
  const { language } = useI18n();
  const { user } = useSession();
  /* The signed-in user, recorded against what they do here. */
  const actorName =
    (language === 'ar' ? user?.nameAr : user?.nameEn) || user?.nameEn || user?.username || '';
  const toast = useToast();

  const wizard = useDisclosure();
  const detail = useDisclosure();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [summary, setSummary] = useState({
    outstandingH: 0,
    withBalance: 0,
    overLimit: 0,
    collectedH: 0,
  });
  const [loading, setLoading] = useState(true);

  /* Reloads when a save elsewhere changes what this page shows.
     Search, filters and paging are separate state, so the user keeps
     their place. */
  const dataVersion = useDataVersion('customers');
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  /* The header search opens this page with ?q=<customer name>. */
  useSearchParamSeed(setSearch);
  const [filter, setFilter] = useState<FilterValue>('all');
  const debouncedSearch = useDebouncedValue(search, 300);

  const [selected, setSelected] = useState<Customer | null>(null);
  const [statement, setStatement] = useState<StatementEntry[]>([]);
  const [statementLoading, setStatementLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [listResult, summaryResult] = await Promise.all([
      safeCall(() => customerService.list()),
      safeCall(() => customerService.receivablesSummary()),
    ]);

    if (listResult.ok) {
      setCustomers(listResult.data);
    } else {
      setError(listResult.error.message);
    }

    if (summaryResult.ok) setSummary(summaryResult.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load, dataVersion]);

  const nameOf = (customer: Customer) =>
    language === 'ar' ? customer.nameAr : customer.nameEn;

  const visible = useMemo(() => {
    const needle = debouncedSearch.trim().toLocaleLowerCase();

    return customers.filter((customer) => {
      if (needle) {
        const haystack = `${customer.nameAr} ${customer.nameEn} ${customer.phone} ${customer.email}`;
        if (!haystack.toLocaleLowerCase().includes(needle)) return false;
      }

      if (filter === 'owing') return customer.balanceH > 0;
      if (filter === 'settled') return customer.balanceH === 0;
      if (filter === 'overLimit') return customer.balanceH > customer.creditLimitH;
      return true;
    });
  }, [customers, debouncedSearch, filter]);

  const counts = useMemo(
    () => ({
      all: customers.length,
      owing: customers.filter((customer) => customer.balanceH > 0).length,
      settled: customers.filter((customer) => customer.balanceH === 0).length,
      overLimit: customers.filter((customer) => customer.balanceH > customer.creditLimitH).length,
    }),
    [customers],
  );

  async function openCustomer(customer: Customer) {
    setSelected(customer);
    detail.open();
    setStatementLoading(true);

    const result = await safeCall(() => customerService.statement(customer.id));
    setStatement(result.ok ? result.data : []);
    setStatementLoading(false);
  }

  async function handleCreate(input: CustomerInput): Promise<boolean> {
    try {
      await customerService.create(input);
      toast.success(t('customers.toast.created'));
      await load();
      return true;
    } catch (caught) {
      const failure = caught as { fieldErrors?: Record<string, string[]>; message?: string };
      if (failure.fieldErrors) throw caught;
      toast.error(t('customers.toast.failed'), failure.message);
      return false;
    }
  }

  async function handlePayment(input: {
    amountH: number;
    method: 'cash' | 'card';
    note: string;
  }): Promise<boolean> {
    if (!selected) return false;

    const result = await safeCall(() =>
      customerService.recordPayment({
        ...input,
        customerId: selected.id,
        receivedBy: actorName,
      }),
    );

    if (!result.ok) {
      toast.error(t('customers.toast.failed'), result.error.message);
      return false;
    }

    toast.success(t('customers.toast.paymentRecorded', { receipt: result.data.receiptNumber }));
    await load();

    const [refreshed, statementResult] = await Promise.all([
      safeCall(() => customerService.get(selected.id)),
      safeCall(() => customerService.statement(selected.id)),
    ]);

    if (refreshed.ok) setSelected(refreshed.data);
    if (statementResult.ok) setStatement(statementResult.data);

    return true;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('customers.title')}
        description={t('customers.description')}
        actions={
          <Button leadingIcon={<UserPlus />} onClick={wizard.open}>
            {t('customers.addCustomer')}
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={
            <span className="flex items-center gap-1.5">
              {t('customers.summary.outstanding')}
              <InfoHint content={t('customers.summary.outstandingHelp')} />
            </span>
          }
          value={<CurrencyDisplay amount={summary.outstandingH} />}
          icon={<Wallet />}
        />
        <KpiCard
          label={t('customers.summary.withBalance')}
          value={<span className="numeric">{formatNumber(summary.withBalance, { language })}</span>}
          icon={<Users />}
        />
        <KpiCard
          label={
            <span className="flex items-center gap-1.5">
              {t('customers.summary.overLimit')}
              <InfoHint content={t('customers.summary.overLimitHelp')} />
            </span>
          }
          value={<span className="numeric">{formatNumber(summary.overLimit, { language })}</span>}
          icon={<AlertTriangle />}
        />
        <KpiCard
          label={
            <span className="flex items-center gap-1.5">
              {t('customers.summary.collected')}
              <InfoHint content={t('customers.summary.collectedHelp')} />
            </span>
          }
          value={<CurrencyDisplay amount={summary.collectedH} />}
          icon={<HandCoins />}
        />
      </div>

      {summary.overLimit > 0 && (
        <Alert tone="warning" title={t('customers.filters.overLimit')}>
          {t('dashboard.insight.overLimitCount', { count: summary.overLimit })}{' '}
          {t('customers.summary.overLimitHelp')}
        </Alert>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          variant="pill"
          value={filter}
          onChange={(value) => setFilter(value as FilterValue)}
          aria-label={t('customers.title')}
          items={[
            { value: 'all', label: t('customers.filters.all'), count: counts.all },
            { value: 'owing', label: t('customers.filters.owing'), count: counts.owing },
            { value: 'settled', label: t('customers.filters.settled'), count: counts.settled },
            {
              value: 'overLimit',
              label: t('customers.filters.overLimit'),
              count: counts.overLimit,
            },
          ]}
        />

        <SearchInput
          className="sm:max-w-xs"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onClear={() => setSearch('')}
        />
      </div>

      {loading ? (
        <div className="overflow-hidden rounded-lg border border-ink-200 bg-surface">
          <SkeletonTable rows={5} columns={5} />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-ink-200 bg-surface">
          <ErrorState description={error} onRetry={() => void load()} />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-ink-200 bg-surface">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{t('customers.columns.customer')}</TableHeaderCell>
                <TableHeaderCell>{t('customers.columns.phone')}</TableHeaderCell>
                <TableHeaderCell numeric>{t('customers.columns.balance')}</TableHeaderCell>
                <TableHeaderCell numeric>{t('customers.columns.creditLimit')}</TableHeaderCell>
                <TableHeaderCell>{t('customers.credit.utilisation')}</TableHeaderCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {visible.length === 0 ? (
                <TableEmptyRow colSpan={5}>
                  <EmptyState
                    icon={<Users />}
                    title={t('customers.empty.title')}
                    description={t('customers.empty.description')}
                    action={<Button onClick={wizard.open}>{t('customers.addCustomer')}</Button>}
                  />
                </TableEmptyRow>
              ) : (
                visible.map((customer) => {
                  const ratio = creditUtilisation(customer);
                  const overLimit = customer.balanceH > customer.creditLimitH;
                  const cashOnly = customer.creditLimitH === 0;

                  return (
                    <TableRow
                      key={customer.id}
                      interactive
                      onClick={() => void openCustomer(customer)}
                    >
                      <TableCell className="font-medium text-ink-900">
                        {nameOf(customer)}
                      </TableCell>

                      <TableCell className="text-ink-600" dir="ltr">
                        {customer.phone || '—'}
                      </TableCell>

                      <TableCell numeric>
                        <CurrencyDisplay
                          amount={customer.balanceH}
                          className={cn(
                            'font-medium',
                            overLimit ? 'text-danger-600' : 'text-ink-900',
                          )}
                        />
                      </TableCell>

                      <TableCell numeric className="text-ink-500">
                        {cashOnly ? (
                          <Badge tone="neutral">{t('pos.payment.cash')}</Badge>
                        ) : (
                          <CurrencyDisplay amount={customer.creditLimitH} />
                        )}
                      </TableCell>

                      <TableCell>
                        {cashOnly ? (
                          <span className="text-sm text-ink-400">—</span>
                        ) : (
                          <Tooltip
                            content={
                              overLimit
                                ? t('customers.credit.overLimit', {
                                    amount: fromMinorUnits(
                                      customer.balanceH - customer.creditLimitH,
                                    ),
                                  })
                                : t('customers.credit.available', {
                                    amount: fromMinorUnits(availableCreditH(customer)),
                                  })
                            }
                          >
                            <span className="flex w-28 items-center gap-2">
                              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-100">
                                <span
                                  className={cn(
                                    'block h-full rounded-full',
                                    overLimit
                                      ? 'bg-danger-500'
                                      : ratio >= 0.9
                                        ? 'bg-warning-500'
                                        : 'bg-brand-500',
                                  )}
                                  style={{ width: `${Math.min(100, ratio * 100)}%` }}
                                />
                              </span>
                              <span className="numeric text-xs text-ink-500">
                                {Math.round(ratio * 100)}%
                              </span>
                            </span>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <CustomerWizard open={wizard.isOpen} onClose={wizard.close} onSubmit={handleCreate} />

      <CustomerDetail
        customer={selected}
        open={detail.isOpen}
        onClose={detail.close}
        statement={statement}
        loading={statementLoading}
        onRecordPayment={handlePayment}
      />
    </div>
  );
}
