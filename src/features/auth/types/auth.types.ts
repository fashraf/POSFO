import type { ID } from '@/types';

/** Where the person is in the sign-in or sign-up journey. */
export type AuthStatus = 'unauthenticated' | 'registering' | 'awaiting_otp' | 'authenticated';

export type OtpPurpose = 'register' | 'login';

/** What the person typed to identify themselves. */
export type IdentifierKind = 'email' | 'mobile';

export interface AuthSession {
  userId: ID;
  email: string;
  mobile: string;
  displayName: string;
  roleId: ID;
  /** Where to land after sign-in. Follows from the role. */
  landingPath: string;
  issuedAt: string;
}

/** A pending verification, held between the identifier step and the OTP step. */
export interface PendingVerification {
  purpose: OtpPurpose;
  /** The address or number the code went to, unmasked. */
  destination: string;
  kind: IdentifierKind;
  /** Masked for display: j***@example.com, or +966 •• ••• •67 */
  maskedDestination: string;
  attemptsRemaining: number;
}

export interface RegistrationOwner {
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  password: string;
}

export interface RegistrationBusiness {
  nameEn: string;
  nameAr: string;
  businessType: string;
  businessCategory: 'products' | 'services' | 'both';
  country: string;
  city: string;
  district: string;
  address: string;
}

export interface RegistrationTax {
  /** Commercial registration number. */
  crNumber: string;
  /** Saudi VAT registration number — 15 digits. */
  vatNumber: string;
  taxStartDate: string;
  /** False when the business is not VAT registered; the fields then go away. */
  isVatRegistered: boolean;
}

export interface RegistrationDraft {
  owner: RegistrationOwner;
  business: RegistrationBusiness;
  tax: RegistrationTax;
}
