/**
 * Canonical normalize + dedupe helpers for business-card contacts.
 *
 * Round 2 Architect HIGH-A-02:
 *   Previously web (`apps/web/src/lib/api/contacts-dedupe.ts`) and worker
 *   (`apps/worker/src/lib/{normalize,dedupe}.ts`) re-implemented these in
 *   subtly different ways:
 *     - web: ASCII-only digit phone, additive (1 - prod(1-w_i)) score
 *     - worker: NFKC + +81 phone, max-based score, weight 0.7/0.85/0.9...
 *   That produced silent dedupe misses across the system. This module
 *   centralizes the worker-side semantics so both surfaces agree.
 *
 * All functions are pure: no env, no DB, no clock.
 *
 * Re-exported from `@ksp/shared` so both apps depend on the *same* identity
 * function for `normalized_email` / `normalized_phone` columns.
 */

import type { MatchField } from './contacts.js';

// ---------------------------------------------------------------------------
// 1) Field-level normalizers
// ---------------------------------------------------------------------------

const WHITESPACE_RE = new RegExp('[\\s\\u00A0\\u3000\\u2028\\u2029]+', 'g');
const WHITESPACE_TRIM_LEFT = new RegExp('^[\\s\\u00A0\\u3000\\u2028\\u2029,.\\u3001\\u3002]+');
const WHITESPACE_TRIM_RIGHT = new RegExp('[\\s\\u00A0\\u3000\\u2028\\u2029,.\\u3001\\u3002]+$');

function emptyToNull(s: unknown): string | null {
  if (s === null || s === undefined) return null;
  if (typeof s !== 'string') return null;
  if (s.length === 0) return null;
  return s;
}

/** Name: NFKC + collapse all whitespace + trim. Case preserved. */
export function normalizeName(input: string | null | undefined): string | null {
  const raw = emptyToNull(input);
  if (raw === null) return null;
  const nfkc = raw.normalize('NFKC');
  const collapsed = nfkc.replace(WHITESPACE_RE, ' ');
  const trimmed = collapsed.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** Email: NFKC + remove all whitespace + lowercase. */
export function normalizeEmail(input: string | null | undefined): string | null {
  const raw = emptyToNull(input);
  if (raw === null) return null;
  const nfkc = raw.normalize('NFKC');
  const stripped = nfkc.replace(WHITESPACE_RE, '');
  const lower = stripped.toLowerCase();
  return lower.length === 0 ? null : lower;
}

/**
 * Phone: NFKC + keep digits and '+' only.
 *   - Leading '0' (JP domestic) -> '+81' prefix.
 *   - Already '+' prefixed -> kept verbatim.
 *   - Otherwise prepend '+'.
 *   - Result shorter than 3 chars -> null.
 */
export function normalizePhone(input: string | null | undefined): string | null {
  const raw = emptyToNull(input);
  if (raw === null) return null;
  const nfkc = raw.normalize('NFKC');
  const digits = nfkc.replace(/[^0-9+]/g, '');
  if (digits.length < 3) return null;
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('0')) return `+81${digits.slice(1)}`;
  return `+${digits}`;
}

const LEGAL_SUFFIX_PATTERNS: RegExp[] = [
  // ---- prefix ----
  new RegExp('^株式会社[\\s\\u3000]*', 'u'),
  new RegExp('^有限会社[\\s\\u3000]*', 'u'),
  new RegExp('^合同会社[\\s\\u3000]*', 'u'),
  new RegExp('^合資会社[\\s\\u3000]*', 'u'),
  new RegExp('^合名会社[\\s\\u3000]*', 'u'),
  new RegExp('^一般社団法人[\\s\\u3000]*', 'u'),
  new RegExp('^一般財団法人[\\s\\u3000]*', 'u'),
  new RegExp('^公益社団法人[\\s\\u3000]*', 'u'),
  new RegExp('^公益財団法人[\\s\\u3000]*', 'u'),
  new RegExp('^医療法人[\\s\\u3000]*', 'u'),
  new RegExp('^学校法人[\\s\\u3000]*', 'u'),
  new RegExp('^宗教法人[\\s\\u3000]*', 'u'),
  new RegExp('^特定非営利活動法人[\\s\\u3000]*', 'u'),
  new RegExp('^NPO法人[\\s\\u3000]*', 'iu'),
  // ---- suffix ----
  new RegExp('[\\s\\u3000]*株式会社$', 'u'),
  new RegExp('[\\s\\u3000]*有限会社$', 'u'),
  new RegExp('[\\s\\u3000]*合同会社$', 'u'),
  new RegExp('[\\s\\u3000]*\\(株\\)$', 'u'),
  new RegExp('[\\s\\u3000]*（株）$', 'u'),
  new RegExp('[\\s\\u3000]*\\(有\\)$', 'u'),
  new RegExp('[\\s\\u3000]*（有）$', 'u'),
  new RegExp('[\\s\\u3000]*K\\.K\\.?$', 'iu'),
  new RegExp('[\\s\\u3000]*Co\\.\\s*,?\\s*Ltd\\.?$', 'iu'),
  new RegExp('[\\s\\u3000]*Inc\\.?$', 'iu'),
  new RegExp('[\\s\\u3000]*Corp\\.?$', 'iu'),
  new RegExp('[\\s\\u3000]*Corporation$', 'iu'),
  new RegExp('[\\s\\u3000]*Ltd\\.?$', 'iu'),
  new RegExp('[\\s\\u3000]*Limited$', 'iu'),
  new RegExp('[\\s\\u3000]*LLC\\.?$', 'iu'),
  new RegExp('[\\s\\u3000]*L\\.L\\.C\\.?$', 'iu'),
  new RegExp('[\\s\\u3000]*GmbH$', 'iu'),
  new RegExp('[\\s\\u3000]*S\\.A\\.?$', 'iu'),
  new RegExp('[\\s\\u3000]*PLC$', 'iu'),
];

export function normalizeCompany(input: string | null | undefined): string | null {
  const raw = emptyToNull(input);
  if (raw === null) return null;
  let s = raw.normalize('NFKC');
  s = s.replace(WHITESPACE_RE, ' ').trim();
  if (s.length === 0) return null;
  for (const pat of LEGAL_SUFFIX_PATTERNS) {
    if (pat.test(s)) {
      s = s.replace(pat, '').trim();
      break;
    }
  }
  s = s.replace(WHITESPACE_TRIM_LEFT, '').replace(WHITESPACE_TRIM_RIGHT, '').trim();
  return s.length === 0 ? null : s;
}

/**
 * Compose a dedupe key from (name, company).
 *
 * Returns null only when both are null. If only one side exists we still
 * return a key (with the empty side blank) — false-negative is worse than
 * false-positive at this stage; the merge UI is the human gate.
 */
export function buildNameCompanyKey(
  name: string | null | undefined,
  company: string | null | undefined,
): string | null {
  const n = normalizeName(name)?.toLowerCase() ?? null;
  const c = normalizeCompany(company)?.toLowerCase() ?? null;
  if (n === null && c === null) return null;
  return `${n ?? ''}|${c ?? ''}`;
}

/**
 * LinkedIn URL canonicalization. Lowercases host + path, drops www/trailing
 * slash/query/fragment. Returns null for non-linkedin URLs or parse failures.
 */
export function normalizeLinkedinUrl(s: string | null | undefined): string | null {
  if (!s || typeof s !== 'string') return null;
  try {
    const u = new URL(s.trim());
    if (!/linkedin\.com$/i.test(u.hostname.replace(/^www\./i, ''))) {
      return null;
    }
    const host = u.hostname.replace(/^www\./i, '').toLowerCase();
    const path = u.pathname.replace(/\/+$/g, '').toLowerCase();
    if (!path) return null;
    return `${host}${path}`;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 2) Dedupe scoring (max-based, worker semantics)
// ---------------------------------------------------------------------------

/**
 * Field weights. The strongest single signal dominates — additive composition
 * gave too many false positives in early tests (esp. phone of corp HQ).
 *
 *   image_hash  = 1.00  same picture = same card
 *   email       = 0.90  typos possible but exceptionally strong
 *   phone       = 0.80  corp shared line can cause FPs
 *   name+company= 0.70  family-name + same-company is suggestive
 *   linkedin    = 0.60  URL noise from copy-paste
 */
export const MATCH_WEIGHTS: Record<MatchField, number> = {
  image_hash: 1.0,
  email: 0.9,
  phone: 0.8,
  name_company: 0.7,
  linkedin: 0.6,
};

/** Shared dedupe contract used by both web list view and worker OCR consumer. */
export interface DedupeCandidate {
  contactId: string;
  name: string | null;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  businessCardImageHash: string | null;
  /** Existing-side only (new side leaves it undefined). */
  capturedAt?: string | null;
}

export interface MatchResult {
  contactId: string;
  matchFields: MatchField[];
  /** [0,1] final score (max-based). */
  score: number;
  capturedAt: string | null;
  /** Display hints — existing-side name/company/email. */
  name: string | null;
  companyName: string | null;
  email: string | null;
}

/**
 * One pair (a = new, b = existing) → matched fields + score.
 * No matches → score=0 / matchFields=[].
 *
 * Inputs may be either raw or normalized — we re-normalize internally so
 * callers can mix and match without surprises.
 */
export function scoreCandidate(
  a: DedupeCandidate,
  b: DedupeCandidate,
): { score: number; matchFields: MatchField[] } {
  const matched: MatchField[] = [];

  if (a.businessCardImageHash && b.businessCardImageHash) {
    if (a.businessCardImageHash === b.businessCardImageHash) {
      matched.push('image_hash');
    }
  }

  const ae = normalizeEmail(a.email);
  const be = normalizeEmail(b.email);
  if (ae && be && ae === be) {
    matched.push('email');
  }

  const ap = normalizePhone(a.phone);
  const bp = normalizePhone(b.phone);
  if (ap && bp && ap === bp) {
    matched.push('phone');
  }

  const al = normalizeLinkedinUrl(a.linkedinUrl);
  const bl = normalizeLinkedinUrl(b.linkedinUrl);
  if (al && bl && al === bl) {
    matched.push('linkedin');
  }

  const ak = buildNameCompanyKey(a.name, a.companyName);
  const bk = buildNameCompanyKey(b.name, b.companyName);
  if (ak && bk && ak === bk && ak !== '|') {
    matched.push('name_company');
  }

  if (matched.length === 0) {
    return { score: 0, matchFields: [] };
  }

  const score = matched.reduce((acc, f) => Math.max(acc, MATCH_WEIGHTS[f]), 0);
  return { score, matchFields: matched };
}

/**
 * findDuplicates: For one new contact, return existing candidates that match
 * the threshold, sorted by score desc.
 *
 * @param threshold default 0.6 (= LinkedIn weak match minimum).
 */
export function findDuplicates(
  newContact: DedupeCandidate,
  candidates: DedupeCandidate[],
  threshold = 0.6,
): MatchResult[] {
  const out: MatchResult[] = [];
  for (const cand of candidates) {
    if (cand.contactId === newContact.contactId) continue;
    const { score, matchFields } = scoreCandidate(newContact, cand);
    if (score >= threshold && matchFields.length > 0) {
      out.push({
        contactId: cand.contactId,
        matchFields,
        score,
        capturedAt: cand.capturedAt ?? null,
        name: cand.name,
        companyName: cand.companyName,
        email: cand.email,
      });
    }
  }
  out.sort((x, y) => y.score - x.score);
  return out;
}
