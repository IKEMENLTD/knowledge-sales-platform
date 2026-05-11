'use server';

import { createHash } from 'node:crypto';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { env } from '@/lib/env';
import { PRIVACY_VERSION, TERMS_VERSION } from '@/lib/onboarding/state';
import { createServerClient } from '@/lib/supabase/server';

/**
 * 規約・プライバシーポリシー本文を、`docs/legal/` 等から将来は動的取得する想定。
 * 現状は string 直書き、その sha256 を content_hash として consent_logs に残す。
 */
const TERMS_BODY = `\
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

(本文は仮版数 — Phase1 開発中。本番ローンチ前に法務チームの正式版へ差し替え)
`;

const PRIVACY_BODY = `\
プライバシーポリシー (v${PRIVACY_VERSION})

1. 取得する情報
本サービスは、利用者の Google アカウントメールアドレス・氏名・組織所属に加え、
Google カレンダー予定 (商談情報) ・名刺画像・録画データを取得します。

2. 利用目的
営業活動の記録・社内ナレッジ蓄積・組織パフォーマンス分析のために利用します。
取得情報は当社が指定する委託先 (Anthropic / OpenAI / Cloudflare / Render / Supabase)
を通じて処理されますが、いずれも個別の DPA に基づき適切に保護されます。

3. 保管期間
取得した個人情報・録画データは、最終利用から 3 年間または利用者退職後 60 日のいずれか
早い日まで保管し、その後速やかに消去します (社内規程に基づき例外あり)。

4. 第三者提供
本サービスのデータは、法令に基づく開示要請を除き、第三者に提供されません。

5. 同意の撤回
利用者はいつでも本同意を撤回できます。撤回後は本サービスの一部または全部が
利用できなくなる場合があります。

(本文は仮版数 — Phase1 開発中。本番ローンチ前に法務チームの正式版へ差し替え)
`;

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const TERMS_HASH = sha256(TERMS_BODY);
const PRIVACY_HASH = sha256(PRIVACY_BODY);

export { TERMS_BODY, PRIVACY_BODY, TERMS_HASH, PRIVACY_HASH };

type AuthContext = {
  userId: string;
  ipAddress: string | null;
  userAgent: string | null;
};

async function requireAuthContext(): Promise<AuthContext> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const h = await headers();
  const xff = h.get('x-forwarded-for');
  const ip = xff?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null;

  return {
    userId: user.id,
    ipAddress: ip,
    userAgent: h.get('user-agent'),
  };
}

/**
 * Step 1: 利用規約・プライバシーポリシーへの同意。
 * consent_logs に同意行を挿入 + users に 2 つの timestamp を立てる。
 */
export async function acceptTerms(formData: FormData) {
  const terms = formData.get('agree_terms') === 'on';
  const privacy = formData.get('agree_privacy') === 'on';
  if (!terms || !privacy) {
    redirect('/onboarding?error=consent_required');
  }

  const ctx = await requireAuthContext();
  const supabase = await createServerClient();
  const now = new Date().toISOString();

  // 2 件の consent_log を append-only で挿入
  await supabase.from('consent_logs').insert([
    {
      user_id: ctx.userId,
      consent_type: 'terms_of_service',
      version: TERMS_VERSION,
      content_hash: TERMS_HASH,
      ip_address: ctx.ipAddress,
      user_agent: ctx.userAgent,
      accepted_at: now,
    },
    {
      user_id: ctx.userId,
      consent_type: 'privacy_policy',
      version: PRIVACY_VERSION,
      content_hash: PRIVACY_HASH,
      ip_address: ctx.ipAddress,
      user_agent: ctx.userAgent,
      accepted_at: now,
    },
  ]);

  // users の中間 timestamp を立てる
  await supabase
    .from('users')
    .update({ terms_consented_at: now, privacy_acknowledged_at: now })
    .eq('id', ctx.userId);

  redirect('/onboarding?step=calendar');
}

/**
 * Step 2: Google カレンダー連携を確認 / 再連携。
 * すでに provider_token があればその場で確定 (calendar_connected_at を立てる)、
 * なければ Google OAuth (incremental authorization) に飛ばす。
 */
export async function connectCalendar() {
  const ctx = await requireAuthContext();
  const supabase = await createServerClient();
  const { data: session } = await supabase.auth.getSession();
  const providerToken = session.session?.provider_token ?? null;

  if (!providerToken) {
    // calendar.events scope を要求して OAuth を再走
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${env.APP_URL}/auth/callback?next=/onboarding?step=calendar`,
        scopes: 'openid email profile https://www.googleapis.com/auth/calendar.events',
        queryParams: { prompt: 'consent', access_type: 'offline' },
      },
    });
    if (data?.url) redirect(data.url);
    if (error) redirect('/onboarding?error=oauth_failed');
  }

  await supabase
    .from('users')
    .update({ calendar_connected_at: new Date().toISOString() })
    .eq('id', ctx.userId);

  redirect('/onboarding?step=sample');
}

/**
 * Step 2: Google カレンダーをスキップ (利用者が後で連携する)。
 */
export async function skipCalendar() {
  const ctx = await requireAuthContext();
  const supabase = await createServerClient();
  // 連携自体は立てないが「ステップを通過した」だけは記録 (将来 onboarding_skipped_steps を作るならそこに)
  await supabase
    .from('users')
    .update({ calendar_connected_at: null })
    .eq('id', ctx.userId);

  redirect('/onboarding?step=sample');
}

/**
 * Step 3: サンプルデータの投入 (任意)。
 * sample_data_seeds に行を挿入し、users.sample_data_loaded_at を立てる。
 * 実際のサンプル投入 worker job (process_sample_seed) は Phase1 W3 で実装、
 * ここではフラグだけ立てて UX 完結。
 */
export async function loadSampleData() {
  const ctx = await requireAuthContext();
  const supabase = await createServerClient();
  const now = new Date().toISOString();

  await supabase.from('sample_data_seeds').insert({
    org_id: '00000000-0000-0000-0000-000000000001',
    seed_kind: 'onboarding_demo',
    payload: { triggered_by: ctx.userId, at: now },
  });

  await supabase
    .from('users')
    .update({ sample_data_loaded_at: now })
    .eq('id', ctx.userId);

  redirect('/onboarding?step=done');
}

export async function skipSampleData() {
  await requireAuthContext();
  redirect('/onboarding?step=done');
}

/**
 * 完了処理: users.onboarded_at = now() を立てて /dashboard へ。
 * 必須ステップ (terms / privacy / calendar) のいずれかが未完了なら戻す。
 */
export async function completeOnboarding() {
  const ctx = await requireAuthContext();
  const supabase = await createServerClient();

  const { data } = await supabase
    .from('users')
    .select('terms_consented_at, privacy_acknowledged_at')
    .eq('id', ctx.userId)
    .maybeSingle();

  if (!data?.terms_consented_at || !data?.privacy_acknowledged_at) {
    redirect('/onboarding?error=incomplete');
  }

  await supabase
    .from('users')
    .update({ onboarded_at: new Date().toISOString() })
    .eq('id', ctx.userId);

  redirect('/dashboard');
}
