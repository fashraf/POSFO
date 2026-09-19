import { useCallback, useEffect, useState } from 'react';
import { Lock, LockOpen, Wallet } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CurrencyDisplay,
  EmptyState,
  FormField,
  LoadingState,
  Modal,
  PageHeader,
  PriceInput,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Textarea,
} from '@/components/ui';
import { useSession } from '@/contexts/SessionContext';
import { useToast } from '@/contexts/ToastContext';
import { FinanceTabs } from '@/features/finance/FinanceTabs';
import { ScopeBanner } from '@/features/finance/ScopeBanner';
import { useI18n, useTranslation } from '@/i18n';
import { cn } from '@/lib/cn';
import { formatDate, toMinorUnits } from '@/lib/format';
import { drawerService, safeCall } from '@/services';
import type { DrawerExpectation, DrawerSession } from '@/types/finance';

export default function CashPage() {
  const { t } = useTranslation();
  const { language } = useI18n();
  const { user, activeBranch } = useSession();
  const toast = useToast();

  const [session, setSession] = useState<DrawerSession | null>(null);
  const [expectation, setExpectation] = useState<DrawerExpectation | null>(null);
  const [takings, setTakings] = useState<{ cashH: number; cardH: number; creditH: number; totalH: number } | null>(null);
  const [history, setHistory] = useState<DrawerSession[]>([]);
  const [loading, setLoading] = useState(true);

  const [opening, setOpening] = useState(false);
  const [closing, setClosing] = useState(false);
  const [float, setFloat] = useState('');
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const actor = user ? (language === 'ar' ? user.nameAr : user.nameEn) : 'System';

  const load = useCallback(async () => {
    setLoading(true);

    const branchId = activeBranch?.id ?? null;
    const [currentResult, historyResult] = await Promise.all([
      safeCall(() => drawerService.current(branchId)),
      safeCall(() => drawerService.history(branchId)),
    ]);

    if (currentResult.ok) {
      setSession(currentResult.data);

      if (currentResult.data) {
        const expectationResult = await safeCall(() =>
          drawerService.expectation(currentResult.data!),
        );
        setExpectation(expectationResult.ok ? expectationResult.data : null);

        const takingsResult = await safeCall(() =>
          drawerService.dayTakings(currentResult.data!),
        );
        setTakings(takingsResult.ok ? takingsResult.data : null);
      } else {
        setExpectation(null);
        setTakings(null);
      }
    }

    if (historyResult.ok) setHistory(historyResult.data);
    setLoading(false);
  }, [activeBranch]);

  useEffect(() => {
    void load();
  }, [load]);

  async function open() {
    setBusy(true);
    const result = await safeCall(() =>
      drawerService.open({
        branchId: activeBranch?.id ?? null,
        openingCashH: toMinorUnits(float || '0'),
        openedBy: actor,
      }),
    );
    setBusy(false);

    if (result.ok) {
      toast.success(t('cash.toast.opened'));
      setOpening(false);
      setFloat('');
      await load();
    } else {
      toast.error(t('cash.toast.failed'), result.error.message);
    }
  }

  async function close() {
    if (!session) return;
    setBusy(true);

    const result = await safeCall(() =>
      drawerService.close({
        sessionId: session.id,
        countedCashH: toMinorUnits(counted || '0'),
        closedBy: actor,
        note,
      }),
    );
    setBusy(false);

    if (result.ok) {
      toast.success(t('cash.toast.closed'));
      setClosing(false);
      setCounted('');
      setNote('');
      await load();
    } else {
      toast.error(t('cash.toast.failed'), result.error.message);
    }
  }

  if (loading) return <LoadingState className="py-20" />;

  const countedH = toMinorUnits(counted || '0');
  const varianceH = expectation ? countedH - expectation.expectedH : 0;

  const breakdown = expectation
    ? [
        { key: 'opening', amountH: expectation.openingCashH, sign: 1 },
        { key: 'cashSales', amountH: expectation.cashSalesH, sign: 1 },
        { key: 'collections', amountH: expectation.cashCollectionsH, sign: 1 },
        { key: 'contributions', amountH: expectation.ownerContributionsH, sign: 1 },
        { key: 'cashExpenses', amountH: expectation.cashExpensesH, sign: -1 },
        { key: 'withdrawals', amountH: expectation.ownerWithdrawalsH, sign: -1 },
        { key: 'refunds', amountH: expectation.cashRefundsH, sign: -1 },
      ]
    : [];

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('cash.title')}
        description={t('cash.description')}
        actions={
          session ? (
            <Button leadingIcon={<Lock />} onClick={() => setClosing(true)}>
              {t('cash.closeDrawer')}
            </Button>
          ) : (
            <Button leadingIcon={<LockOpen />} onClick={() => setOpening(true)}>
              {t('cash.openDrawer')}
            </Button>
          )
        }
      />

      <FinanceTabs />

      <ScopeBanner />

      {!session ? (
        <div className="rounded-lg border border-dashed border-ink-300 bg-surface">
          <EmptyState
            icon={<Wallet />}
            title={t('cash.noSession')}
            description={t('cash.noSessionHint')}
            action={<Button onClick={() => setOpening(true)}>{t('cash.openDrawer')}</Button>}
          />
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Card>
            <CardBody className="space-y-3">
              <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-400">
                {t('cash.breakdown')}
              </h2>

              <dl className="divide-dotted-y">
                {breakdown.map((line) => (
                  <div key={line.key} className="flex items-center justify-between py-1.5 text-sm">
                    <dt className="text-ink-600">{t(`cash.lines.${line.key}` as never)}</dt>
                    <dd>
                      <CurrencyDisplay
                        amount={line.sign * line.amountH}
                        signed
                        className="font-medium"
                      />
                    </dd>
                  </div>
                ))}
              </dl>

              <div className="flex items-center justify-between rounded-md bg-ink-100 px-3 py-2.5">
                <span className="text-sm font-semibold text-ink-900">{t('cash.expected')}</span>
                <CurrencyDisplay
                  amount={expectation?.expectedH ?? 0}
                  className="text-xl font-semibold text-ink-900"
                />
              </div>

              <Alert tone="tip" compact>
                {t('cash.excluded')}
              </Alert>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="space-y-2 text-sm">
              <Badge tone="success" dot>
                {t('cash.sessionOpen', {
                  time: formatDate(session.openedAt, { language, withTime: true }),
                })}
              </Badge>
              <p className="text-xs text-ink-500">{session.openedBy}</p>
              <div className="border-t border-dashed border-ink-200 pt-2">
                <p className="text-xs text-ink-500">{t('cash.openingFloat')}</p>
                <CurrencyDisplay
                  amount={session.openingCashH}
                  className="text-lg font-semibold text-ink-900"
                />
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {history.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-ink-200 bg-surface">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{t('cash.title')}</TableHeaderCell>
                <TableHeaderCell numeric>{t('cash.openingFloat')}</TableHeaderCell>
                <TableHeaderCell numeric>{t('cash.counted')}</TableHeaderCell>
                <TableHeaderCell>{t('cash.variance')}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {history.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-ink-600">
                    {formatDate(entry.closedAt ?? entry.openedAt, { language, withTime: true })}
                    <span className="block text-2xs text-ink-400">{entry.closedBy}</span>
                  </TableCell>
                  <TableCell numeric>
                    <CurrencyDisplay amount={entry.openingCashH} className="text-ink-700" />
                  </TableCell>
                  <TableCell numeric>
                    <CurrencyDisplay amount={entry.countedCashH ?? 0} className="text-ink-900" />
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-ink-500">{entry.note || '—'}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Open */}
      <Modal
        open={opening}
        onClose={() => setOpening(false)}
        size="sm"
        title={t('cash.openDrawer')}
        dismissible={!busy}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpening(false)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button onClick={open} loading={busy}>
              {t('cash.openDrawer')}
            </Button>
          </>
        }
      >
        <FormField label={t('cash.openingFloat')} required>
          <PriceInput
            inputSize="lg"
            autoFocus
            value={float}
            onChange={(event) => setFloat(event.target.value)}
            placeholder="0.00"
          />
        </FormField>
      </Modal>

      {/* Close */}
      <Modal
        open={closing}
        onClose={() => setClosing(false)}
        size="sm"
        title={t('cash.closeDrawer')}
        dismissible={!busy}
        footer={
          <>
            <Button variant="outline" onClick={() => setClosing(false)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button onClick={close} loading={busy} disabled={counted === ''}>
              {t('cash.closeDrawer')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {/* The shift at a glance before committing to a count. */}
          {takings && (
            <div className="rounded-md border border-ink-200 p-3">
              <p className="mb-2 text-2xs font-semibold uppercase tracking-wider text-ink-400">
                {t('cash.takings')}
              </p>

              <dl className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <dt className="text-ink-600">{t('pos.payment.cash')}</dt>
                  <dd>
                    <CurrencyDisplay amount={takings.cashH} className="font-medium text-ink-900" />
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-400">{t('pos.payment.card')}</dt>
                  <dd>
                    <CurrencyDisplay amount={takings.cardH} className="text-ink-500" />
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-400">{t('pos.payment.credit')}</dt>
                  <dd>
                    <CurrencyDisplay amount={takings.creditH} className="text-ink-500" />
                  </dd>
                </div>
                <div className="flex justify-between border-t border-dashed border-ink-200 pt-1.5">
                  <dt className="font-medium text-ink-700">{t('cash.takingsTotal')}</dt>
                  <dd>
                    <CurrencyDisplay amount={takings.totalH} className="font-semibold text-ink-900" />
                  </dd>
                </div>
              </dl>

              <p className="mt-2 text-2xs text-ink-400">{t('cash.excluded')}</p>
            </div>
          )}

          <div className="flex items-center justify-between rounded-md bg-ink-50 px-3 py-2">
            <span className="text-sm text-ink-500">{t('cash.expected')}</span>
            <CurrencyDisplay
              amount={expectation?.expectedH ?? 0}
              className="font-semibold text-ink-900"
            />
          </div>

          <FormField label={t('cash.counted')} required>
            <PriceInput
              inputSize="lg"
              autoFocus
              value={counted}
              onChange={(event) => setCounted(event.target.value)}
              placeholder="0.00"
            />
          </FormField>

          {/* The variance is stated plainly rather than buried after saving. */}
          {counted !== '' && (
            <div
              className={cn(
                'flex items-center justify-between rounded-md px-3 py-2.5',
                varianceH === 0
                  ? 'bg-success-50'
                  : varianceH > 0
                    ? 'bg-info-50'
                    : 'bg-danger-50',
              )}
            >
              <span
                className={cn(
                  'text-sm font-medium',
                  varianceH === 0
                    ? 'text-success-700'
                    : varianceH > 0
                      ? 'text-info-700'
                      : 'text-danger-700',
                )}
              >
                {varianceH === 0
                  ? t('cash.exact')
                  : varianceH > 0
                    ? t('cash.over')
                    : t('cash.short')}
              </span>
              {varianceH !== 0 && (
                <CurrencyDisplay
                  amount={Math.abs(varianceH)}
                  className={cn(
                    'text-lg font-semibold',
                    varianceH > 0 ? 'text-info-700' : 'text-danger-700',
                  )}
                />
              )}
            </div>
          )}

          <FormField label={t('cash.note')} showOptional>
            <Textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
          </FormField>
        </div>
      </Modal>
    </div>
  );
}
