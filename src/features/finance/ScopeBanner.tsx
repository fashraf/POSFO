import { Building2, Layers } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useSession } from '@/contexts/SessionContext';
import { useI18n, useTranslation } from '@/i18n';

/**
 * Says which branch the figures on screen belong to.
 *
 * Financial numbers are meaningless without knowing whose they are, and the
 * header switcher is easy to miss. This states it on the page itself, right
 * above the figures it applies to.
 */
export function ScopeBanner({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { language } = useI18n();
  const { activeBranch, viewingAllBranches, branches } = useSession();

  if (branches.length <= 1) return null;

  const branchName = activeBranch
    ? language === 'ar'
      ? activeBranch.nameAr
      : activeBranch.nameEn
    : '—';

  return (
    <p
      className={cn(
        'flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs',
        viewingAllBranches
          ? 'border-brand-100 bg-brand-50/60 text-brand-800'
          : 'border-ink-200 bg-ink-50/60 text-ink-600',
        className,
      )}
    >
      {viewingAllBranches ? (
        <Layers aria-hidden className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <Building2 aria-hidden className="h-3.5 w-3.5 shrink-0" />
      )}
      {viewingAllBranches ? t('branch.scopeAll') : t('branch.scopeOne', { branch: branchName })}
    </p>
  );
}
