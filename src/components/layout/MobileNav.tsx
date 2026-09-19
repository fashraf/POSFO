import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { visibleNavigation } from '@/config/navigation';
import { useSession } from '@/contexts/SessionContext';
import { useTranslation } from '@/i18n';

/**
 * Bottom bar for small screens. Only renders when there are enough
 * destinations to be worth the vertical space, and caps at five so the
 * targets stay large enough to hit.
 */
export function MobileNav() {
  const { t } = useTranslation();
  const { permissions } = useSession();
  const NAV_ITEMS = visibleNavigation(permissions).flatMap((section) => section.items);

  if (NAV_ITEMS.length < 2) return null;
  const items = NAV_ITEMS.slice(0, 5);

  return (
    <nav
      aria-label={t('nav.mainNavigation')}
      className="sticky bottom-0 z-header border-t border-ink-200 bg-surface/95 backdrop-blur-md sm:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="flex items-stretch">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.id} className="flex-1">
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'flex flex-col items-center gap-1 px-1 py-2.5 text-2xs font-medium transition-colors',
                    isActive ? 'text-brand-700' : 'text-ink-500',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      aria-hidden
                      className={cn('h-5 w-5', isActive ? 'text-brand-600' : 'text-ink-400')}
                    />
                    <span className="truncate">{t(item.labelKey)}</span>
                  </>
                )}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
