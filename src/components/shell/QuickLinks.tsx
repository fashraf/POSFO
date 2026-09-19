import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChefHat,
  Command,
  FileText,
  PackagePlus,
  Plus,
  ShoppingCart,
  Tags,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Modal } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useSession } from '@/contexts/SessionContext';
import { useTranslation } from '@/i18n';
import { ROUTES } from '@/routes/paths';
import type { PermissionKey } from '@/types/permissions';
import type { TranslationKey } from '@/i18n';

interface QuickAction {
  id: string;
  to: string;
  labelKey: TranslationKey;
  hintKey: TranslationKey;
  icon: LucideIcon;
  /** Hidden unless the person holds this. */
  permission: PermissionKey;
}

const ACTIONS: QuickAction[] = [
  { id: 'sale', to: ROUTES.pos, labelKey: 'quickLinks.newSale', hintKey: 'quickLinks.newSaleHint', icon: ShoppingCart, permission: 'pos.view' },
  { id: 'product', to: ROUTES.catalog, labelKey: 'quickLinks.addProduct', hintKey: 'quickLinks.addProductHint', icon: Plus, permission: 'products.create' },
  { id: 'restock', to: ROUTES.restock, labelKey: 'quickLinks.restock', hintKey: 'quickLinks.restockHint', icon: PackagePlus, permission: 'inventory.purchase_entry' },
  { id: 'customer', to: ROUTES.customers, labelKey: 'quickLinks.addCustomer', hintKey: 'quickLinks.addCustomerHint', icon: UserPlus, permission: 'customers.create' },
  { id: 'discount', to: ROUTES.discountNew, labelKey: 'quickLinks.addDiscount', hintKey: 'quickLinks.addDiscountHint', icon: Tags, permission: 'discounts.create' },
  { id: 'user', to: ROUTES.userNew, labelKey: 'quickLinks.addUser', hintKey: 'quickLinks.addUserHint', icon: Users, permission: 'users.create' },
  { id: 'kitchen', to: ROUTES.kitchen, labelKey: 'quickLinks.kitchen', hintKey: 'quickLinks.kitchenHint', icon: ChefHat, permission: 'pos.view' },
  { id: 'bill', to: ROUTES.billBuilder, labelKey: 'quickLinks.billBuilder', hintKey: 'quickLinks.billBuilderHint', icon: FileText, permission: 'bill_builder.edit' },
];

export interface QuickLinksProps {
  open: boolean;
  onClose: () => void;
}

/**
 * A small command palette.
 *
 * Filtered by permission for the same reason the menu is: offering someone a
 * shortcut to a page they will be turned away from is worse than not offering
 * it at all.
 */
export function QuickLinks({ open, onClose }: QuickLinksProps) {
  const { t } = useTranslation();
  const { can } = useSession();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
    }
  }, [open]);

  const available = useMemo(() => ACTIONS.filter((action) => can(action.permission)), [can]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return available;
    return available.filter((action) =>
      `${t(action.labelKey)} ${t(action.hintKey)}`.toLocaleLowerCase().includes(needle),
    );
  }, [available, query, t]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  function go(action: QuickAction) {
    onClose();
    navigate(action.to);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, filtered.length - 1));
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    }
    if (event.key === 'Enter' && filtered[active]) {
      event.preventDefault();
      go(filtered[active]);
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="md" title={t('quickLinks.title')}>
      <div className="space-y-3" onKeyDown={onKeyDown}>
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('quickLinks.search')}
          className="w-full rounded-md border border-ink-200 bg-surface px-3 py-2 text-base text-ink-900 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/25"
        />

        {filtered.length === 0 ? (
          <p className="px-2 py-8 text-center text-sm text-ink-400">{t('quickLinks.noResults')}</p>
        ) : (
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {filtered.map((action, index) => {
              const Icon = action.icon;
              return (
                <li key={action.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(index)}
                    onClick={() => go(action)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-start transition-colors',
                      index === active ? 'bg-ink-100' : 'hover:bg-ink-50',
                    )}
                  >
                    <span
                      aria-hidden
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-600"
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink-900">
                        {t(action.labelKey)}
                      </span>
                      <span className="block truncate text-2xs text-ink-400">
                        {t(action.hintKey)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <p className="flex items-center gap-1.5 border-t border-dashed border-ink-200 pt-2 text-2xs text-ink-400">
          <Command aria-hidden className="h-3 w-3" />
          {t('quickLinks.hint')}
        </p>
      </div>
    </Modal>
  );
}
