# UX MAX化ロードマップ

> 20体並列シミュレーションによる UX 改善計画書
> 作成日: 2026-05-17 / 対象: Phase 1 (T-007〜019) 完成想定

## 目次

- [1. エグゼクティブサマリ](#1-エグゼクティブサマリ)
- [2. 20観点スコア一覧](#2-20観点スコア一覧)
- [3. 観点別 Top5 ギャップ詳細](#3-観点別-top5-ギャップ詳細)
- [4. Phase 別ロードマップ](#4-phase-別ロードマップ)
- [5. 神UX 7原則](#5-神ux-7原則)
- [6. 期待スコア進化](#6-期待スコア進化)
- [7. 最重要発見](#7-最重要発見)
- [8. 次の打ち手候補](#8-次の打ち手候補)

---

## 1. エグゼクティブサマリ

| 指標 | 値 |
|---|---|
| 総合平均スコア | **44/100** |
| 最低スコア | i18n **12/100** |
| 最高スコア | 情報設計 **78/100** |
| 法令違反内包 | a11y cinnabar contrast 1.44:1 (WCAG AA違反) |
| MAX化到達目標 | **96+/100** (約5-6ヶ月) |

### 3行サマリ

1. **営業1ロール特化** で CS / Executive / IT管理者 / 外部開発者 が軒並み 18-42点
2. **エンタープライズ要件 (SSO/SCIM/Public Legal/監査UI/SLA) ほぼゼロ** → 数百名規模で導入決裁通らない
3. **同時編集無音データ消失 (18点)** は CRM として致命傷、即対応必須

---

## 2. 20観点スコア一覧

| # | 観点 | スコア | 重大度 | 主な発見 |
|---|---|---:|---|---|
| ⑰ | 国際化・多言語 (i18n) | **12** | 🚨🚨 | next-intl 未導入、ハードコード日本語50ファイル超 |
| ⑨ | エグゼクティブKPI俯瞰 | **18** | 🚨🚨 | KPI全部"—"、役員ダッシュボード機能ゼロ |
| ⑯ | 同時編集/マルチタブ衝突 | **18** | 🚨🚨 | blind UPDATE でデータ無音消失 |
| ⑲ | チーム招待・一括設定 | **18** | 🚨🚨 | CSV bulk invite 無し、50人=50回手作業 |
| ⑬ | IT管理者/Tenant Admin | **32** | 🚨 | SSO/SCIM/IP制限/監査UI 全部未実装 |
| ⑥ | CS担当・解約防止 | **32** | 🚨 | health score / handoff / 約束追跡 ゼロ |
| ⑤ | チーム協業/引継ぎ | **35** | 🚨 | 通知/コメント/タイムライン全部 placeholder |
| ⑧ | AI信頼性 (LLM特有) | **42** | ⚠️ | confidence/citation/regenerate/👍👎 皆無 |
| ⑪ | 録画される顧客側 | **42** | ⚠️ | 外部閲覧者の同意UI不在、GDPR要件未達 |
| ⑱ | DX (Integration開発者) | **42** | ⚠️ | Public API/OpenAPI/PAT 無し |
| ⑮ | 30日経過リテンション | **42** | ⚠️ | First Win 演出/Achievement/Changelog 無し |
| ② | パワーユーザー日次 | **52** | ⚠️ | Cmd+K不在、フォーム検索、スクロール記憶無し |
| ⑩ | Salesforce移行 | **52** | ⚠️ | external_id 無し、bulk API 無し |
| ① | 初回オンボーディング | **62** | | 無音遷移、Skip後の復帰導線不明確 |
| ⑫ | 障害復旧・データロス耐性 | **62** | | Idempotency status-only、Offline スタブ |
| ⑳ | 法務/契約購買者 | **62** | | Public ToS/DPA/SLA 文書無し |
| ⑦ | アクセシビリティ (a11y) | **68** | 🚨法令違反 | cinnabar light mode 1.44:1 |
| ③ | モバイル外出先 | **72** | | Camera/Offline placeholder |
| ⑭ | SOC2監査適合 | **72** | | consent 強制 middleware 無し、key rotation 無し |
| ④ | 認知負荷/情報設計 | **78** | ✅ | Editorial美学◎、状態完全性に穴 |

---

## 3. 観点別 Top5 ギャップ詳細

### ① 初回オンボーディング (62/100)
- 認証→Onboarding の無音遷移 `apps/web/src/app/auth/callback/route.ts:1-50`
- Skip ボタンの consequence 不明 `onboarding/_components/step-calendar.tsx`
- Empty dashboard で competing CTA `dashboard/page.tsx:58-83`
- Stepper に description 無し `onboarding/page.tsx:64-66`
- Sample data 削除 CTA が fine print `dashboard/page.tsx:117-119`

### ② パワーユーザー日次 (52/100)
- Cmd+K コマンドパレット無し `meetings/page.tsx:70` 他
- 検索が form-submit 型 `search/page.tsx:100-120`
- 詳細→戻る でスクロール位置喪失
- バルク選択/multi-select 無し
- スケルトンローダー粗い

### ③ モバイル外出先 (72/100)
- Camera capture 未実装 `apps/web/src/app/contacts/import/page.tsx:20`
- Offline queue placeholder `apps/web/src/app/mobile/queue/page.tsx:16`
- SearchBox の min-w が iPhone SE で狭い `contacts/page.tsx:143-151`
- bottomActionBar が古い iOS で nav と衝突 `components/layout/app-shell.tsx:89`
- StatusBadge の whitespace-nowrap 切れリスク `contacts/page.tsx:252-256`

### ④ 認知負荷/情報設計 (78/100)
- Empty/Loading 混在 `dashboard/page.tsx:168-172`
- Stage 色 6種で凡例固定無し `meetings/page.tsx:24-54`
- formatDateJp / formatJpy の locale 不透明 `lib/demo/fixtures.ts`
- 3種類アイコン StatusBadge `contacts/page.tsx:234-262`
- Hardcoded NOW `meetings/page.tsx:20`

### ⑤ チーム協業/引継ぎ (35/100)
- 通知設定UI placeholder `settings/notifications/page.tsx`
- Meeting詳細 描述のみ未実装 `meetings/[id]/page.tsx`
- Recording player 未実装 `recordings/[id]/page.tsx`
- アクティビティタイムライン UI 無し (audit.ts はある)
- @mention/コメント機能 無し
- handoff template / due date / 完了確認 無し

### ⑥ CS担当・解約防止 (32/100)
- 約束/コミットメント追跡無し
- health score / churn signal 無し (last_contact_date 等)
- Sales→CS handoff 機能無し (status='ready_for_cs')
- 更新日/QBR フロー不可視
- CS role の RLS 不在 `0033_*`

### ⑦ アクセシビリティ (68/100) 🚨法令違反
- **cinnabar light mode 1.44:1** `globals.css:32-33` → WCAG 1.4.3 違反
- Form error aria-describedby リンク未確認
- Skip link デプロイ未確認 `protected-shell.tsx`
- Image alt 体系化されてない
- prefers-reduced-motion 全コンポ未検証

### ⑧ AI信頼性 (42/100)
- LLM出力に confidence 表示無し (OCRには3-tier ある)
- regenerate / retry ボタン無し
- モデル名/コスト/timestamp 完全非表示
- AI content timestamp 無し
- 👍👎 フィードバックループ無し

### ⑨ エグゼクティブKPI俯瞰 (18/100)
- KPI 全部"—" `dashboard/page.tsx:59-82`
- ロール別ダッシュボード分岐 無し
- 期間比較 (週/月/年) 無し
- Export (CSV/PDF/Slack) 無し
- Empty state 永続化

### ⑩ Salesforce移行 (52/100)
- Pre-Import validation UI 無し
- 重複マージ UI / rollback 無し
- external_id 欠落 → traceability 喪失
- OCR async 完了通知無し
- Bulk API / import-job tracking 無し

### ⑪ 録画される顧客側 (42/100)
- 外部閲覧者の pre-access consent 無し
- One-time 表示 backend 未強制
- watermark 開示無し
- viewer 削除権 無し
- TLS 明示無し

### ⑫ 障害復旧 (62/100)
- IndexedDB AES-GCM 暗号化未実装
- idempotency response_body 未保存 (status のみ)
- Service Worker navigation のみ
- アップロード resume UI 不明
- LLM cost cap フォールバック無し

### ⑬ IT管理者 (32/100)
- SSO/SAML/OIDC 完全未実装
- SCIM 非対応
- 監査ログ検索UI/Export 無し
- Session管理/IP制限 無し
- カスタムロール Phase 2 送り

### ⑭ SOC2監査 (72/100)
- recording_consent 強制無し (P2/PI7.1)
- Encryption-at-rest 仕様文書化無し
- 7年保管 enforcement 無し (CC7.2)
- Webhook 内 consent verify 無し
- Secret 自動ローテ無し (CC6.3)

### ⑮ 30日経過リテンション (42/100)
- ダッシュボード First Win 演出無し
- 機能進捗バッジ無し (Help/?アイコンも無し)
- Impact Carousel/AI サジェスト無し
- Achievement/Badge/Streak 無し (4ファイルあるが UI 統合無し)
- Changelog / What's New 完全無し

### ⑯ 同時編集/マルチタブ (18/100)
- blind UPDATE 無音上書き `meetings/[id]/route.ts:156`
- presence indicator 無し `manual-notes.tsx:19-22`
- localStorage draft 無し `manual-notes.tsx:33-37`
- BroadcastChannel 無し
- 3-way diff UI 無し

### ⑰ i18n (12/100)
- next-intl/react-intl 未導入 `apps/web/package.json`
- timezone selector 未実装 (date-fns-tz 入ってるが未使用)
- 言語切替 UI 無し
- ハードコード日本語 50ファイル超
- Intl.NumberFormat による currency 戦略無し

### ⑱ DX/Integration (42/100)
- Public API 認証 (Bearer/PAT) 無し
- OpenAPI/Swagger Spec 無し
- REST rate limit 無し (webhook のみ)
- カスタムエラー (RFC7807 非準拠)
- versioning/changelog 戦略 無し
- ✅ Webhook (Zoom) は production-grade

### ⑲ チーム招待 (18/100)
- 招待ボタン onClick 未実装 `admin/users/page.tsx:72-75`
- CSV bulk import 無し
- 招待状態管理 (sent/opened/expired) 無し
- 部署/役割 一括割当 無し
- スケジュール送信 無し

### ⑳ 法務/契約購買者 (62/100)
- ToS/Privacy が TypeScript 定数 `policy-document.ts:13-14`
- DPA template 単体文書 無し
- SLA 公式定義 無し
- Sub-processor 透明性ポータル無し
- DSAR/削除証明書 UI 無し

---

## 4. Phase 別ロードマップ

### Phase L0 — 即対応 (1週) ⚠️法令違反 + データ消失

| 項目 | 観点 | 工数 |
|---|---|---|
| cinnabar light mode → 4.5:1 修正 | ⑦ | 1d |
| 全 mutating endpoint に `version`/`If-Match` 楽観ロック | ⑯ | 3d |
| 外部 share-link 受信者の同意 modal | ⑪ | 2d |
| 個情報削除リクエスト窓口 (form + 受信) | ⑪⑳ | 1d |

### Phase B — ローンチブロッカー (3-4週)

| 項目 | 観点 | 工数 |
|---|---|---|
| Cmd+K コマンドパレット | ②⑤① | 5d |
| Empty/Loading/Error の4状態完全分離 | ①④⑫ | 4d |
| 通知センター + 設定UI (channel/frequency/role) | ⑤ | 5d |
| AI信頼性3点 (confidence/regenerate/citation+👍👎) | ⑧ | 5d |
| Idempotency middleware の response_body 保存 | ⑫⑭ | 2d |
| consent 強制 middleware (録画前に verify) | ⑭⑪ | 3d |
| 30日経過 First Win 演出 + マイルストーン | ⑮ | 3d |

### Phase E — エンタープライズ獲得 (6-8週)

| 項目 | 観点 | 工数 |
|---|---|---|
| **SSO/SAML/OIDC + SCIM** | ⑬ | 15d |
| **CSV bulk invite + 招待状態管理** | ⑲ | 5d |
| エグゼクティブ俯瞰ダッシュボード (ARR/NRR/Win Rate) | ⑨ | 8d |
| 自動週次レポート Slack 配信 | ⑨ | 3d |
| CS機能群 (health score / handoff / promise追跡) | ⑥ | 12d |
| Salesforce import wizard + external_id + bulk API | ⑩ | 10d |
| 監査ログ管理UI + SIEM転送 + 7年保管 enforcement | ⑬⑭ | 6d |
| **Public ToS/Privacy/DPA HTML + Trust Center** | ⑳ | 5d |
| Sub-processor list 公開 + 変更通知 | ⑳⑭ | 2d |
| SLA 公式文書 + Status Page | ⑳⑭ | 3d |
| Secret 90日自動ローテーション | ⑭ | 4d |

### Phase G — グローバル展開 (2ヶ月)

| 項目 | 観点 | 工数 |
|---|---|---|
| next-intl 導入 + ja/en/zh/ko | ⑰ | 8d |
| timezone/currency 設定UI + 全 datetime locale化 | ⑰ | 5d |
| AI要約の翻訳ボタン | ⑰⑧ | 3d |
| Public API + PAT + OpenAPI Spec 自動生成 | ⑱ | 10d |
| Webhook outbound + retry/署名 | ⑱ | 5d |
| RFC 7807 Problem Details 全 endpoint 標準化 | ⑱ | 3d |
| Zapier / Slack 公式 integration | ⑱ | 7d |

### Phase R — 磨き上げ (1-2ヶ月)

| 項目 | 観点 | 工数 |
|---|---|---|
| Real-time presence (Supabase Realtime) | ⑯ | 8d |
| BroadcastChannel でマルチタブ同期 | ⑯ | 3d |
| 3-way diff conflict resolution UI | ⑯ | 5d |
| LocalStorage draft autosave 全フォーム | ⑫⑯ | 3d |
| View Transitions API + スクロール記憶 | ② | 4d |
| バルク選択 + 一括操作 | ② | 5d |
| Camera API + IndexedDB (AES-GCM) Service Worker | ③⑫ | 10d |
| 編集的ナンバリング(№ 01)キーボードジャンプ | ④ | 2d |
| Stepper description + Skip復帰導線 | ① | 2d |
| LLM cost cap フォールバック導線 | ⑫⑧ | 3d |
| In-app Changelog + What's New | ⑮ | 3d |
| Achievement / Streak / Badge | ⑮ | 5d |

---

## 5. 神UX 7原則

1. **Speed of Light** — 全操作100ms以内体感 (Cmd+K, debounce, optimistic UI, View Transitions)
2. **State Honesty** — Empty/Loading/Error/Success の4状態 + 衝突 + 削除Undo を絶対に隠さない
3. **AI as Trusted Coworker** — 信頼度・出典・再生成・編集・👍👎 の5点必須
4. **Privacy by Design** — 内部/外部ユーザー同等扱い、consent→開示→削除
5. **Editorial as Function** — 美学を機能化 (色=動詞、ナンバリング=ナビ、余白=情報階層)
6. **Enterprise Ready** — SSO/SCIM/監査/Public Legal/SLA は MVP必須要件
7. **Global by Default** — i18n/timezone/currency を後付けせず最初から

---

## 6. 期待スコア進化

| Phase | 期間累計 | 平均スコア | 主な飛躍 |
|---|---|---:|---|
| 現状 | - | 44 | - |
| +L0 (法令) | 1週 | 52 | コントラスト・データ消失・同意 |
| +B (ローンチ) | +4週 | 67 | Cmd+K・AI信頼性・通知・状態完全性 |
| +E (Enterprise) | +8週 | 82 | SSO・CS・Salesforce・エグゼ・Trust |
| +G (Global) | +8週 | 90 | i18n・Public API |
| +R (磨き) | +8週 | **96+** | Presence・Camera・Achievement |

**累計 約5-6ヶ月で 44 → 96+ 到達**

---

## 7. 最重要発見

1. **営業1ロールに偏ったプロダクト** (CS 32点、Exec 18点、IT管 32点)
2. **エンタープライズ要件 (SSO/SCIM/Public Legal/SLA/監査UI) ほぼゼロ** → 数百名規模で導入決裁通らない
3. **データ消失リスク (同時編集 18点)** は CRM として致命傷、即対応必須
4. **AI機能の信頼性 (42点)** はローンチ可レベル未満、confidence/citation/regenerate は必須セット
5. **i18n (12点)** は海外拠点持つ顧客で即離脱、後付け不可なので早期決断必要
6. **a11y の cinnabar 1.44:1** は障害者差別解消法違反、1日で直せるが放置はリスク
7. **CSV bulk invite (18点)** が無いと 50人組織のテナント立ち上げで詰む
8. **Public API/OpenAPI/PAT 無し (42点)** → Zapier/Slack 連携を顧客側で作れない

---

## 8. 次の打ち手候補

- **A:** Phase L0 の4項目を file:line 完全仕様に落とす (即修正パッケージ)
- **B:** Phase B のローンチブロッカー7項目をライブラリ選定・実装パターン込みで深掘り
- **C:** Phase E の中でも SSO + Public Legal + エグゼダッシュボード だけ仕様化
- **D:** さらに別軸シミュレーション (例: 営業BPO/外注業者、経理/インボイス、IPO監査人、DR訓練、PoC評価担当)
- **E:** 上記ロードマップを4観点並列レビュー (CTO/CPO/SecLead/CFO) でツッコミ入れる

---

## 付録: シミュレーション実施記録

- 実施日: 2026-05-17
- 手法: Explore subagent による並列 read-only シミュレーション
- ペルソナ数: 20
- 平均レポート長: 約800字/体
- 失敗・再投入: ④⑤⑮ の3体 (autocompact thrashing 等で1回ずつ再投入)
- ロードマップバージョン: v3 (12観点 → 20観点 拡張版)
