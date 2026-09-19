import { useCallback, useMemo, useReducer } from 'react';
import { computeTotals, type SaleLine } from '@/types/sales';
import type { CatalogItem } from '@/types/catalog';
import { isProduct } from '@/types/catalog';

/**
 * Cart state lives in a reducer rather than scattered useState calls, because
 * every rule about what a cart may contain then has exactly one home. Adding a
 * rule later means adding a case here, not auditing six components.
 */

export interface CartState {
  lines: SaleLine[];
  /**
   * Invoice-level discount in halalas. Always derived from a configured
   * discount — the cashier never types this value.
   */
  discountH: number;
  /** Which configured discount produced `discountH`. */
  discountId: string | null;
  customerId: string | null;
}

export type CartAction =
  | { type: 'add'; item: CatalogItem }
  | { type: 'setQuantity'; lineId: string; quantity: number }
  | { type: 'increment'; lineId: string }
  | { type: 'decrement'; lineId: string }
  | { type: 'remove'; lineId: string }
  | { type: 'setLineDiscount'; lineId: string; discountH: number }
  | { type: 'setDiscount'; discountH: number; discountId: string | null }
  | { type: 'setCustomer'; customerId: string | null }
  | { type: 'clear' };

const EMPTY: CartState = { lines: [], discountH: 0, discountId: null, customerId: null };

/** Ceiling on a line's quantity: stock on hand, or unlimited when untracked. */
function maxQuantityFor(item: CatalogItem): number {
  if (isProduct(item) && item.trackInventory) return item.stockQuantity;
  return Number.POSITIVE_INFINITY;
}

function reducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'add': {
      const { item } = action;
      const existing = state.lines.find((line) => line.itemId === item.id);

      /* Scanning the same barcode twice bumps the quantity — it does not create
         a second line, which would be confusing on the receipt. */
      if (existing) {
        const ceiling = maxQuantityFor(item);
        if (existing.quantity >= ceiling) return state;

        return {
          ...state,
          lines: state.lines.map((line) =>
            line.id === existing.id ? { ...line, quantity: line.quantity + 1 } : line,
          ),
        };
      }

      const line: SaleLine = {
        id: `line_${item.id}_${Date.now().toString(36)}`,
        itemId: item.id,
        kind: item.kind,
        nameAr: item.nameAr,
        nameEn: item.nameEn,
        quantity: 1,
        unitPriceH: item.priceH,
        unitCostH: item.costH,
        discountH: 0,
      };

      /* Newest line first: the cashier watches the top of the list. */
      return { ...state, lines: [line, ...state.lines] };
    }

    case 'setQuantity': {
      const quantity = Math.max(0, Math.floor(action.quantity));
      if (quantity === 0) {
        return { ...state, lines: state.lines.filter((line) => line.id !== action.lineId) };
      }
      return {
        ...state,
        lines: state.lines.map((line) =>
          line.id === action.lineId ? { ...line, quantity } : line,
        ),
      };
    }

    case 'increment':
      return {
        ...state,
        lines: state.lines.map((line) =>
          line.id === action.lineId ? { ...line, quantity: line.quantity + 1 } : line,
        ),
      };

    case 'decrement': {
      const target = state.lines.find((line) => line.id === action.lineId);
      if (!target) return state;
      if (target.quantity <= 1) {
        return { ...state, lines: state.lines.filter((line) => line.id !== action.lineId) };
      }
      return {
        ...state,
        lines: state.lines.map((line) =>
          line.id === action.lineId ? { ...line, quantity: line.quantity - 1 } : line,
        ),
      };
    }

    case 'remove':
      return { ...state, lines: state.lines.filter((line) => line.id !== action.lineId) };

    case 'setLineDiscount':
      return {
        ...state,
        lines: state.lines.map((line) =>
          line.id === action.lineId
            ? { ...line, discountH: Math.max(0, action.discountH) }
            : line,
        ),
      };

    case 'setDiscount':
      return {
        ...state,
        discountH: Math.max(0, action.discountH),
        discountId: action.discountId,
      };

    case 'setCustomer':
      return { ...state, customerId: action.customerId };

    case 'clear':
      return EMPTY;

    default:
      return state;
  }
}

export function usePosCart() {
  const [state, dispatch] = useReducer(reducer, EMPTY);

  const totals = useMemo(
    () => computeTotals(state.lines, state.discountH),
    [state.lines, state.discountH],
  );

  const add = useCallback((item: CatalogItem) => dispatch({ type: 'add', item }), []);
  const increment = useCallback((lineId: string) => dispatch({ type: 'increment', lineId }), []);
  const decrement = useCallback((lineId: string) => dispatch({ type: 'decrement', lineId }), []);
  const remove = useCallback((lineId: string) => dispatch({ type: 'remove', lineId }), []);
  const setQuantity = useCallback(
    (lineId: string, quantity: number) => dispatch({ type: 'setQuantity', lineId, quantity }),
    [],
  );
  const setDiscount = useCallback(
    (discountH: number, discountId: string | null) =>
      dispatch({ type: 'setDiscount', discountH, discountId }),
    [],
  );
  const setCustomer = useCallback(
    (customerId: string | null) => dispatch({ type: 'setCustomer', customerId }),
    [],
  );
  const clear = useCallback(() => dispatch({ type: 'clear' }), []);

  /** Quantity already in the cart for an item, so the grid can show a count. */
  const quantityOf = useCallback(
    (itemId: string) => state.lines.find((line) => line.itemId === itemId)?.quantity ?? 0,
    [state.lines],
  );

  return {
    ...state,
    totals,
    isEmpty: state.lines.length === 0,
    add,
    increment,
    decrement,
    remove,
    setQuantity,
    setDiscount,
    setCustomer,
    clear,
    quantityOf,
  };
}

export type PosCart = ReturnType<typeof usePosCart>;
