# Architecture / Code Quality Review — Onboarding Round 1

- 対象: commit `571d804` (`apps/web/src/app/onboarding/**` + `apps/web/src/lib/auth/onboarding.ts` + `apps/web/src/lib/onboarding/state.ts` + `packages/db/src/migrations/manual/0029_consent_logs.sql`)
- 仕様根拠: `docs/spec/sales_platform_design_spec_v2.xlsx` (`04_api_endpoints` / `05_jobs_queues` / `08_security_rls` / `19_onboarding_initial`)
- 観点: Next.js 15 App Router Server Actions / Supabase RLS / TypeScript strict (`noUncheckedIndexedAccess`)
- 採点ルール: Critical -8 / High -5 / Medium -2 / Minor -1

---

## 採点サマリ

| # | 観点 | 配点 | 減点 | 得点 | 主な指摘 |
|---|---|---|---|---|---|
| 1 | Server Action 設計 | 20 | -13 | **7.0** | C1 `'use server'` ファイルから非 async export / C2 redirect が try 外でも catch されない仕様の理解欠如 / H1 idempotency 完全欠落 / H2 supabase 戻り値 error 無視 |
| 2 | 状態管理 | 15 | -7 | **8.0** | H3 step searchParams 任意改ざんで前進 / M1 hasCalendarScope は session.provider_token 由来で短命・状態管理が壊れる / M2 resolveActive が done で users.onboarded_at を立てない経路あり |
| 3 | RLS / セキュリティ境界 | 15 | -10 | **5.0** | C3 sample_data_seeds は authenticated INSERT が REVOKE されているのに authenticated client から insert している (即 RLS 違反 / 失敗無視で UI は前進) / H4 consent_logs insert 時 org_id がリクエスト元 user の org と一致しない default '...001' に固定 / M3 server action 内で auth.getUser だけで auth.getSession の二度引きが重複 |
| 4 | 型安全性 | 15 | -5 | **10.0** | H5 FormData.get の戻りが string\|File\|null だが narrowing せず `=== 'on'` 比較で潜在的 false-negative / M4 supabase 戻り値の data 型が unknown 同等で as キャストが requireUser に残存 / M5 入力 validation (Zod 等) 不在 |
| 5 | SQL 設計 | 10 | -4 | **6.0** | H6 (user_id, consent_type, version) UNIQUE 不在で再同意ごとに重複行 / M6 withdrawn_at UPDATE policy が他列の改ざんを RLS では止められない (列レベル制約 / トリガで二重防御すべき) / m1 created_at と accepted_at の役割重複 |
| 6 | エラー回復 | 10 | -7 | **3.0** | C4 sample 投入失敗を握り潰し sample_data_loaded_at を立ててしまう (UI は完了表示・DB に痕跡なし) / H7 connectCalendar の OAuth error 時に redirect しないと calendar_connected_at が NULL UPDATE で潰れる / M7 部分完了 retry 用の state machine が無い |
| 7 | テスタビリティ | 5 | -3 | **2.0** | H8 supabase / headers / redirect が server action 内でハードバインドされており DI が一切無く unit test 不可 / m2 sha256(TERMS_BODY) が module top-level で副作用評価 |
| 8 | 拡張性 | 5 | -2 | **3.0** | M8 step 追加が page.tsx の resolveActive / buildStepperState / consent_type CHECK 3 箇所同時改修必須 / m3 STEP_ERROR_TEXT が page.tsx に inline |
| 9 | 読みやすさ | 5 | -1 | **4.0** | m4 `void TERMS_HASH; void PRIVACY_HASH;` の不可解な sink、`'use server'` ファイルの export 構造、page.tsx の中で SearchParams 型と Step 型が重複定義 |
| **合計** | **100** | **-52** | **48.0** | |

**判定: FAIL (48.0 / 100)**。実運用以前にビルド or 初回実行で必ず壊れる Critical 4 件、Senior エンジニアの review なら必ずブロックされるレベル。

---

## 検出された問題 (Critical → Minor)

### C1 — `'use server'` ファイルから非 async 値を export している (Critical / -8)

**場所**: `apps/web/src/lib/auth/onboarding.ts:1, 64`

```ts
'use server';
// ...
export { TERMS_BODY, PRIVACY_BODY, TERMS_HASH, PRIVACY_HASH };
```

Next.js 15 の制約: **`'use server'` directive が付いたファイルは、export できるのは async 関数のみ**。string 定数や hash 値を export すると、Webpack の Server Actions プラグインが

```
Error: Only async functions are allowed to be exported in a "use server" file.
```

を投げてビルドが落ちる (もしくは production runtime で server action client reference に変換されて壊れる)。`apps/web/src/app/onboarding/page.tsx:22-23` の `void TERMS_HASH; void PRIVACY_HASH;` は実装者がこの問題に気付いて型エラー回避だけ試した形跡だが、本質的な解消にはなっていない。

**修正案**:
- `TERMS_BODY` / `PRIVACY_BODY` / `TERMS_VERSION` / `TERMS_HASH` 等の **静的データは別ファイル** (例: `apps/web/src/lib/onboarding/policy-document.ts`, `'use server'` 無し) に隔離
- `'use server'` ファイルは action 関数 (`acceptTerms`, `connectCalendar`, ...) のみに専念
- `page.tsx` の `void` 文も削除

```ts
// apps/web/src/lib/onboarding/policy-document.ts  (no 'use server')
import { createHash } from 'node:crypto';
export const TERMS_VERSION = '2026.05.0';
export const PRIVACY_VERSION = '2026.05.0';
export const TERMS_BODY = `...`;
export const PRIVACY_BODY = `...`;
export const TERMS_HASH = createHash('sha256').update(TERMS_BODY).digest('hex');
export const PRIVACY_HASH = createHash('sha256').update(PRIVACY_BODY).digest('hex');
```

---

### C2 — `redirect()` を try/finally なしの素直なフローで多用、catch されると永久ループ (Critical / -8)

**場所**: `apps/web/src/lib/auth/onboarding.ts:97-99, 133, 142, 156-158, 166, 181, 206, 211, 229, 237`

Next.js の `redirect()` は内部的に `NEXT_REDIRECT` という特殊な error を throw する。**try/catch で握ると redirect が消える / finally 経路でフォロー処理が走るとデータ破壊**につながる。本コードでは現状 try/catch なしだが、Sentry 等の error boundary が拾ってしまうと「永遠に `/onboarding?error=consent_required` に戻る」「provider_token を NULL のままで calendar_connected_at だけ立つ」の死亡パターンを生む。

加えて、`acceptTerms` (L94-134) は **`redirect('/onboarding?step=calendar')` の前に DB INSERT を 2 つ + UPDATE 1 つを await する**設計だが、`supabase.from('consent_logs').insert(...)` の戻り値 `{ data, error }` の **error を一度も見ていない** (H2 参照)。RLS で REJECT されても、UPDATE で 0 行マッチでも、`users.terms_consented_at` が立たないまま `?step=calendar` に進み、`/onboarding` 再訪時 `resolveActive` が `'consent'` に戻し、ユーザは無限ループする。

**修正案**:
```ts
const { error: insErr } = await supabase.from('consent_logs').insert([...]);
if (insErr) {
  // logger.error('consent_logs.insert failed', { userId: ctx.userId, error: insErr });
  redirect('/onboarding?error=consent_save_failed');
}
const { error: updErr } = await supabase.from('users').update({...}).eq('id', ctx.userId);
if (updErr) redirect('/onboarding?error=consent_save_failed');
// revalidatePath('/onboarding'); // ← これも必要 (M9)
redirect('/onboarding?step=calendar');
```

---

### C3 — `loadSampleData` が authenticated client で REVOKE 済みテーブルに INSERT を打つ (Critical / -8)

**場所**: `apps/web/src/lib/auth/onboarding.ts:190-207` + `packages/db/src/migrations/manual/0021_sample_data_seeds.sql:36`

0021 migration の L36:
```sql
revoke insert, update, delete on public.sample_data_seeds from authenticated, anon;
```

しかし `loadSampleData` は **anon key + cookie 認証 (authenticated role)** で動く `createServerClient()` 経由で:
```ts
await supabase.from('sample_data_seeds').insert({
  org_id: '00000000-0000-0000-0000-000000000001', // ← ハードコード
  seed_kind: 'onboarding_demo',
  payload: { triggered_by: ctx.userId, at: now },
});
```
これは **100% RLS / GRANT で REJECT される**。`{ data: null, error: { code: '42501', ... } }` が返るがコードは error を無視し、続く `users.update({ sample_data_loaded_at })` だけ通る (users self update policy は 0012_rls_v2 L72 で許可)。**UI は「サンプル投入完了」を表示するが、実際にはサンプル投入 job も seed 行も無い**。仕様 (`19_onboarding_initial` Step4) で要求された「sample_data_seeds に行が残り、worker が contact/meeting/recording を生成」が一切起きない致命バグ。

加えて 0021 のコメント L7-9 で「適用元は admin の手動投入 + onboarding GAS のいずれかで、いずれにしても service_role 経由のため authenticated は読み取りのみ」と明示されている。**設計仕様と実装が真っ向から矛盾**している。

**修正案 (どちらか)**:

(a) サンプル投入は server action から発火せず、**Edge Function (service_role)** を `/api/onboarding/sample-mode` 経由で呼ぶ (仕様 `04_api_endpoints` AP-138 と整合):
```ts
// loadSampleData
const r = await fetch(`${env.APP_URL}/api/onboarding/sample-mode`, {
  method: 'POST',
  headers: { cookie: (await headers()).get('cookie') ?? '' },
  body: JSON.stringify({ step5_view_only: false }),
});
if (!r.ok) redirect('/onboarding?error=sample_failed');
```
- Edge Function 側で service_role client を作り insert
- Idempotency-Key を `org_id + user_id + 'onboarding_demo'` で発行 (0009)

(b) `sample_data_seeds` の RLS を「**self insert (`applied_by = auth.uid()`) のみ許可、ただし seed_kind は CHECK で onboarding_demo に限定**」へ緩める policy を新規 migration で追加。ただし「実 worker は service_role」「authenticated は flag を立てるだけ」設計と整合せず非推奨。

---

### C4 — sample 投入失敗を握り潰して `sample_data_loaded_at` を立てる (Critical / -8) ※ C3 と一体だが評価軸が違うため別カウント (-8 → -7 に減点しエラー回復軸へ計上)

C3 で indicate した「`{ error }` 無視」が、エラー回復の文脈ではさらに重い意味を持つ。本来 retry / partial completion / 部分失敗の SOP を踏むべきところ、**完了フラグだけ立てて隠蔽**する設計は再現困難な「データなし完了」状態を生み、サポート対応の sink になる。

**修正案**: 全 server action で
```ts
const { error } = await supabase.from(...).insert(...);
if (error) {
  // Sentry に送る (logger 経由)
  redirect(`/onboarding?error=${mapErrorCode(error)}`);
}
```
の defensive pattern を徹底。`mapErrorCode` は `42501` → `permission_denied`, `23505` → `already_done`, etc.

---

### H1 — Idempotency が完全欠落 (High / -5)

**場所**: `apps/web/src/lib/auth/onboarding.ts` 全 action

問題シナリオ:
1. `acceptTerms`: 同一 user が「同意して次へ」を 2 回連打すると、`consent_logs` に 4 行 (terms 2 + privacy 2) が積まれる。0029 migration L33 の `created_at default now()` で時刻は異なるが、`(user_id, consent_type, version) UNIQUE` 制約が無いため重複検知できない。Compliance audit で「同意は 1 回」が証跡として要求される場面で問題。
2. `loadSampleData`: `sample_data_seeds (org_id, seed_kind) UNIQUE` 制約 (0021 L20-21) で 2 回目は 23505 を返すが、コードは error 無視 (C3) で気付かない。
3. `connectCalendar`: OAuth は idempotent だが、provider_token が更新されると `calendar_connected_at` も毎回上書き → 最初の連携日時が失われる。

**修正案**:

```sql
-- 0029_consent_logs.sql に追加
alter table public.consent_logs
  add constraint consent_logs_user_type_version_uq
  unique (user_id, consent_type, version);
```

```ts
// acceptTerms
await supabase.from('consent_logs').upsert(
  [...],
  { onConflict: 'user_id,consent_type,version', ignoreDuplicates: true },
);

// users.update も冪等。calendar_connected_at は coalesce で初回時刻保持:
await supabase
  .from('users')
  .update({ calendar_connected_at: now }) // ← 既に値があれば preserve したい
  .eq('id', ctx.userId)
  .is('calendar_connected_at', null); // ← initial connection time を保護
```

---

### H2 — Supabase 戻り値 `{ error }` を一度も見ていない (High / -5) ※ C2/C3/C4 と重なるが汎用問題として計上

**場所**: `auth/onboarding.ts` 全 await 文 (L106, L128, L161, L176, L195, L201, L232)

全 7 箇所の DB 操作で `error` を無視している。RLS 違反・network failure・constraint violation すべて silent fail。`state.ts:33` `getOnboardingState` も同様で、`data` が null でも `?.` チェーンで素通り。

**修正案**: `lib/supabase/with-error.ts` のような helper:
```ts
export async function expect<T>(p: Promise<{ data: T | null; error: any }>, ctx: string): Promise<T> {
  const { data, error } = await p;
  if (error) throw new SupabaseOpError(ctx, error);
  if (data === null) throw new SupabaseOpError(ctx, { code: 'NOT_FOUND' });
  return data;
}
```
を各 action でラップ。`SupabaseOpError` を `error.tsx` boundary で `redirect('/onboarding?error=...')` に変換。

---

### H3 — `step` searchParams で任意の画面に飛べる (High / -5)

**場所**: `apps/web/src/app/onboarding/page.tsx:39-46` (`resolveActive`)

```ts
if (step === 'consent' || step === 'calendar' || step === 'sample' || step === 'done') {
  return step;
}
```

`?step=done` を URL 直打ちすると `StepDone` (`completeOnboarding` button) が即出現。`completeOnboarding` (L218-238) は terms / privacy のみ check するが、calendar は check しない。仕様 `19_onboarding_initial` で `calendar` は P1 で完了必須 (`isFullyOnboarded` 自体は L57-63 で calendar も必須にしているのに、`completeOnboarding` は terms/privacy のみ確認) → **不整合**。

**修正案**:
```ts
// completeOnboarding
const { data } = await supabase
  .from('users')
  .select('terms_consented_at, privacy_acknowledged_at, calendar_connected_at')
  .eq('id', ctx.userId)
  .maybeSingle();

if (!data?.terms_consented_at || !data?.privacy_acknowledged_at || !data?.calendar_connected_at) {
  redirect('/onboarding?error=incomplete');
}
```
+ `resolveActive` で `step=done` 指定時にも state を実検証して、未完了なら降格:
```ts
if (step === 'done' && !isFullyOnboarded(state)) {
  // fall through to natural progression
} else if (validSteps.includes(step)) {
  return step;
}
```

---

### H4 — `consent_logs.org_id` のハードコード default を user の実 org_id に差し替えていない (High / -5)

**場所**: `packages/db/src/migrations/manual/0029_consent_logs.sql:17` + `auth/onboarding.ts:106-125`

```sql
org_id uuid not null default '00000000-0000-0000-0000-000000000001',
```

acceptTerms の insert 文では org_id を明示せず default 任せ。Phase2 マルチテナント期 (0027 placeholder) で `default DROP` を当てる前提が `08_security_rls` のレビュー round4 で確定済なので、ここで **「INSERT 側で `org_id` を必ず指定する」**コードを今のうちに入れておかないと Phase2 cutover で全 onboarding action が落ちる。Round4 security の S3-H-01 と同根の負債。

**修正案**:
```ts
// users から org_id を select してから insert
const { data: u } = await supabase.from('users').select('org_id').eq('id', ctx.userId).maybeSingle();
const orgId = u?.org_id ?? null;
if (!orgId) redirect('/onboarding?error=org_missing');

await supabase.from('consent_logs').insert([
  { user_id: ctx.userId, org_id: orgId, consent_type: 'terms_of_service', ... },
  { user_id: ctx.userId, org_id: orgId, consent_type: 'privacy_policy',  ... },
]);
```
+ 0029 migration の `default '00000000-...001'` も DROP する別 migration を `0030_consent_logs_no_default_org.sql` で予約 (Phase2 切替時に有効化)。

---

### H5 — FormData narrowing が雑で false-negative リスク (High / -5)

**場所**: `apps/web/src/lib/auth/onboarding.ts:95-96`

```ts
const terms = formData.get('agree_terms') === 'on';
const privacy = formData.get('agree_privacy') === 'on';
```

`FormData.get()` の戻りは `FormDataEntryValue | null = string | File | null`。ブラウザによっては `value=""` の checkbox を string `""` で送るパスがあり、また `<input type="checkbox" value="true">` 等で実装が変わると即崩れる。step-consent.tsx (L153-156) では `value` 属性を指定していないため現在は "on" だが、将来の改修で簡単に壊れる。

**修正案**: Zod ベースの form parser:
```ts
import { z } from 'zod';

const ConsentInput = z.object({
  agree_terms: z.literal('on').or(z.literal('true')),
  agree_privacy: z.literal('on').or(z.literal('true')),
});

export async function acceptTerms(formData: FormData) {
  const raw = Object.fromEntries(formData);
  const parsed = ConsentInput.safeParse(raw);
  if (!parsed.success) redirect('/onboarding?error=consent_required');
  // ...
}
```

---

### H6 — `consent_logs` に `(user_id, consent_type, version) UNIQUE` が無い (High / -5)

**場所**: `packages/db/src/migrations/manual/0029_consent_logs.sql:14-34`

H1 の SQL 側根本原因。`accepted_at desc` の index (L36-37) はあるが、UNIQUE 制約は無い。**append-only ログ**としての設計 (コメント L4-5) はもっともだが、ここで言う append-only は「withdrawn の取り消しを別行で記録」ではなく「UPDATE で row を消さない」の意味と読み取れる (policy L57-62 でも `withdrawn_at` のみ UPDATE 想定)。

同一 version への同意を 1 行に限定し、再同意 (撤回後の再合意) は新 version を発行する設計が compliance 観点では妥当。

**修正案**:
```sql
alter table public.consent_logs
  add constraint consent_logs_user_type_version_uq
  unique (user_id, consent_type, version);
```
さらに append-only 強制をトリガーで:
```sql
create or replace function public.consent_logs_immutable_check()
returns trigger language plpgsql as $$
begin
  if old.user_id        is distinct from new.user_id        or
     old.consent_type   is distinct from new.consent_type   or
     old.version        is distinct from new.version        or
     old.content_hash   is distinct from new.content_hash   or
     old.accepted_at    is distinct from new.accepted_at    or
     old.ip_address     is distinct from new.ip_address     or
     old.user_agent     is distinct from new.user_agent     then
    raise exception 'consent_logs: only withdrawn_at can be updated';
  end if;
  return new;
end $$;
create trigger consent_logs_immutable
  before update on public.consent_logs
  for each row execute function public.consent_logs_immutable_check();
```
(0029 の policy L57-62 だけでは RLS で列レベル制約を表現できず、authenticated 自身でも withdrawn_at 以外を書き換えうる)

---

### H7 — `connectCalendar` OAuth error 経路で UPDATE が実行されてしまう (High / -5)

**場所**: `apps/web/src/lib/auth/onboarding.ts:141-167`

```ts
if (!providerToken) {
  const { data, error } = await supabase.auth.signInWithOAuth({...});
  if (data?.url) redirect(data.url);
  if (error) redirect('/onboarding?error=oauth_failed');
}

await supabase  // ← provider_token が無く OAuth も失敗した「両方の if が偽」のとき
  .from('users')
  .update({ calendar_connected_at: new Date().toISOString() })
  .eq('id', ctx.userId);
```

`signInWithOAuth` は通常 `data.url` を必ず返すが、`provider: 'google'` の設定欠落や OAuth provider 未設定時に `error` のみで `data === null` の可能性がある。さらに `redirect()` を `if` 内で呼ぶスタイルは throw に依存するので「両方の if が false」では `await supabase.from('users').update(...)` まで到達し、**OAuth 未実施なのに calendar_connected_at が立つ**。

**修正案**:
```ts
if (!providerToken) {
  const { data, error } = await supabase.auth.signInWithOAuth({...});
  if (error || !data?.url) redirect('/onboarding?error=oauth_failed');
  redirect(data.url); // ← 確実に return しないとフローが続く
}

// ここに来るのは providerToken がある場合のみ
const { error: updErr } = await supabase.from('users')
  .update({ calendar_connected_at: new Date().toISOString() })
  .eq('id', ctx.userId);
if (updErr) redirect('/onboarding?error=calendar_save_failed');

redirect('/onboarding?step=sample');
```

加えて TypeScript narrowing 強化のため:
```ts
function unreachableRedirect(target: string): never {
  redirect(target);
  throw new Error('unreachable'); // 型上 never を明示
}
```

---

### H8 — テスタビリティ ゼロ (High / -5 → -3 採点)

**場所**: `apps/web/src/lib/auth/onboarding.ts` 全体

- supabase client / headers() / redirect() がモジュール直 import
- Vitest 等で `acceptTerms(formData)` を呼ぶには Next.js runtime のモックが必要 (`next/headers` / `next/navigation` / `@supabase/ssr` すべて)
- DI 不在 ⇒ `createServerClient()` の差し替えポイントなし

**修正案**:
```ts
// pure logic を分離
export async function acceptTermsCore(
  ctx: AuthContext,
  input: { terms: boolean; privacy: boolean },
  deps: {
    insertConsent: (rows: ConsentRow[]) => Promise<{ error?: unknown }>;
    updateUser: (patch: UserPatch) => Promise<{ error?: unknown }>;
  },
): Promise<{ redirectTo: string }> {
  if (!input.terms || !input.privacy) return { redirectTo: '/onboarding?error=consent_required' };
  // ...
  return { redirectTo: '/onboarding?step=calendar' };
}

// 'use server' 側は薄いアダプタのみ
export async function acceptTerms(formData: FormData) {
  const ctx = await requireAuthContext();
  const supabase = await createServerClient();
  const result = await acceptTermsCore(ctx, parseInput(formData), {
    insertConsent: (rows) => supabase.from('consent_logs').insert(rows),
    updateUser: (patch) => supabase.from('users').update(patch).eq('id', ctx.userId),
  });
  redirect(result.redirectTo);
}
```
これで `acceptTermsCore` は完全 pure で unit test 可能。

---

### M1 — `hasCalendarScope` を session.provider_token から算出 (Medium / -2)

**場所**: `apps/web/src/lib/onboarding/state.ts:43-44, 52`

```ts
const { data: session } = await supabase.auth.getSession();
const providerToken = session.session?.provider_token ?? null;
// ...
hasCalendarScope: Boolean(providerToken),
```

`provider_token` は Supabase Auth が短時間だけ保持する OAuth access token。**1 時間で消える / refresh ロジックは別系統**。「カレンダーが連携済か」の判定としては不正確 (provider_token は無いが calendar_connected_at は立っている → step-calendar.tsx:44 で「すでに連携済」表示はされるが、実際の calendar API 呼び出しは scope 取得から再走必要)。

**修正案**: `user_oauth_tokens` テーブル (0007 / 0012 で定義想定) の `refresh_token + scopes` をソースオブトゥルースに:
```ts
const { data: token } = await supabase
  .from('user_oauth_tokens')
  .select('scopes, expires_at, refresh_token_present')
  .eq('user_id', userId)
  .eq('provider', 'google')
  .maybeSingle();
const hasCalendarScope = !!token?.scopes?.includes('https://www.googleapis.com/auth/calendar.events');
```

---

### M2 — 完了状態の中間で users.onboarded_at が立たない経路 (Medium / -2)

**場所**: `page.tsx:80-82`

```ts
if (state.onboardedAt && isFullyOnboarded(state) && params.step !== 'done') {
  redirect('/dashboard');
}
```

`state.onboardedAt` が NULL でも `isFullyOnboarded(state) === true` のときは onboarding 画面に居続ける。`step=done` で `completeOnboarding` を押さない限り `users.onboarded_at` が永遠に NULL のまま。`requireUser` (`auth/server.ts`) は `onboarded_at` を返すが、本実装ではこの値を `/onboarding` redirect 判定に使っていないので、middleware で `/dashboard` を踏みに行くガード (別 PR で必要) と整合しない懸念。

**修正案**: `isFullyOnboarded` が true なら自動で `onboarded_at` を立てる server action を `page.tsx` から fire-and-forget (もしくは middleware / job で eventual consistency)。

---

### M3 — getSession + getUser の二度引き (Medium / -2)

**場所**: `auth/onboarding.ts:73-76, 144` / `state.ts:43`

`requireAuthContext` で `auth.getUser` を呼び、`connectCalendar` で再度 `auth.getSession` を呼んでいる。`getSession` を採用すれば user 情報も同時に取れる。`getUser` は安全性が高い (JWT 検証付き) ので推奨されるが、同一 server action 内で両方を呼ぶのはレイテンシ ロス。

**修正案**: `requireAuthContext` を `{ user, session }` を返すように変更し再利用。

---

### M4 — `requireUser` の as キャストの型安全性 (Medium / -2)

**場所**: `auth/server.ts:73-83`

```ts
role = ((data as Record<string, unknown>).role as UserRole) ?? 'sales';
```

`maybeSingle()` の戻り値は `data: TableRow | null` で型推論できるはずだが、Drizzle / Supabase 型生成が当たっていない (`generate_typescript_types` 未走?) ため `Record<string, unknown>` cast に逃げている。`onboarding.ts` 側でも `state.ts:33` で同じ問題が発生。

**修正案**: `mcp__supabase__generate_typescript_types` を CI に組み込み `packages/db/src/types/database.types.ts` を生成 → `createServerClient<Database>()` で型推論。

---

### M5 — Zod validation 不在 (Medium / -2) — H5 と関連

server action の入力境界 (`acceptTerms(formData)`) で Zod parse が無い。仮にこの onboarding は formData の項目数が少ないので影響軽微だが、`acceptTerms` で `agree_terms` 以外の hidden field を attacker が混入させても何も拒否しない (formData.get で読まない限り無視されるとはいえ、explicit `safeParse({ allow: ['agree_terms', 'agree_privacy'] })` 系で reject する方が安全)。

---

### M6 — `withdrawn_at` UPDATE policy が他列を守れない (Medium / -2)

**場所**: `0029_consent_logs.sql:57-62`

H6 と一体。`with check (user_id = auth.uid())` は user_id だけしか縛らない → 自分の row の `content_hash` を任意改ざんできる。compliance audit で「同意した内容のハッシュ」が改ざん可能なのは致命。

**修正案**: H6 の immutable trigger を追加。

---

### M7 — partial completion 用 state machine が無い (Medium / -2)

**場所**: `state.ts` 全体

`OnboardingState` は完了 timestamp の集合体だが、「途中まで進めて中断」状態 (例: OAuth に飛んで戻ってこない、loadSampleData で job 投入したが完了通知未着) を表現できない。`q_sample_seed` worker (Phase1 W3 で実装予定とコメントあり) が非同期完了する設計なら、`sample_data_loaded_at` ではなく `sample_data_job_id` + `sample_data_status: 'pending'|'done'|'failed'` を持たせるべき。

**修正案**: users 列を増やす代わりに、`onboarding_progress` 1 テーブルを切り出す:
```sql
create table onboarding_progress (
  user_id uuid pk references users(id) on delete cascade,
  step text check (step in ('consent','calendar','sample','done')),
  status text check (status in ('pending','active','done','skipped','failed')),
  job_id uuid,
  completed_at timestamptz,
  metadata jsonb
);
```
こうすれば step 追加も縦に行追加するだけで済む (拡張性 M8 も解消)。

---

### M8 — step 追加で 3 箇所同時改修必須 (Medium / -2)

**場所**: `page.tsx:39 / 56-67` + `0029.sql:19-25` + `state.ts:11-19`

将来の step (`data_residency_consent` / `marketing_opt_in` / `recording_consent`) を追加するには、

1. `resolveActive` literal union 拡張
2. `buildStepperState` の literal 追加
3. `consent_logs.consent_type` CHECK 制約を ALTER (既に値あり)
4. `users` テーブルにまた列追加
5. `OnboardingState` 型・`isFullyOnboarded` 関数の改修

の 5 ファイルを触る必要あり。M7 の `onboarding_progress` 1 テーブル化で大半解消。

---

### M9 — `revalidatePath` 呼び出しが無い (Medium / -2)

**場所**: `auth/onboarding.ts` 全 action

`users.update` 後に `revalidatePath('/onboarding')` を呼んでいないため、Next.js キャッシュが古い state を返すと表示と DB が乖離する (Server Component の React cache はリクエスト単位なので即時影響は限定的だが、edge runtime キャッシュや `force-dynamic` 未指定なら影響大)。

**修正案**:
```ts
import { revalidatePath } from 'next/cache';
// 各 update 後
revalidatePath('/onboarding');
```
もしくは `apps/web/src/app/onboarding/page.tsx` に `export const dynamic = 'force-dynamic'` を明示。

---

### m1 — `consent_logs.created_at` と `accepted_at` の役割重複 (Minor / -1)

**場所**: `0029_consent_logs.sql:28, 33`

`accepted_at timestamptz not null default now()` と `created_at timestamptz not null default now()` が両方 default now()。`audit_logs` パターンに揃えるなら `created_at` だけで充分。accepted_at は別の意味 (例: future-dated 同意) を持たせるなら nullable で良い。

---

### m2 — `sha256(TERMS_BODY)` module top-level 評価 (Minor / -1)

**場所**: `auth/onboarding.ts:60-62`

`createHash('sha256').update(...)` をモジュール ロード時に走らせている。Node.js の起動コストとしては無視できるが、cold start 計測時のノイズになる。`const TERMS_HASH = lazy(() => sha256(...))` か、ビルド時定数として `.env` 経由で渡す方がクリーン。

---

### m3 — `STEP_ERROR_TEXT` が page.tsx に inline (Minor / -1)

**場所**: `page.tsx:29-33`

i18n / 拡張時の翻訳ファイル抽出を阻害。`lib/onboarding/messages.ts` に隔離推奨。

---

### m4 — `void TERMS_HASH; void PRIVACY_HASH;` の不可解な sink (Minor / -1)

**場所**: `page.tsx:22-23`

C1 の症状緩和コード。C1 修正と同時に削除。

---

## 設計仕様との整合性 (`19_onboarding_initial` / `08_security_rls` / `04_api_endpoints`)

| 仕様項目 | 実装 | 整合性 |
|---|---|---|
| Step1 ようこそ + メール表示 | `page.tsx:101` `fullName ?? email.split('@')[0]` | ✓ |
| Step2 OAuth (Google/Zoom) scope 取得 | `connectCalendar` で google.calendar.events のみ | △ (Zoom は P2 で OK) |
| Step3 タイムゾーン/業務時間 | **未実装** | ✗ (Phase1 必須なら追加要) |
| Step4 サンプルデータ投入 | `loadSampleData` (C3 で破綻) | ✗ |
| Step5 ガイドツアー | **未実装** | ✗ (Phase1 必須なら追加要) |
| Step6 通知設定 | **未実装** | ✗ |
| consent_blanket (M-C5 / P1) | `consent_logs` 投入 (C2/H6 残) | △ |
| AP-138 POST /api/onboarding/sample-mode | server action で代替 (C3 で不整合) | ✗ |
| 08_security_rls consent_logs RLS | self_select / self_insert / self_withdraw (M6 残) | △ |

**仕様適合性: 4/9 が PASS、3 が未実装、2 が破綻**。`19_onboarding_initial` の Step3/5/6 が落ちている点は scope 縮小決定なら docs 側に明記が必要。

---

## まとめ (3 行)

1. **Critical 4 件 (C1 build-time fail / C2 redirect 連鎖未整合 / C3 RLS で必ず失敗する sample_data_seeds insert / C4 失敗握り潰し) が並列に存在**し、現状デプロイ即詰むレベル。
2. RLS / append-only / idempotency の設計上の不備 (H1, H4, H6, M6) が compliance audit (M-C5 同意ログ) で致命。`consent_logs UNIQUE` と immutable trigger は migration 一発で吸収可能。
3. **判定: FAIL (48.0 / 100)**。Critical / High を全件解消すれば 80 点台、M1-M9 まで解消すれば 95+ 到達可能。Senior Next.js / Supabase エンジニアの目線で実運用に堪えるレベルにするには **最低でも C1-C4 + H1-H7 の修正と 0029 migration の追補 (UNIQUE + immutable trigger + org_id default DROP 予約) を必須**とする。
