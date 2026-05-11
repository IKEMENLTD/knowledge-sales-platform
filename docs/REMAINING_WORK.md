# Knowledge Sales Platform — Remaining Work

> Phase 1 W1 完了時点で残っている作業を、優先度順に整理する。コードレビュー R4 で全観点 100点・デザインレビュー DR3 で全観点 95+ を達成しているが、これは「設計と整合した scaffold」のスコアであり、**動くシステム** ではない。

---

## 🔴 最重要 (これやらないと現場で使えない)

### #1 実機 Sign-in 完走テスト
**状態**: 進行中 (ユーザー操作待ち) / **見積**: 30 分

- ブラウザで `/login` → Google → `/dashboard` の完全往復を一度も確認していない
- `feedback_simulation_first.md` 直撃 — 「レビュー高得点≠実装完成」
- 検証項目:
  - Supabase Google Provider が Enable + Save 済みか
  - Google OAuth callback (`arylptrsgxiwcnprzszo.supabase.co/auth/v1/callback`) が実走するか
  - `auth.users` → `public.users` 自動プロビジョン (handle_new_auth_user trigger)
  - `requireUser()` の onboarded_at fetch が動くか
  - 各 placeholder ページが表示されるか
  - モバイル bottom nav が機能するか
- 詰まりやすい点: redirect_uri_mismatch / scope not authorized / inactive role / RLS

### #2 T-007〜T-019 実機能ゼロ
**状態**: 全 placeholder のみ / **見積**: 12 週間

| タスク | 内容 |
|---|---|
| T-007 | 名刺アップロード UI (D&D + Storage + pgmq enqueue) |
| T-008 | モバイル名刺撮影 (getUserMedia + opencv-wasm + jsqr + IndexedDB queue) |
| T-009 | OCR Worker (Vision Document AI + Claude PROMPT-02 + 重複検知) |
| T-010 | 名刺レビュー画面 (修正 / マージ判定 UI) |
| T-012 | 録画処理 Worker (Zoom DL → R2 → Whisper → Claude PROMPT-01) |
| T-013 | Embedding 生成 Worker (800tok chunk + OpenAI batch API + pgvector) |
| T-014 | 商談一覧 / 詳細 (Kanban + List + 動画プレーヤー + 同期文字起こし) |
| T-015 | ハイブリッド検索 API (`/api/search` BM25 + vector + RRF) |
| T-016 | 検索 UI |
| T-017 | ユーザー管理 (招待 / role 変更 / 退職処理) |
| T-018 | 通知システム (Supabase Realtime + Web Push) |
| T-019 | Phase 1 E2E 統合テスト (Playwright) |

#### 着手前のブロッカー
- workbox / opencv-wasm / react-camera-pro / faster-whisper / pyannote 未追加
- LLM プロンプト LP-01〜04 未配置
- pgmq consumer ループ未起動 (`apps/worker/src/jobs/` 空)
- R2 bucket 未作成

---

## 🟠 重要

### #3 デザイン残課題 (-3.7点)
**見積**: 1 日

- **Visual (-4 点)**: dashboard 横スクロール挙動 / Submit button 完了余韻 (Check icon fade-out) / Header dynamic border on scroll
- **Mobile (-3 点)**: maskable PNG icon (raster 出力、デザイナー後付け)
- **Brand (-4 点)**: タグライン UI 常駐 / onboarding 実機能化 (consent_logs 連動) / 403 connect 先確定 (メール窓口)

### #4 ダークモード未確認
**見積**: 1 時間

- `next-themes` は導入済みだが **トグル UI 自体がない**
- 実機で system 設定変えて目視していない
- handedness 切替 UI も同様 (CSS 変数だけ)
- 対応: ヘッダー右上に Sun/Moon icon の `<ThemeToggle>` を作る

### #5 セキュリティ実装の実テスト未済
**見積**: 4 時間

- RLS が ロール別ユーザー作って実際に効くか未テスト (AT-RLS-1〜3)
- audit_logs hash chain trigger が実 INSERT で連鎖するか未確認
- match_knowledge sensitivity prefilter が漏らさないか未テスト
- 自己昇格防止 trigger (0015) が発火するか未テスト
- 対応: `apps/worker/src/__tests__/rls.test.ts` / `audit_chain.test.ts` を追加。pgvector を service container で立てる

### #6 CI / Render 未実走
**見積**: 2 時間

- `.github/workflows/ci.yml` 配置済みだが **PR 作って通したことがない**
- Render Blueprint 未デプロイ
- 本番 Sentry / cost-guard / rate-limit 動作未確認
- 対応: 仮 PR を作り CI 全 job pass 確認 → main merge → Render Dashboard で Blueprint 読込

---

## 🟡 次フェーズ (P1 W2 と並行 or 完了後)

### #7 ブランド資産確定
**見積**: 3 日 (デザイナー監修)

- KSP ロゴ = 私が描いた仮当て (デザイナー監修なし)
- アプリアイコン .png raster 不在 (iOS ホーム画面で SVG 拒否される機種あり)
- favicon.ico (旧ブラウザ用) 不在
- og-image .png 不在 (SNS 共有時の表示崩れリスク)
- ブランドガイドライン文書ゼロ (色 / フォント / トーン / アイコン使用ルール)

### #8 法務・コンプライアンス
**見積**: 2 週間 (法務監修)

- プライバシーポリシー / 利用規約 / コンプライアンス文書 ゼロ
- Gmail `gmail.send` の Google CASA Tier 2 審査未着手 (年100万円規模、本番公開前必須)
- 録画 per-attendee 同意フロー未実装 (16_compliance_legal NF-S4-1)
- 個人情報保護法上の DPA (Anthropic / OpenAI / Cloudflare / Render / Supabase) 確認未

### #9 ナレッジHD 現場ヒアリング
**見積**: 1.5h × 3名 = 5h + 分析 4h

- 設計書 v2.2 は机上で 100点だが、**現場営業マンにヒアリングしてない**
- 実利用者の「これは要らない / これが欲しい」が反映されていない
- 推奨: 営業マン 3 名、CS 1 名、マネージャー 1 名にデモ + 1時間ヒアリング
- 結果は `docs/INTERVIEWS.md` に集約、Phase 1 W3 着手前にスコープ調整

### #10 コスト試算
**見積**: 2 時間

- 50人 / 100人 / 500人時の月額算定未
- 試算対象:
  - Anthropic Claude (要約 / ロープレ評価)
  - OpenAI Embeddings / Whisper / TTS
  - Cloudflare R2 (録画原本 + cross-region replication)
  - Render Standard ×3 (web / ingress / worker)
  - Supabase Pro (DB / Auth / Storage / Realtime / pgmq / pg_cron)
- 12_cost_estimate シートの cost cap (per-conversation $0.10 / per-meeting $0.50) が現実的か検証

### #11 パフォーマンス測定
**見積**: 4 時間

- Lighthouse Mobile (LCP/INP/CLS) 実測値未取得
- Bundle size 計測未 (Next.js `next build --analyze`)
- Web Vitals (LCP/INP/CLS) 監視未配線 (vercel/speed-insights)
- 対応: CI に `lhci` (Lighthouse CI) 統合、baseline 値を `docs/PERF_BASELINE.md` に固定

### #12 テスト
**見積**: 1 週間

- vitest 32 件は通っている (worker 23 / shared 9)
- Playwright e2e は `describe.skip` placeholder のみ
- Visual regression test (Chromatic / Percy) なし
- accessibility (axe-core) test なし
- load test (k6 / artillery) なし
- 対応: T-019 で本格整備、placeholder smoke から AT 24 シート対応へ

---

## 🟢 装飾的・後回し可

### #13 各セクション empty state 設計
dashboard は対応済だが /meetings, /recordings, /search の empty state は placeholder のみ。Phase 1 W2-W4 の本実装と並行で対応。

### #14 i18n
文字列は全 ja ハードコード。`next-intl` / `next-i18next` 統合は Phase 3 (21_a11y_i18n) で。

### #15 監視ダッシュボード
Sentry / Prometheus / Grafana の閲覧 UI は本番運用開始後に整備。

### #16 Storybook / Design Gallery
コンポーネントカタログは Phase 1 W3 以降のチーム拡大時に。

---

## まとめ — 直近の優先順位

```
1. 実機 Sign-in 完走テスト (30分)        ← 今日やる
2. ダークモードトグル UI (1時間)
3. Render Blueprint デプロイ (2時間)
4. RLS テスト書く (4時間)
5. T-007 名刺取込UI 着手 (8時間)
6. ナレッジHD 現場ヒアリング (9時間)
7. コスト試算 (2時間)
```

最小限 1〜4 を片付けてから 5 に進むのが安全。実機 sign-in 通らないまま T-007 着手しても、後で auth まわりの本番障害で全部やり直しになる。

---

© 2026 IKEMENLTD / Knowledge Holdings
