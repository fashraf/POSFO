import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScanLine } from 'lucide-react';
import { Input } from '@/components/ui';
import { CartPanel } from '@/features/pos/CartPanel';
import { ApprovalModal } from '@/features/pos/ApprovalModal';
import { CheckoutModal, type CheckoutResult } from '@/features/pos/CheckoutModal';
import { OrderComplete } from '@/features/pos/OrderComplete';
import { CategoryScroller } from '@/features/pos/CategoryScroller';
import { ProductGrid } from '@/features/pos/ProductGrid';
import { usePosCart } from '@/features/pos/usePosCart';
import { useDisclosure } from '@/hooks/useDisclosure';
import { useToast } from '@/contexts/ToastContext';
import { useI18n, useTranslation } from '@/i18n';
import { ROUTES } from '@/routes/paths';
import {
  branchStaffService,
  catalogService,
  categoryService,
  customerService,
  discountService,
  printGroupService,
  printService,
  settingsService,
  safeCall,
  salesService,
  HttpError,
  type BranchStaff,
} from '@/services';
import { isProduct } from '@/types/catalog';
import type { CatalogItem, Category } from '@/types/catalog';
import type { Customer, Sale, SalePayment } from '@/types/sales';
import { buildPrintDocuments, groupsInOrder } from '@/types/printing';
import type { PrintGroup } from '@/types/printing';
import type { BranchSettings } from '@/types/settings';
import { NO_APPROVAL, resolveAutomatic } from '@/types/discounts';
import type { DiscountApproval, DiscountableLine } from '@/types/discounts';
import type { ResolvedDiscount } from '@/services';
import { useSession } from '@/contexts/SessionContext';

/** Match against name, SKU, and barcode — whatever the cashier types or scans. */
function itemMatches(item: CatalogItem, term: string): boolean {
  const needle = term.trim().toLocaleLowerCase();
  if (!needle) return true;

  const fields = [item.nameAr, item.nameEn];
  if (isProduct(item)) fields.push(item.sku, item.barcode);

  return fields.some((field) => field?.toLocaleLowerCase().includes(needle));
}

export default function PosPage() {
  const { t } = useTranslation();
  const { language } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();

  const { user, role, activeBranch, can } = useSession();
  /* Who is at the till, for the receipt and any approval they give. */
  const signedInName =
    (language === 'ar' ? user?.nameAr : user?.nameEn) || user?.nameEn || user?.username || '';
  const cart = usePosCart();
  const payment = useDisclosure();
  const scanRef = useRef<HTMLInputElement>(null);

  const [items, setItems] = useState<CatalogItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);
  const [completedChangeH, setCompletedChangeH] = useState(0);
  const [sentToKitchen, setSentToKitchen] = useState(false);
  const [printGroups, setPrintGroups] = useState<PrintGroup[]>([]);
  const [settings, setSettings] = useState<BranchSettings | null>(null);
  const [staff, setStaff] = useState<BranchStaff[]>([]);
  const [completedLines, setCompletedLines] = useState<typeof cart.lines>([]);
  const [discounts, setDiscounts] = useState<ResolvedDiscount[]>([]);
  const [approval, setApproval] = useState<DiscountApproval>(NO_APPROVAL);
  const [discountCapped, setDiscountCapped] = useState(false);
  /* Who approved the applied discount, sent with the sale. The password is
     present only when a manager approved on the cashier's screen. */
  const [approvalBy, setApprovalBy] = useState<{ userId: string; password: string | null } | null>(
    null,
  );
  const [approving, setApproving] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);

    const [itemResult, categoryResult, customerResult, printGroupResult, staffResult] =
      await Promise.all([
      safeCall(() => catalogService.posItems()),
      safeCall(() => categoryService.list()),
      safeCall(() => customerService.list()),
      safeCall(() => printGroupService.list()),
      safeCall(() => branchStaffService.list(activeBranch?.id ?? null)),
    ]);

    if (itemResult.ok) setItems(itemResult.data);
    if (categoryResult.ok) setCategories(categoryResult.data);
    if (customerResult.ok) setCustomers(customerResult.data);
    if (printGroupResult.ok) setPrintGroups(printGroupResult.data);
    if (staffResult.ok) setStaff(staffResult.data);

    if (activeBranch) {
      const settingsResult = await safeCall(() => settingsService.get(activeBranch.id));
      if (settingsResult.ok) setSettings(settingsResult.data);
    }

    setLoading(false);
  }, [activeBranch]);

  useEffect(() => {
    void load();
  }, [load]);

  /* Keep focus in the scan field: a hardware scanner is a keyboard, and it types
     wherever the caret happens to be. */
  useEffect(() => {
    if (payment.isOpen) return;
    scanRef.current?.focus();
  }, [payment.isOpen, items.length]);

  /* The basket, reduced to what a discount rule needs to reason about. */
  const discountableLines: DiscountableLine[] = useMemo(
    () =>
      cart.lines.map((line) => {
        const item = items.find((candidate) => candidate.id === line.itemId);
        return {
          itemId: line.itemId,
          categoryId: item?.categoryId ?? null,
          kind: line.kind,
          grossH: line.unitPriceH * line.quantity - line.discountH,
        };
      }),
    [cart.lines, items],
  );

  const basketGrossH = cart.totals.grossH;

  /* Re-resolve on every basket change: eligibility depends on what is in it, so
     a discount can become available part-way through a sale. */
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const result = await safeCall<ResolvedDiscount[]>(() =>
        discountService.resolveForCart({
          lines: discountableLines,
          basketTotalH: basketGrossH,
          roleId: role?.id ?? null,
          branchId: activeBranch?.id ?? null,
        }),
      );
      if (cancelled || !result.ok) return;
      setDiscounts(result.data);

      /* Automatic discounts apply themselves. The cashier is told which one
         and why, but is never asked to remember it exists. */
      const auto = resolveAutomatic(result.data);
      if (auto && cart.discountId !== auto.discount.id) {
        const manualChosen =
          cart.discountId !== null &&
          result.data.find((entry) => entry.discount.id === cart.discountId)?.discount
            .isAutomatic === false;

        /* A manual choice outranks an automatic one — the cashier made a
           deliberate decision and should not have it overwritten. */
        if (!manualChosen) {
          cart.setDiscount(auto.eligibility.amountH, auto.discount.id);
          setDiscountCapped(auto.eligibility.capped);
          setApproval(
            auto.eligibility.requiresApproval ? { ...NO_APPROVAL, state: 'pending' } : NO_APPROVAL,
          );
          setApprovalBy(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [discountableLines, basketGrossH, role?.id, activeBranch?.id]);

  /**
   * Keep the applied amount honest as the basket changes.
   *
   * If the selected discount stops qualifying — an item was removed and the
   * basket dropped below the minimum — it is cleared rather than silently
   * left applied at a stale amount. Any approval is voided at the same time,
   * because it was granted for a different number.
   */
  useEffect(() => {
    if (!cart.discountId) return;

    const entry = discounts.find((candidate) => candidate.discount.id === cart.discountId);

    if (!entry || !entry.eligibility.eligible) {
      cart.setDiscount(0, null);
      setApproval(NO_APPROVAL);
      setApprovalBy(null);
      setDiscountCapped(false);
      return;
    }

    if (entry.eligibility.amountH !== cart.discountH) {
      cart.setDiscount(entry.eligibility.amountH, cart.discountId);
      setDiscountCapped(entry.eligibility.capped);
      /* The approved figure no longer matches, so approval must be sought again. */
      if (approval.state === 'approved') {
        setApproval({ ...NO_APPROVAL, state: 'pending' });
        setApprovalBy(null);
      }
    }
  }, [discounts, cart.discountId, cart.discountH, cart, approval.state]);

  /* Only categories that actually hold sellable items get a pill — an empty
     filter is a dead end the cashier has to back out of. */
  const categoryOptions = useMemo(() => {
    const used = new Set(items.map((item) => item.categoryId).filter(Boolean));

    return [
      { value: '', label: t('pos.allItems') },
      { value: 'products', label: t('pos.productsOnly') },
      { value: 'services', label: t('pos.servicesOnly') },
      ...categories
        .filter((category) => used.has(category.id))
        .map((category) => ({
          value: category.id,
          label: language === 'ar' ? category.nameAr : category.nameEn,
        })),
    ];
  }, [items, categories, language, t]);

  const visibleItems = useMemo(() => {
    return items.filter((item) => {
      if (!itemMatches(item, search)) return false;
      if (filter === '') return true;
      if (filter === 'products') return item.kind === 'product';
      if (filter === 'services') return item.kind === 'service';
      return item.categoryId === filter;
    });
  }, [items, search, filter]);

  function addItem(item: CatalogItem) {
    /* Refuse to oversell a tracked product rather than letting the cart go
       negative and failing at commit time. */
    if (isProduct(item) && item.trackInventory) {
      if (cart.quantityOf(item.id) >= item.stockQuantity) {
        toast.warning(t('pos.toast.maxStock'));
        return;
      }
    }
    cart.add(item);
  }

  /**
   * A scanner ends its transmission with Enter. An exact barcode match adds the
   * item straight away and clears the field, so scanning ten items is ten scans
   * and nothing else.
   */
  function handleScanSubmit(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();

    const term = search.trim();
    if (!term) return;

    const exact = items.find(
      (item) => isProduct(item) && (item.barcode === term || item.sku === term),
    );
    const target = exact ?? (visibleItems.length === 1 ? visibleItems[0] : null);

    if (target) {
      addItem(target);
      setSearch('');
    }
  }

  /**
   * Commit the sale.
   *
   * The sale, its stock movement, the kitchen ticket and the discount usage
   * happen together inside the one commit call on the server. A balance
   * settlement follows as its own collection.
   */
  async function handleCheckout(result: CheckoutResult): Promise<boolean> {
    const payments: SalePayment[] = [];
    if (result.cardH > 0) payments.push({ method: 'card', amountH: result.cardH });
    if (result.cashH > 0) payments.push({ method: 'cash', amountH: result.cashH });
    if (result.creditH > 0) payments.push({ method: 'credit', amountH: result.creditH });

    const saleResult = await safeCall(() =>
      salesService.commit({
        lines: cart.lines,
        payments: payments.length > 0 ? payments : [{ method: 'cash', amountH: cart.totals.totalH }],
        customerId: cart.customerId,
        servedByUserId: result.servedByUserId,
        discountH: cart.discountH,
        discountId: cart.discountId,
        tenderedH: result.tenderedH,
        approvedByUserId: approval.state === 'approved' ? (approvalBy?.userId ?? null) : null,
        approverPassword: approval.state === 'approved' ? (approvalBy?.password ?? null) : null,
        orderType: result.orderType,
        cashierName: signedInName,
        branchId: activeBranch?.id ?? null,
      }),
    );

    if (!saleResult.ok) {
      /* The server is the judge of an approval. When it refuses one, the
         discount goes back to waiting and the cashier is told why. */
      const code = saleResult.error instanceof HttpError ? saleResult.error.code : '';
      if (
        code === 'discount_approval_required' ||
        code === 'approver_not_allowed' ||
        code === 'approval_invalid'
      ) {
        setApproval({ ...NO_APPROVAL, state: 'pending' });
        setApprovalBy(null);
        setApprovalError(saleResult.error.message);
        payment.close();
      }
      toast.error(t('pos.toast.failed'), saleResult.error.message);
      return false;
    }

    const sale = saleResult.data;

    /* Discount usage is counted by the commit itself, from the discountId
       sent above — counting it here as well would double it. */

    /* Settling an existing balance is a separate collection, not part of the
       sale — it must land on the customer statement as its own line. */
    if (result.settleH > 0 && cart.customerId) {
      await safeCall(() =>
        customerService.recordPayment({
          customerId: cart.customerId!,
          amountH: result.settleH,
          method: result.cardH > 0 ? 'card' : 'cash',
          note: `Settled with ${sale.invoiceNumber}`,
          receivedBy: signedInName,
        }),
      );
    }

    /* Only lines flagged as needing preparation reach the kitchen board. The
       server raises the ticket inside the commit, so this only decides
       whether to tell the cashier it went. */
    const sentLines = cart.lines.filter((line) => {
      const item = items.find((candidate) => candidate.id === line.itemId);
      return item?.requiresPreparation === true;
    });

    setCompletedLines(cart.lines);
    setCompletedSale(sale);
    setCompletedChangeH(result.changeH);
    setSentToKitchen(sentLines.length > 0);
    payment.close();
    toast.success(t('pos.toast.completed', { invoice: sale.invoiceNumber }));

    await load();
    return true;
  }

  function selectDiscount(discountId: string | null) {
    setApprovalBy(null);
    setApprovalError(null);
    if (!discountId) {
      cart.setDiscount(0, null);
      setApproval(NO_APPROVAL);
      setDiscountCapped(false);
      return;
    }

    const entry = discounts.find((candidate) => candidate.discount.id === discountId);
    if (!entry || !entry.eligibility.eligible) return;

    cart.setDiscount(entry.eligibility.amountH, discountId);
    setDiscountCapped(entry.eligibility.capped);
    setApproval(
      entry.eligibility.requiresApproval
        ? { ...NO_APPROVAL, state: 'pending' }
        : NO_APPROVAL,
    );
  }

  /**
   * Approve a discount above its threshold.
   *
   * A cashier holding discounts.approve approves it themself. Anyone else
   * hands the screen to a manager, who names themself and types their
   * password; the server checks both when the sale is committed.
   */
  const [pendingReason, setPendingReason] = useState('');

  function markApproved(approverName: string, reason: string) {
    const now = new Date().toISOString();
    setApproval({
      state: 'approved',
      approverName,
      reason,
      requestedAt: now,
      decidedAt: now,
    });
    toast.success(t('posDiscount.approval.approvedBy', { name: approverName }));
  }

  function requestApproval(reason: string) {
    if (can('discounts.approve') && user) {
      setApprovalBy({ userId: user.id, password: null });
      setApprovalError(null);
      markApproved(signedInName, reason);
      return;
    }

    setPendingReason(reason);
    setApproving(true);
  }

  function approveByManager(approver: { userId: string; name: string; password: string }) {
    setApprovalBy({ userId: approver.userId, password: approver.password });
    setApprovalError(null);
    setApproving(false);
    markApproved(approver.name, pendingReason);
  }

  /** Item id -> print group, so the split can be computed without the catalog. */
  const itemGroupIds = useMemo(
    () =>
      Object.fromEntries(items.map((item) => [item.id, item.printGroupId ?? null])) as Record<
        string,
        string | null
      >,
    [items],
  );

  const orderGroups = useMemo(
    () => groupsInOrder(completedLines, printGroups, itemGroupIds),
    [completedLines, printGroups, itemGroupIds],
  );

  async function printDocument(documentId: string) {
    const documents = buildPrintDocuments(completedLines, printGroups, itemGroupIds);
    const target = documents.find((document) => document.id === documentId);
    if (!target) return;
    await printService.print(target.id);
  }

  async function printEverything() {
    const documents = buildPrintDocuments(completedLines, printGroups, itemGroupIds);
    /* Sequential: each document is a separate physical print job, and firing
       them together would interleave on a single-roll printer. */
    for (const document of documents) {
      await printService.print(document.id);
    }
  }

  function startNewSale() {
    cart.clear();
    setApproval(NO_APPROVAL);
    setApprovalBy(null);
    setApprovalError(null);
    setDiscountCapped(false);
    setCompletedSale(null);
    setCompletedChangeH(0);
    setCompletedLines([]);
    setSentToKitchen(false);
    payment.close();
    setSearch('');
  }

  /* Fills the shell exactly: header (3rem) plus page padding (1.5rem). No page
     scrolling — only the product grid and the cart scroll, internally. */
  return (
    <div className="flex h-[calc(100svh-4.5rem)] min-h-[34rem] flex-col gap-2">
      {/* Scan bar and today's running totals */}
      {/* Search and categories share one row: search takes 5 of 12 columns,
          the rail takes the rest and scrolls. Stacking them cost a whole row
          of product grid for no benefit. */}
      <header className="grid shrink-0 grid-cols-12 items-center gap-2">
        <div className="col-span-12 sm:col-span-5">
          <Input
            ref={scanRef}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={handleScanSubmit}
            placeholder={t('pos.scanPlaceholder')}
            aria-label={t('pos.scanPlaceholder')}
            leadingAddon={<ScanLine aria-hidden />}
            autoComplete="off"
          />
        </div>

        <div className="col-span-12 min-w-0 sm:col-span-7">
          <CategoryScroller options={categoryOptions} value={filter} onChange={setFilter} />
        </div>
      </header>

      {/* Grid + cart. The cart is a fixed rail on desktop and stacks below on
          narrow screens, where the whole page scrolls instead. */}
      <div className="grid min-h-0 flex-1 gap-2 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
        <ProductGrid
          items={visibleItems}
          loading={loading}
          searching={search.trim() !== ''}
          quantityOf={cart.quantityOf}
          onSelect={addItem}
          onOpenCatalog={() => navigate(ROUTES.catalog)}
        />

        <div className="min-h-0 lg:h-full">
          <CartPanel
            cart={cart}
            onCheckout={payment.open}
            discounts={discounts}
            selectedDiscountId={cart.discountId}
            onSelectDiscount={selectDiscount}
            discountApproval={approval}
            onRequestApproval={requestApproval}
            discountCapped={discountCapped}
            checkoutBlocked={approval.state === 'pending'}
          />
        </div>
      </div>

      <CheckoutModal
        open={payment.isOpen}
        onClose={payment.close}
        lines={cart.lines}
        totals={cart.totals}
        customers={customers}
        customerId={cart.customerId}
        onCustomerChange={cart.setCustomer}
        settings={settings}
        staff={staff}
        askOrderType={cart.lines.some(
          (line) => items.find((item) => item.id === line.itemId)?.requiresPreparation === true,
        )}
        appliedDiscount={
          discounts.find((entry) => entry.discount.id === cart.discountId)?.discount ?? null
        }
        onConfirm={handleCheckout}
      />

      <ApprovalModal
        open={approving}
        onClose={() => setApproving(false)}
        staff={staff.filter((member) => member.id !== user?.id)}
        error={approvalError}
        onApprove={approveByManager}
      />

      <OrderComplete
        open={Boolean(completedSale)}
        sale={completedSale}
        discount={
          discounts.find((entry) => entry.discount.id === cart.discountId)?.discount ?? null
        }
        changeH={completedChangeH}
        sentToKitchen={sentToKitchen}
        printGroups={orderGroups}
        onPrint={(id) => void printDocument(id)}
        onPrintAll={() => void printEverything()}
        onView={() => navigate(ROUTES.sales)}
        onNewSale={startNewSale}
      />
    </div>
  );
}
