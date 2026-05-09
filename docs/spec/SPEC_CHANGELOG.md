# 営業ナレッジ&商談アーカイブ・プラットフォーム 設計書 v2.2

## ファイル
- `sales_platform_design_spec.xlsx` (v1: 旧版バックアップ)
- `sales_platform_design_spec_v2.xlsx` (v2.2: **本番版**)

## 経緯
1. v1 → ユーザーから 14シーン分(名刺/アポ/返信/商談/録画/クレーム/ロープレ/マネージャー/引き継ぎ/失敗運用/コンプラ/オンボード/検索/モバイル) + 横断要件の現場ギャップ指摘
2. v2.0 ビルド: 既存14シートに追記 + 新規11シート(14_state_machines〜24_acceptance_test_matrix)
3. **Round1レビュー(3並列)**:
   - UX現場視点 → 88点 (Critical 6 / Moderate 10 / Minor 10)
   - 技術アーキ → 78点 (Critical 8 / Moderate 20 / Minor 10)
   - コンプラ運用 → 78点 (Critical 6 / Moderate 8 / Minor 6)
4. v2.1 ビルド: 全指摘 84件を 25_v2_review_resolutions にマトリクス化、新シート 26_user_offboarding_sop 追加、各既存シートに「■ Round1指摘反映」セクション追記
5. **Round2再採点(3並列)**:
   - UX → 96点 / approve (Critical 0 / 残 minor 4件 NG-1〜NG-4)
   - 技術 → 98点 / approve (Critical 0)
   - コンプラ → 94点 / approve (Critical 0)
6. v2.2 polish: Round2 minor 9件すべて反映 → 全reviewer approve + 残gap 0

## 最終構成 (27シート)

| シート | 内容 | 行数 |
|---|---|---|
| 00_index | 索引・全体方針・v2/v2.1/v2.2 増分サマリ | 65 |
| 01_user_stories | US-01〜US-111 (91件追加) | 118 |
| 02_screens | SC-01〜SC-79 (47件追加) | 86 |
| 03_data_model | 主要+追加 60+テーブル定義 | 1,000+ |
| 04_api_endpoints | AP-01〜AP-124 + 副作用APIに Idempotency 列 | 137 |
| 05_jobs_queues | pgmq ジョブ + 35件 + Round1/2追加 | 81 |
| 06_external_integrations | Google/Zoom/Anthropic/OpenAI/Pyannote/R2/Sentry等 | 54 |
| 07_llm_prompts | LP-01〜LP-41(tool_use+zod+RAG cost cap) | 52 |
| 08_security_rls | RLS + 横断ポリシー(MFA/dual approval/rate limit/CSP/argon2id等) | 119 |
| 09_implementation_plan | Phase別実装計画 | 56 |
| 10_env_vars | シークレット rolling rotation 含む | 61 |
| 11_tech_stack_libs | paradedb/HNSW/IndexedDB暗号化/gitleaks 等追加 | 65 |
| 12_cost_estimate | per-meeting/per-conversation cap 等 | 45 |
| 13_risks_decisions | RD-01〜RD-84 | 98 |
| **14_state_machines** | scheduling/recording/consent/handoff/contact lifecycle/jobs_inflight 等 | 66 |
| **15_field_ux_supplement** | 14シーン×トレーサビリティ | 98 |
| **16_compliance_legal** | + Round1反映1ページ参照表 (C-1〜C-6/M-C1〜M-C8/L-C1〜L-C6) | 41 |
| **17_offline_mobile** | IndexedDB暗号化/騒音抑制/Pin for offline 等 | 34 |
| **18_search_knowledge_quality** | paradedb/HNSWチューニング/RAG cost cap/golden set | 40 |
| **19_onboarding_initial** | guided tour/初週habit-loop/メンター | 22 |
| **20_failure_recovery** | undo/soft delete/PITR/楽観ロック/権限申請 | 21 |
| **21_a11y_i18n** | WCAG AA + handedness/reach_zone/dark_mode | 26 |
| **22_feature_flags_ab** | percentage rollout/A/B/SRM | 18 |
| **23_observability_alerts** | Anthropic tokens/sec, pgmq, audit chain SLA 等 | 45 |
| **24_acceptance_test_matrix** | AT-S1-1〜AT-X-7 + AT-RLS/DLQ/LLM-Schema/Idem/OCC/Audit/DR/Cost/SW | 89 |
| **25_v2_review_resolutions** | Round1+Round2 全93件の対応マトリクス | 88 |
| **26_user_offboarding_sop** | 退職処理 M-1〜M+60 (O-01〜O-16) | 22 |

## 反映した重要設計判断 (抜粋)

### 現場UX
- 暗所/反射/片手撮影: WASM補正+ガイド枠+blur/exposureスコア+ハプティクス+静止検出オートシャッター
- 両面名剌/QR/非名刺判別/イベント一括タグ/音声メモ
- オフラインキュー: IndexedDB(暗号化)+Service Worker+Idempotency
- CTI連動着信→自動顧客マッチング (G-1)
- 商談中検索: share_safety_filter (internal/sensitive自動除外+プレビュー必須)
- 録音中断ハンドリング: onInterrupt→部分保存→再開
- 観戦時の本人画面常時バッジ
- Soft delete 7日前/1日前リマインド

### 技術アーキ
- マルチテナント: 全テーブルに org_id NOT NULL + RLS統一
- pgvector × RLS: SECURITY DEFINER RPC + sensitivity/visibility/org_id を embedding メタデータに非正規化
- pgmq 冪等性: jobs_inflight + INSERT ON CONFLICT DO NOTHING RETURNING + state machine guard
- 検索: paradedb(BM25) + HNSW チューニング(ef_search=64/ef_construction=128 ベンチ要) + partition + ハイブリッド prefilter→rerank
- Idempotency: idempotency_keys + middleware(同key同hash→保存response再生)
- 楽観ロック: 本体テーブルに version 列 + UPDATE WHERE version=? RETURNING で CAS
- Secret rotation: _OLD/_NEW 7日窓 + service_role はworker専用 + gitleaks CI
- LLM tool_use + zod 強制 + per-conversation cost cap $0.10 / per-meeting $0.50

### コンプライアンス
- per-attendee 録画同意: pre-consent buffer purge + 途中参加 late_join_pending(5分タイムアウト) + 撤回遡及削除
- 保持期間: O-04確定(受注/失注3年/退職60日内再評価) + sensitivity tier別 TTL
- 削除依頼: 30日SLA + 15日中間通知 + 下流伝播(R2/Anthropic/OpenAI/PITR)
- 法的開示: dual approval(admin+legal) + SHA-256 + GPG署名 + manifest
- audit_logs: append-only + prev_hash chain + R2 WORM Object Lock + 7年保持 + 破断検知15分通報
- 退職処理SOP: M-1〜M+60 (O-01〜O-16) + legal hold二重承認 + delegate即失効
- DR: RPO=15min/RTO=4h, ap-northeast-3 暗号化バックアップ
- 委託先一覧: Anthropic/OpenAI/Cloudflare/Render/Supabase, 追加時30日前事前通知

## 削除可能な中間ファイル
ビルド過程で生成された下記は不要なので削除して構わない:
- `_build_v2_part1_core.py`〜`_build_v2_part5_new_sheets.py`
- `_build_v2_round2_fixes.py`, `_build_v2_round3_polish.py`
- `_read_existing.py`
- `_existing_dump.json`

## 次のアクション候補
1. **Phase 1 実装着手**: 09_implementation_plan に従い、Sprint 1-4(マルチテナント基盤+OAuth+OCR+検索の MVP)
2. **第三者pen test 手配**: P1終盤(リリース2週前)で予約しておく
3. **DPA再点検**: Anthropic/OpenAI/Cloudflare/Render/Supabase 各社の最新 DPA で『提供データを学習に利用しない』『東京/同国内処理可』を確認
4. **HNSW ベンチ**: 実データのembeddings(20万行想定)で ef_search 値を実測調整(P1ローンチ前必須)

---
作業日: 2026-04-25
レビュアー(全員 approve): UX/技術アーキ/コンプラ運用 各シニア(3並列)
