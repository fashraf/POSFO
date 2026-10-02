import type { BillTemplate, CompanyProfile } from '@/types/company';
import { billTemplateApi, companyApi, type ApiBillTemplate, type ApiCompany } from './api';
import { invalidate } from './dataVersion';
import { utc } from './mappers/time';

function toProfile(row: ApiCompany): CompanyProfile {
  return {
    nameEn: row.nameEn,
    nameAr: row.nameAr,
    /*
     * The form has one description box, and saving it writes the English
     * column (see update). Reading the same column keeps the round trip
     * honest; the Arabic one shows only when no English text exists.
     */
    description: row.descriptionEn || row.descriptionAr || row.description,
    logoUrl: row.logoUrl ?? null,
    crNumber: row.crNumber,
    vatNumber: row.vatNumber,
    phone: row.phone,
    email: row.email,
    website: row.website,
    address: {
      street: row.address.street,
      district: row.address.district,
      city: row.address.city,
      postalCode: row.address.postalCode,
      country: row.address.country,
    },
    /* The server always sends every platform it knows, "" when unset. */
    social: {
      instagram: row.social.instagram ?? '',
      facebook: row.social.facebook ?? '',
      x: row.social.x ?? '',
      tiktok: row.social.tiktok ?? '',
      linkedin: row.social.linkedin ?? '',
      youtube: row.social.youtube ?? '',
    },
    createdAt: utc(row.createdAt),
    updatedAt: utc(row.updatedAt),
  };
}

export const companyService = {
  async get(): Promise<CompanyProfile> {
    return toProfile(await companyApi.get());
  },

  async update(input: Omit<CompanyProfile, 'createdAt' | 'updatedAt'>): Promise<CompanyProfile> {
    const saved = await companyApi.save({
      nameEn: input.nameEn.trim(),
      nameAr: input.nameAr.trim(),
      /* Fills the English column; the Arabic one is left as stored. */
      description: input.description.trim(),
      logoUrl: input.logoUrl,
      crNumber: input.crNumber.trim(),
      vatNumber: input.vatNumber.trim(),
      phone: input.phone.trim(),
      email: input.email.trim(),
      website: input.website.trim(),
      address: input.address,
      social: { ...input.social },
    });
    invalidate('company');
    return toProfile(saved);
  },
};

function toTemplate(row: ApiBillTemplate): BillTemplate {
  return {
    ...row,
    printGroupId: row.printGroupId ?? null,
    createdAt: utc(row.createdAt),
    updatedAt: utc(row.updatedAt),
  };
}

/*
 * A shop prints more than one document, so templates are a collection: one
 * customer bill and a ticket per print group. The server keeps exactly one
 * default per audience and refuses to delete it (409 default_template).
 */
export const billTemplateService = {
  async list(): Promise<BillTemplate[]> {
    const rows = await billTemplateApi.list();
    return rows.map(toTemplate);
  },

  async get(id: string): Promise<BillTemplate> {
    return toTemplate(await billTemplateApi.get(id));
  },

  async create(input: Omit<BillTemplate, 'id' | 'createdAt' | 'updatedAt'>): Promise<BillTemplate> {
    const created = await billTemplateApi.create({ ...input, name: input.name.trim() });
    invalidate('bills');
    return toTemplate(created);
  },

  async update(
    id: string,
    input: Omit<BillTemplate, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<BillTemplate> {
    const updated = await billTemplateApi.update(id, { ...input, name: input.name.trim() });
    invalidate('bills');
    return toTemplate(updated);
  },

  /** A real delete. To retire one without deleting it, set its status. */
  async remove(id: string): Promise<void> {
    await billTemplateApi.remove(id);
    invalidate('bills');
  },

  /**
   * The template a given document should print with: the group's own ticket
   * if it has one, otherwise the default customer bill.
   */
  async resolveFor(audience: 'customer' | 'group', printGroupId?: string): Promise<BillTemplate> {
    return toTemplate(await billTemplateApi.resolve(audience, printGroupId));
  },
};
