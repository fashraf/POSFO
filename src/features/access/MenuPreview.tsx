import { Eye } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useTranslation } from '@/i18n';
import { visibleNavigation } from '@/config/navigation';
import type { PermissionKey } from '@/types/permissions';

export interface MenuPreviewProps {
  permissions: PermissionKey[];
  className?: string;
}

/**
 * What this user's sidebar will actually look like.
 *
 * Reading a permission list and picturing the resulting menu is hard; showing
 * the menu is not. This renders from the same `visibleNavigation` the real
 * sidebar uses, so it cannot show something the user would not get.
 */
export function MenuPreview({ permissions, className }: MenuPreviewProps) {
  const { t } = useTranslation();
  const sections = visibleNavigation(permissions);

  return (
    <div className={cn('rounded-md border border-ink-200 bg-surface', className)}>
      <header className="flex items-center gap-2 border-b border-dashed border-ink-200 px-3.5 py-2.5">
        <Eye aria-hidden className="h-3.5 w-3.5 text-ink-400" />
        <h3 className="text-sm font-medium text-ink-800">{t('users.menuPreview')}</h3>
      </header>

      {sections.length === 0 ? (
        <p className="px-3.5 py-6 text-center text-sm text-ink-400">
          {t('users.menuPreviewEmpty')}
        </p>
      ) : (
        <div className="space-y-3 p-3">
          {sections.map((section) => (
            <div key={section.id}>
              {section.labelKey && (
                <p className="px-2 pb-1 text-2xs font-semibold uppercase tracking-wider text-ink-400">
                  {t(section.labelKey)}
                </p>
              )}
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li
                      key={item.id}
                      className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-ink-700"
                    >
                      <Icon aria-hidden className="h-4 w-4 shrink-0 text-ink-400" />
                      {t(item.labelKey)}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      <p className="border-t border-dashed border-ink-200 px-3.5 py-2 text-xs text-ink-400">
        {t('users.menuPreviewHint')}
      </p>
    </div>
  );
}
