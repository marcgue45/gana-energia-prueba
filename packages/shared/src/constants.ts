export const INTEREST_MIN = 1;
export const INTEREST_MAX = 10;

export const SOURCE_RATINGS = {
  referral: 100,
  web: 70,
  phone: 50,
  cold: 30,
} as const;

export type LeadSource = keyof typeof SOURCE_RATINGS;

export const AGE_MAX_DAYS = 90;

export const PRIORITY_HIGH_MIN = 75;
export const PRIORITY_MEDIUM_MIN = 40;

export const DEFAULT_WEIGHTS = {
  newCustomer: 40,
  interest: 30,
  source: 20,
  age: 10,
} as const;
