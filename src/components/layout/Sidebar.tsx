import { NavLink, useLocation } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { visibleNavigation } from '@/config/navigation';
import { useSession } from '@/contexts/SessionContext';
import { useTranslation } from '@/i18n';
import { APP_VERSION } from '@/lib/version';
import { Brand } from './Brand';

export interface SidebarProps {
  /** Desktop: collapsed to an icon rail. */
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** Mobile: sheet is open. */
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({ collapsed, onToggleCollapsed, mobileOpen, onCloseMobile }: SidebarProps) {
  const { t, isRTL } = useTranslation();
  const { permissions } = useSession();
  const location = useLocation();
  const sections = visibleNavigation(permissions);

  const nav = (
    <nav aria-label={t('nav.mainNavigation')} className="flex-1 overflow-y-auto px-2 py-3">
      {sections.map((section, index) => (
        <div key={section.id} className={cn(index > 0 && 'mt-4')}>
          {section.labelKey && !collapsed && (
            <p className="px-2.5 pb-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-400">
              {t(section.labelKey)}
            </p>
          )}
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.id}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={onCloseMobile}
                    title={collapsed ? t(item.labelKey) : undefined}
                    className={({ isActive }) =>
                      cn(
                        'group flex items-center gap-3 rounded-md px-2.5 py-2 text-base font-medium transition-colors',
                        collapsed && 'justify-center px-0',
                        isActive
                          ? 'bg-brand-50 text-brand-700'
                          : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon
                          aria-hidden
                          className={cn(
                            'h-4.5 w-4.5 shrink-0',
                            isActive ? 'text-brand-600' : 'text-ink-400 group-hover:text-ink-600',
                          )}
                        />
                        {!collapsed && <span className="truncate">{t(item.labelKey)}</span>}
                      </>
                    )}
                  </NavLink>

              {/* Children appear only while their parent section is open, so
                  the sidebar does not carry eleven extra rows at all times. */}
              {item.children && location.pathname.startsWith(item.to) && !collapsed && (
                <ul className="ms-6 mt-0.5 space-y-0.5 border-s border-ink-200 ps-2">
                  {item.children.map((child) => (
                    <li key={child.id}>
                      <NavLink
                        to={child.to}
                        end={child.to === item.to}
                        className={({ isActive }) =>
                          cn(
                            'block rounded px-2 py-1 text-xs transition-colors',
                            isActive
                              ? 'font-medium text-brand-700'
                              : 'text-ink-500 hover:text-ink-800',
                          )
                        }
                      >
                        {t(child.labelKey)}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const footer = (
    <div className="border-t border-ink-200 px-3 py-3">
      <button
        type="button"
        onClick={onToggleCollapsed}
        aria-label={collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
        className={cn(
          'hidden w-full items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800 lg:flex',
          collapsed && 'justify-center px-0',
        )}
      >
        {collapsed ? (
          <PanelLeftOpen aria-hidden className="h-4.5 w-4.5 shrink-0 flip-rtl" />
        ) : (
          <>
            <PanelLeftClose aria-hidden className="h-4.5 w-4.5 shrink-0 flip-rtl" />
            <span className="truncate">{t('nav.collapseSidebar')}</span>
          </>
        )}
      </button>

      {!collapsed && (
        <p className="px-2.5 pt-2 text-2xs text-ink-400">
          {t('common.version')} <span className="numeric">{APP_VERSION}</span>
        </p>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop rail — always mounted, width driven by `collapsed`. */}
      <aside
        className={cn(
          'sticky top-0 hidden h-svh shrink-0 flex-col border-e border-ink-200 bg-surface transition-[width] duration-200 lg:flex',
          collapsed ? 'w-[4.5rem]' : 'w-[15.5rem]',
        )}
      >
        <div
          className={cn(
            'flex h-12 shrink-0 items-center border-b border-ink-200 px-3',
            collapsed && 'justify-center px-0',
          )}
        >
          <Brand compact={collapsed} />
        </div>
        {nav}
        {footer}
      </aside>

      {/* Mobile sheet. */}
      {mobileOpen && (
        <div className="fixed inset-0 z-sidebar lg:hidden">
          <div
            aria-hidden
            onClick={onCloseMobile}
            className="absolute inset-0 animate-fade-in bg-ink-900/35"
          />
          <aside
            className="relative flex h-full w-[16.5rem] flex-col border-e border-ink-200 bg-surface shadow-overlay animate-slide-in-end"
            style={{ ['--slide-from' as string]: isRTL ? '100%' : '-100%' }}
          >
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-ink-200 px-4">
              <Brand />
              <button
                type="button"
                onClick={onCloseMobile}
                aria-label={t('nav.closeMenu')}
                className="-me-1 rounded p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
              >
                <X aria-hidden className="h-4 w-4" />
              </button>
            </div>
            {nav}
            <div className="border-t border-ink-200 px-5 py-3">
              <p className="text-2xs text-ink-400">
                {t('common.version')} <span className="numeric">{APP_VERSION}</span>
              </p>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
