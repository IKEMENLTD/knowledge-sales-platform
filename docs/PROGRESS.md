# Knowledge Sales Platform — Progress Log

> Phase 1 Week 1 scaffold の進捗を時系列で記録する。完了 / 未完了の判定は「設計書とのコード整合」と「実機動作確認」の二段で行う。

---

## プロジェクト概要

| 項目 | 内容 |
|---|---|
| クライアント | 株式会社ナレッジホールディングス (沼倉氏経由) |
| 開発体制 | IKEMENLTD 受託、設計書 v2.2 / 30 シート |
| リポジトリ | https://github.com/IKEMENLTD/knowledge-sales-platform |
| Supabase | `arylptrsgxiwcnprzszo` (ap-northeast-1, Pro plan) |
| 設計書 | `docs/spec/sales_platform_design_spec_v2.xlsx` (Excel 270KB / 30 sheets) |
| 開始日 | 2026-05-09 |
| 現状フェーズ | Phase 1 Week 1 完了、Week 2 着手前 |

### システム概要 (一言)
**営業ナレッジ × 商談アーカイブ。** Zoom 録画・名刺・メールを AI で構造化し、組織の営業知見に変える B2B SaaS。

### 主要機能 (Phase 1〜3)
1. 名刺OCR (Vision API + Claude) — P1 W2
2. Zoom 録画自動取込・要約 (Whisper + Claude) — P1 W3
3. ハイブリッド検索 (BM25 + pgvector + RRF) — P1 W4
4. 日程調整自動化 (Gmail Pub/Sub + Calendar) — P2
5. AIロープレ — P3
6. マネージャーダッシュボード — P3
7. 引き継ぎ書自動生成 — P2
8. 期限付き共有リンク (sha256 + IP allowlist + WORM) — P2

---

## 完了タスク (Phase 1 Week 1)

設計書 `09_implementation_plan` シート準拠。

| ID | タスク | 状態 | 場所 |
|---|---|---|---|
| T-001 | monorepo init (pnpm + Turborepo) | ✅ | `package.json` `turbo.json` `pnpm-workspace.yaml` |
| T-002 | Supabase project (Tokyo / Pro) | ✅ | project ref `arylptrsgxiwcnprzszo` / migrations 0000-0028 適用済 |
| T-003 | Drizzle schema (P1 + 補助) | ✅ | `packages/db/src/schema/*` (24+ テーブル) |
| T-004 | RLS + RPC + triggers | ✅ | `packages/db/src/migrations/manual/0003,0008,0012,0014,0015,0023` |
| T-005 | Auth 基盤 | ✅ | `apps/web/src/lib/auth/*`, `middleware.ts`, Google OAuth (Calendar scope) |
| T-006 | Render deploy config | ✅ | `render.yaml` (3-service blueprint) |
| T-011 | Zoom Webhook (受信のみ) | ✅ | `apps/worker/src/routes/webhooks.ts` (URL validation + HMAC + jobs_inflight dedupe + audit) |

## 残タスク (Phase 1 Week 2-4)

| ID | タスク | 場所 |
|---|---|---|
| T-007 | 名刺アップロード UI | `apps/web/src/app/contacts/import/` (placeholder のみ) |
| T-008 | モバイル名刺撮影 | `apps/web/src/app/mobile/scan/` (placeholder のみ) |
| T-009 | OCR Worker (Vision + Claude PROMPT-02) | `apps/worker/src/jobs/process_business_card.ts` (未作成) |
| T-010 | 名刺レビュー画面 | `apps/web/src/app/contacts/[id]/review/` (placeholder のみ) |
| T-012 | 録画処理 Worker (Zoom DL + Whisper + Claude PROMPT-01 + R2) | `apps/worker/src/jobs/process_recording.ts` (未作成) |
| T-013 | Embedding 生成 Worker | `apps/worker/src/jobs/generate_embeddings.ts` (未作成) |
| T-014 | 商談一覧・詳細 | `apps/web/src/app/meetings/` (placeholder のみ) |
| T-015 | ハイブリッド検索 API | `apps/web/src/app/api/search/route.ts` (未作成) |
| T-016 | 検索 UI | `apps/web/src/app/search/` (placeholder のみ) |
| T-017 | ユーザー管理 | `apps/web/src/app/admin/users/` (placeholder のみ) |
| T-018 | 通知システム (Realtime) | (未作成) |
| T-019 | Phase 1 統合テスト (E2E) | `tests/e2e/` (placeholder のみ) |

---

## レビュー履歴サマリ

詳細は [`docs/REVIEW_HISTORY.md`](./REVIEW_HISTORY.md)。

### コード品質レビュー (5観点・4ラウンド)

| Round | 平均 | Architect | Security | UX | SRE | CTO |
|---|---|---|---|---|---|---|
| R1 | 64.3 | 78 | 61.5 | 62 | 41.5 | 78.5 |
| R2 | 93.9 | 94 | 88.5 | 95 | 95.5 | 96.5 |
| R3 | 99.7 | 100 | 99.0 | 100 | 100 | 99.5 |
| **R4** | **100.0 ✅** | 100 | 100 | 100 | 100 | 100 |

### デザインレビュー (3観点・3ラウンド)

| Round | 平均 | Visual | Mobile | Brand |
|---|---|---|---|---|
| DR1 | 48.0 | 42 | 64 | 38 |
| DR2 | 92.3 | 89 | 92 | 96 ✅ |
| **DR3** | **96.3 ✅** | 96 ✅ | 97 ✅ | (DR2 達成) |

---

## 主要 commits

| Commit | 内容 |
|---|---|
| `c80e0f4` | Phase 1 Week 1 scaffold (T-001/003/004/005/006/011) — 65 files |
| `01f7965` | docs: 設計書 v2.2 同梱 (`docs/spec/`) |
| `43d85fe` | DB bootstrap migrations 適用 (Supabase `arylptrsgxiwcnprzszo`) |
| `26b2441` | Google OAuth セットアップガイド `docs/SETUP_GOOGLE_OAUTH.md` |
| `4c2ab71` | Round 1 修正適用 (137 ファイル / 18 migrations) |
| `f516685` | Round 2 修正 (60+ ファイル / 9 migrations / docs 大幅刷新) |
| `a43f9f5` | Round 3 最終仕上げ (0027 phase2 placeholder + rate-limit P2 comment) |
| `6036998` | Round 4 全観点 100 到達 |
| `8fc39a7` | Sumi & Cinnabar Editorial 神デザイン全面リライト (75 files) |
| `524f31a` | Design Round 2 polish (Dialog/Sheet + 藍 info + KPI pulse + Dashboard hero) |
| `589d4a2` | Design Round 3 全観点 95+ PASS |
| `5c4a35b` | Smoke test 準備 (onboarded_at 列 + 完了ボタン + name 列修正) |

---

## 環境構築済み項目

### Database (Supabase Postgres)
- 拡張: pgcrypto / vector 0.8.0 / pgmq 1.5.1 / pg_cron 1.6.4 / supabase_vault 0.3.1
- pgmq キュー: `process_business_card` / `process_recording` / `generate_embeddings`
- 24+ テーブル全 org_id 統一 / RLS 全有効 (sales/cs/manager/admin/legal マトリクス)
- audit_logs hash chain trigger + append-only RLS
- match_knowledge RPC (sensitivity/visibility/org_id prefilter + hnsw.ef_search=64)
- 自己昇格防止 BEFORE UPDATE trigger
- handedness 列 (P1 W3 で UI 連動予定)

### Web (Next.js 15 / apps/web)
- App Router + Supabase SSR
- Google OAuth (Calendar.events scope、Gmail は P2 incremental)
- middleware: 未認証 → /login、PUBLIC_PATHS 整備、/api/* rate-limit (60 rpm)
- PWA: manifest.ts / sw.js (navigation fallback) / viewport (notch) / themeColor
- A11y: skip link / focus-visible / sr-only-focusable / aria-live / `<html lang="ja">`
- 17 SC placeholder pages (SC-06/08/09/11/15/16/17/27/32/33/34/35/55/61/66/70/71/74)
- Sentry init (client/server/edge) + instrumentation.ts
- next/font: Bricolage Grotesque + Plus Jakarta Sans + Noto Sans JP + JetBrains Mono

### Worker (Hono / apps/worker)
- Zoom Webhook: URL validation + HMAC + 64KB cap + per-IP rate limit + dual-secret rotation + jobs_inflight dedupe + appendAudit
- /healthz (liveness) + /readyz (DB+pgmq+R2+Sentry 並列 ping)
- /metrics Prometheus endpoint (jobs / job_duration / pgmq_queue_depth / llm_tokens / llm_cost_usd / http_*)
- request_id propagation (x-request-id + child logger + pgmq payload)
- cost-guard (per-conversation $0.10 / per-meeting $0.50)
- idempotency middleware + audit lib
- tsc-alias で build 時 paths 解決

### DevOps
- render.yaml 3-service (ksp-web / ksp-ingress / ksp-worker、region: tokyo / plan: standard)
- .github/workflows: ci.yml (check/sql-syntax/build/e2e) + security.yml (gitleaks/audit/CodeQL) + release.yml
- renovate.json (weekly schedule + グループ化)
- playwright.config.ts (root)
- vitest 32 tests pass (worker 23 + shared 9)
- typecheck 4 packages 全成功

---

## デザインシステム

詳細は [`docs/DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md)。

### "Sumi & Cinnabar Editorial" 美学

| 軸 | 採用 |
|---|---|
| 思想 | 編集的 (editorial) × 業務 SaaS の信頼感 × 日本らしさ (墨と朱) |
| 色 | 墨 sumi `#131a26` / 朱 cinnabar `#cf3a2d` / クリーム paper `#fafaf6` / 千歳緑 chitose / ochre / 藍 info |
| タイポ | Bricolage Grotesque (display) + Plus Jakarta Sans (body) + Noto Sans JP + JetBrains Mono |
| モチーフ | 編集的ナンバリング (№ 01/02/03) + hairline rules + 落款 (inkan) accent + paper grain |
| モーション | cubic-bezier(0.32, 0.72, 0, 1) ease-sumi、Linear-grade 抑制 |
| ロゴ | 自家製 SVG: K letterform + 落款朱方 (favicon.svg / apple-touch-icon.svg / og-image.svg) |

### 構築済みコンポーネント
- UI primitives 8 本 (button / card / input / dialog / sheet / alert / submit-button / label)
- Layout 8 本 (AppShell / HeaderNav / MobileBottomNav / ThemeProvider / ProtectedShell / SectionSkeleton / SectionError / SignOutButton / PagePlaceholder)
- Brand 1 本 (Logo + LogoMark)

---

## 残課題

詳細は [`docs/REMAINING_WORK.md`](./REMAINING_WORK.md) + GitHub Issues。

### 直近の優先順位
1. 🔴 **実機 Sign-in 完走テスト** (現在進行中、ユーザー操作待ち)
2. 🔴 ダークモードトグル UI
3. 🟠 Render Blueprint デプロイ
4. 🟠 RLS / audit_logs / 自己昇格防止 trigger 実テスト (AT-RLS-1〜3)
5. 🟠 T-007 名刺取込 UI 着手 (Phase 1 W2)
6. 🟡 ナレッジHD 現場ヒアリング
7. 🟡 コスト試算
8. 🟡 Lighthouse / Playwright e2e 実測
9. 🟡 ブランド資産確定 (PNG raster / brand guideline)
10. 🟡 法務・コンプラ文書 (利用規約 / プライバシーポリシー / DPA)

---

© 2026 IKEMENLTD / Knowledge Holdings
