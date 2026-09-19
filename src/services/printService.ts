import type { PrintGroup } from '@/types/printing';
import { delay, nextId, notFound, timestamp, validationFailed } from './mock/store';
import { SEED_PRINT_GROUPS } from './mock/seed';

let groups: PrintGroup[] = [...SEED_PRINT_GROUPS];

export const printGroupService = {
  async list(): Promise<PrintGroup[]> {
    await delay(120);
    return [...groups].sort((a, b) => a.sortOrder - b.sortOrder);
  },

  async create(input: {
    nameAr: string;
    nameEn: string;
    ticketTitle: string;
  }): Promise<PrintGroup> {
    await delay(280);

    if (!input.nameAr.trim() || !input.nameEn.trim()) {
      throw validationFailed({
        nameAr: input.nameAr.trim() ? [] : ['Arabic name is required.'],
        nameEn: input.nameEn.trim() ? [] : ['English name is required.'],
      });
    }

    const now = timestamp();
    const created: PrintGroup = {
      id: nextId('pgr'),
      nameAr: input.nameAr.trim(),
      nameEn: input.nameEn.trim(),
      ticketTitle: input.ticketTitle.trim() || input.nameEn.trim(),
      sortOrder: groups.length + 1,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    groups = [...groups, created];
    return created;
  },

  async setStatus(id: string, status: 'active' | 'inactive'): Promise<PrintGroup> {
    await delay(220);

    const existing = groups.find((group) => group.id === id);
    if (!existing) throw notFound('Print group', id);

    const updated: PrintGroup = { ...existing, status, updatedAt: timestamp() };
    groups = groups.map((group) => (group.id === id ? updated : group));
    return updated;
  },
};

/**
 * Printing.
 *
 * Isolated so the browser print call lives in one place. When a real print
 * bridge arrives — a thermal driver, or a backend PDF endpoint — only this
 * module changes.
 */
export const printService = {
  async print(documentId: string): Promise<void> {
    await delay(120);
    /* The browser dialog stands in for a device. The document being printed is
       rendered off-screen by the caller before this runs. */
    window.print();
    void documentId;
  },
};
