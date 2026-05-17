# Design Spec ↔ Implementation Gap — Cross-Cutting (Onboarding / Admin / Mobile / 通知 / 横断)

- 対象 commit: HEAD (Phase 1 W1〜W2 scaffold + onboarding R3 修正反映後)
- 担当範囲: T-001/T-002/T-003/T-004/T-005/T-006/T-018/T-019 + SC-01〜05 / SC-19〜26 / SC-32〜40 + 横断シート (17,19,20,21,22,23,26)
- 仕様根拠: `reviews/design_spec_md/{02,17,19,20,21,22,23,26}.md`
- 採点ルール: P0 = リリースブロッカー / P1 = Phase1 GA 前必須 / P2 = Phase2 早期着手 / P3 = 装飾・後回し可
- 突き合わせた実装: `apps/web/src/app/{login,403,offline,dashboard,onboarding,admin,settings,inbox,mobile}/**` + `apps/web/src/components/layout/**` + `apps/web/src/lib/{auth,offline,onboarding,rate-limit,sentry,supabase}/**` + `apps/web/src/app/api/csp-report/**` + `packages/db/src/{schema,migrations/manual}/**`

---

## サマリ — Phase ごとの実装到達度

| 領域 | 設計 SC/要件 | 実装 | 未実装 | 達成 |
|---|---:|---:|---:|---:|
| Onboarding (SC-02/61/75) | 7 step + consent + offboarding 連動 | consent / calendar / sample / done の4 step | OAuth 取得・通知設定・ガイドツアー・ロール別パス・移行 (SC-62/63)・PWA install gate (SC-75) | 35% |
| Auth & shell (SC-01/03/70/71) | login / 403 / offline / dashboard | Server Action SSO + ThemeToggle + Skip link + Mobile bottom nav | Realtime header badge / sync_failure_log badge / Web Push permission prompt | 70% |
| Admin (SC-27/28/29/30/40/55-60a/68/69/77-86) | 23 画面 + 退職処理 SOP (16 step) | SC-27 (DEMO_MEMBERS hardcode) + SC-55 placeholder | SC-28/29/30/40/55(機能)/56/57/58/59/60a/68/69/77/78/79/80/81/83/84/86/126 ほぼ全件 | 8% |
| Mobile/PWA (SC-07/33-35/72/75) | カメラ・キュー・即時検索・音声メモ・PWA install | placeholder のみ。manifest.ts + 最小 SW + IndexedDB スキーマ定義 | getUserMedia / opencv-wasm / jsqr / Background Sync / 暗号化 IndexedDB / handedness 反映 / haptics / torch | 5% |
| Notifications (SC-66 + T-018) | Push / Email / Slack + Web Push + Realtime + quiet hours | `notifications` テーブルだけ存在 | settings UI / web-push (VAPID) / Supabase Realtime channel / dedup / quiet hours / role-default preset | 5% |
| Settings (SC-32/66/67/76/86) | 5画面 | SC-32/66 placeholder + SC-86=`/settings/privacy` (撤回 UI) | SC-67 (export)・SC-76 (handedness)・SC-86 仕様分離・notifications 実画面 | 25% |
| A11y / i18n (シート21) | 18+ 要件 | skip link 2 本 + ThemeToggle a11y + onboarding alert + 一部 aria-live | next-i18next / Intl 全面 / dark_mode 自動 / handedness mirror 実反映 / axe CI gate / jest-axe / live region 優先度ルール | 30% |
| Feature flags (T-022) | DB + admin UI + observability | `feature_flags` テーブル + `ab_test_assignments` テーブル | 評価関数 (sha256+%+allow/block) / admin UI (SC-68) / Sentry tag / 監査ログ連動 / killswitch | 15% |
| Observability (T-018 / シート23) | 38+ アラート種 | Sentry wrapper + CSP report endpoint + in-memory rate limit | LLM rate / cost / pgmq backlog / DLQ / Realtime conn / pgbouncer / Zoom-Google quota / audit chain alert / behavioral anomaly | 10% |
| Offboarding (SC-79 + シート26) | O-01〜O-17 (17 アクション) | 0028 で onboarded_at + 60日後 placeholder 説明文のみ | `/admin/users/offboarding/[id]` 画面 / O-05 OAuth revoke 自動化 / O-07 owner 移管 / O-12 anonymize worker / O-17 device wipe / dual approval (O-10b) | 5% |
| Failure recovery (シート20) | 18 種 | Soft delete placeholder ページ + `optimistic_lock_versions` schema 未 | 30秒 undo / autosave_drafts / sync_failure_log / permission_requests / 編集競合 (SC-74) / Zoom historical retry / audit chain incident UI | 8% |
| E2E test (T-019) | Playwright + axe + AT-RLS-1〜3 + Visual regression | `playwright.config.ts` placeholder + `tests/` 空 | 主要 SC を網羅する e2e / axe-core / RLS 検証 / lhci | 0% |

**全領域加重平均: 約 18%** (Phase 1 W1〜W2 scaffold 段階としては正常値。ただし本書はこのギャップを後の Phase ごとに割り振るための一次台帳)。

---

## P0 — リリース or 本実装着手前ブロッカー

### G-P0-1. Onboarding の `OAuthScopeStep` / `ZoomConnectStep` / `ProfileStep` が未実装、設計上 7 step → 実装 4 step
**設計**: `19_onboarding_initial.md` Step1 ようこそ+ロール / Step2 OAuth (Google+Zoom) / Step3 タイムゾーン+業務時間 / Step4 サンプル / Step5 ガイドツアー / Step6 通知 / Step7 移行  
**実装**: `apps/web/src/app/onboarding/page.tsx` の `resolveActive` は `consent` → `calendar` → `sample` → `done` の 4 step のみ。タイムゾーン保存・ロール選択・Zoom 連携・通知設定・ガイドツアー UI が一切無い。  
**影響**: 設計シート 19 の P1 必須項目を 5 件未達。SC-02 とのギャップが顕著。  
**対応**: Step 構成を拡張、`users` に `timezone` (既存) と `notification_preset` / `mentor_user_id` (未) 列追加、`step-tour` / `step-notifications` / `step-zoom` コンポーネント新設。

### G-P0-2. 通知システム (T-018) が DB スキーマ以外ゼロ
**設計**: SC-66 + シート23 + シート17 (Web Push VAPID) + SC-03 ヘッダ badge + `sync_failure_log` 連動  
**実装**: `packages/db/src/schema/notifications.ts` の 1 テーブルだけ。`/api/notifications` / `web-push` 依存 / VAPID 鍵管理 / Supabase Realtime channel / quiet hours / role-default preset / dedup / `/settings/notifications` 画面 (`SC-66`) はすべて placeholder。  
**影響**: 仕様シート 17,19,20,23,26 の通知系トリガが全部宙吊り。M-Day OAuth revoke (O-05) の admin push、録画停止検知 (F-S4-5)、handoff SLA (F-S9-1) 等の P1 アラート受信先がない。  
**対応**: `web-push` 採用、`apps/web/src/app/api/push/subscribe`、`apps/worker/src/jobs/notification-dispatcher.ts`、`notification_preferences` テーブル新設、SC-66 UI 実装。

### G-P0-3. Web Push / VAPID / Service Worker push handler 未実装
**設計**: シート17「Web Push: VAPID+SW」P2、シート19 Step6 通知設定 P1  
**実装**: `apps/web/public/sw.js` は navigation fallback only。`push` / `notificationclick` リスナ無し。`web-push` パッケージ未依存。VAPID 鍵 env 不在。  
**影響**: SC-75 iOS PWA install gate も実質的に動かない (push gate 用)。  
**対応**: SW に push handler 追加、`/api/push/subscribe` で `push_subscriptions` テーブル (新規) に登録、worker 側で `web-push` で送信。

### G-P0-4. Mobile 名刺撮影 (SC-07/33) の getUserMedia + opencv-wasm + jsqr 完全未実装
**設計**: シート17「OpenCV.js+静止検出+ガイド枠 / torch / vibrate / Burst / handedness / fallback_capture_mode」  
**実装**: `apps/web/src/app/mobile/scan/page.tsx` は `<PagePlaceholder />` のみ。`opencv-wasm` / `react-camera-pro` 未依存 (jsqr のみ package.json に存在 — Phase1 W2 で予約済)。  
**影響**: 17_offline_mobile の v2.3 〜 v2.4 の追加項目 (volume_button_shutter, voice_command, SNR<10dB fallback順序) が全部宙吊り。`docs/REMAINING_WORK.md` の T-008 と整合。  
**対応**: T-008 で本実装 — `apps/web/src/app/mobile/scan/_components/camera-view.tsx` 新設、opencv-wasm dynamic import (`'use client'` でも `next/dynamic` で SSR 抑制)、`navigator.mediaDevices.getUserMedia({video: {facingMode: 'environment'}, audio: false})` + `ImageCapture` + `applyConstraints({torch:true})`。

### G-P0-5. IndexedDB 暗号化 + Background Sync 未実装、 `OfflineStore` は throw 実装
**設計**: シート17「IndexedDB暗号化 libsodium wrap, key=session-bound / LRU eviction / IndexedDB wipe 強化 (is_active=false 即時 wipe) / SW Background Sync」 P1  
**実装**: `apps/web/src/lib/offline/indexeddb.ts` は `OfflineStore.put` が `throw new Error('not implemented (P1 W3 T-007)')`、`db.ts` は idb schema 定義のみ。`libsodium-wrappers` 未依存。SW に `sync` event listener 無し。  
**影響**: SC-34 (`/mobile/queue`) で UI 出しても永続化できない → モバイル撮影フローが圏外で機能ゼロ。M-Day device wipe (O-17 SOP) も動かない。  
**対応**: T-007 で `libsodium-wrappers` + HKDF-SHA-256 derive、`crypto_secretstream`、SW `self.addEventListener('sync', ...)`、`navigator.serviceWorker.ready.then(r => r.sync.register('process_business_card'))`。

### G-P0-6. RLS が `auth.uid()` ベースだが Server Action で `service_role` 経由しない検証なし — onboarding は安全だが Admin 系で同じ罠が再発する懸念
**設計**: シート 8 + memory「SECURITY DEFINER + auth.uid() の罠」  
**実装**: `apps/web/src/lib/auth/onboarding.ts` は `createServerClient()` (anon + cookie) で呼ぶため OK。だが `/admin/users` / `/admin/audit-chain` 等を後で実装するときに service_role でうっかり呼ぶと `auth.uid() = NULL` で全 RLS bypass する。  
**対応**: `apps/web/src/lib/supabase/server.ts` に service_role 用のラッパは存在させず、admin server action は anon client + `current_user_role()='admin'` 系 RPC で書く規約をコメントで明示。`docs/SECURITY_GUARDRAIL.md` (新規) に reference_supabase_subsidies_token と同じトーンで記述。

### G-P0-7. Playwright e2e (T-019) 完全空
**設計**: シート24「AT-Onboarding / AT-Auth / AT-RLS-1〜3 / AT-Mobile-1〜3 / AT-A11y」 — リリース判定に必須  
**実装**: `playwright.config.ts` 存在、`tests/` 配下未確認 (空 or describe.skip)。jest-axe / axe-core CI gate 未配線。  
**影響**: 「実機 sign-in 完走テスト」が `REMAINING_WORK #1` で進行中 — 自動化されないと regression 検知できない。  
**対応**: `tests/e2e/{auth,onboarding,403,offline,mobile-bottom-nav,a11y}.spec.ts` を最低 8 本敷く。CI で `--reporter=html`。

---

## P1 — Phase 1 GA 前必須

### G-P1-1. Admin 画面群 (SC-27 以外) が placeholder すらない or DEMO_MEMBERS 静的
**設計**: SC-27 (users)、SC-28 (audit)、SC-29 (usage)、SC-30 (knowledge review)、SC-40 (delegates)、SC-55 (trash)、SC-77 (audit-chain)、SC-78 (DR)、SC-79 (offboarding)、SC-80 (audit evidence)、SC-81 (cost actuals)、SC-83 (share audience)、SC-84 (anomalies)、SC-68 (feature flags)、SC-69 (experiments)、SC-126 (DLQ)  
**実装**: `/admin/users` は `DEMO_MEMBERS` (fixtures) でテーブル表示するだけ、招待・role 変更・退職処理ボタンは全部 disabled。`/admin/trash` のみ placeholder。残り 13 画面はファイルすら無い。  
**対応**: T-017 で `/admin/users` 招待 (Supabase Auth admin API + `invitedBy` metadata)、role 変更 (server action + `protect_profiles_sensitive` の bypass GUC — memory `feedback_techstars_profile_role_bypass` 参照)、suspend (is_active=false + O-06)。残りは Phase 2 SOP。

### G-P1-2. ロール別ナビ — `legal` ロール用 nav item と admin nav item 非対称
**設計**: ユーザロール `sales/cs/manager/admin/legal` (v2.1)。`legal` は SC-57/58/60a/79 でレビュー権限。  
**実装**: `apps/web/src/components/layout/app-shell.tsx` で `ADMIN_ITEMS` だけ、`requireRole==='manager'|'admin'` の `requireRole` field は型定義だけで filter 適用ロジック無し (`items = user.role === 'admin' ? [...NAV_ITEMS, ...ADMIN_ITEMS] : NAV_ITEMS`)。legal ユーザは admin nav が見えない。  
**対応**: ROLE_RANK と nav の連携、`legal` ロール用ナビ (削除依頼 / 法務開示)。

### G-P1-3. `/403` 画面に permission_requests 申請動線が無い
**設計**: シート20「権限不足 → 申請動線 → permission_requests + /admin/permission-requests」P2  
**実装**: `/403` はメッセージとログイン直しボタンのみ。「上長に依頼するフォーム」が無い。  
**対応**: `app/403/_components/request-form.tsx` 新設、`permission_requests` テーブル schema 化 (drizzle に無い)、admin 側受信箱 (SC-70 と統合)。

### G-P1-4. `header-nav` に通知 (bell) / sync_failure badge / `/inbox/internal-invites` 動線が無い
**設計**: SC-03 dashboard + SC-37 + シート17「同期失敗 → 右上badge+リトライ」+ シート20「sync_failure_log」 P1  
**実装**: `apps/web/src/components/layout/app-shell.tsx` のヘッダ右側は theme toggle + 名前 + signout のみ。bell icon / unread count / sync status indicator 不在。  
**対応**: `Notifications`/`SyncStatus` を `app-shell` に組込み、Supabase Realtime channel で unread 即時更新。

### G-P1-5. `/onboarding` での Zoom / OAuth scope ステップが結合してない (calendar OAuth は実装済だが Zoom は未)
**設計**: Step2 で Google+Zoom 両方を取得  
**実装**: `connectCalendar()` (Google Calendar.events のみ)。`connectZoom()` server action 不在。`user_oauth_tokens` テーブルに `provider='zoom'` enum はあるが書き込むコード無し。  
**対応**: Zoom OAuth (`/auth/zoom/start` route + `/auth/zoom/callback` + token Vault 保存)。

### G-P1-6. `consent_logs` の同意撤回後にオンボーディング再フローを通す挙動が中途半端
**設計**: シート19「利用規約同意 M-C5 / Step6 改修」 — 撤回したら次回ログイン時に再フロー  
**実装**: `withdrawConsent` server action は `users.terms_consented_at = null` + `onboarded_at = null` を立てるので OK。ただし `recording_consent` / `marketing_communications` / `data_processing` の撤回 UI は存在しない (撤回可は terms/privacy のみで hardcoded `isWithdrawable`)。  
**対応**: 録画同意撤回時の挙動 (M-S4-1 verbal_proof_locked retention) を SC-32/SC-66/SC-67 にマップ。

### G-P1-7. 利き手 (handedness) は DB 列 + CSS 変数のみで実際の UI ミラーリング無し
**設計**: シート17 「handedness P1 昇格」「reach_zone_guideline」「one_handed_audit」  
**実装**: `users.handedness` 列は migration 0024 で追加済、`UserHandedness` 型は drizzle schema で `'left'|'right'|'auto'`。ただし `MobileBottomNav` / `BottomActionBar` の CSS が `--bottom-action-bar-justify` を hard-code (`var(--bottom-action-bar-justify)` 未設定箇所多数)。`/settings/handedness` (SC-76) 画面無し。  
**対応**: SC-76 実装 + `app-shell.tsx` の bottom action bar 配置を `user.handedness` 由来で switch。

### G-P1-8. PWA install gate (SC-75) 未実装、`beforeinstallprompt` 捕捉なし
**設計**: SC-75「/onboarding/install-pwa iOS Safari 向け」+ シート17「iOS PWA install (G-25) push 前提」 P2 (実質 P1)  
**実装**: `manifest.ts` 配置済、SW 配置済。しかし `'beforeinstallprompt'` event handler 無し、iOS Safari の「ホーム画面に追加」誘導 UI 無し。  
**対応**: `apps/web/src/app/onboarding/install-pwa/page.tsx` + iOS UA 検出 + `<InstallPWAGuide />`。

### G-P1-9. `next-themes` ダークモードは UI トグル実装済だが `prefers-color-scheme: dark` の `metadataBase` だけで CSS 変数の暗色定義 (`--background dark` 等) の網羅未確認
**設計**: シート21 v2.2「dark_mode prefers-color-scheme 自動 + 手動」 P3  
**実装**: `ThemeProvider` (`next-themes`) + `ThemeToggle` 完備。ただし `apps/web/src/app/globals.css` の `.dark { ... }` 定義のカバレッジを目視確認していない (`docs/REMAINING_WORK.md` #4 「ダークモード未確認」)。  
**対応**: 全ページのスクリーンショット dark/light 比較、`@axe-core/react` で contrast 違反検出。

### G-P1-10. CSP report endpoint は実装済だが nonce 配信 / strict CSP enforce 未
**設計**: シート23「CSP report-uri 受信」 P2  
**実装**: `apps/web/src/app/api/csp-report/route.ts` は POST 受信 → Sentry breadcrumb 化。しかし Next.js middleware で `Content-Security-Policy-Report-Only` ヘッダ自体を出していない (要 grep)。  
**対応**: `middleware.ts` で nonce 生成 + `script-src 'nonce-...' 'strict-dynamic'` enforce、report-only → enforce 切替手順を `docs/SECURITY_GUARDRAIL.md` に書く。

### G-P1-11. Feature flags 評価関数と admin UI (SC-68) 未実装
**設計**: シート22「sha256(user_id+key)%100 / allowlist / blocklist / killswitch」P2  
**実装**: drizzle schema `feature_flags`, `ab_test_assignments` のみ。評価 helper (`isEnabled(key, userId)`) 不在、`/admin/features` (SC-68) も無い。  
**対応**: `apps/web/src/lib/feature-flags/evaluate.ts` 新設 (memo 化、AB_HASH_SECRET 注入)、`/admin/features/page.tsx`、`updated_by` トリガで監査ログ連動。

---

## P2 — Phase 2 早期着手

### G-P2-1. 退職処理 (SC-79 + シート26 全16 step) 完全未着手
**設計**: O-01〜O-17 (offboarding ticket / preview / OAuth revoke / owner transfer / delegate 失効 / FF引継 / ex-employee policy / data export / anonymize / device wipe / 60日後完全削除)  
**実装**: `0028_users_onboarded_at.sql` + `/admin/users` placeholder 説明文「最後の操作から 60 日後にアカウントは自動削除予定キューへ入ります」  
**対応**: `/admin/users/offboarding/[id]/page.tsx` + `q_offboarding_checklist` worker (`apps/worker/src/jobs/`) + `delegate_grants` / `data_exports` / `ex_employee_speech_policies` schema 追加。M-Day O-11(改) を OAuth revoke の前に強制する状態機械を v2.3 通り実装。

### G-P2-2. Audit chain 破断検知 (SC-77 + シート23 audit chain SLA 15 分) 完全未実装
**設計**: シート23「破断検知→通報 15 分以内」 P2  
**実装**: `audit_logs` 系の hash chain trigger は 0008 migration で存在するはずだが `q_audit_chain_verify` cron 無し、`/admin/audit-chain` (SC-77) も無し、Slack/PD 連携も無し。  
**対応**: `apps/worker/src/jobs/audit-chain-verify.ts` (pg_cron + worker hybrid)、SC-77 dual-approval UI、`dangerous_action_audits` schema 確認。

### G-P2-3. `sync_failure_log` / `autosave_drafts` / `optimistic_lock_versions` / `permission_requests` テーブル不在
**設計**: シート20「同期失敗 / 編集競合 / autosave / 権限不足」 P1〜P2  
**実装**: drizzle schema / migration いずれにも無い (`packages/db/src/schema/` ls で確認)。SC-74 (`/inbox/conflicts`) placeholder のみ。  
**対応**: 4 テーブル schema 化 + RLS、`autosave_drafts` は 5 秒 throttle で client → server PATCH。

### G-P2-4. Soft delete / `/admin/trash` (SC-55) 機能ゼロ
**設計**: シート20「30 日復旧」 + SC-55  
**実装**: `/admin/trash` placeholder。各テーブルの `deleted_at` 列の有無も未統一。  
**対応**: `contacts/meetings/recordings/handoffs/contracts` に `deleted_at` 共通追加、Trash 一覧 API、Restore server action、`q_purge_after_30days` cron。

### G-P2-5. Help / FAQ ページ (SC-65 / SC-85) と 20 記事 seed 不在
**設計**: シート22 v2.3「F-UX-5: P1 リリース時 20 記事 seed」 P2  
**実装**: `/help` ルート無し。  
**対応**: `apps/web/src/app/help/{page.tsx,articles/[slug]/page.tsx}` + `help_articles` テーブル + 20 記事 seed。

### G-P2-6. 個人データエクスポート (SC-67 / SC-86) 不在
**設計**: シート19「Step7 移行」反対方向 + シート 26「O-11 データ可搬性」 P3 (実質 P2)  
**実装**: `/settings/export` 無し。  
**対応**: `data_exports` テーブル + `q_personal_export_zip` worker + パスフレーズ二経路 (`PassphraseChannelPicker SMS|別Email`)。

### G-P2-7. Realtime conn 監視 / pgbouncer / pgvector memory / LLM rate cost / pgmq backlog 等の運用アラート 14 件未配線
**設計**: シート23 v2.1 「LLM rate / cost / pgmq visibility / Realtime conn / pgbouncer / pgvector memory / Zoom quota / Google quota / audit chain / DR」  
**実装**: Sentry wrapper のみ。Prometheus exporter / metrics エンドポイント / Slack webhook 連携が無い。  
**対応**: `apps/worker/src/metrics/` を新設し prom-client (or hono-prometheus) で `/metrics` 公開、Grafana Cloud (Render) で alert rule 設定。

### G-P2-8. share/[token] ロケール解決 (シート21 F-UX-1) + Accept-Language middleware が未
**設計**: SC-31 v2.3「token 原作成者 locale or recipient Accept-Language」  
**実装**: `share/[token]` 画面そのものが無い。i18n middleware も無い。  
**対応**: T-022 で本実装。

---

## P3 — Phase 3 / 装飾

### G-P3-1. `next-i18next` 未導入、文字列が全 ja ハードコード
**設計**: シート21「i18n ja/en next-i18next ICU MessageFormat」 P3  
**実装**: `apps/web/package.json` に `next-i18next` / `next-intl` 不在。すべての画面で日本語が JSX に inline。  
**対応**: Phase 3 で `next-intl` (App Router 推奨) に統一、`messages/ja.json` / `messages/en.json` 抽出。

### G-P3-2. `jest-axe` / `@axe-core/react` 未導入で a11y unit/E2E CI gate 無し
**設計**: シート21「axe CI gate」「Playwright+axe」  
**実装**: package.json 不在。  
**対応**: `pnpm add -D jest-axe @axe-core/playwright`、Playwright fixture で `injectAxe(page)`、CI fail 条件。

### G-P3-3. A/B テスト (SC-69 + シート22) は schema のみ、metrics / SRM check 無し
**設計**: シート22「ab_test_experiments / ab_test_metrics / SRM p<0.001」  
**実装**: `ab_test_assignments` のみ。  
**対応**: `ab_test_experiments` / `ab_test_metrics` schema + sequential testing helper。

### G-P3-4. 行動異常 / 失敗パターン分析 (SC-48/49/52/84) 全件未
**設計**: P3。  
**対応**: 後回し。

### G-P3-5. Live region 優先度ルール / Storybook + jest-axe / 翻訳開示 UI / 人手翻訳リンク等 21 シート v2.4 v2.5 minor 系
すべて P3。Phase 3 でまとめて対応。

---

## 補強観点 — 既存実装に潜む整合性問題

### X-1. `/admin/users` の説明文「60 日後にアカウントは自動削除予定キューへ入ります」と SOP O-15 「M+60 最終削除」は整合するが、queue 実装ゼロ
UI が SLA を約束しているのに worker が動いていない。**P0 相当** (誤情報の表示) として `/admin/users` の UI から「自動削除予定キュー」文言を一旦 disable するか、worker 実装を待つ。

### X-2. `apps/web/src/lib/auth/server.ts` の `requireUser()` fallback (列が無い場合に sales role + isActive=true で前進) が本番で危険
Phase1 初期の利便性 fallback だが、migration 0028 適用済の今は不要。`docs/REMAINING_WORK.md` の「実機 Sign-in 完走テスト」直前に削除すべき。**P1**。

### X-3. `rate-limit.ts` は in-memory token bucket。Render の multi-instance になると per-IP 制限が壊れる
コメントで Phase2 cutover は予告済だが、Auth callback 系には今すぐ Upstash Redis 化したい。**P1**。

### X-4. `mobile-bottom-nav.tsx` の 5 タブが `/dashboard /meetings /mobile/scan /mobile/quick-lookup /settings`。SC-37 (内部同席 inbox) / SC-74 (conflicts inbox) が掘れない
ハンバーガー (Menu = `/settings`) 配下に inbox メニュー追加、または bottom-nav 変更。**P1**。

### X-5. Mobile placeholder ページが「暗号化して保管されます」と書いてあるが `OfflineStore.put` が throw 実装
**P0** 整合性問題。文言を「Phase 1 W3 で実装予定」に修正するか、placeholder ページの説明文を「実装後の動作」と明示する。

### X-6. `applied_by` (sample_data_seeds) は 0030 で追加されたが `consent_logs` の同 onboarding 操作と1 transaction にできていない
`acceptTerms()` → `loadSampleData()` 別 server action のため、片方失敗時の補正は client redirect 任せ。**P2**: Supabase RPC `f_complete_consent_step` 統合で 2-phase 保証。

---

## まとめ — 直近着手すべき順序

| 順 | タスク | カテゴリ | 工数 |
|---:|---|---|---:|
| 1 | G-P0-1 onboarding step 拡張 (タイムゾーン+通知+ガイドツアー)  | Onboarding | 1.5 週 |
| 2 | G-P0-2/3 通知システム T-018 (DB + web-push + SW + UI) | 通知 | 2 週 |
| 3 | G-P0-4/5 mobile T-007/T-008 (camera + IndexedDB 暗号化 + Background Sync) | Mobile | 3 週 |
| 4 | G-P0-7 Playwright e2e 8 本敷く + axe-core gate | テスト | 1 週 |
| 5 | G-P1-1 admin 招待/role 変更 (T-017) | Admin | 1 週 |
| 6 | G-P1-3/4 /403 申請動線 + ヘッダ通知 badge | Auth shell | 0.5 週 |
| 7 | G-P1-5 Zoom OAuth | OAuth | 0.5 週 |
| 8 | G-P1-11 feature flags 評価 + SC-68 admin | FF | 0.5 週 |
| 9 | G-P2-1 退職処理 SOP 実装 | Offboarding | 2 週 |
| 10 | G-P2-2 audit chain 検知 SLA + SC-77 | Observability | 1 週 |

— 合計 13 週、Phase 1 GA + Phase 2 早期に必要な分。`docs/REMAINING_WORK.md` の T-007〜T-019 12週見積と整合的。

---

© 2026 IKEMENLTD / Knowledge Sales Platform — design_gap_round1 / cross-cutting
