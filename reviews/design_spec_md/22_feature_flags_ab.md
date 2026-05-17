# 22_feature_flags_ab

| feature flags / A/Bテスト |  |  |  |  |
| --- | --- | --- | --- | --- |
| β機能ロールアウト/メールテンプレ効果測定 |  |  |  |  |
| 項目 | 要件 | 実装 | 管理 | Phase |
| フラグ | ON/OFF/percentage | feature_flags(percentage,allowlist,blocklist) | /admin/features | P2 |
| 割当 | stable hash | sha256(user_id+key)%100 | - | P2 |
| ロールアウト | 段階(5/25/50/100%) | admin UI | SOP | P2 |
| killswitch | 即時OFF | percentage=0 | - | P2 |
| 観測性 | フラグ別Vitals/Errors | Sentry tag | - | P2 |
| A/Bテスト | 変数+メトリック | ab_test_experiments | /admin/experiments | P3 |
| 割当(AB) | stable hash | - | - | P3 |
| コホート | セグメント条件 | - | - | P3 |
| メトリック | conversion/CTR/受注率 | ab_test_metrics | - | P3 |
| 有意差判定 | sequential testing | - | SRM check | P3 |
| 事前停止条件 | 破壊的変動 | SOP | - | P3 |
| メールテンプレAB | 2 variants | LP-30 | 個別メトリック | P3 |
| UIテンプレAB | 2 variants | - | - | P3 |
| ロールアウトログ | 変更履歴 | feature_flags audit | - | P2 |
| ■ v2.3 追加(実演シミュ反映) |  |  |  |  |
| 項目 | 要件 | 実装 | 管理 | Phase |
| NDA/RFP通知ルート FF(F-S3-5) | 添付分類後のSlack通知ON/OFF | feature_flags(notif.nda_to_legal,notif.rfp_to_deals) | /admin/features | P2 |
| new_user_until ハンドリング(F-S3-1) | 入社<3Mのconfidence高ハイライト | users.new_user_untilで判定 | SC-14 | P2 |
| Top5/Top3 注目案件(F-S8-1) | 週次ロールアウト | FF: dashboards.attention_top5 | リリース管理 | P3 |
| partial_artifacts_allowed(F-S5-2) | stage3未完で部分発行 | FF: meetings.partial_artifacts | admin | P2 |