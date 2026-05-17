# 19_onboarding_initial

| オンボーディング・初期運用 |  |  |  |  |
| --- | --- | --- | --- | --- |
| 初日体験/移行/学習リスト |  |  |  |  |
| 項目 | 内容 | 目的 | 完了条件 | Phase |
| Step1: ようこそ | 初回ログイン+ロール選択 | 個別最適 | ロール保存 | P1 |
| Step2: OAuth | Google/Zoom連携 | データ取得 | スコープ取得 | P1 |
| Step3: タイムゾーン/業務時間 | work_hours設定 | アポ取り精度 | 保存 | P1 |
| Step4: サンプルデータ | モックcontact/meeting/recording | 空状態を回避 | Skip可 | P1 |
| Step5: ガイドツアー | 名刺撮影/検索/ロープレ7ステップ | 操作習得 | 完了 or Skip | P1 |
| Step6: 通知設定 | Push/Email/Slack | 抜け漏れ防止 | 保存 | P1 |
| Step7: 移行(任意) | CSV/Sansan/Eight名刺+Zoom過去録画 | 蓄積活用 | Skip可 | P2 |
| 新人パス | 推奨ナレッジ7本+ロープレ3本 | 早期戦力化 | 完了率60% | P3 |
| マネージャーパス | ダッシュボード使い方+承認フロー | 運用統制 | 完了率80% | P3 |
| 管理者パス | セキュリティ/Backup/feature flags | 運用安全 | 完了率100% | P2 |
| 再オンボーディング | 半年に1度のリマインド | 新機能学習 | - | P3 |
| 既存組織移行 | データインポート→検索可+検索精度確認 | 乗換成功 | インポート完了+検索ヒット率>=70% | P2 |
| ■ Round1指摘反映追加(v2.1) |  |  |  |  |
| 項目 | 内容 | 目的 | 完了条件 | Phase |
| 初週habit-loop(G-13) | 初週KPI(連絡先5件/録画1件/検索3回) | 定着 | push+CSM/上司alert | P3 |
| メンターアサイン(G-23) | 新人にメンター(先輩)+1on1連動 | 早期戦力化 | onboarding_recommendations.mentor_user_id | P3 |
| 利用規約同意(M-C5) | 版数+撤回scope | コンプラ | consent_logs | P1 |
| ■ v2.3 追加(実演シミュ反映) |  |  |  |  |
| 項目 | 内容 | 目的 | 完了条件 | Phase |
| 新人パス『見るだけ』Step5(F-S12-3) | 録音/ロープレを見学のみ | プレッシャー軽減 | Skipなしで完了可能 | P3 |
| sample_data_seeds 音声仕様(F-S12-3) | 合成音声+dummy_company付与 | 本人音声不要 | sample_data_seedsに meta:{voice:'synthetic',dummy:true} | P1 |
| consent_blanket Step6(F-S4-3) | 社内会議の包括同意ON/OFF | 社内ユーザの会議体験軽減 | 保存+撤回可能性ガイド | P2 |
| observation_consent_level Step7(F-S8-2) | 常時/事前通知/個別承認 | 心理的安全性 | 保存 | P3 |
| Step6改修 ロール別通知初期(F-S12-4) | role_default_notification_presetsから自動充填 | 新人デフォルトは静か | 保存 | P3 |
| O-11前倒し(F-S12-1) | M-Day 16:00にexport完了→16:30 OAuth revoke | 退職データ可搬性確保 | チェックリスト達成 | P2 |