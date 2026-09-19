import { credit, debit, ledgerService } from '../ledgerService';

/**
 * Six months of trading history.
 *
 * Without this every chart renders an empty frame and the finance module looks
 * broken rather than new. The figures are shaped to be realistic — a slow
 * summer, a strong September, one branch outperforming the other — so the
 * comparison views actually have something to show.
 */

const BRANCHES = ['brn_001', 'brn_002'] as const;

/* Riyadh trades roughly twice Jeddah's volume, and Jeddah has a weak month,
   so the branch comparison has a real story in it rather than noise. */
const MONTHLY: { salesH: number; share: [number, number] }[] = [
  { salesH: 6_820_000, share: [0.68, 0.32] },
  { salesH: 7_140_000, share: [0.66, 0.34] },
  { salesH: 6_450_000, share: [0.71, 0.29] },
  { salesH: 7_960_000, share: [0.64, 0.36] },
  { salesH: 8_540_000, share: [0.62, 0.38] },
  { salesH: 9_120_000, share: [0.65, 0.35] },
];

const VAT_RATE = 0.15;

/** Split a gross figure into net and VAT the way the rest of the app does. */
function split(grossH: number) {
  const taxH = Math.round((grossH * VAT_RATE) / (1 + VAT_RATE));
  return { netH: grossH - taxH, taxH };
}

function monthStart(monthsAgo: number): string {
  const date = new Date();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - monthsAgo);
  return date.toISOString().slice(0, 10);
}

let seeded = false;

/**
 * Post the history. Runs once — a second call would double every figure.
 */
export async function seedFinanceHistory(): Promise<void> {
  if (seeded) return;
  seeded = true;

  for (let index = 0; index < MONTHLY.length; index += 1) {
    const monthsAgo = MONTHLY.length - 1 - index;
    const month = monthStart(monthsAgo);
    const plan = MONTHLY[index];

    for (let branchIndex = 0; branchIndex < BRANCHES.length; branchIndex += 1) {
      const branchId = BRANCHES[branchIndex];
      const grossH = Math.round(plan.salesH * plan.share[branchIndex]);
      const { netH, taxH } = split(grossH);

      /* Payment mix: mostly card, a solid cash share, a little on credit. */
      const cardH = Math.round(grossH * 0.54);
      const cashH = Math.round(grossH * 0.38);
      const creditH = grossH - cardH - cashH;

      const cogsH = Math.round(netH * 0.42);

      await ledgerService.post({
        kind: 'sale',
        sourceReference: `HIST-${month}-${branchId}`,
        description: `Sales ${month.slice(0, 7)}`,
        postedAt: `${month}T12:00:00.000Z`,
        actor: 'System',
        branchId,
        lines: [
          debit('1000', cashH, 'Cash'),
          debit('1150', cardH, 'Card clearing'),
          debit('1400', creditH, 'Customer credit'),
          credit('4100', netH, 'Sales'),
          credit('2100', taxH, 'Output VAT'),
          debit('5100', cogsH, 'Cost of goods sold'),
          credit('1200', cogsH, 'Inventory'),
        ],
      });

      /* Operating costs, weighted so Jeddah's margin is visibly thinner. */
      const rentH = branchIndex === 0 ? 800_000 : 620_000;
      const salariesH = branchIndex === 0 ? 1_240_000 : 1_180_000;
      const utilitiesH = branchIndex === 0 ? 215_000 : 268_000;

      await ledgerService.post({
        kind: 'expense_recognition',
        sourceReference: `HIST-RENT-${month}-${branchId}`,
        description: `Rent — ${month.slice(0, 7)}`,
        postedAt: `${month}T12:00:00.000Z`,
        actor: 'System',
        branchId,
        lines: [debit('6000', rentH, 'Rent'), credit('1000', rentH, 'Cash')],
      });

      await ledgerService.post({
        kind: 'expense_recognition',
        sourceReference: `HIST-SAL-${month}-${branchId}`,
        description: `Salaries — ${month.slice(0, 7)}`,
        postedAt: `${month}T12:00:00.000Z`,
        actor: 'System',
        branchId,
        lines: [debit('6200', salariesH, 'Salaries'), credit('1100', salariesH, 'Bank')],
      });

      await ledgerService.post({
        kind: 'expense_recognition',
        sourceReference: `HIST-UTIL-${month}-${branchId}`,
        description: `Utilities — ${month.slice(0, 7)}`,
        postedAt: `${month}T12:00:00.000Z`,
        actor: 'System',
        branchId,
        lines: [debit('6000', utilitiesH, 'Utilities'), credit('1000', utilitiesH, 'Cash')],
      });

      /* The bank settles card takings, less a fee. */
      const feeH = Math.round(cardH * 0.015);
      await ledgerService.post({
        kind: 'card_settlement',
        sourceReference: `HIST-SET-${month}-${branchId}`,
        description: 'Card settlement',
        postedAt: `${month}T18:00:00.000Z`,
        actor: 'System',
        branchId,
        lines: [
          debit('1100', cardH - feeH, 'Bank deposit'),
          debit('6100', feeH, 'Card fees'),
          credit('1150', cardH, 'Card clearing'),
        ],
      });
    }
  }
}
