import { Alert, CurrencyDisplay, Drawer, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '@/components/ui';
import { useI18n, useTranslation } from '@/i18n';
import { formatDate } from '@/lib/format';
import { storedToPercent } from '@/types/discounts';
import type { CommissionEntry } from '@/types/finance';

export interface CommissionBreakdownProps {
  open: boolean;
  onClose: () => void;
  employeeName: string;
  period: string;
  entries: CommissionEntry[];
}

/**
 * Every riyal of an employee's commission, traced to the sale that earned it.
 *
 * This exists so a commission figure is never something an employee has to
 * take on trust. Each row shows the sale, the item, what it sold for, and the
 * rate that applied at that moment — which is what settles a dispute.
 */
export function CommissionBreakdown({
  open,
  onClose,
  employeeName,
  period,
  entries,
}: CommissionBreakdownProps) {
  const { t } = useTranslation();
  const { language } = useI18n();

  const totalH = entries.reduce((sum, entry) => sum + entry.amountH, 0);

  const nameOf = (entry: CommissionEntry) =>
    language === 'ar' ? entry.itemNameAr : entry.itemNameEn;

  const rateLabel = (entry: CommissionEntry) =>
    entry.basis === 'percentage'
      ? `${storedToPercent(entry.rateAtSale)}%`
      : `${(entry.rateAtSale / 100).toFixed(2)}`;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size="lg"
      title={t('commissionDetail.title', { name: employeeName })}
      description={t('commissionDetail.subtitle', { period, count: entries.length })}
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-lg border border-ink-200 bg-ink-50/60 px-4 py-3">
          <span className="text-sm font-medium text-ink-700">
            {t('commissionDetail.total')}
          </span>
          <CurrencyDisplay amount={totalH} className="text-xl font-semibold text-ink-900" />
        </div>

        {entries.length === 0 ? (
          <p className="rounded-md border border-dashed border-ink-300 px-4 py-8 text-center text-sm text-ink-400">
            {t('commissionDetail.empty')}
          </p>
        ) : (
          <>
            <div className="overflow-hidden rounded-md border border-ink-200">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>{t('commissionDetail.columns.date')}</TableHeaderCell>
                    <TableHeaderCell>{t('commissionDetail.columns.item')}</TableHeaderCell>
                    <TableHeaderCell numeric>
                      {t('commissionDetail.columns.lineTotal')}
                    </TableHeaderCell>
                    <TableHeaderCell numeric>
                      {t('commissionDetail.columns.rate')}
                    </TableHeaderCell>
                    <TableHeaderCell numeric>
                      {t('commissionDetail.columns.amount')}
                    </TableHeaderCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="text-ink-600">
                        {formatDate(entry.earnedAt, { language })}
                        <span className="numeric block text-2xs text-ink-400">
                          {entry.invoiceNumber}
                        </span>
                      </TableCell>

                      <TableCell className="text-ink-800">{nameOf(entry)}</TableCell>

                      <TableCell numeric className="text-ink-600">
                        <CurrencyDisplay amount={entry.lineGrossH} />
                      </TableCell>

                      {/* The rate as it stood at the sale, not as it stands now. */}
                      <TableCell numeric className="numeric text-ink-500">
                        {rateLabel(entry)}
                      </TableCell>

                      <TableCell numeric>
                        <CurrencyDisplay
                          amount={entry.amountH}
                          className="font-semibold text-success-600"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <Alert tone="tip" compact>
              {t('commissionDetail.frozenNote')}
            </Alert>
          </>
        )}
      </div>
    </Drawer>
  );
}
