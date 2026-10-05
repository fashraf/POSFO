import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, ClipboardList, RotateCcw } from 'lucide-react';
import {
  Alert,
  Button,
  Card,
  CardBody,
  Checkbox,
  ConfirmModal,
  CurrencyDisplay,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  KpiCard,
  LoadingState,
  PageHeader,
  SearchInput,
  Select,
  Table,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui';
import { useSession } from '@/contexts/SessionContext';
import { useToast } from '@/contexts/ToastContext';
import { useI18n, useTranslation } from '@/i18n';
import { cn } from '@/lib/cn';
import { formatCurrency, formatNumber } from '@/lib/format';
import { safeCall } from '@/services';
import { stocktakeService, type StocktakeSheetLine } from '@/services/stocktakeService';

/** Quantities are DECIMAL(18,3) on the server. */
const QTY_DIGITS = 3;

function parseCount(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === '') return null;
  const value = Number(raw.replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

/** Compare at the precision the server stores, so 1.0004 is not a "difference". */
function sameQuantity(a: number, b: number): boolean {
  return Math.round(a * 1000) === Math.round(b * 1000);
}

/**
 * Stocktake.
 *
 * Pick the branch, enter what is physically on the shelf, review what differs,
 * post. Only lines with a count are considered; a blank line is "not counted"
 * and left alone, so a partial count (one aisle) is possible. Posting is one
 * transaction on the server: every difference or none.
 */
export default function StocktakePage() {
  const { t } = useTranslation();
  const { language } = useI18n();
  const toast = useToast();
  const { can, user, branches, activeBranch } = useSession();
  const allowed = can('inventory.stocktake');

  /* Only branches this user works in. */
  const available = useMemo(
    () => branches.filter((branch) => !user || user.branchIds.includes(branch.id)),
    [branches, user],
  );

  const [branchId, setBranchId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<StocktakeSheetLine[]>([]);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [onlyDifferences, setOnlyDifferences] = useState(false);
  const [note, setNote] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [posting, setPosting] = useState(false);
  const [lastReference, setLastReference] = useState<string | null>(null);

  useEffect(() => {
    if (branchId) return;
    const initial = activeBranch?.id ?? available[0]?.id ?? null;
    if (initial) setBranchId(initial);
  }, [activeBranch, available, branchId]);

  const load = useCallback(async () => {
    if (!branchId || !allowed) return;
    setLoading(true);
    setError(null);
    const result = await safeCall(() => stocktakeService.sheet(branchId));
    if (result.ok) {
      setSheet(result.data);
    } else {
      setSheet([]);
      setError(result.error.message);
    }
    setLoading(false);
  }, [branchId, allowed]);

  /* A different branch is a different shelf: its counts start empty. */
  useEffect(() => {
    setCounts({});
    setLastReference(null);
    void load();
  }, [load]);

  const nameOf = (line: { nameAr: string; nameEn: string }) =>
    language === 'ar' ? line.nameAr : line.nameEn;

  /* Every line with its count and difference worked out once. */
  const rows = useMemo(
    () =>
      sheet.map((line) => {
        const counted = parseCount(counts[line.itemId]);
        const difference =
          counted === null || sameQuantity(counted, line.systemQuantity)
            ? 0
            : counted - line.systemQuantity;
        return {
          line,
          counted,
          difference,
          valueH: Math.round(difference * line.costH),
          invalid: counted !== null && counted < 0,
        };
      }),
    [sheet, counts],
  );

  const changed = rows.filter((row) => row.counted !== null && !row.invalid && row.difference !== 0);
  const countedCount = rows.filter((row) => row.counted !== null).length;
  const hasInvalid = rows.some((row) => row.invalid);
  const shrinkageH = changed.filter((row) => row.valueH < 0).reduce((sum, row) => sum - row.valueH, 0);
  const surplusH = changed.filter((row) => row.valueH > 0).reduce((sum, row) => sum + row.valueH, 0);

  const visible = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return rows.filter((row) => {
      if (onlyDifferences && row.difference === 0) return false;
      if (!needle) return true;
      return `${row.line.nameAr} ${row.line.nameEn} ${row.line.sku ?? ''} ${row.line.barcode ?? ''}`
        .toLocaleLowerCase()
        .includes(needle);
    });
  }, [rows, search, onlyDifferences]);

  async function post() {
    if (!branchId) return;
    setPosting(true);

    const result = await safeCall(() =>
      stocktakeService.post({
        branchId,
        lines: changed.map((row) => ({ itemId: row.line.itemId, countedQuantity: row.counted! })),
        note: note.trim() || undefined,
      }),
    );

    setPosting(false);
    setReviewing(false);

    if (result.ok) {
      toast.success(
        t('stocktake.posted', { reference: result.data.reference }),
        t('stocktake.postedDescription', {
          count: formatNumber(result.data.changedLines, { language }),
        }),
      );
      setLastReference(result.data.reference);
      setCounts({});
      setNote('');
      await load();
    } else {
      toast.error(t('stocktake.failed'), result.error.message);
    }
  }

  if (!allowed) {
    return (
      <div className="space-y-4">
        <PageHeader title={t('stocktake.title')} description={t('stocktake.description')} />
        <Alert tone="warning">{t('stocktake.noPermission')}</Alert>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('stocktake.title')}
        description={t('stocktake.description')}
        actions={
          <>
            <Button
              variant="outline"
              leadingIcon={<RotateCcw />}
              onClick={() => setCounts({})}
              disabled={countedCount === 0 || posting}
            >
              {t('stocktake.reset')}
            </Button>
            <Button
              leadingIcon={<ClipboardCheck />}
              onClick={() => setReviewing(true)}
              disabled={changed.length === 0 || hasInvalid || posting}
            >
              {t('stocktake.review')}
            </Button>
          </>
        }
      />

      <Card>
        <CardBody className="grid gap-3 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
          <FormField label={t('stocktake.branch')} required>
            <Select
              value={branchId ?? ''}
              onChange={(value) => setBranchId(value || null)}
              options={available.map((branch) => ({ value: branch.id, label: nameOf(branch) }))}
              placeholder={t('stocktake.selectBranch')}
            />
          </FormField>
          <FormField label={t('stocktake.note')} showOptional>
            <Input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t('stocktake.notePlaceholder')}
              maxLength={200}
            />
          </FormField>
        </CardBody>
      </Card>

      {lastReference && (
        <Alert tone="success" compact>
          {t('stocktake.lastPosted', { reference: lastReference })}
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={t('stocktake.summary.counted')}
          value={
            <span className="numeric">
              {formatNumber(countedCount, { language })} / {formatNumber(sheet.length, { language })}
            </span>
          }
          icon={<ClipboardList />}
        />
        <KpiCard
          label={t('stocktake.summary.changed')}
          value={<span className="numeric">{formatNumber(changed.length, { language })}</span>}
          icon={<ClipboardCheck />}
        />
        <KpiCard label={t('stocktake.summary.shrinkage')} value={<CurrencyDisplay amount={shrinkageH} />} />
        <KpiCard label={t('stocktake.summary.surplus')} value={<CurrencyDisplay amount={surplusH} />} />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput
          className="sm:max-w-xs"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onClear={() => setSearch('')}
          placeholder={t('stocktake.searchPlaceholder')}
        />
        <Checkbox
          checked={onlyDifferences}
          onChange={(event) => setOnlyDifferences(event.target.checked)}
          label={t('stocktake.onlyDifferences')}
        />
      </div>

      {loading ? (
        <LoadingState className="py-16" />
      ) : error ? (
        <ErrorState title={t('stocktake.loadFailed')} description={error} onRetry={() => void load()} />
      ) : (
        <div className="overflow-hidden rounded-lg border border-ink-200 bg-surface">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{t('stocktake.columns.item')}</TableHeaderCell>
                <TableHeaderCell>{t('stocktake.columns.sku')}</TableHeaderCell>
                <TableHeaderCell numeric>{t('stocktake.columns.system')}</TableHeaderCell>
                <TableHeaderCell numeric>{t('stocktake.columns.counted')}</TableHeaderCell>
                <TableHeaderCell numeric>{t('stocktake.columns.difference')}</TableHeaderCell>
                <TableHeaderCell numeric>{t('stocktake.columns.value')}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {visible.length === 0 ? (
                <TableEmptyRow colSpan={6}>
                  <EmptyState
                    icon={<ClipboardList />}
                    title={t('stocktake.empty')}
                    description={t('stocktake.emptyHint')}
                  />
                </TableEmptyRow>
              ) : (
                visible.map(({ line, counted, difference, valueH, invalid }) => (
                  <TableRow key={line.itemId}>
                    <TableCell className="font-medium text-ink-900">{nameOf(line)}</TableCell>
                    <TableCell className="numeric text-ink-500" dir="ltr">
                      {line.sku ?? '—'}
                    </TableCell>
                    <TableCell numeric className="text-ink-600">
                      {formatNumber(line.systemQuantity, { language, maximumFractionDigits: QTY_DIGITS })}
                    </TableCell>
                    <TableCell numeric>
                      <Input
                        inputSize="sm"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="any"
                        dir="ltr"
                        className="ms-auto w-28 text-end"
                        value={counts[line.itemId] ?? ''}
                        invalid={invalid}
                        placeholder={t('stocktake.notCounted')}
                        aria-label={`${t('stocktake.columns.counted')} — ${nameOf(line)}`}
                        onChange={(event) =>
                          setCounts((current) => ({ ...current, [line.itemId]: event.target.value }))
                        }
                      />
                    </TableCell>
                    <TableCell
                      numeric
                      className={cn(
                        'numeric',
                        difference < 0 && 'text-danger-600',
                        difference > 0 && 'text-success-600',
                        (counted === null || difference === 0) && 'text-ink-400',
                      )}
                    >
                      {counted === null
                        ? '—'
                        : `${difference > 0 ? '+' : ''}${formatNumber(difference, {
                            language,
                            maximumFractionDigits: QTY_DIGITS,
                          })}`}
                    </TableCell>
                    <TableCell numeric className={cn(valueH < 0 && 'text-danger-600')}>
                      {difference === 0 ? '—' : <CurrencyDisplay amount={valueH} />}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <ConfirmModal
        open={reviewing}
        title={t('stocktake.reviewTitle')}
        description={t('stocktake.reviewDescription', {
          count: formatNumber(changed.length, { language }),
          value: formatCurrency(surplusH - shrinkageH, { language }),
        })}
        confirmLabel={t('stocktake.post')}
        variant="warning"
        loading={posting}
        onConfirm={() => void post()}
        onCancel={() => setReviewing(false)}
      >
        <ul className="max-h-60 space-y-1 overflow-y-auto text-sm">
          {changed.map(({ line, counted, difference }) => (
            <li key={line.itemId} className="flex justify-between gap-3">
              <span className="truncate text-ink-700">{nameOf(line)}</span>
              <span className="numeric shrink-0 text-ink-500" dir="ltr">
                {formatNumber(line.systemQuantity, { language, maximumFractionDigits: QTY_DIGITS })} →{' '}
                {formatNumber(counted!, { language, maximumFractionDigits: QTY_DIGITS })} (
                <span className={difference < 0 ? 'text-danger-600' : 'text-success-600'}>
                  {difference > 0 ? '+' : ''}
                  {formatNumber(difference, { language, maximumFractionDigits: QTY_DIGITS })}
                </span>
                )
              </span>
            </li>
          ))}
        </ul>
      </ConfirmModal>
    </div>
  );
}
