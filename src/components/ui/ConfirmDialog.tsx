import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import { useTranslation } from '@/i18n';

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Use `danger` for anything that removes or deactivates. */
  tone?: 'danger' | 'primary';
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = 'danger',
  loading = false,
}: ConfirmDialogProps) {
  const { t } = useTranslation();

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      dismissible={!loading}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            {cancelLabel ?? t('common.cancel')}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel ?? t('common.confirm')}
          </Button>
        </>
      }
    >
      <div className="flex gap-3.5 py-1">
        <span
          aria-hidden
          className={
            tone === 'danger'
              ? 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger-50 text-danger-500'
              : 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600'
          }
        >
          <AlertTriangle className="h-4.5 w-4.5" />
        </span>
        <div className="space-y-1.5 pt-0.5">
          <h2 className="text-md font-semibold text-ink-900">{title ?? t('confirm.title')}</h2>
          <p className="text-sm text-ink-500">{description ?? t('confirm.description')}</p>
        </div>
      </div>
    </Modal>
  );
}
