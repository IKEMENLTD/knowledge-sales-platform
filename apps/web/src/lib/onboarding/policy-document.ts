import { createHash } from 'node:crypto';

/**
 * 利用規約・プライバシーポリシー本文と版数。
 * 注意: このファイルは `'use server'` を付けない (静的 export のため、Next.js 15 の
 * Server Actions 制約「server file は async 関数のみ export 可」を回避)。
 *
 * Compliance Round1 H-3 / H-5 対応:
 *   - 越境移転 (個情法第28条 / GDPR Art.13(1)(f), Art.46) を明示
 *   - 仮版数のままで本番に出ないよう NODE_ENV='production' で fail-fast
 */

export const TERMS_VERSION = '2026.05.0';
export const PRIVACY_VERSION = '2026.05.0';

const TERMS_BODY_DRAFT = `\
利用規約 (v${TERMS_VERSION})

第1条 本規約は、株式会社ナレッジホールディングス (以下「当社」) が提供する
Knowledge Sales Platform (以下「本サービス」) の利用に関する条件を定めるものです。

第2条 本サービスは、当社の従業員および所属コンサルタント、ならびに当社が個別に
利用を許可した者 (以下「利用者」) のみが利用できます。

第3条 利用者は、本サービスを通じて取得した商談記録・名刺情報・顧客連絡先を、
業務目的以外に使用してはなりません。

第4条 録画機能を利用する場合、利用者は事前に商談相手の同意を得るものとします。

第5条 利用者の所属が変わった場合 (退職等) 、当社は速やかに利用者の本サービスへの
アクセス権限を停止し、保有するデータを社内規程に従い処理します。
`;

const PRIVACY_BODY_DRAFT = `\
プライバシーポリシー (v${PRIVACY_VERSION})

1. 取得する情報
本サービスは、利用者の Google アカウントメールアドレス・氏名・組織所属に加え、
Google カレンダー予定 (商談情報) ・名刺画像・録画データを取得します。

2. 利用目的
営業活動の記録・社内ナレッジ蓄積・組織パフォーマンス分析のために利用します。

2-1. 外国にある第三者への提供 (個人情報保護法 第28条 / GDPR Art.13(1)(f), Art.46)
取得情報は下記の国に所在する当社委託先を通じて処理されます。各社とは DPA
(データ処理契約) および SCC (標準契約条項) を締結しています。
  - Anthropic (米国 / FTC 監督下)
  - OpenAI (米国 / FTC 監督下)
  - Cloudflare (米国 / FTC 監督下)
  - Render (米国 / FTC 監督下)
  - Supabase (シンガポール / PDPA 適用)
各国の個人情報保護制度に関する情報は、社内ポータルの「越境移転先一覧」で常時
公開しています (要請があれば紙面で交付します)。

3. 保管期間
取得した個人情報・録画データは、最終利用から 3 年間または利用者退職後 60 日のいずれか
早い日まで保管し、その後速やかに消去します (社内規程に基づく例外あり)。

4. 第三者提供
本サービスのデータは、法令に基づく開示要請を除き、第三者に提供されません。

5. 同意の撤回 (GDPR Art.7(3) / 個人情報保護法 第35条)
利用者はいつでも本同意を撤回できます。「設定 → プライバシー → 撤回」 から、
同意を与えたときと同じ手数で撤回が可能です。撤回後は本サービスの一部または
全部が利用できなくなる場合があります。

6. 同意ログ
本人が同意した版数・本文ハッシュ・同意日時・接続元情報を、撤回・退会後も
audit 用に最長 7 年保持します (上記 3 とは独立の保管期間)。
`;

/** "仮版数" "Phase1 開発中" の文字列が本番ビルドに残らないようガード。 */
function assertProductionSafe(body: string, label: string) {
  if (process.env.NODE_ENV !== 'production') return;
  const forbidden = ['仮版数', 'Phase1', 'Phase 1', 'draft', 'TODO'];
  for (const w of forbidden) {
    if (body.includes(w)) {
      throw new Error(
        `policy-document: forbidden draft phrase "${w}" found in ${label}. Replace with legal-approved body before production deploy.`,
      );
    }
  }
}

assertProductionSafe(TERMS_BODY_DRAFT, 'TERMS_BODY');
assertProductionSafe(PRIVACY_BODY_DRAFT, 'PRIVACY_BODY');

export const TERMS_BODY = TERMS_BODY_DRAFT;
export const PRIVACY_BODY = PRIVACY_BODY_DRAFT;

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

export const TERMS_HASH = sha256(TERMS_BODY);
export const PRIVACY_HASH = sha256(PRIVACY_BODY);
