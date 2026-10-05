import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, CheckCheck, CircleHelp, LogOut, Menu, Sparkles, User } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/cn';
import { Dropdown } from '@/components/ui/Dropdown';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { GlobalSearch } from '@/components/shell/GlobalSearch';
import { useTranslation } from '@/i18n';
import { LanguageSwitcher } from './LanguageSwitcher';
import { NotificationBell } from '@/components/shell/NotificationBell';
import { QuickLinks } from '@/components/shell/QuickLinks';
import { ThemeToggle } from '@/components/shell/ThemeToggle';
import { useSession } from '@/contexts/SessionContext';
import { useAuth } from '@/features/auth/context/AuthContext';
import { useI18n } from '@/i18n';

export interface HeaderProps {
  onOpenMobileNav: () => void;
}

export function Header({ onOpenMobileNav }: HeaderProps) {
  const { t } = useTranslation();
  const { language } = useI18n();
  const {
    user,
    branches,
    activeBranch,
    setActiveBranch,
    viewingAllBranches,
    setViewingAllBranches,
  } = useSession();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [quickLinksOpen, setQuickLinksOpen] = useState(false);

  /* Ctrl/Cmd-K opens the palette from anywhere, which is what anyone who has
     used a modern tool will try first. */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setQuickLinksOpen((value) => !value);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    setSigningOut(false);
    setConfirmingSignOut(false);
    navigate('/login', { replace: true });
  }

  /* Only offer the switcher when there is actually somewhere to switch to. */
  const available = branches.filter((branch) => user?.branchIds.includes(branch.id));
  const branchName = (branch: { nameAr: string; nameEn: string }) =>
    language === 'ar' ? branch.nameAr : branch.nameEn;

  return (
    <header className="sticky top-0 z-header flex h-12 shrink-0 items-center gap-2 border-b border-ink-200 bg-surface/85 px-3 backdrop-blur-md sm:px-4">
      <button
        type="button"
        onClick={onOpenMobileNav}
        aria-label={t('nav.openMenu')}
        className="-ms-1 rounded p-2 text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 lg:hidden"
      >
        <Menu aria-hidden className="h-5 w-5" />
      </button>

      {available.length > 1 && (
        <Dropdown
          align="start"
          trigger={
            <button
              type="button"
              className="flex max-w-[12rem] items-center gap-2 rounded-md border border-ink-200 px-2.5 py-1.5 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50"
            >
              <Building2
                aria-hidden
                className={cn(
                  'h-3.5 w-3.5 shrink-0',
                  viewingAllBranches ? 'text-brand-600' : 'text-ink-400',
                )}
              />
              <span className="truncate">
                {viewingAllBranches
                  ? t('branch.allBranches')
                  : activeBranch
                    ? branchName(activeBranch)
                    : t('branch.select')}
              </span>
            </button>
          }
          items={[
            {
              key: 'all',
              label: t('branch.allBranches'),
              description: t('branch.allBranchesHint'),
              icon: viewingAllBranches ? <CheckCheck /> : undefined,
              onSelect: () => setViewingAllBranches(true),
              separated: true,
            },
            ...available.map((branch) => ({
              key: branch.id,
              label: branchName(branch),
              icon:
                !viewingAllBranches && branch.id === activeBranch?.id ? (
                  <CheckCheck />
                ) : undefined,
              onSelect: () => setActiveBranch(branch.id),
            })),
          ]}
        />
      )}

      <div className="hidden min-w-0 flex-1 md:block">
        <GlobalSearch className="max-w-xs" />
      </div>

      <div className="flex flex-1 items-center justify-end gap-1 md:flex-none">
        <LanguageSwitcher variant="compact" className="hidden sm:inline-flex" />

        <button
          type="button"
          onClick={() => setQuickLinksOpen(true)}
          aria-label={t('quickLinks.open')}
          className="hidden items-center gap-1.5 rounded-md border border-ink-200 px-2 py-1.5 text-2xs font-medium text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 sm:inline-flex"
        >
          <Sparkles aria-hidden className="h-3.5 w-3.5" />
          {t('quickLinks.open')}
          <kbd className="rounded border border-ink-200 bg-ink-50 px-1 py-0.5 text-[9px] text-ink-400">
            ⌘K
          </kbd>
        </button>

        <NotificationBell />

        <ThemeToggle />

        <span aria-hidden className="mx-1 hidden h-5 w-px bg-ink-200 sm:block" />

        <Dropdown
          align="end"
          trigger={
            <button
              type="button"
              className="flex items-center gap-2 rounded-md p-1 transition-colors hover:bg-ink-100"
            >
              <Avatar name={user ? branchName(user) : "?"} size="sm" />
            </button>
          }
          items={[
            {
              key: 'profile',
              label: t('common.profile'),
              icon: <User />,
              onSelect: () => navigate('/profile'),
            },
            {
              key: 'help',
              label: t('common.help'),
              icon: <CircleHelp />,
            },
            {
              key: 'signout',
              label: t('common.signOut'),
              icon: <LogOut />,
              destructive: true,
              separated: true,
              onSelect: () => setConfirmingSignOut(true),
            },
          ]}
        />
      </div>

      <QuickLinks open={quickLinksOpen} onClose={() => setQuickLinksOpen(false)} />

      <ConfirmModal
        open={confirmingSignOut}
        title={t('auth.signOut.title')}
        description={t('auth.signOut.description')}
        confirmLabel={t('auth.signOut.confirm')}
        variant="warning"
        loading={signingOut}
        onConfirm={handleSignOut}
        onCancel={() => setConfirmingSignOut(false)}
      />
    </header>
  );
}
