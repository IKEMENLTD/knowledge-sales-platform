/**
 * Business-card dedupe scoring.
 *
 * Round 2 Architect HIGH-A-02: This module is now a thin re-export of the
 * canonical implementation in `@ksp/shared` (packages/shared/src/contacts-normalize.ts).
 * Both apps/worker and apps/web now share identical normalize + score semantics
 * — previously the two diverged in weights, phone normalization, and score
 * composition, which caused silent dedupe misses.
 *
 * Do not add behavior here — edit packages/shared/src/contacts-normalize.ts.
 */

export {
  type DedupeCandidate,
  type MatchResult,
  MATCH_WEIGHTS,
  findDuplicates,
  scoreCandidate,
} from '@ksp/shared';
