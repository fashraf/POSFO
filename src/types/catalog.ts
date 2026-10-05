import type { ID, RecordStatus, Timestamped } from './common';

/**
 * The central modelling decision of the whole platform.
 *
 * A product and a service share one catalog so the POS, sales, and reporting
 * code never branches on business type. They differ only in the fields each one
 * carries, which is what `kind` discriminates.
 */
export type CatalogItemKind = 'product' | 'service';

export type UnitOfMeasure = 'piece' | 'kg' | 'gram' | 'litre' | 'ml' | 'metre' | 'box' | 'pack';

/** Fields every catalog entry has, regardless of kind. */
export interface CatalogItemBase extends Timestamped {
  id: ID;
  kind: CatalogItemKind;
  nameAr: string;
  nameEn: string;
  categoryId: ID | null;
  description: string;
  imageUrl: string | null;
  /** Selling price in minor units (halalas). */
  priceH: number;
  /** Cost in minor units. Zero is legitimate for a service. */
  costH: number;
  /** Whether the item appears in the POS sell grid. */
  showOnPos: boolean;
  /**
   * Whether this item has to be made before it can be handed over.
   *
   * Drives the kitchen screen. A burger is true; a bottle of cola and a haircut
   * are both false. Keeping it a per-item flag rather than a business-type
   * switch is what lets one POS serve a café and a barber without either
   * inheriting the other's workflow.
   */
  requiresPreparation: boolean;
  /**
   * Which print group this item's ticket goes to, if any. Null means the item
   * appears on the customer bill only.
   */
  printGroupId: ID | null;
  status: RecordStatus;
}

/** A physical good. Carries identifiers, a supplier, and stock. */
export interface Product extends CatalogItemBase {
  kind: 'product';
  sku: string;
  barcode: string;
  vendorId: ID | null;
  unit: UnitOfMeasure;
  /** When false the item sells without touching stock (e.g. a made-to-order good). */
  trackInventory: boolean;
  /** Quantity on hand. Meaningless when `trackInventory` is false. */
  stockQuantity: number;
  /** Reorder threshold that drives the low-stock alert. */
  minStockLevel: number;
}

/** A non-inventory offering. Never depletes stock. */
export interface Service extends CatalogItemBase {
  kind: 'service';
  /** Minutes. Null when duration is not meaningful for this service. */
  durationMinutes: number | null;
  /** Staff member who normally performs it. */
  providerId: ID | null;
}

export type CatalogItem = Product | Service;

/** Narrowing helpers — use these instead of comparing `kind` inline. */
export const isProduct = (item: CatalogItem): item is Product => item.kind === 'product';
export const isService = (item: CatalogItem): item is Service => item.kind === 'service';

/** Stock position derived from quantity and threshold, never stored. */
export type StockLevel = 'in_stock' | 'low_stock' | 'out_of_stock' | 'not_tracked';

export function stockLevelOf(item: CatalogItem): StockLevel {
  if (!isProduct(item) || !item.trackInventory) return 'not_tracked';
  if (item.stockQuantity <= 0) return 'out_of_stock';
  if (item.stockQuantity <= item.minStockLevel) return 'low_stock';
  return 'in_stock';
}

/**
 * Gross margin as a ratio, or null when there is no cost to compare against.
 *
 * Shelf prices include VAT, and the VAT is the government's, not revenue. The
 * margin is therefore on the price excluding VAT — the same rule as the P&L
 * and dashboard: (net price − cost) ÷ net price.
 */
export function grossMarginOf(priceH: number, costH: number, vatRatePercent = 15): number | null {
  if (priceH <= 0) return null;
  if (costH <= 0) return null;
  const netPriceH = (priceH * 100) / (100 + vatRatePercent);
  return (netPriceH - costH) / netPriceH;
}

export function marginOf(item: CatalogItem, vatRatePercent = 15): number | null {
  return grossMarginOf(item.priceH, item.costH, vatRatePercent);
}

export interface Category extends Timestamped {
  id: ID;
  nameAr: string;
  nameEn: string;
  /** Which kinds of item may belong to this category. */
  appliesTo: CatalogItemKind | 'both';
  /** Display order in the POS category rail. */
  sortOrder: number;
  status: RecordStatus;
}

export interface Vendor extends Timestamped {
  id: ID;
  nameAr: string;
  nameEn: string;
  contactPerson: string;
  phone: string;
  email: string;
  vatNumber: string;
  city: string;
  status: RecordStatus;
}

/** Staff member who can be assigned as a service provider. */
export interface StaffMember extends Timestamped {
  id: ID;
  nameAr: string;
  nameEn: string;
  role: string;
  status: RecordStatus;
}

/**
 * Write model. Kind-specific fields are optional here because the form only
 * sends the ones relevant to the selected kind; the service validates them.
 */
export interface CatalogItemInput {
  kind: CatalogItemKind;
  nameAr: string;
  nameEn: string;
  categoryId: ID | null;
  description: string;
  priceH: number;
  costH: number;
  showOnPos: boolean;
  requiresPreparation?: boolean;
  printGroupId?: ID | null;
  status: RecordStatus;

  /* Product only */
  sku?: string;
  barcode?: string;
  vendorId?: ID | null;
  unit?: UnitOfMeasure;
  trackInventory?: boolean;
  stockQuantity?: number;
  minStockLevel?: number;

  /* Service only */
  durationMinutes?: number | null;
  providerId?: ID | null;
}

/** Filters accepted by the catalog list endpoint. */
export interface CatalogFilters {
  kind?: CatalogItemKind | 'all';
  categoryId?: ID | 'all';
  status?: RecordStatus | 'all';
  stockLevel?: StockLevel | 'all';
}
