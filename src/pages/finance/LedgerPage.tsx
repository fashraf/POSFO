import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, RotateCcw, Scale } from 'lucide-react';
import {
  DatePicker,
  Alert,
  Badge,
  Button,
  ConfirmModal,
  CurrencyDisplay,
  Drawer,
  EmptyState,
  FormField,
  PageHeader,
  SearchInput,
  SearchableSelect,
  SkeletonTable,
  Table,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeaderCell,
  TableRow,
  Textarea,
} from '@/components/ui';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useDisclosure } from '@/hooks/useDisclosure';
import { useSession } from '@/contexts/SessionContext';
import { useToast } from '@/contexts/ToastContext';
import { FinanceTabs } from '@/features/finance/FinanceTabs';
import { ScopeBanner } from '@/features/finance/ScopeBanner';
import { useI18n, useTranslation } from '@/i18n';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import { ledgerService, safeCall } from '@/services';
import { ACCOUNTS, ACCOUNT_LIST, entryTotals } from '@/types/finance';
import type { JournalEntry, TransactionKind } from '@/types/finance';

const KINDS: TransactionKind[] = [
  'sale',
  'return',
  'void',
  'expense',
  'expense_recognition',
  'customer_collection',
  'supplier_payment',
  'purchase',
  'card_settlement',
  'stock_adjustment',
  'owner_contribution',
  'owner_withdrawal',
  'payroll',
  'commission',
  'opening_balance',
  'manual',
];

export default function LedgerPage() {
  const { t } = useTranslation();
  const { language } = useI18n();
  const { user, activeBranch } = useSession();
  const toast = useToast();
  const detail = useDisclosure();

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [trial, setTrial] = useState<{ code: string; debitH: number; creditH: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [account, setAccount] = useState<string | null>(null);
  const [kind, setKind] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const debounced = useDebouncedValue(search, 300);

  const [selected, setSelected] = useState<JournalEntry | null>(null);
  const [reversing, setReversing] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const nameOf = <T extends { nameAr: string; nameEn: string }>(record: T) =>
    language === 'ar' ? record.nameAr : record.nameEn;

  const load = useCallback(async () => {
    setLoading(true);

    const [entryResult, trialResult] = await Promise.all([
      safeCall(() =>
        ledgerService.list({
          search: debounced || undefined,
          accountCode: account ?? undefined,
          kind: (kind as TransactionKind) ?? undefined,
          from: from || undefined,
          to: to || undefined,
          branchId: activeBranch?.id ?? null,
        }),
      ),
      safeCall(() => ledgerService.trialBalance()),
    ]);

    if (entryResult.ok) setEntries(entryResult.data);
    if (trialResult.ok) setTrial(trialResult.data);
    setLoading(false);
  }, [debounced, account, kind, from, to, activeBranch]);

  useEffect(() => {
    void load();
  }, [load]);

  /* The ledger balancing is not a nice-to-have: if these differ, something has
     posted that should have been impossible, and it is worth saying loudly. */
  const totals = useMemo(
    () =>
      trial.reduce(
        (sum, row) => ({ debitH: sum.debitH + row.debitH, creditH: sum.creditH + row.creditH }),
        { debitH: 0, creditH: 0 },
      ),
    [trial],
  );

  const balanced = totals.debitH === totals.creditH;

  /* The list carries headers only; the drawer reads the entry with its
     lines, so every debit and credit behind the total is shown. */
  async function openEntry(entry: JournalEntry) {
    setSelected(entry);
    detail.open();
    const result = await safeCall(() => ledgerService.get(entry.id));
    if (result.ok) setSelected(result.data);
    else toast.error(t('expenses.toast.failed'), result.error.message);
  }

  async function reverse() {
    if (!selected) return;
    setBusy(true);

    const result = await safeCall(() =>
      ledgerService.reverse(selected.id, reason, user ? nameOf(user) : 'System'),
    );

    setBusy(false);

    if (result.ok) {
      toast.success(t('ledger.reversal'));
      setReversing(false);
      setReason('');
      detail.close();
      await load();
    } else {
      toast.error(t('expenses.toast.failed'), result.error.message);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title={t('ledger.title')} description={t('ledger.description')} />

      <FinanceTabs />

      <ScopeBanner />

      {/* Trial balance strip */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-ink-200 bg-surface px-4 py-2.5">
        <span className="flex items-center gap-2 text-xs font-medium text-ink-600">
          <Scale aria-hidden className="h-3.5 w-3.5 text-ink-400" />
          {t('ledger.trialBalance')}
        </span>

        <span className="flex items-center gap-1.5 text-xs">
          <span className="text-ink-500">{t('ledger.totalDebits')}</span>
          <CurrencyDisplay amount={totals.debitH} className="font-medium text-ink-800" />
        </span>

        <span className="flex items-center gap-1.5 text-xs">
          <span className="text-ink-500">{t('ledger.totalCredits')}</span>
          <CurrencyDisplay amount={totals.creditH} className="font-medium text-ink-800" />
        </span>

        <Badge tone={balanced ? 'success' : 'danger'} dot>
          {balanced ? t('ledger.detail.balanced') : t('ledger.outOfBalance')}
        </Badge>
      </div>

      {!balanced && <Alert tone="danger">{t('ledger.outOfBalance')}</Alert>}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          className="w-full sm:max-w-xs"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onClear={() => setSearch('')}
          placeholder={t('ledger.filters.search')}
        />

        <SearchableSelect
          size="sm"
          className="w-48"
          value={account}
          onChange={setAccount}
          isClearable
          placeholder={t('ledger.filters.allAccounts')}
          options={ACCOUNT_LIST.map((entry) => ({
            value: entry.code,
            label: `${entry.code} · ${nameOf(entry)}`,
          }))}
        />

        <SearchableSelect
          size="sm"
          className="w-44"
          value={kind}
          onChange={setKind}
          isClearable
          placeholder={t('ledger.filters.allKinds')}
          options={KINDS.map((value) => ({ value, label: t(`ledger.kinds.${value}`) }))}
        />

        <DatePicker
                size="sm"
                value={from}
                onChange={setFrom}
                aria-label={t('ledger.filters.from')}
                className="w-36"
                />
        <DatePicker
                size="sm"
                value={to}
                onChange={setTo}
                aria-label={t('ledger.filters.to')}
                className="w-36"
                />
      </div>

      {loading ? (
        <div className="overflow-hidden rounded-lg border border-ink-200 bg-surface">
          <SkeletonTable rows={6} columns={5} />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-ink-200 bg-surface">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{t('ledger.columns.reference')}</TableHeaderCell>
                <TableHeaderCell>{t('ledger.columns.date')}</TableHeaderCell>
                <TableHeaderCell>{t('ledger.columns.description')}</TableHeaderCell>
                <TableHeaderCell>{t('ledger.columns.source')}</TableHeaderCell>
                <TableHeaderCell numeric>{t('ledger.columns.debit')}</TableHeaderCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {entries.length === 0 ? (
                <TableEmptyRow colSpan={5}>
                  <EmptyState
                    icon={<BookOpen />}
                    title={t('ledger.empty.title')}
                    description={t('ledger.empty.description')}
                  />
                </TableEmptyRow>
              ) : (
                entries.map((entry) => {
                  const entryTotal = entryTotals(entry);
                  return (
                    <TableRow
                      key={entry.id}
                      interactive
                      onClick={() => void openEntry(entry)}
                    >
                      <TableCell>
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="numeric font-medium text-ink-900">
                            {entry.reference}
                          </span>
                          {entry.reversedByEntryId && (
                            <Badge tone="danger">{t('ledger.reversed')}</Badge>
                          )}
                          {entry.reversesEntryId && (
                            <Badge tone="warning">{t('ledger.reversal')}</Badge>
                          )}
                        </span>
                      </TableCell>

                      <TableCell className="text-ink-600">
                        {formatDate(entry.postedAt, { language })}
                      </TableCell>

                      <TableCell className="max-w-xs">
                        <span className="line-clamp-1 text-ink-700">{entry.description}</span>
                        <span className="text-2xs text-ink-400">
                          {t(`ledger.kinds.${entry.kind}`)}
                        </span>
                      </TableCell>

                      <TableCell className="numeric text-ink-500">
                        {entry.sourceReference || '—'}
                      </TableCell>

                      <TableCell numeric className="font-medium text-ink-900">
                        <CurrencyDisplay amount={entryTotal.debitH} />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Entry detail */}
      <Drawer
        open={detail.isOpen}
        onClose={detail.close}
        size="lg"
        title={selected ? t('ledger.detail.title', { reference: selected.reference }) : ''}
        description={selected ? formatDate(selected.postedAt, { language, withTime: true }) : ''}
        footer={
          selected && !selected.reversedByEntryId && !selected.reversesEntryId ? (
            <Button variant="danger" leadingIcon={<RotateCcw />} onClick={() => setReversing(true)}>
              {t('ledger.reverse')}
            </Button>
          ) : undefined
        }
      >
        {selected && (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 rounded-md border border-ink-200 bg-ink-50/60 p-3 text-xs">
              <div>
                <dt className="text-ink-500">{t('ledger.columns.source')}</dt>
                <dd className="numeric font-medium text-ink-900">
                  {selected.sourceReference || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-ink-500">{t('ledger.detail.postedBy')}</dt>
                <dd className="font-medium text-ink-900">{selected.actor}</dd>
              </div>
            </dl>

            <p className="text-sm text-ink-700">{selected.description}</p>

            <div className="overflow-hidden rounded-md border border-ink-200">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>{t('ledger.columns.account')}</TableHeaderCell>
                    <TableHeaderCell numeric>{t('ledger.columns.debit')}</TableHeaderCell>
                    <TableHeaderCell numeric>{t('ledger.columns.credit')}</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {selected.lines.map((line, index) => {
                    const acc = ACCOUNTS[line.accountCode];
                    return (
                      <TableRow key={`${line.accountCode}-${index}`}>
                        <TableCell>
                          <span className="numeric text-2xs text-ink-400">{line.accountCode}</span>
                          <span className="block text-ink-800">{acc ? nameOf(acc) : '—'}</span>
                          {line.memo && (
                            <span className="block text-2xs text-ink-400">{line.memo}</span>
                          )}
                        </TableCell>
                        <TableCell numeric>
                          {line.debitH > 0 ? (
                            <CurrencyDisplay amount={line.debitH} className="text-ink-900" />
                          ) : (
                            <span className="text-ink-300">—</span>
                          )}
                        </TableCell>
                        <TableCell numeric>
                          {line.creditH > 0 ? (
                            <CurrencyDisplay amount={line.creditH} className="text-ink-900" />
                          ) : (
                            <span className="text-ink-300">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              <div
                className={cn(
                  'flex items-center justify-between border-t border-ink-200 px-3 py-2 text-xs',
                  'bg-ink-50/60',
                )}
              >
                <span className="font-medium text-ink-700">{t('ledger.detail.balanced')}</span>
                <span className="flex items-center gap-4">
                  <CurrencyDisplay
                    amount={entryTotals(selected).debitH}
                    className="font-semibold text-ink-900"
                  />
                  <CurrencyDisplay
                    amount={entryTotals(selected).creditH}
                    className="font-semibold text-ink-900"
                  />
                </span>
              </div>
            </div>
          </div>
        )}
      </Drawer>

      <ConfirmModal
        open={reversing}
        title={t('ledger.reverseTitle')}
        description={t('ledger.reverseDescription')}
        confirmLabel={t('ledger.reverse')}
        variant="danger"
        loading={busy}
        onConfirm={reverse}
        onCancel={() => setReversing(false)}
      >
        <FormField label={t('expenses.reverseReason')} required>
          <Textarea rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />
        </FormField>
      </ConfirmModal>
    </div>
  );
}
