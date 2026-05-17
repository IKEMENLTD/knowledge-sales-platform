/**
 * Field normalization utilities for business-card OCR output.
 *
 * Round 2 Architect HIGH-A-02: This module is now a thin re-export of the
 * canonical implementation in `@ksp/shared` (packages/shared/src/contacts-normalize.ts).
 * Keeping the import path stable so existing call sites and unit tests inside
 * apps/worker/ (e.g. __tests__/normalize.test.ts) keep working.
 *
 * Do not add behavior here — edit packages/shared/src/contacts-normalize.ts.
 */

export {
  buildNameCompanyKey,
  normalizeCompany,
  normalizeEmail,
  normalizeName,
  normalizePhone,
} from '@ksp/shared';
