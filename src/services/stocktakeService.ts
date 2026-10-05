import { api } from './apiClient';
import { invalidate } from './dataVersion';

/**
 * Stocktake (inventory.stocktake).
 *
 * The sheet lists every active item that tracks stock with the quantity the
 * system holds in the branch. Posting sends the counts; the server sets each
 * item that differs to its count, records the movements under one stocktake
 * reference and posts one journal entry for the variance — all or nothing.
 */

export interface StocktakeSheetLine {
  itemId: string;
  nameAr: string;
  nameEn: string;
  sku: string | null;
  barcode: string | null;
  categoryId: string | null;
  costH: number;
  systemQuantity: number;
}

export interface StocktakePostedLine {
  itemId: string;
  nameAr: string;
  nameEn: string;
  sku: string | null;
  systemQuantity: number;
  countedQuantity: number;
  difference: number;
  valueH: number;
}

export interface StocktakeResult {
  reference: string;
  branchId: string;
  changedLines: number;
  netValueH: number;
  lines: StocktakePostedLine[];
}

export const stocktakeService = {
  async sheet(branchId: string): Promise<StocktakeSheetLine[]> {
    const rows = await api.get<StocktakeSheetLine[]>('/api/inventory/stocktake/sheet', {
      query: { branchId },
    });
    return rows.map((row) => ({
      ...row,
      sku: row.sku ?? null,
      barcode: row.barcode ?? null,
      categoryId: row.categoryId ?? null,
      systemQuantity: Number(row.systemQuantity),
    }));
  },

  /** Refused with 422 nothing_changed when every count matches the system. */
  async post(input: {
    branchId: string;
    lines: { itemId: string; countedQuantity: number }[];
    note?: string;
  }): Promise<StocktakeResult> {
    const result = await api.post<StocktakeResult>('/api/inventory/stocktake', input);
    invalidate('inventory');
    return result;
  },
};
