import { useCallback, useEffect, useState } from 'react';
import { CreditCard, Plus } from 'lucide-react';
import {
  DatePicker,
  Alert,
  Button,
  CurrencyDisplay,
  EmptyState,
  FormField,
  KpiCard,
  Modal,
  PageHeader,
  PriceInput,
  SkeletonTable,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeaderCell,
  TableRow,
  Textarea,
} from '@/components/ui';
import { FinanceTabs } from '@/features/finance/FinanceTabs';
import { ScopeBanner } from '@/features/finance/ScopeBanner';
import { useSession } from '@/contexts/SessionContext';
import { useToast } from '@/contexts/ToastContext';
import { useI18n, useTranslation } from '@/i18n';
import { formatCurrency, formatDate, toMinorUnits } from '@/lib/format';
import { safeCall, settlementService } from '@/services';
import type { CardSettlement } from '@/types/finance';

export default function SettlementsPage() {
  const { t } = useTranslation();
  const { language } = useI18n();
  const { user } = useSession();
  const toast = useToast();

  const [settlements, setSettlements] = useState<CardSettlement[]>([]);
  const [outstandingH, setOutstandingH] = useState(0);
  const [loading, setLoading] = useState(true);

  const [creating, setCreating] = useState(false);
  const [takings, setTakings] = useState('');
  const [deposit, setDeposit] = useState('');
  const [settledOn, setSettledOn] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const actor = user ? (language === 'ar' ? user.nameAr : user.nameEn) : 'System';

  const load = useCallback(async () => {
    setLoading(true);
    const [listResult, outstandingResult] = await Promise.all([
      safeCall(() => settlementService.list()),
      safeCall(() => settlementService.outstandingH()),
    ]);
    if (listResult.ok) setSettlements(listResult.data);
    if (outstandingResult.ok) setOutstandingH(outstandingResult.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!creating) return;
    /* Pre-fill with what is actually outstanding — that is almost always the
       batch being settled. */
    setTakings(outstandingH > 0 ? (outstandingH / 100).toFixed(2) : '');
    setDeposit('');
    setSettledOn(new Date().toISOString().slice(0, 10));
    setNote('');
  }, [creating, outstandingH]);

  const takingsH = toMinorUnits(takings || '0');
  const depositH = toMinorUnits(deposit || '0');
  const feeH = Math.max(0, takingsH - depositH);
  const invalid = depositH > takingsH;

  async function record() {
    setBusy(true);

    const result = await safeCall(() =>
      settlementService.record({
        cardSalesH: takingsH,
        depositH,
        settledOn,
        note,
        actor,
      }),
    );

    setBusy(false);

    if (result.ok) {
      toast.success(t('settlement.toast.recorded'));
      setCreating(false);
      await load();
    } else {
      toast.error(t('settlement.toast.failed'), result.error.message);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('settlement.title')}
        description={t('settlement.description')}
        actions={
          <Button leadingIcon={<Plus />} onClick={() => setCreating(true)}>
            {t('settlement.record')}
          </Button>
        }
      />

      <FinanceTabs />

      <ScopeBanner />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          label={t('settlement.outstanding')}
          value={<CurrencyDisplay amount={outstandingH} />}
          icon={<CreditCard />}
        />
      </div>

      {outstandingH > 0 && <Alert tone="info" compact>{t('settlement.outstandingHelp')}</Alert>}

      {loading ? (
        <div className="overflow-hidden rounded-lg border border-ink-200 bg-surface">
          <SkeletonTable rows={4} columns={5} />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-ink-200 bg-surface">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{t('settlement.columns.reference')}</TableHeaderCell>
                <TableHeaderCell>{t('settlement.columns.settledOn')}</TableHeaderCell>
                <TableHeaderCell numeric>{t('settlement.columns.takings')}</TableHeaderCell>
                <TableHeaderCell numeric>{t('settlement.columns.deposit')}</TableHeaderCell>
                <TableHeaderCell numeric>{t('settlement.columns.fee')}</TableHeaderCell>
                <TableHeaderCell>{t('settlement.columns.status')}</TableHeaderCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {settlements.length === 0 ? (
                <TableEmptyRow colSpan={6}>
                  <EmptyState
                    icon={<CreditCard />}
                    title={t('settlement.empty.title')}
                    description={t('settlement.empty.description')}
                  />
                </TableEmptyRow>
              ) : (
                settlements.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="numeric font-medium text-ink-900">
                      {entry.reference}
                    </TableCell>
                    <TableCell className="text-ink-600">
                      {formatDate(entry.settledOn, { language })}
                    </TableCell>
                    <TableCell numeric>
                      <CurrencyDisplay amount={entry.cardSalesH} className="text-ink-700" />
                    </TableCell>
                    <TableCell numeric>
                      <CurrencyDisplay
                        amount={entry.depositH}
                        className="font-medium text-ink-900"
                      />
                    </TableCell>
                    <TableCell numeric>
                      <CurrencyDisplay amount={entry.feeH} className="text-danger-600" />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status="active" />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        size="sm"
        title={t('settlement.record')}
        dismissible={!busy}
        footer={
          <>
            <Button variant="outline" onClick={() => setCreating(false)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button onClick={record} loading={busy} disabled={takingsH <= 0 || invalid}>
              {t('settlement.record')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormField label={t('settlement.fields.takings')} required help={t('settlement.fields.takingsHelp')}>
            <PriceInput
              inputSize="sm"
              value={takings}
              onChange={(event) => setTakings(event.target.value)}
            />
          </FormField>

          <FormField
            label={t('settlement.fields.deposit')}
            required
            help={t('settlement.fields.depositHelp')}
            error={invalid ? t('settlement.fields.depositHelp') : undefined}
          >
            <PriceInput
              inputSize="sm"
              value={deposit}
              onChange={(event) => setDeposit(event.target.value)}
              invalid={invalid}
            />
          </FormField>

          <FormField label={t('settlement.fields.settledOn')} required>
            <DatePicker
                size="sm"
                value={settledOn}
                onChange={(value) => setSettledOn(value)}
                />
          </FormField>

          {/* The fee is derived, never typed — it is defined as the gap. */}
          {takingsH > 0 && !invalid && (
            <div className="space-y-1 rounded-md border border-warning-100 bg-warning-50 px-3 py-2.5">
              <p className="text-sm font-medium text-warning-700">
                {t('settlement.feeCalculated', {
                  amount: formatCurrency(feeH, { language }),
                })}
              </p>
              <p className="text-2xs text-warning-700/80">{t('settlement.feeHint')}</p>
            </div>
          )}

          <FormField label={t('settlement.fields.note')} showOptional>
            <Textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
          </FormField>
        </div>
      </Modal>
    </div>
  );
}
