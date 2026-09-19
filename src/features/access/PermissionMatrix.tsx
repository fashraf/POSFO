import { useMemo } from 'react';
import { Lock, Minus, ShieldAlert } from 'lucide-react';
import { Alert, Badge, Checkbox } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useTranslation } from '@/i18n';
import {
  ALL_PERMISSIONS,
  EXTERNAL_FORBIDDEN,
  MODULE_ORDER,
  permissionsFor,
} from '@/types/permissions';
import type { PermissionKey, PermissionModule } from '@/types/permissions';

export interface PermissionMatrixProps {
  selected: PermissionKey[];
  onChange: (permissions: PermissionKey[]) => void;
  /** Locks every checkbox — used for the owner role. */
  readOnly?: boolean;
  /** Disables and marks anything exposing money or personal data. */
  external?: boolean;
}

/**
 * The permission matrix.
 *
 * Grouped by module, with a select-all per module and one for everything. The
 * per-module control is tri-state: a partial selection shows a dash rather than
 * a tick, so it never claims more than is actually granted.
 */
export function PermissionMatrix({
  selected,
  onChange,
  readOnly = false,
  external = false,
}: PermissionMatrixProps) {
  const { t } = useTranslation();

  const allowed = useMemo(
    () =>
      external ? ALL_PERMISSIONS.filter((key) => !EXTERNAL_FORBIDDEN.includes(key)) : ALL_PERMISSIONS,
    [external],
  );

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const allSelected = allowed.every((key) => selectedSet.has(key));

  function toggle(key: PermissionKey, checked: boolean) {
    onChange(checked ? [...selected, key] : selected.filter((entry) => entry !== key));
  }

  function toggleModule(module: PermissionModule, checked: boolean) {
    const keys = permissionsFor(module)
      .map((permission) => permission.key)
      .filter((key) => allowed.includes(key));

    onChange(
      checked
        ? Array.from(new Set([...selected, ...keys]))
        : selected.filter((key) => !keys.includes(key)),
    );
  }

  return (
    <div className="space-y-4">
      {external && (
        <Alert tone="info" icon={<ShieldAlert className="h-4 w-4" />} compact>
          {t('roles.externalHint')}
        </Alert>
      )}

      {/* Select everything */}
      <div className="flex items-center justify-between gap-3 rounded-md border border-ink-200 bg-ink-50/60 px-3.5 py-2.5">
        <Checkbox
          checked={allSelected}
          disabled={readOnly}
          onChange={(event) => onChange(event.target.checked ? [...allowed] : [])}
          label={<span className="font-medium">{t('roles.selectAllPermissions')}</span>}
        />
        <Badge tone={allSelected ? 'brand' : 'neutral'}>
          {t('roles.permissionCount', { count: selected.length, total: allowed.length })}
        </Badge>
      </div>

      {MODULE_ORDER.map((module) => {
        const permissions = permissionsFor(module);
        const usable = permissions.filter((permission) => allowed.includes(permission.key));
        const checkedCount = usable.filter((permission) =>
          selectedSet.has(permission.key),
        ).length;

        const moduleAll = usable.length > 0 && checkedCount === usable.length;
        const modulePartial = checkedCount > 0 && !moduleAll;

        return (
          <fieldset
            key={module}
            className="overflow-hidden rounded-md border border-ink-200 bg-surface"
          >
            <legend className="sr-only">{t(`modules.${module}`)}</legend>

            <div className="flex items-center justify-between gap-3 border-b border-dashed border-ink-200 bg-ink-50/40 px-3.5 py-2.5">
              <label className="flex cursor-pointer items-center gap-2.5">
                <span className="relative flex items-center">
                  <Checkbox
                    checked={moduleAll}
                    disabled={readOnly}
                    onChange={(event) => toggleModule(module, event.target.checked)}
                    aria-label={t('roles.selectAllIn', { module: t(`modules.${module}`) })}
                  />
                  {/* Partial selections show a dash, not a tick — a tick here
                      would claim the whole module is granted. */}
                  {modulePartial && (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-sm bg-brand-600"
                    >
                      <Minus className="h-3 w-3 text-white" strokeWidth={3} />
                    </span>
                  )}
                </span>
                <span className="text-base font-medium text-ink-900">
                  {t(`modules.${module}`)}
                </span>
              </label>

              <span className="numeric text-xs text-ink-400">
                {checkedCount}/{usable.length}
              </span>
            </div>

            <div className="grid gap-x-4 gap-y-2 p-3.5 sm:grid-cols-2 lg:grid-cols-3">
              {permissions.map((permission) => {
                const blocked = external && EXTERNAL_FORBIDDEN.includes(permission.key);
                const checked = selectedSet.has(permission.key) && !blocked;

                return (
                  <div
                    key={permission.key}
                    className={cn('flex items-start gap-2', blocked && 'opacity-60')}
                  >
                    <Checkbox
                      checked={checked}
                      disabled={readOnly || blocked}
                      onChange={(event) => toggle(permission.key, event.target.checked)}
                      label={
                        <span className="flex items-center gap-1.5">
                          {t(`actions.${permission.action}`)}
                          {blocked && (
                            <Lock aria-hidden className="h-3 w-3 shrink-0 text-ink-400" />
                          )}
                        </span>
                      }
                    />
                  </div>
                );
              })}
            </div>
          </fieldset>
        );
      })}

      {readOnly && (
        <Alert tone="tip" compact>
          {t('roles.ownerLocked')}
        </Alert>
      )}
    </div>
  );
}
