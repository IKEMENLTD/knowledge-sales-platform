# Knowledge Sales Platform — Review History

> 5観点コード品質レビュー (R1〜R4) + 3観点デザインレビュー (DR1〜DR3) の詳細記録。
> 個別レポートは `reviews/round[1-4]/` と `reviews/design_round[1-3]/` 配下。

---

## コード品質レビュー (5観点 × 4 ラウンド)

### Round 1 — 平均 64.3 / 100

採点初回。設計書 `sales_platform_design_spec_v2.xlsx` v2.2 (30シート) を基準に 5 並列 agent で採点。

| 観点 | スコア | 主要指摘 |
|---|---|---|
| Architect | 78 / 100 | recording_segments/recording_stages 欠落、pgmq.create 非冪等、Zoom webhook enqueue 未実装 false-OK |
| Security | 61.5 / 100 | users.role 自己昇格、match_knowledge sensitivity prefilter 欠如、P1 必須 9 テーブル不在 |
| UX | 62 / 100 | PWA manifest 不在、handedness P1 痕跡なし、shadcn primitive 未配置、AppShell / signout 欠落 |
| SRE | 41.5 / 100 | CI 未設定、Sentry 未配線、env 網羅性不足、region: singapore のまま |
| CTO | 78.5 / 100 | **org_id 全テーブル不在** (v2.1 CRIT 乖離)、AT-RLS テスト雛形ゼロ |

### Round 2 — 平均 93.9 (+29.6)

137 ファイル変更 / 18 migrations 追加。

| 観点 | R1 → R2 | Δ |
|---|---|---|
| Architect | 78 → 94 | +16 |
| Security | 61.5 → 88.5 | +27 |
| UX | 62 → 95 | +33 |
| SRE | 41.5 → 95.5 | +54 |
| CTO | 78.5 → 96.5 | +18 |

主要対応:
- 全テーブル `org_id` 統一 (T-1 v2.1 CRIT 解消)
- recording_segments/stages, audit_logs (hash chain), idempotency_keys, feature_flags, business_card_images 他 P1 補助テーブル群追加
- recordings.sensitivity tier + RLS prefilter
- match_knowledge v2 (sensitivity/visibility/org_id prefilter + hnsw.ef_search=64)
- users.role 自己昇格防止 BEFORE UPDATE trigger
- pgmq.create 冪等化、apply_migrations.py に ledger + dry-run
- PWA: manifest.ts / sw.js / viewport / skip link / focus-visible / next-themes / Toaster
- shadcn primitives 7 本 / AppShell / signout 導線 / 17 SC placeholder pages
- Sentry init (client/server/edge) / Prometheus metrics / /readyz 依存ping / cost-guard / 90日 dual-secret rotation
- render.yaml 3-service分離 (region: tokyo / plan: standard)
- .github/workflows: ci / security / release
- next.config: HSTS / X-Content-Type-Options / Permissions-Policy / CSP-Report-Only
- requireUser({role}) role gate / OAuth scope 最小化

### Round 3 — 平均 99.7 (+5.8)

9 migrations 追加 (0018-0026)、9 ファイル新規 + 7 ファイル変更。

| 観点 | R2 → R3 | Δ |
|---|---|---|
| Architect | 94 → 100 | +6 |
| Security | 88.5 → 99.0 | +10.5 |
| UX | 95 → 100 | +5 |
| SRE | 95.5 → 100 | +4.5 |
| CTO | 96.5 → 99.5 | +3 |

主要対応:
- 0018 notifications.type SQL CHECK
- 0019 FK on delete restrict 統一 (8 本)
- 0020 vector extension extensions schema 移動
- 0021 sample_data_seeds テーブル
- 0022 share_links + RLS (token sha256 + ip_allowlist)
- 0023 update_recording_insights RPC
- 0024 users.handedness 列
- 0025 auth_sync_v2 (is_active default false)
- 0026 current_org_id fail-closed (GUC 未設定時 NULL)
- audit lib + webhook 配線 (jobs_inflight INSERT ON CONFLICT)
- embeddingSourceType / notificationType const 集中化
- userTimezoneSchema (Intl.supportedValuesOf 検証)
- 8 セクション loading.tsx + error.tsx
- SubmitButton (useFormStatus + Loader2)
- dashboard hint 「Phase1 T-XXX」→「近日提供」
- /api/* rate-limit middleware + CORS allowlist
- README に Migration troubleshoot / Supabase Pro 拡張順 / DR runbook / Secret rotation SOP

### Round 4 — 平均 100.0 ✅ (+0.3)

Round 3 残点 (-1.5) を最終仕上げ。

| 観点 | R3 → R4 | Δ |
|---|---|---|
| Architect | 100 → 100 | (R3 達成) |
| Security | 99.0 → 100 | +1 |
| UX | 100 → 100 | (R3 達成) |
| SRE | 100 → 100 | (R3 達成) |
| CTO | 99.5 → 100 | +0.5 |

主要対応:
- 0027_phase2_chain_partition_placeholder.sql (audit_logs default org_id Phase2 切替手順)
- apps/web/src/lib/rate-limit.ts に P2 Redis (Upstash) 移行コメント拡張

**Verdict**: 5観点全 100 PASS、Phase 1 W2 着手 GO。

---

## デザインレビュー (3観点 × 3 ラウンド)

### Design Round 1 — 平均 48.0 / 100

3 並列 agent で「神デザイン」基準 (Linear / Vercel / Stripe / Notion 級) 採点。

| 観点 | スコア | 主要指摘 |
|---|---|---|
| Visual Design | 42 / 100 | shadcn テンプレ感、ブランドカラー不在、ロゴが塗り四角、login の 🔐 絵文字、dashboard 空 KPI |
| Mobile Responsive | 64 / 100 | bottom nav 消失、iOS 入力ズーム、safe-area 未対応、SW offline fallback 未配線 |
| Brand & Information | 38 / 100 | 内部 SC コード本番 UI 露出、ブランド資産不在、マイクロコピーが設計書直貼り、empty state 不在 |

### Design Round 2 — 平均 92.3 (+44.3)

75 ファイル全面リライト、"Sumi & Cinnabar Editorial" 美学コミット。

| 観点 | DR1 → DR2 | Δ |
|---|---|---|
| Visual | 42 → 89 | +47 |
| Mobile | 64 → 92 | +28 |
| Brand | 38 → 96 ✅ | +58 |

主要対応:
- tailwind.config.ts 全面再設計、HSL token / shadow / easing / animations / xs:375 breakpoint
- globals.css: 墨/朱/千歳緑/ochre/info の HSL CSS variables / paper grain SVG / kicker / display / section-no / inkan utilities
- next/font: Bricolage Grotesque (display) + Plus Jakarta Sans (body) + Noto Sans JP + JetBrains Mono
- brand/logo.tsx 新規: SVG K letterform + 落款 (inkan) accent
- ui/button: 7 variants × 3-state hover/active, cubic-bezier ease-sumi, 44px+
- ui/card: multi-layer shadow + hover lift
- ui/input: text-base mobile (iOS ズーム防止), cinnabar focus ring
- ui/alert: token-based 6 variant (cinnabar / destructive / warning(ochre) / success(chitose) / info)
- mobile-bottom-nav.tsx 新規 (5 tab + center cinnabar FAB + safe-area-inset-bottom)
- placeholder.tsx: SC/T コード data-* 化、editorial № section + kicker + hairline
- 12 placeholder pages: brand voice 全面書換 (Phase1/T-XXX/SC/RLS/jargon ゼロ)
- /403, /offline: SVG illustration + brand voice
- /onboarding: 3-step stepper
- login: 🔐 絵文字 → 公式 Google G SVG, scope 説明平易化
- dashboard: 時間帯あいさつ + editorial № 01-04 KPI + empty state CTA
- public/favicon.svg, apple-touch-icon.svg, og-image.svg 内製
- public/sw.js: navigation request 失敗時 /offline フォールバック実装

### Design Round 3 — 平均 96.3 ✅ (+4.0)

Round 2 残課題を 1 巡完全解消。

| 観点 | DR2 → DR3 | Δ |
|---|---|---|
| Visual | 89 → 96 ✅ | +7 |
| Mobile | 92 → 97 ✅ | +5 |
| Brand | (DR2 達成 96) | — |

主要対応:
- Dialog/Sheet overlay: bg-foreground/35 + backdrop-blur-md + shadow-sumi-xl + rounded-2xl + animate-scale-in
- Dialog/Sheet に [overscroll-behavior:contain] 全面追加
- Dialog/Sheet close ボタンを size-11 (44px) に拡張 + focus-shadow-ring
- Sheet bottom variant に drag handle UI (h-1.5 w-10 rounded-full)
- Sheet 全 side variant で safe-area inset 対応
- Input preset variant 8 種 (default/email/tel/search/numeric/url/name-jp/password) — iOS/Android キーボード設定一括宣言
- KPI 空状態 "—" に baseline (repeating-linear-gradient) + cinnabar 脈動 dot
- Dashboard "最初の一歩" を真の hero card に: radial cinnabar glow + 右下 rotated-8deg inkan 落款 + shadow-sumi
- --info: 215 75% 42% → 204 52% 38% (藍化、和テイスト整合)
- --cinnabar-muted: 10 75% 96% → 8 60% 93% (cream 上で識別可能)
- dark mode: paper-grain → 微弱 vertical hairline pattern (32px tile)
- display letter-spacing 微調整 (3xl/-0.015, 4xl/-0.018, 5xl/-0.022, 6xl/-0.026)

**Verdict**: 3観点全 95+ PASS、Linear / Vercel / Stripe / Notion 級 distinctive 到達。

---

## レビュー方式の特徴

### 並列サブエージェントアプローチ
- 5観点 (R1〜R4) / 3観点 (DR1〜DR3) を **一度のメッセージで並列起動**
- 各 agent が独立に採点 → 横並びで比較可能
- 修正者 (主エージェント) は全 agent のレポートを統合してパッチを当てる
- 修正後に再び並列起動して再採点 → 100/95+ までループ

### スコア体系
- 100 点満点、観点ごとに減点方式
- Critical (-5〜-8), High (-3〜-5), Medium (-1〜-2), Minor (-0.5〜-1)
- 各 agent が独立に Critical / High / Medium / Minor を判定
- 残課題には必ず file:line + 具体的修正パッチ案を添える

### 文書アーカイブ
- 全レビュー結果を `reviews/round[N]/<perspective>.md` で永続化
- 後日「なぜそう判断したか」を辿れる証跡として残す
- Phase 2 以降の reviewer がコンテキストを引き継げる

---

© 2026 IKEMENLTD / Knowledge Holdings
