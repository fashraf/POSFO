import { useEffect, useState } from 'react';
import { Button, FormField, Input, Modal, SearchableSelect } from '@/components/ui';
import { useI18n, useTranslation } from '@/i18n';
import type { BranchStaff } from '@/services';

export interface ApprovalModalProps {
  open: boolean;
  onClose: () => void;
  /** People at the branch, the signed-in cashier already left out. */
  staff: BranchStaff[];
  /** A message from the server's last refusal, shown under the password. */
  error?: string | null;
  onApprove: (approver: { userId: string; name: string; password: string }) => void;
}

/**
 * A manager approves a discount at the till.
 *
 * The cashier cannot approve it, so the manager picks their own name and types
 * their password on this screen. Nothing is checked here: the password goes
 * with the sale, and the server verifies it — and that the person holds
 * discounts.approve — when the sale is committed.
 */
export function ApprovalModal({ open, onClose, staff, error, onApprove }: ApprovalModalProps) {
  const { t } = useTranslation();
  const { language } = useI18n();

  const [approverId, setApproverId] = useState<string | null>(null);
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (!open) return;
    setPassword('');
  }, [open]);

  const approver = staff.find((member) => member.id === approverId) ?? null;
  const nameOf = (member: BranchStaff) => (language === 'ar' ? member.nameAr : member.nameEn);

  function submit() {
    if (!approver || !password) return;
    onApprove({ userId: approver.id, name: nameOf(approver), password });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('posDiscount.approval.managerTitle')}
      description={t('posDiscount.approval.managerDescription')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} disabled={!approver || !password}>
            {t('posDiscount.approval.approve')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label={t('posDiscount.approval.approver')} required>
          <SearchableSelect
            options={staff.map((member) => ({
              value: member.id,
              label: nameOf(member),
              description: language === 'ar' ? member.roleNameAr : member.roleNameEn,
            }))}
            value={approverId}
            onChange={setApproverId}
          />
        </FormField>

        <FormField
          label={t('posDiscount.approval.password')}
          required
          error={error ?? undefined}
        >
          <Input
            type="password"
            autoComplete="off"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submit();
            }}
          />
        </FormField>
      </div>
    </Modal>
  );
}
