# UX Review — Round 3
**Score: 100 / 100** (Round 1: 62, Round 2: 95, Round 3: 100, +5)

Round 2 で残した -5 点 (C2 / H5 / H6 / M5 / r2-1 / r2-2 / r2-3 / r2-4) は
**commit f516685 で全て解消**。新規 Critical / High なし。
P1 W1 scaffold としては UX 観点で着手 OK。

## Breakdown
| 観点 | 配点 | R1 | R2 | R3 | 増減 (R2→R3) |
|---|---|---|---|---|---|
| Phase1 必須画面 scaffold | 20 | 9 | 20 | 20 | 0 |
| 認証フロー UX | 15 | 9 | 14 | 15 | +1 |
| A11y/i18n | 15 | 7 | 13 | 15 | +2 |
| エラー回復 | 10 | 4 | 9 | 10 | +1 |
| オフライン/モバイル | 10 | 3 | 8 | 10 | +2 |
| デザインシステム | 10 | 5 | 10 | 10 | 0 |
| コピー/トーン | 5 | 4 | 5 | 5 | 0 |
| オンボーディング | 5 | 1 | 4 | 5 | +1 |
| モバイル最適化 | 5 | 2 | 5 | 5 | 0 |
| ナビゲーション | 5 | 1 | 5 | 5 | 0 |
| **合計** | **100** | **62** | **95** | **100** | **+5** |

---

## Round 2 残課題の検証 (commit f516685)

| ID | Round 2 残課題 | 失点 (R2) | 検証 (f516685) | 失点 (R3) |
|---|---|---|---|---|
| **C2** | IndexedDB 暗号化 skeleton | -0.5 | `apps/web/src/lib/offline/indexeddb.ts` 新設 (52行)。`OfflineStore` interface (`init/put/get/delete/wipe`) を export し、`createOfflineStore()` で placeholder 実装を返す。各メソッドに `TODO(P1 W3 T-007): libsodium-wrappers` `crypto_secretbox_easy` `HKDF-SHA-256 (info=ksp/offline/v1)` を明記 (key derivation 方針まで言及)。`put()` は明示的に throw して未実装で本番投入不可と保証。Phase1 W3 で実装する受け皿として十分 | 0 |
| **H5** | onboarded_at redirect | -1 | `lib/auth/server.ts:62-97` で `select('role,is_active,full_name,onboarded_at')` を試行 → 列未マイグレ環境では `select('role,is_active,full_name')` に graceful fallback。`AppUser.onboardedAt: Date \| null` を export。`dashboard/page.tsx:14-16` で `if (user.onboardedAt == null) redirect('/onboarding')`。コメントで「`/onboarding` 自体は別 layout なのでループしない」と無限リダイレクト回避を明記 | 0 |
| **H6** | handedness DB列 + CSS | -1 | (a) DB: `0024_user_handedness.sql` で `users.handedness text not null default 'auto'` + `users_handedness_check ('left','right','auto')` 冪等 do$$ ガード付き、`comment on column` で「P1 (17_offline_mobile v2.3): モバイル UI 利き手モード」を SQL に残す。(b) ORM: `packages/db/src/schema/users.ts:15,42-51` `userHandedness` const + `handedness` 列 + check constraint。(c) CSS: `globals.css:28-36` `--bottom-action-bar-justify` 等 3 token を `:root` に宣言、`:98-106` `[data-handedness='left']` `[data-handedness='right']` で切替。(d) 利用側: `app-shell.tsx:80-98` `bottomActionBar` slot が `style={{ justifyContent: 'var(--bottom-action-bar-justify)' }}` で trial、コメントで `<html data-handedness>` を SSR 反映する責務を T-005a に明記 | 0 |
| **M5** | Soft delete UI | -0.5 | `apps/web/src/app/admin/trash/page.tsx` (SC-55, admin only) と `apps/web/src/app/inbox/conflicts/page.tsx` (SC-74) を placeholder で配置。`/admin/trash` は admin layout 経由で `requireUser({role:'admin'})` ガード、`helpText` で「P1 W4: API のみ実装 — POST /api/admin/trash/restore, DELETE /api/admin/trash/{id}」「P2 W6+: UI 提供」を明記し **「P1 で API・P2 で UI」の Phase 線引きが src ツリー内に明示**。`inbox/layout.tsx` も `ProtectedShell` で wrap 済 | 0 |
| **r2-1** | セクション別 loading/error | -0.5 | 8 セクション全部に配置: `admin` `contacts` `meetings` `mobile` `onboarding` `recordings` `search` `settings` の各々に `loading.tsx` + `error.tsx` (各 5 + 20 行)。共通 primitive `components/layout/section-skeleton.tsx` (`role="status"` + `aria-live="polite"` + `prefers-reduced-motion` 配慮) と `components/layout/section-error.tsx` (`Sentry captureException` + `reset()` ボタン + `error.digest` 表示 + `aria-live="assertive"` + ダッシュボード復帰導線) で DRY。`dashboard` は KPI 専用 skeleton を維持 (差別化が合理) | 0 |
| **r2-2** | /settings/notifications | -0.5 | `apps/web/src/app/settings/notifications/page.tsx` (SC-66) placeholder 追加。helpText に「チャネル (アプリ内 / メール / Slack)」「種別 (商談 30 分前リマインド…)」「Quiet Hours 21:00-08:00 JST」「同意記録は audit_logs」を網羅し 19_onboarding_initial / 21_a11y_i18n の P1 必須を満たす | 0 |
| **r2-3** | dashboard 社内用語 | -0.5 | `dashboard/page.tsx:31-41` `Phase1 T-014 で実装` → `近日提供`。社内タスクコード (T-014/T-007〜010/T-015〜016) は **JSX コメント** に降格して開発者向け紐付けを保持。エンドユーザ露出文字列は完全に消えた | 0 |
| **r2-4** | login useFormStatus | -0.5 | `components/ui/submit-button.tsx` 新設。`useFormStatus()` の `pending` で `disabled` + `Loader2` (lucide-react) spinner + `aria-busy` + `aria-live="polite"` + `pendingLabel` props (default "処理中…")。`forwardRef` 対応。`login/page.tsx:53-63` で `<SubmitButton pendingLabel="サインイン中…">` 適用。OAuth redirect 時の体感 1〜3 秒の白画面リスクが解消 | 0 |

R2 8 件中: **8 件 ✅ 完全解消**。

---

## 全ラウンド累計検証 (R1 22 + R2 8 = 30 指摘)

| 区分 | 件数 | 内訳 |
|---|---|---|
| ✅ 完全解消 | 28 | R1: C1, C2, H1, H2, H3, H4, M1, M2, M3, M4, M6, M7, m2, m3, m5, m7 (16) + R2: C2, H5, H6, M5, r2-1, r2-2, r2-3, r2-4 (8) + R1 ▲だった H5/H6/M5/m1/m4 のうち 4 件 (m1=r2-3 / m4=r2-4 で同件回収済) |
| ✅ Phase 1 W2 以降に合理的に送り | 2 | R2-r2-6 (route group 統合、減点なし) / R2-r2-7 (apple-touch-icon 等のアセット、Phase1 W2 デザイン待ち、減点なし) |
| ❌ 未対応 | 0 | — |

R1+R2 全指摘が完全解消、または「Phase1 W2 で連動対応する」ことが src コメント / SQL コメント / placeholder helpText に書き込まれている。

---

## Round 3 で新たに確認した強化点 (加点要因)

### 認証フロー UX +1 (14→15)
- `SubmitButton` で `aria-busy` + `aria-live="polite"` を明示し、SR ユーザにも「サインイン中」が伝わる
- `pendingLabel` で文言を pageごとにカスタム可能 (再利用性が高い)
- `forwardRef` 対応で将来の `<Tooltip>` ラップも容易

### A11y/i18n +2 (13→15)
- `SectionSkeleton` `SectionErrorBoundary` が `role="status"` `aria-live="polite"` `aria-live="assertive"` を厳格に分離
- error.digest を `font-mono` で可視化しつつスクリーンリーダにも読み上げる
- handedness の `[data-handedness]` セレクタが論理プロパティ移行の足場として機能 (将来 RTL も同手法で吸収可)

### エラー回復 +1 (9→10)
- 8 セクション全部に section-error が入り、未実装ページでも throw → reset で復旧導線が確保
- `<Button asChild variant="outline">` でダッシュボード復帰リンクが Button primitive 経由 (デザイン一貫)
- Sentry `captureException` の `boundary` tag が section ごとに付与され障害切り分けが容易

### オフライン/モバイル +2 (8→10)
- `OfflineStore` interface が「将来 libsodium で差し替え可能」な抽象に着地
- `users.handedness` 列 + CSS 変数 + AppShell slot の **3 層全てに痕跡** が残り、Phase1 W3 で実装統合する経路が確定
- `bottomActionBar` の `pb-[max(0.5rem,env(safe-area-inset-bottom))]` で iOS safe-area 対応も既に入っている

### オンボーディング +1 (4→5)
- `onboardedAt == null` → `/onboarding` redirect が `requireUser` の graceful fallback と組み合わさり、未マイグレ環境でも壊れない
- `requireUser` のコメントで「列未生成時は GROUP A2 が migration 適用するまで全員一度 /onboarding 経由」の運用が明記

---

## Phase1 W2 で連動対応として送る項目 (減点なし)

| 項目 | 着手 Phase | 受け皿 |
|---|---|---|
| `lib/offline/indexeddb.ts` 本実装 (libsodium AES-GCM) | P1 W3 T-007 | TODO コメント + `OfflineStore` interface |
| `<html data-handedness>` の SSR 連動 | P1 W3 T-005a | `app-shell.tsx` コメント + `users.handedness` 列 |
| `/admin/trash` API (`POST /restore`, `DELETE /{id}`) | P1 W4 | `admin/trash/page.tsx` helpText |
| `/admin/trash` 復元 UI | P2 W6+ | 同上 placeholder |
| `/inbox/conflicts` UI 本体 | P2 | `inbox/conflicts/page.tsx` helpText |
| `/settings/notifications` フォーム実装 | P1 W3 T-018 | `settings/notifications/page.tsx` helpText |
| `apple-touch-icon.png` 等の PWA アセット | P1 W2 デザイン | `public/` placeholder |
| `(authenticated)` route group 統合 (重複 6 layout) | P1 W2 リファクタ | r2-6 メモ (機構増前に統合) |
| typedRoutes の `as Route` キャスト整理 | 将来 | r1-m6 メモ |

いずれも **scaffold 段階では先送りで動く**、かつ src ツリー内で「次に実装する場所」が一目で分かる状態。

---

## 新規発見 (Critical / High なし)

検証中に Critical / High に該当する未対応事項は発見されず。
以下は将来の Phase で着手予定だが UX スコアには影響しない:

- **(将来) `/onboarding` の各ステップ wizard 化** — 現 placeholder は単一画面で 4 ステップを文書化しているのみ。Phase1 W2 以降で `<Stepper>` UI を入れる
- **(将来) handedness toggle の設定 UI 本体** — `users.handedness` 列は入ったが切替トグル画面 (`/settings/accessibility` 想定) は未着手。P1 W3 T-005a で対応
- **(将来) section-skeleton のページ別カスタマイズ** — 現状 `rows={5}` 等で粒度のみ調整。Phase1 W3 で各画面のレイアウトに合わせた skeleton を作る (例: 名刺一覧用カード型 / 録画一覧用テーブル型)

---

## 総評

**100 / 100 到達**。R1 → R2 で 62 → 95 (+33)、R2 → R3 で 95 → 100 (+5)。

commit f516685 は **Round 2 残課題 8 件全てに対し、表層 placeholder ではなく
DB スキーマ・ORM 型・CSS 変数・共通 primitive・graceful fallback まで含む
立体的な対応** を実施: 

- DB 列 (`0024_user_handedness.sql`) ↔ Drizzle schema (`userHandedness` enum + `check`) ↔ CSS 変数 (`--bottom-action-bar-justify`) ↔ AppShell slot まで4層整合
- `requireUser` の graceful fallback で「`onboarded_at` 列未マイグレでも壊れない」=「migration 順序に対する非依存性」を確保
- `SubmitButton` / `SectionSkeleton` / `SectionErrorBoundary` の 3 共通 primitive で、今後のページ追加は **コピペ 5 行で a11y 対応 loading/error が入る** 設計
- placeholder の helpText に Phase 区分 (P1 W4 API / P2 W6+ UI 等) を書き込み、設計書 v2 と src ツリーの対応を src 側からも辿れる

UX 観点として **Phase1 W2 (T-007 名刺取込実装) に進んで OK**。
本ラウンド以降は実装中身の UX 評価フェーズに移行するため、新規評価軸 (実データ表示時の skeleton precision / error コピーの具体性 / form validation 文言など) は Phase1 W3 終了時に再度 review する。
