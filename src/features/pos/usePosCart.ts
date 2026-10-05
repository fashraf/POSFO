import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
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
  | { type: 'reprice'; prices: Record<string, number> }
  | { type: 'replace'; state: CartState }
  | { type: 'clear' };

export const EMPTY_CART: CartState = { lines: [], discountH: 0, discountId: null, customerId: null };
const EMPTY = EMPTY_CART;

/*
 * The cart survives leaving the page.
 *
 * Kept in this browser's localStorage, per user and branch, so walking away
 * to look something up — or a reload — does not lose a half-rung sale. It is
 * a convenience on this device only: nothing here is sent anywhere, and the
 * server re-prices everything at commit. Every read and write is guarded,
 * because storage can be full, blocked or absent (private windows).
 */
const CART_STORAGE_PREFIX = 'nazad.pos.cart.v1';

export function cartStorageKey(userId: string | null | undefined, branchId: string | null | undefined) {
  return userId ? `${CART_STORAGE_PREFIX}:${userId}:${branchId ?? 'none'}` : null;
}

/** A stored cart, or an empty one if there is none or it does not parse. */
export function readStoredCart(key: string | null): CartState {
  if (!key) return EMPTY;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<CartState>;
    if (!Array.isArray(parsed.lines)) return EMPTY;
    return {
      lines: parsed.lines.filter(
        (line): line is SaleLine =>
          typeof line?.itemId === 'string' && typeof line?.quantity === 'number' && line.quantity > 0,
      ),
      discountH: typeof parsed.discountH === 'number' ? parsed.discountH : 0,
      discountId: typeof parsed.discountId === 'string' ? parsed.discountId : null,
      customerId: typeof parsed.customerId === 'string' ? parsed.customerId : null,
    };
  } catch {
    return EMPTY;
  }
}

function writeStoredCart(key: string | null, state: CartState) {
  if (!key) return;
  try {
    if (state.lines.length === 0) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(state));
  } catch {
    /* Storage full or blocked: the cart still works, it just will not
       survive leaving the page. */
  }
}

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

    /* The catalog is the price list. A cart restored from storage, or held
       for a while, may carry yesterday's price; the server would refuse it
       (price_mismatch), so lines are brought to the current price instead. */
    case 'reprice': {
      let changed = false;
      const lines = state.lines.map((line) => {
        const price = action.prices[line.itemId];
        if (price === undefined || price === line.unitPriceH) return line;
        changed = true;
        return { ...line, unitPriceH: price };
      });
      return changed ? { ...state, lines } : state;
    }

    case 'replace':
      return action.state;

    case 'clear':
      return EMPTY;

    default:
      return state;
  }
}

/**
 * @param storageKey where this user's cart for this branch is kept (see
 *   cartStorageKey); null keeps it in memory only.
 */
export function usePosCart(storageKey: string | null = null) {
  const [state, dispatch] = useReducer(reducer, storageKey, readStoredCart);

  /* Which key the state in memory belongs to. When the branch (or user)
     changes, that branch's cart is loaded rather than this one being written
     over it. */
  const loadedKey = useRef(storageKey);
  useEffect(() => {
    if (loadedKey.current !== storageKey) {
      loadedKey.current = storageKey;
      dispatch({ type: 'replace', state: readStoredCart(storageKey) });
      return;
    }
    writeStoredCart(storageKey, state);
  }, [state, storageKey]);

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
  const reprice = useCallback(
    (prices: Record<string, number>) => dispatch({ type: 'reprice', prices }),
    [],
  );
  const replace = useCallback((next: CartState) => dispatch({ type: 'replace', state: next }), []);

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
    reprice,
    replace,
    /** The cart as stored, for holding it. */
    snapshot: state,
    quantityOf,
  };
}

export type PosCart = ReturnType<typeof usePosCart>;
