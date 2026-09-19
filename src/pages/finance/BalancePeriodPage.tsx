import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Lock } from 'lucide-react';
import {
  DatePicker,
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  ConfirmModal,
  CurrencyDisplay,
  FormField,
  InfoHint,
  Input,
  LoadingState,
  PageHeader,
  SearchableSelect,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Textarea,
} from '@/components/ui';
import { MethodBalanceFields } from '@/features/finance/MethodBalanceFields';
import { useSession } from '@/contexts/SessionContext';
import { useToast } from '@/contexts/ToastContext';
import { useI18n, useTranslation } from '@/i18n';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import { balancePeriodService, safeCall } from '@/services';
import {
  EMPTY_METHOD_BALANCES,
  methodTotalH,
  periodMovement,
} from '@/types/finance';
import type { BalancePeriod, MethodBalances } from '@/types/finance';

const today = () => new Date().toISOString().slice(0, 10);

/** Serves both `/finance/periods/new` and `/finance/periods/:id`. */
export default function BalancePeriodPage({ mode }: { mode: 'create' | 'view' }) {
  const { t } = useTranslation();
  const { language } = useI18n();
  const { user, branches, activeBranch } = useSession();
  const toast = useToast();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [period, setPeriod] = useState<BalancePeriod | null>(null);
  const [expected, setExpected] = useState<MethodBalances | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [branchId, setBranchId] = useState<string | null>(activeBranch?.id ?? null);
  const [label, setLabel] = useState('');
  const [openedOn, setOpenedOn] = useState(today());
  const [opening, setOpening] = useState<MethodBalances>(EMPTY_METHOD_BALANCES);
  const [note, setNote] = useState('');

  const [closing, setClosing] = useState<MethodBalances>(EMPTY_METHOD_BALANCES);
  const [closedOn, setClosedOn] = useState(today());
  const [confirmingOpen, setConfirmingOpen] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);

  const actor = user ? (language === 'ar' ? user.nameAr : user.nameEn) : 'System';

  const branchName = (value: string | null) => {
    if (!value) return '—';
    const branch = branches.find((candidate) => candidate.id === value);
    if (!branch) return '—';
    return language === 'ar' ? branch.nameAr : branch.nameEn;
  };

  const load = useCallback(async () => {
    if (mode === 'create') {
      setLoading(false);
      return;
    }
    if (!id) return;

    setLoading(true);
    const result = await safeCall(() => balancePeriodService.get(id));

    if (result.ok) {
      setPeriod(result.data);
      setClosing(result.data.closing ?? EMPTY_METHOD_BALANCES);

      const expectedResult = await safeCall(() => balancePeriodService.expected(result.data));
      if (expectedResult.ok) {
        setExpected(expectedResult.data);
        /* Pre-fill the count with what the ledger expects: the common case is
           that they agree, and typing six numbers to confirm that is friction. */
        if (result.data.status === 'open') setClosing(expectedResult.data);
      }
    }

    setLoading(false);
  }, [mode, id]);

  useEffect(() => {
    void load();
  }, [load]);

  const movement = useMemo(() => {
    if (!period) return [];
    return periodMovement(period.opening, period.closing ?? closing);
  }, [period, closing]);

  const varianceH = expected ? methodTotalH(closing) - methodTotalH(expected) : 0;

  async function open() {
    setBusy(true);
    const result = await safeCall(() =>
      balancePeriodService.open({
        branchId,
        label,
        openedOn,
        opening,
        openedBy: actor,
        note,
      }),
    );
    setBusy(false);
    setConfirmingOpen(false);

    if (result.ok) {
      toast.success(t('periods.toast.opened'));
      navigate(`/finance/periods/${result.data.id}`);
    } else {
      toast.error(t('periods.toast.failed'), result.error.message);
    }
  }

  async function close() {
    if (!period) return;
    setBusy(true);

    const result = await safeCall(() =>
      balancePeriodService.close({
        id: period.id,
        closedOn,
        closing,
        closedBy: actor,
        note,
      }),
    );
    setBusy(false);
    setConfirmingClose(false);

    if (result.ok) {
      toast.success(t('periods.toast.closed'));
      await load();
    } else {
      toast.error(t('periods.toast.failed'), result.error.message);
    }
  }

  async function roll() {
    if (!period) return;
    setBusy(true);

    const result = await safeCall(() =>
      balancePeriodService.rollForward(period.id, today(), actor),
    );
    setBusy(false);

    if (result.ok) {
      toast.success(t('periods.toast.rolled'));
      navigate(`/finance/periods/${result.data.id}`);
    } else {
      toast.error(t('periods.toast.failed'), result.error.message);
    }
  }

  if (loading) return <LoadingState className="py-20" />;

  return (
    <div className="space-y-4">
      <div>
        <Button
          variant="ghost"
          size="sm"
          leadingIcon={<ArrowLeft className="flip-rtl" />}
          onClick={() => navigate('/finance/periods')}
        >
          {t('periods.listTitle')}
        </Button>
      </div>

      <PageHeader
        title={mode === 'create' ? t('periods.open') : (period?.label ?? '')}
        description={
          period
            ? `${branchName(period.branchId)} · ${formatDate(period.openedOn, { language })}`
            : t('periods.description')
        }
        actions={
          mode === 'create' ? (
            <Button onClick={() => setConfirmingOpen(true)} disabled={!branchId}>
              {t('periods.open')}
            </Button>
          ) : period?.status === 'open' ? (
            <Button leadingIcon={<Lock />} onClick={() => setConfirmingClose(true)}>
              {t('periods.close')}
            </Button>
          ) : (
            <Button
              variant="outline"
              leadingIcon={<ArrowRight className="flip-rtl" />}
              onClick={roll}
              loading={busy}
            >
              {t('periods.rollForward')}
            </Button>
          )
        }
      />

      {mode === 'create' ? (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Card>
            <CardBody className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label={t('periods.branch')} required help={t('periods.branchHelp')}>
                  <SearchableSelect
                    size="sm"
                    value={branchId}
                    onChange={setBranchId}
                    options={branches.map((branch) => ({
                      value: branch.id,
                      label: language === 'ar' ? branch.nameAr : branch.nameEn,
                      description: branch.code,
                    }))}
                  />
                </FormField>

                <FormField label={t('periods.label')} hint={t('periods.labelHint')}>
                  <Input
                    inputSize="sm"
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                    placeholder="September 2026"
                  />
                </FormField>

                <FormField label={t('periods.openedOn')} required>
                  <DatePicker
                size="sm"
                value={openedOn}
                onChange={(value) => setOpenedOn(value)}
                />
                </FormField>
              </div>

              <MethodBalanceFields value={opening} onChange={setOpening} />

              <FormField label={t('periods.note')} showOptional>
                <Textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
              </FormField>
            </CardBody>
          </Card>
        </div>
      ) : period ? (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-3">
            {/* Movement per method — the whole reason this is a period rather
                than a single opening snapshot. */}
            <Card>
              <CardBody className="space-y-3">
                <h2 className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-400">
                  {t('periods.movement')}
                  <InfoHint content={t('periods.movementHelp')} />
                </h2>

                <div className="overflow-hidden rounded-md border border-ink-200">
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableHeaderCell>{t('periods.columns.period')}</TableHeaderCell>
                        <TableHeaderCell numeric>{t('periods.columns.opening')}</TableHeaderCell>
                        <TableHeaderCell numeric>{t('periods.columns.closing')}</TableHeaderCell>
                        <TableHeaderCell numeric>
                          {t('periods.columns.difference')}
                        </TableHeaderCell>
                      </TableRow>
                    </TableHead>

                    <TableBody>
                      {movement.map((line) => (
                        <TableRow key={line.key}>
                          <TableCell className="text-ink-700">
                            {t(`periods.methods.${line.key}` as never)}
                          </TableCell>
                          <TableCell numeric className="text-ink-600">
                            <CurrencyDisplay amount={line.openingH} />
                          </TableCell>
                          <TableCell numeric className="text-ink-900">
                            <CurrencyDisplay amount={line.closingH} />
                          </TableCell>
                          <TableCell numeric>
                            <CurrencyDisplay
                              amount={line.deltaH}
                              signed
                              className={cn(
                                'font-medium',
                                line.deltaH === 0
                                  ? 'text-ink-400'
                                  : line.key === 'payablesH'
                                    ? line.deltaH > 0
                                      ? 'text-danger-600'
                                      : 'text-success-600'
                                    : line.deltaH > 0
                                      ? 'text-success-600'
                                      : 'text-danger-600',
                              )}
                            />
                          </TableCell>
                        </TableRow>
                      ))}

                      <TableRow className="bg-ink-50/60">
                        <TableCell className="font-semibold text-ink-900">
                          {t('periods.total')}
                        </TableCell>
                        <TableCell numeric>
                          <CurrencyDisplay
                            amount={methodTotalH(period.opening)}
                            className="font-semibold text-ink-700"
                          />
                        </TableCell>
                        <TableCell numeric>
                          <CurrencyDisplay
                            amount={methodTotalH(period.closing ?? closing)}
                            className="font-semibold text-ink-900"
                          />
                        </TableCell>
                        <TableCell numeric>
                          <CurrencyDisplay
                            amount={
                              methodTotalH(period.closing ?? closing) -
                              methodTotalH(period.opening)
                            }
                            signed
                            className="text-base font-semibold"
                          />
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardBody>
            </Card>

            {period.status === 'open' && (
              <Card>
                <CardBody className="space-y-3">
                  <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-400">
                    {t('periods.counted')}
                  </h2>

                  <MethodBalanceFields
                    value={closing}
                    onChange={setClosing}
                    expected={expected}
                  />

                  <FormField label={t('periods.closedOn')} required>
                    <DatePicker
                size="sm"
                value={closedOn}
                onChange={(value) => setClosedOn(value)}
                />
                  </FormField>
                </CardBody>
              </Card>
            )}
          </div>

          <div className="space-y-3 lg:sticky lg:top-16 lg:h-fit">
            <Card>
              <CardBody className="space-y-2 text-sm">
                <Badge tone={period.status === 'open' ? 'info' : 'neutral'} dot>
                  {t(`periods.status.${period.status}`)}
                </Badge>

                <div className="flex justify-between pt-1">
                  <span className="text-ink-500">{t('periods.openedOn')}</span>
                  <span className="text-ink-800">
                    {formatDate(period.openedOn, { language })}
                  </span>
                </div>

                {period.closedOn && (
                  <div className="flex justify-between">
                    <span className="text-ink-500">{t('periods.closedOn')}</span>
                    <span className="text-ink-800">
                      {formatDate(period.closedOn, { language })}
                    </span>
                  </div>
                )}

                {period.status === 'open' && expected && (
                  <div className="space-y-1.5 border-t border-dashed border-ink-200 pt-2">
                    <div className="flex justify-between">
                      <span className="flex items-center gap-1 text-ink-500">
                        {t('periods.variance')}
                        <InfoHint content={t('periods.varianceHelp')} />
                      </span>
                      <span
                        className={cn(
                          'font-semibold',
                          varianceH === 0
                            ? 'text-success-600'
                            : varianceH > 0
                              ? 'text-info-600'
                              : 'text-danger-600',
                        )}
                      >
                        {varianceH === 0 ? (
                          t('periods.exact')
                        ) : (
                          <CurrencyDisplay amount={varianceH} signed />
                        )}
                      </span>
                    </div>
                  </div>
                )}
              </CardBody>
            </Card>

            {period.note && (
              <Alert tone="tip" compact>
                {period.note}
              </Alert>
            )}
          </div>
        </div>
      ) : null}

      <ConfirmModal
        open={confirmingOpen}
        title={t('periods.openTitle')}
        description={t('periods.openDescription')}
        confirmLabel={t('periods.open')}
        variant="primary"
        loading={busy}
        onConfirm={open}
        onCancel={() => setConfirmingOpen(false)}
      >
        <dl className="space-y-1 rounded-md bg-ink-50 px-3 py-2 text-xs">
          <div className="flex justify-between">
            <dt className="text-ink-500">{t('periods.branch')}</dt>
            <dd className="font-medium text-ink-800">{branchName(branchId)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-500">{t('periods.total')}</dt>
            <dd>
              <CurrencyDisplay amount={methodTotalH(opening)} className="font-semibold text-ink-900" />
            </dd>
          </div>
        </dl>
      </ConfirmModal>

      <ConfirmModal
        open={confirmingClose}
        title={t('periods.closeTitle')}
        description={t('periods.closeDescription')}
        confirmLabel={t('periods.close')}
        variant="warning"
        loading={busy}
        onConfirm={close}
        onCancel={() => setConfirmingClose(false)}
      >
        <dl className="space-y-1 rounded-md bg-ink-50 px-3 py-2 text-xs">
          <div className="flex justify-between">
            <dt className="text-ink-500">{t('periods.expected')}</dt>
            <dd>
              <CurrencyDisplay amount={expected ? methodTotalH(expected) : 0} className="text-ink-700" />
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-500">{t('periods.counted')}</dt>
            <dd>
              <CurrencyDisplay amount={methodTotalH(closing)} className="font-medium text-ink-900" />
            </dd>
          </div>
          <div className="flex justify-between border-t border-dashed border-ink-200 pt-1.5">
            <dt className="font-medium text-ink-700">{t('periods.variance')}</dt>
            <dd>
              {varianceH === 0 ? (
                <span className="font-semibold text-success-600">{t('periods.exact')}</span>
              ) : (
                <CurrencyDisplay
                  amount={varianceH}
                  signed
                  className={cn(
                    'font-semibold',
                    varianceH > 0 ? 'text-info-600' : 'text-danger-600',
                  )}
                />
              )}
            </dd>
          </div>
        </dl>
      </ConfirmModal>
    </div>
  );
}
