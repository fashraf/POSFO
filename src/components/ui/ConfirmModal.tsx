import type { ReactNode } from 'react';
import { AlertTriangle, Info, Trash2 } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import { cn } from '@/lib/cn';
import { useTranslation } from '@/i18n';

export type ConfirmVariant = 'danger' | 'warning' | 'primary';

const STYLES: Record<ConfirmVariant, { badge: string; icon: typeof Info }> = {
  danger: { badge: 'bg-danger-50 text-danger-500', icon: Trash2 },
  warning: { badge: 'bg-warning-50 text-warning-500', icon: AlertTriangle },
  primary: { badge: 'bg-brand-50 text-brand-600', icon: Info },
};

export interface ConfirmModalProps {
  open: boolean;
  title: ReactNode;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  loading?: boolean;
  /** Extra context — a total, a list of affected users, a warning. */
  children?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The one confirmation dialog.
 *
 * Every destructive, financial, or permission-changing action uses this rather
 * than rolling its own, so the wording, button order, and escape behaviour are
 * the same everywhere and people learn it once.
 */
export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  variant = 'danger',
  loading = false,
  children,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const { t } = useTranslation();
  const styles = STYLES[variant];
  const Icon = styles.icon;

  return (
    <Modal
      open={open}
      onClose={onCancel}
      size="sm"
      dismissible={!loading}
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            {cancelLabel ?? t('common.cancel')}
          </Button>
          <Button
            variant={variant === 'primary' ? 'primary' : 'danger'}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel ?? t('common.confirm')}
          </Button>
        </>
      }
    >
      <div className="flex gap-3.5 py-1">
        <span
          aria-hidden
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
            styles.badge,
          )}
        >
          <Icon className="h-4 w-4" />
        </span>

        <div className="min-w-0 space-y-2 pt-0.5">
          <h2 className="text-md font-semibold text-ink-900">{title}</h2>
          <p className="text-sm text-ink-500">{description}</p>
          {children}
        </div>
      </div>
    </Modal>
  );
}
