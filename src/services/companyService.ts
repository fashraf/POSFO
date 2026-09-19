import type { BillTemplate, CompanyProfile } from '@/types/company';
import { DEFAULT_BILL_TEMPLATE } from '@/types/company';
import { HttpError } from './http';
import { delay, nextId, notFound, timestamp, validationFailed } from './mock/store';

const now = '2026-08-01T00:00:00.000Z';

let profile: CompanyProfile = {
  nameEn: 'Al Noor Store',
  nameAr: 'متجر النور',
  description: 'Your trusted neighbourhood store',
  logoUrl: null,
  crNumber: '1010123456',
  vatNumber: '300000000000003',
  phone: '+966 11 220 8899',
  email: 'hello@alnoor.sa',
  website: 'alnoor.sa',
  address: {
    street: 'King Fahd Road',
    district: 'Al Olaya',
    city: 'Riyadh',
    postalCode: '12211',
    country: 'SA',
  },
  social: {
    instagram: '@alnoorstore',
    facebook: '',
    x: '',
    tiktok: '',
    linkedin: '',
    youtube: '',
  },
  createdAt: now,
  updatedAt: now,
};



export const companyService = {
  async get(): Promise<CompanyProfile> {
    await delay(160);
    return profile;
  },

  async update(input: Omit<CompanyProfile, 'createdAt' | 'updatedAt'>): Promise<CompanyProfile> {
    await delay(360);

    const errors: Record<string, string[]> = {};
    if (!input.nameEn.trim()) errors.nameEn = ['Company name is required.'];
    if (!input.nameAr.trim()) errors.nameAr = ['Arabic company name is required.'];

    const cr = input.crNumber.trim();
    if (cr && !/^\d{10}$/.test(cr)) errors.crNumber = ['A CR number is 10 digits.'];

    const vat = input.vatNumber.trim();
    if (vat && !/^\d{15}$/.test(vat)) {
      errors.vatNumber = ['A Saudi VAT number is exactly 15 digits.'];
    }

    if (input.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
      errors.email = ['Enter a valid email address, or leave it empty.'];
    }

    if (Object.keys(errors).length > 0) throw validationFailed(errors);

    profile = { ...profile, ...input, updatedAt: timestamp() };
    return profile;
  },
};

/* A shop prints more than one document, so templates are a collection. The
   seeds mirror the print groups: one customer bill, one ticket per station. */
let templates: BillTemplate[] = [
  {
    ...DEFAULT_BILL_TEMPLATE,
    id: 'bil_customer',
    name: 'Customer bill',
    createdAt: now,
    updatedAt: now,
  },
  {
    ...DEFAULT_BILL_TEMPLATE,
    id: 'bil_kitchen',
    name: 'Kitchen ticket',
    audience: 'group',
    printGroupId: 'pgr_kitchen',
    isDefault: false,
    paperSize: '58mm',
    language: 'both',
    /* An operational ticket needs the item and the count, nothing else — money
       on a kitchen ticket is noise the cook has to read past. */
    showLogo: false,
    showDescription: false,
    showVatNumber: false,
    showCrNumber: false,
    showUnitPrice: false,
    showLineTotal: false,
    showSubtotal: false,
    showDiscount: false,
    showVat: false,
    showGrandTotal: false,
    showZatcaQr: false,
    createdAt: now,
    updatedAt: now,
  },
  {
    ...DEFAULT_BILL_TEMPLATE,
    id: 'bil_bbq',
    name: 'BBQ ticket',
    audience: 'group',
    printGroupId: 'pgr_bbq',
    isDefault: false,
    paperSize: '58mm',
    showLogo: false,
    showDescription: false,
    showVatNumber: false,
    showCrNumber: false,
    showUnitPrice: false,
    showLineTotal: false,
    showSubtotal: false,
    showDiscount: false,
    showVat: false,
    showGrandTotal: false,
    showZatcaQr: false,
    createdAt: now,
    updatedAt: now,
  },
];

export const billTemplateService = {
  async list(): Promise<BillTemplate[]> {
    await delay(140);
    return [...templates];
  },

  async get(id: string): Promise<BillTemplate> {
    await delay(120);
    const template = templates.find((candidate) => candidate.id === id);
    if (!template) throw notFound('Bill template', id);
    return template;
  },

  async create(input: Omit<BillTemplate, 'id' | 'createdAt' | 'updatedAt'>): Promise<BillTemplate> {
    await delay(320);

    if (!input.name.trim()) {
      throw validationFailed({ name: ['Give the template a name.'] });
    }
    if (input.audience === 'group' && !input.printGroupId) {
      throw validationFailed({
        printGroupId: ['Choose which print group this ticket is for.'],
      });
    }

    const stamp = timestamp();
    const created: BillTemplate = {
      ...input,
      name: input.name.trim(),
      id: nextId('bil'),
      createdAt: stamp,
      updatedAt: stamp,
    };

    /* Exactly one default customer bill, always. */
    if (created.isDefault) {
      templates = templates.map((template) => ({ ...template, isDefault: false }));
    }

    templates = [...templates, created];
    return created;
  },

  async update(
    id: string,
    input: Omit<BillTemplate, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<BillTemplate> {
    await delay(320);

    const existing = templates.find((candidate) => candidate.id === id);
    if (!existing) throw notFound('Bill template', id);

    if (input.audience === 'group' && !input.printGroupId) {
      throw validationFailed({
        printGroupId: ['Choose which print group this ticket is for.'],
      });
    }

    const updated: BillTemplate = {
      ...existing,
      ...input,
      name: input.name.trim(),
      updatedAt: timestamp(),
    };

    if (updated.isDefault) {
      templates = templates.map((template) =>
        template.id === id ? template : { ...template, isDefault: false },
      );
    }

    templates = templates.map((template) => (template.id === id ? updated : template));
    return updated;
  },

  async remove(id: string): Promise<void> {
    await delay(280);

    const existing = templates.find((candidate) => candidate.id === id);
    if (!existing) throw notFound('Bill template', id);

    if (existing.isDefault) {
      throw new HttpError({
        status: 409,
        code: 'default_template',
        message: 'Make another template the default before deleting this one.',
      });
    }

    templates = templates.filter((template) => template.id !== id);
  },

  /** The template a given document should print with. */
  async resolveFor(audience: 'customer' | 'group', printGroupId?: string): Promise<BillTemplate> {
    await delay(80);

    if (audience === 'group' && printGroupId) {
      const match = templates.find(
        (template) =>
          template.audience === 'group' &&
          template.printGroupId === printGroupId &&
          template.status === 'active',
      );
      if (match) return match;
    }

    const fallback =
      templates.find((template) => template.audience === 'customer' && template.isDefault) ??
      templates[0];
    return fallback;
  },
};
