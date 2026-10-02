import { apiPrintGroupService } from './apiCatalogService';

/** Print groups, from the API (see apiCatalogService.ts). */
export const printGroupService = apiPrintGroupService;

/**
 * Printing.
 *
 * Isolated so the browser print call lives in one place. When a real print
 * bridge arrives — a thermal driver, or a backend PDF endpoint — only this
 * module changes.
 */
export const printService = {
  async print(documentId: string): Promise<void> {
    /* The browser dialog stands in for a device. The document being printed is
       rendered off-screen by the caller before this runs. */
    window.print();
    void documentId;
  },
};
