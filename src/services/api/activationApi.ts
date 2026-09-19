import { api } from '../apiClient';

/**
 * Activating and deactivating records.
 *
 * There is no delete. A record that has been sold against or paid against must
 * stay, or last month's invoice stops adding up — so this is the only way a
 * record leaves circulation.
 */

export type ActivatableEntity =
  | 'item'
  | 'category'
  | 'printGroup'
  | 'vendor'
  | 'customer'
  | 'discount'
  | 'expenseCategory'
  | 'commissionRule'
  | 'billTemplate'
  | 'branch';

/**
 * Thrown when the record's state prevents the change — a category with live
 * items, a customer who still owes money. The message says what is in the way.
 *
 * Distinct from a failure, because nothing went wrong: the answer is no, and
 * there is something the person can do about it.
 */
export class DeactivationBlocked extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeactivationBlocked';
  }
}

export const activationApi = {
  async set(entityType: ActivatableEntity, entityId: string, isActive: boolean) {
    try {
      return await api.patch<{ entityType: string; entityId: string; isActive: boolean }>(
        `/api/activation/${entityType}/${entityId}`,
        { isActive },
      );
    } catch (caught) {
      const failure = caught as { status?: number; code?: string; message?: string };

      if (failure.status === 409 || failure.code === 'deactivation_blocked') {
        throw new DeactivationBlocked(
          failure.message ?? 'This record cannot be deactivated yet.',
        );
      }

      throw caught;
    }
  },

  activate(entityType: ActivatableEntity, entityId: string) {
    return activationApi.set(entityType, entityId, true);
  },

  deactivate(entityType: ActivatableEntity, entityId: string) {
    return activationApi.set(entityType, entityId, false);
  },
};
