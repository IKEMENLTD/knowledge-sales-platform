import Anthropic from '@anthropic-ai/sdk';
import { ocrResultSchema, type OcrResult } from '@ksp/shared';
import { logger } from '../logger.js';

/**
 * Claude PROMPT-02 後処理 (Phase2 Round 2 P1-CT-07).
 *
 * 設計書 07_llm_prompts.md PROMPT-02 (business_card_post_ocr) に準拠した
 * 2nd-pass 補強。GoogleVisionProvider の heuristic では弱い以下 5 項目を
 * Claude (claude-sonnet-4-5) に再抽出させて `OcrResult.fields` に書き戻す。
 *
 * 補強対象:
 *   1. 姓名分離 — 「山田太郎」→ name=「山田 太郎」(姓名は半角スペース区切り)
 *   2. フリガナ推定 — 全角ひらがな or カタカナで `nameKana`
 *   3. 漢字社名 canonical 化 — "(株)ナレッジさん" / "株式会社ナレッジさん" → 統一
 *   4. 役職 / 部署正規化 — "営業部 マネージャー" は title (department は schema に列がないので合体保持)
 *   5. LinkedIn URL — rawText から linkedin.com/in/xxx を拾って fields に書く列が無いため
 *      rawText 末尾に既に含まれているはずなのでここでは「補強しない」 = 既存挙動を壊さない
 *
 * **schema 拡張は行わない** (directive)。
 *  - lastName / firstName / department などは ocrResultSchema に列が無いので
 *    `name` (姓 + 半角スペース + 名) と `title` (役職部分のみ) に正規化して書き戻す。
 *  - 元の Vision の値より「明らかに悪化」する場合は採用しない (品質ガード)。
 *
 * cost 概算:
 *  - 入力: system prompt ~400 tokens + Vision rawText 数百 tokens ≒ 600 tokens
 *  - 出力: JSON 7 項目 ≒ 150 tokens
 *  - claude-sonnet-4-5 単価: input $3/M + output $15/M
 *  - 1 名刺あたり ≒ 600×$3/M + 150×$15/M = $0.0018 + $0.00225 = **$0.004** 程度
 *    (directive 想定 $0.0003 は claude-haiku 想定。Sonnet では 1 桁高い)
 *
 * 失敗 / fallback ポリシー:
 *  - ANTHROPIC_API_KEY 不在 → warn log + Vision 結果をそのまま返す
 *  - timeout (30s) → 例外を catch して Vision 結果を返す (補強失敗 ≠ ジョブ失敗)
 *  - JSON parse 失敗 → 同上
 *  - maxRetries=0 (pgmq visibility timeout に委譲)
 */

// ----------------------------------------------------------------------------
// constants
// ----------------------------------------------------------------------------

/** Anthropic Messages API timeout (per request)。Vision より短く 30s に揃える。 */
const CLAUDE_POSTPROCESS_TIMEOUT_MS = 30_000;
/** 出力上限。JSON 7 項目で 512 tokens あれば十分。 */
const CLAUDE_POSTPROCESS_MAX_TOKENS = 512;
/** 使用モデル。設計書 07_llm_prompts L23 で claude-sonnet-4-5 指定。 */
const CLAUDE_POSTPROCESS_MODEL = 'claude-sonnet-4-5';

/** USD per 1M tokens (Anthropic 公式 2026-05)。summarize/providers.ts と同値。 */
const PRICE_INPUT_PER_M = 3.0;
const PRICE_OUTPUT_PER_M = 15.0;

/**
 * 設計書 07_llm_prompts.md PROMPT-02 準拠の system prompt。
 *
 * 実装上の差分:
 *  - "department" は schema に列が無いので、必要なら title に "{department} {役職}" で合体して返す
 *  - "mobile" は schema に専用列が無いので phone に統合
 *  - "confidence" は overallConfidence と統合するため top-level に置く
 *  - 元 fields を hint として渡し、新規補強分のみを返すことで token 削減
 */
const POSTPROCESS_SYSTEM_PROMPT = `あなたは日本語の名刺 OCR 後処理 AI です。
Google Cloud Vision が抽出した名刺の生テキスト (rawText) と heuristic 抽出済の fields を入力に、
以下のルールで構造化し直して JSON のみを返してください。

# 出力フォーマット (必ずこの JSON のみを返す。説明文や前置きは出力しない)

{
  "name": "氏名 (姓 + 半角スペース + 名。判別不能なら元の name を維持)",
  "nameKana": "全角ひらがな or カタカナの読み (姓 + 半角スペース + 名)",
  "title": "役職 (例: マネージャー / 部長 / CEO)。部署は含めず役職のみ",
  "department": "部署 (例: 営業部 / マーケティング部)。title と分離可能な場合のみ",
  "companyName": "会社名 canonical 形 (株式会社○○ / (株)○○ → 株式会社○○ に統一)",
  "email": "メールアドレス (元 fields.email をそのまま、無ければ rawText から抽出)",
  "phone": "電話番号 (国際/国内、ハイフン保持、無ければ rawText から抽出)",
  "address": "住所 (元 fields.address があればそれを優先、無ければ rawText から抽出)",
  "linkedinUrl": "linkedin.com/in/xxx 形式の URL (無ければ null)",
  "confidence": 0.0-1.0
}

# ルール
- rawText に根拠が無い情報は推測せず、該当項目は null とする
- 元 fields より明らかに悪化する場合は元 fields の値を維持する
- 姓名分離: 苗字辞典に頼らず、一般的な日本人 2-4 文字氏名のパターン (姓 1-2 文字 + 名 1-3 文字) で推定
- フリガナ推定: 鈴木 → すずき / 田中 → たなか 等の常用読み。確信度低い場合は null
- 会社名正規化: "(株)", "（株）", "株式会社" を "株式会社" に統一。前置 / 後置どちらでも先頭に置く
- 役職 / 部署: "営業部 マネージャー" → department: "営業部", title: "マネージャー"
- JSON 以外の文字列 (説明・コードフェンス) は出力しないこと。ただしコードフェンスで囲った場合も parse 可能とする`;

// ----------------------------------------------------------------------------
// public API
// ----------------------------------------------------------------------------

/**
 * Claude PROMPT-02 で OcrResult を 2nd-pass 補強する。
 *
 * **失敗時は throw せず元の OcrResult をそのまま返す**。
 * (補強失敗 = ジョブ失敗ではない。Vision 結果だけで status='pending_review' に進む)
 *
 * @param ocr — Vision (or 他 provider) 出力の OcrResult
 * @returns 補強後 OcrResult。provider は "gcv+claude" に書き換え (元が 'gcv' のとき)。
 *          estimatedCostUsd は Vision + Claude の合算。
 */
export async function enrichWithClaude(ocr: OcrResult): Promise<OcrResult> {
  const log = logger.child({ op: 'ocr.claude-postprocess' });

  // ---- API key チェック ----
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.length === 0 || apiKey === 'sk-ant-test') {
    log.warn(
      { provider: ocr.provider },
      'ANTHROPIC_API_KEY missing; skipping Claude post-process (Vision result preserved)',
    );
    return ocr;
  }

  // ---- 空 rawText は補強しても意味がない ----
  if (!ocr.rawText || ocr.rawText.trim().length === 0) {
    log.info({ provider: ocr.provider }, 'rawText empty; skipping Claude post-process');
    return ocr;
  }

  // ---- Anthropic SDK 呼出 ----
  const client = new Anthropic({
    apiKey,
    timeout: CLAUDE_POSTPROCESS_TIMEOUT_MS,
    maxRetries: 0,
  });

  const userText = buildUserPrompt(ocr);

  let res: Awaited<ReturnType<typeof client.messages.create>>;
  try {
    res = await client.messages.create(
      {
        model: CLAUDE_POSTPROCESS_MODEL,
        max_tokens: CLAUDE_POSTPROCESS_MAX_TOKENS,
        system: POSTPROCESS_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userText }],
      },
      { signal: AbortSignal.timeout(CLAUDE_POSTPROCESS_TIMEOUT_MS) },
    );
  } catch (err) {
    // 補強失敗 → Vision 結果をそのまま返す (ジョブは継続)
    log.warn(
      { err: (err as Error).message, name: (err as Error).name },
      'Claude post-process API call failed; preserving Vision result',
    );
    return ocr;
  }

  // ---- text 抽出 ----
  const text = (res.content ?? [])
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

  if (text.length === 0) {
    log.warn({ provider: ocr.provider }, 'Claude post-process empty response; preserving Vision result');
    return ocr;
  }

  // ---- JSON parse (寛容: ```json``` フェンス除去) ----
  const parsed = parseJsonLoose(text);
  if (!parsed.ok) {
    log.warn(
      { reason: parsed.reason, snippet: text.slice(0, 200) },
      'Claude post-process JSON parse failed; preserving Vision result',
    );
    return ocr;
  }

  // ---- cost 算出 (Vision + Claude 合算) ----
  const inputTokens = Math.max(0, Number(res.usage?.input_tokens) || 0);
  const outputTokens = Math.max(0, Number(res.usage?.output_tokens) || 0);
  const claudeCostUsd =
    (inputTokens / 1_000_000) * PRICE_INPUT_PER_M +
    (outputTokens / 1_000_000) * PRICE_OUTPUT_PER_M;
  const baseCost = ocr.estimatedCostUsd ?? 0;
  const totalCostUsd = baseCost + claudeCostUsd;

  // ---- fields 統合 (Claude が "明らかに悪化" させていないかチェックして書き戻し) ----
  const enrichedFields = mergeFields(ocr.fields, parsed.value);

  // ---- field-level confidence: 新規 / 上書きされた field は Claude confidence で再計算 ----
  const claudeConfidence = clamp01(
    typeof parsed.value.confidence === 'number' && Number.isFinite(parsed.value.confidence)
      ? Number(parsed.value.confidence)
      : 0.85,
  );
  const enrichedFieldConfidence = mergeFieldConfidence(
    ocr.fieldConfidence,
    ocr.fields,
    enrichedFields,
    claudeConfidence,
  );

  // provider 識別子: 元が 'gcv' なら 'gcv+claude' に昇格
  const newProvider = ocr.provider === 'gcv' ? 'gcv+claude' : `${ocr.provider}+claude`;

  log.info(
    {
      baseProvider: ocr.provider,
      inputTokens,
      outputTokens,
      claudeCostUsd,
      totalCostUsd,
      enrichedFields: diffFields(ocr.fields, enrichedFields),
    },
    'Claude post-process enrichment completed',
  );

  const result: OcrResult = {
    ...ocr,
    fields: enrichedFields,
    fieldConfidence: enrichedFieldConfidence,
    provider: newProvider,
    estimatedCostUsd: totalCostUsd,
  };
  return ocrResultSchema.parse(result);
}

// ----------------------------------------------------------------------------
// helpers (internal)
// ----------------------------------------------------------------------------

/** ユーザープロンプト本体。Vision の rawText + 既存 fields を hint として渡す。 */
function buildUserPrompt(ocr: OcrResult): string {
  const lines: string[] = [];
  lines.push('# rawText (Vision OCR)');
  lines.push(ocr.rawText.trim());
  lines.push('');
  lines.push('# heuristic fields (補強の hint。明らかに悪化させない範囲で正規化)');
  lines.push(JSON.stringify(ocr.fields, null, 2));
  return lines.join('\n');
}

/**
 * Claude が返した JSON を OcrResult.fields の形に合体する。
 *
 * 戦略:
 *  - Claude が新たな値を提供した field は採用する
 *  - Claude が null / 空文字を返した field は元の Vision 値を維持する
 *  - email / phone は元 Vision が regex 抽出済なので「元を優先」(Claude の誤り混入リスク回避)
 *  - department は schema 列がないので title に "{department} {title}" で合体保持
 *  - linkedinUrl は schema 列がないので捨てる (rawText に元々含まれる)
 */
function mergeFields(
  base: OcrResult['fields'],
  raw: Record<string, unknown>,
): OcrResult['fields'] {
  const merged: OcrResult['fields'] = { ...base };

  // name: 姓名分離後の値が優先
  const newName = toStr(raw.name);
  if (newName && isReasonableName(newName)) {
    merged.name = newName;
  }

  // nameKana: Claude のフリガナを優先 (Vision の heuristic はひらがなのみ)
  const newKana = toStr(raw.nameKana);
  if (newKana && isReasonableKana(newKana)) {
    merged.nameKana = newKana;
  }

  // title + department: department があれば "{department} {title}" で合体
  const newTitle = toStr(raw.title);
  const newDept = toStr(raw.department);
  if (newTitle || newDept) {
    const combined = [newDept, newTitle].filter((s) => s && s.length > 0).join(' ');
    if (combined.length > 0 && combined.length <= 80) {
      merged.title = combined;
    }
  }

  // companyName: canonical 化された値を採用
  const newCompany = toStr(raw.companyName);
  if (newCompany && newCompany.length <= 100) {
    merged.companyName = newCompany;
  }

  // email: 元 Vision (regex 抽出) を優先。Vision が無いときだけ Claude を採用
  if (!merged.email) {
    const newEmail = toStr(raw.email);
    if (newEmail && /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(newEmail)) {
      merged.email = newEmail;
    }
  }

  // phone: 元 Vision を優先。Vision が無いときだけ Claude を採用
  if (!merged.phone) {
    const newPhone = toStr(raw.phone);
    if (newPhone && /\d/.test(newPhone)) {
      merged.phone = newPhone;
    }
  }

  // address: Claude が補強した値があれば採用 (Vision heuristic より精度高い想定)
  const newAddress = toStr(raw.address);
  if (newAddress && newAddress.length >= 5 && newAddress.length <= 200) {
    merged.address = newAddress;
  }

  return merged;
}

/** field 値の差分を log 用に集計。 */
function diffFields(
  before: OcrResult['fields'],
  after: OcrResult['fields'],
): string[] {
  const keys: Array<keyof OcrResult['fields']> = [
    'name',
    'nameKana',
    'title',
    'email',
    'phone',
    'companyName',
    'address',
  ];
  const changed: string[] = [];
  for (const k of keys) {
    if (before[k] !== after[k]) changed.push(k);
  }
  return changed;
}

/** Claude confidence を「Claude が新たに埋めた / 書き換えた field」のみ反映。 */
function mergeFieldConfidence(
  baseConfidence: OcrResult['fieldConfidence'],
  baseFields: OcrResult['fields'],
  enrichedFields: OcrResult['fields'],
  claudeConfidence: number,
): OcrResult['fieldConfidence'] {
  const merged: OcrResult['fieldConfidence'] = { ...baseConfidence };
  const keys: Array<keyof OcrResult['fieldConfidence']> = [
    'name',
    'nameKana',
    'title',
    'email',
    'phone',
    'companyName',
    'address',
  ];
  for (const k of keys) {
    const before = baseFields[k];
    const after = enrichedFields[k];
    if (after !== undefined && after !== before) {
      // 新規 or 上書き → Claude confidence を採用
      merged[k] = claudeConfidence;
    } else if (after !== undefined && merged[k] === undefined) {
      // base に値はあったが confidence が無い場合のみ補完
      merged[k] = claudeConfidence;
    }
  }
  return merged;
}

/** 寛容な JSON parser (summarize providers のロジックを軽量化)。 */
function parseJsonLoose(
  text: string,
): { ok: true; value: Record<string, unknown> } | { ok: false; reason: string } {
  let body = text.trim();

  // code fence 除去
  const fenceMatch = body.match(/^```(?:json)?\s*\n([\s\S]*?)\n?```\s*$/i);
  if (fenceMatch && fenceMatch[1]) {
    body = fenceMatch[1].trim();
  }

  // 先頭が `{` でなければ、最初の `{` から最後の `}` までを取り出す
  if (!body.startsWith('{')) {
    const first = body.indexOf('{');
    const last = body.lastIndexOf('}');
    if (first >= 0 && last > first) {
      body = body.slice(first, last + 1);
    }
  }

  try {
    const v = JSON.parse(body);
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return { ok: true, value: v as Record<string, unknown> };
    }
    return { ok: false, reason: 'top-level is not an object' };
  } catch (err) {
    return { ok: false, reason: `JSON.parse: ${(err as Error).message}` };
  }
}

/** unknown → trimmed string or undefined。 */
function toStr(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const trimmed = v.trim();
  if (trimmed.length === 0) return undefined;
  // 'null' / 'undefined' 文字列ガード (LLM がよく返す)
  if (/^(null|undefined|none|n\/a)$/i.test(trimmed)) return undefined;
  return trimmed;
}

/** 姓名候補の sanity check。1〜30 文字、明らかな URL/メール混入を排除。 */
function isReasonableName(s: string): boolean {
  if (s.length < 1 || s.length > 30) return false;
  if (/[@/]/.test(s)) return false;
  return true;
}

/** フリガナの sanity check。ひらがな or カタカナ (+ 半角スペース) のみ許容。 */
function isReasonableKana(s: string): boolean {
  if (s.length < 1 || s.length > 30) return false;
  return /^[぀-ゟ゠-ヿ\s]+$/.test(s);
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}
