import type { ID, Timestamped } from './common';
import type { SaleLine } from './sales';

/**
 * A print group is a destination for part of an order.
 *
 * Deliberately generic: a restaurant calls them Kitchen and Bar, a laundry
 * calls them Washing and Ironing, a shop calls them Packing. Hard-coding
 * "kitchen" would make the whole product a restaurant POS, which it is not.
 */
export interface PrintGroup extends Timestamped {
  id: ID;
  nameAr: string;
  nameEn: string;
  /** Shown on the ticket header. Falls back to the name. */
  ticketTitle: string;
  sortOrder: number;
  status: 'active' | 'inactive';
}

export type DocumentKind = 'customer_receipt' | 'group_ticket';

/** One printable document produced from an order. */
export interface PrintDocument {
  id: string;
  kind: DocumentKind;
  /** Null for the customer receipt, which is not tied to a group. */
  groupId: ID | null;
  titleAr: string;
  titleEn: string;
  lines: SaleLine[];
}

/**
 * Split an order into everything that needs printing.
 *
 * The rule that matters: **the customer receipt always carries the whole
 * order; a group ticket carries only the lines assigned to that group.** Items
 * with no print group appear on the customer receipt and nowhere else.
 */
export function buildPrintDocuments(
  lines: SaleLine[],
  groups: PrintGroup[],
  itemGroupIds: Record<string, ID | null>,
): PrintDocument[] {
  const documents: PrintDocument[] = [
    {
      id: 'customer',
      kind: 'customer_receipt',
      groupId: null,
      titleAr: 'فاتورة العميل',
      titleEn: 'Customer bill',
      lines,
    },
  ];

  for (const group of groups) {
    if (group.status !== 'active') continue;

    const groupLines = lines.filter((line) => itemGroupIds[line.itemId] === group.id);
    /* A group with nothing in this order produces no ticket, and its button
       never appears — offering an empty print is a way to waste paper. */
    if (groupLines.length === 0) continue;

    documents.push({
      id: group.id,
      kind: 'group_ticket',
      groupId: group.id,
      titleAr: group.nameAr,
      titleEn: group.nameEn,
      lines: groupLines,
    });
  }

  return documents;
}

/** Which groups an order actually touches. Drives the print buttons. */
export function groupsInOrder(
  lines: SaleLine[],
  groups: PrintGroup[],
  itemGroupIds: Record<string, ID | null>,
): PrintGroup[] {
  const touched = new Set(
    lines.map((line) => itemGroupIds[line.itemId]).filter((id): id is ID => Boolean(id)),
  );
  return groups.filter((group) => touched.has(group.id) && group.status === 'active');
}
