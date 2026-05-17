import type { MatchField } from '@ksp/shared';
import {
  type DedupeCandidate,
  MATCH_WEIGHTS as SHARED_MATCH_WEIGHTS,
  buildNameCompanyKey,
  findDuplicates,
  normalizeLinkedinUrl,
  scoreCandidate,
  normalizeEmail as sharedNormalizeEmail,
  normalizeName as sharedNormalizeName,
  normalizePhone as sharedNormalizePhone,
} from '@ksp/shared';

/**
 * @deprecated Round 2 Architect HIGH-A-02
 *
 * 旧実装 (web 専用) は normalize / 重み / score 合成が worker と食い違っていたため
 * `@ksp/shared` の canonical 実装に統合した。本ファイルは backwards-compatible な
 * adapter としてのみ残し、新規コードは `@ksp/shared` を直接 import すること。
 *
 * 旧 API → 新 API 対応:
 *   - normalizeEmail / normalizePhone / normalizeName → @ksp/shared
 *   - MATCH_WEIGHTS                                    → @ksp/shared (重みも変更)
 *   - DedupeQueryInput / DedupeCandidateInput          → 内部で DedupeCandidate に変換
 *   - rankCandidates(query, candidates)                → findDuplicates(new, cands) を呼ぶ
 *   - evaluateMatch / scoreMatch                       → scoreCandidate に統合
 */

export const MATCH_WEIGHTS = SHARED_MATCH_WEIGHTS;

export function normalizeEmail(input: string | null | undefined): string | null {
  return sharedNormalizeEmail(input);
}

export function normalizePhone(input: string | null | undefined): string | null {
  return sharedNormalizePhone(input);
}

export function normalizeName(input: string | null | undefined): string | null {
  return sharedNormalizeName(input);
}

/**
 * 旧 web 側の query shape。新 API では DedupeCandidate に統合されている。
 * 旧 callsites を壊さないため alias として残す。
 */
export interface DedupeQueryInput {
  name: string | null;
  /** 旧 web 実装は companyId で同社判定していたが、新統合では companyName を使う */
  companyId: string | null;
  companyName?: string | null;
  normalizedEmail: string | null;
  normalizedPhone: string | null;
  businessCardImageHash: string | null;
  linkedinUrl: string | null;
}

export interface DedupeCandidateInput extends DedupeQueryInput {
  contactId: string;
}

export interface DedupeMatch {
  contactId: string;
  matchFields: MatchField[];
  matchScore: number;
}

function inputToCandidate(contactId: string, q: DedupeQueryInput): DedupeCandidate {
  return {
    contactId,
    name: q.name,
    companyName: q.companyName ?? q.companyId ?? null,
    email: q.normalizedEmail,
    phone: q.normalizedPhone,
    linkedinUrl: q.linkedinUrl,
    businessCardImageHash: q.businessCardImageHash,
  };
}

/** 旧 scoreMatch(fields) compat. 重みの最大値を返す。 */
export function scoreMatch(fields: MatchField[]): number {
  if (fields.length === 0) return 0;
  let score = 0;
  for (const f of fields) {
    score = Math.max(score, SHARED_MATCH_WEIGHTS[f]);
  }
  return Number(score.toFixed(4));
}

/** 旧 evaluateMatch(query, cand) compat. */
export function evaluateMatch(
  query: DedupeQueryInput,
  candidate: DedupeCandidateInput,
): DedupeMatch | null {
  const newC = inputToCandidate('__query__', query);
  const oldC = inputToCandidate(candidate.contactId, candidate);
  const { score, matchFields } = scoreCandidate(newC, oldC);
  if (matchFields.length === 0) return null;
  return {
    contactId: candidate.contactId,
    matchFields,
    matchScore: score,
  };
}

/**
 * 旧 rankCandidates(query, candidates) compat.
 *
 * 互換性 NOTE: 旧 web 実装は companyId 一致 + 名前一致 で name_company を判定して
 * いたが、canonical 実装は normalized company NAME 一致 + 名前一致 で判定する。
 * 旧呼び出しが companyId だけを渡している場合、これは "company name 文字列" として
 * 解釈される (UUID 同士の equality は引き続き機能するので false-negative にはならない)。
 */
export function rankCandidates(
  query: DedupeQueryInput,
  candidates: DedupeCandidateInput[],
): DedupeMatch[] {
  const newC = inputToCandidate('__query__', query);
  const matches: DedupeMatch[] = [];
  for (const c of candidates) {
    const oldC = inputToCandidate(c.contactId, c);
    const { score, matchFields } = scoreCandidate(newC, oldC);
    if (matchFields.length > 0) {
      matches.push({
        contactId: c.contactId,
        matchFields,
        matchScore: Number(score.toFixed(4)),
      });
    }
  }
  matches.sort((a, b) => b.matchScore - a.matchScore);
  return matches;
}

// 新規コードは shared の API を直接使う。再 export で導線を残す。
export { findDuplicates, scoreCandidate, normalizeLinkedinUrl };
export type { DedupeCandidate, MatchField };
