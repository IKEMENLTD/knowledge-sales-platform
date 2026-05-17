# 23_observability_alerts

| 観測性・アラート |  |  |  |  |  |
| --- | --- | --- | --- | --- | --- |
| ログ/メトリクス/トレース/アラート |  |  |  |  |  |
| 分類 | 要件 | 実装 | しきい値 | 通知先 | Phase |
| エラー | Sentry | フロント+バック | エラー率>1%/5min | Slack #alerts | P1 |
| パフォーマンス | Web Vitals | RUM | p75 LCP>2.5s | Slack | P2 |
| API レイテンシ | p95<500ms | APM | p95>1000ms 5min | Slack | P1 |
| LLM料金 | 日次 | llm_usage_logs | 予算120% | Slack | P2 |
| queueバックログ | pgmq | - | >1000 30min | Slack | P1 |
| DLQ | 失敗 | - | >10件 1h | Slack/PD | P1 |
| 録画処理SLA | stage1<=5min | - | 違反率>5% | Slack | P1 |
| ハルシネーション率 | 引用なし回答 | q_hallucination_audit | >5%/週 | Slack | P3 |
| 削除依頼SLA | 30日 | data_deletion_requests | 残3日 | Slack/Email | P2 |
| 契約更新 | 3ヶ月前 | contract_renewals | - | Slack/Push | P2 |
| sync失敗 | ユーザ別 | sync_failure_log | >5/h | UI badge+Slack | P1 |
| バックアップ | PITR健全 | backup_status | 失敗 1回 | Slack/PD | P2 |
| セキュリティ | 異常ログイン | auth audits | 新IP+admin | メール | P1 |
| MFA違反 | 破壊操作の試行 | - | 1件 | Slack/PD | P2 |
| 署名URL大量発行 | 異常 | share_links | 30/min | Slack | P2 |
| A/Bテスト SRM | 割当偏り | - | p<0.001 | Slack | P3 |
| FFロールアウト | エラー率上昇 | - | FF別+30% | Slack | P2 |
| 業務時間外送信 | 異常 | - | 23-7時送信 | 本人通知 | P2 |
| ■ Round1指摘反映で追加観測(v2.1) |  |  |  |  |  |
| 分類 | 要件 | 実装 | しきい値 | 通知先 | Phase |
| LLM rate(T-6) | Anthropic tokens/sec rate | Prometheus exporter | p99>5000tps 1min | Slack | P1 |
| LLM cost(T-6,M-C6) | 日/時 ¥/h | Prometheus | 予算150% hard stop | Slack+kill switch | P1 |
| pgmq visibility(T-6) | 重複実行カウンタ | 内部メトリクス | 重複>0/h | Slack | P1 |
| Realtime conn(T-6) | 100conn上限 | Supabase metrics | >80conn | Slack | P2 |
| pgbouncer(T-6) | pool枯渇 | metrics | wait>1s | Slack | P1 |
| pgvector memory(T-6) | HNSW | metrics | mem>1.5GB | Slack | P1 |
| Zoom quota(T-6) | 録画DL 80req/sec | 内部counter | quota 80% | Slack | P1 |
| Google quota(T-6) | Calendar 100/100s | 内部counter | quota 80% | Slack | P1 |
| audit chain(C-5) | hash chain破断 | q_audit_chain_verify | 破断1件 | Slack/PD | P2 |
| DR(M-C4) | ap-northeast-3 bk健全 | metrics | 失敗1回 | Slack/PD | P2 |
| Soft delete期限 | 残3日 | metrics | 発生時 | Push+Email | P2 |
| 削除依頼SLA | 残3日 | metrics | 発生時 | Slack/Email | P2 |
| ハルシネーション(M-15) | golden set 95%CI 0-3% | 週次job | 逸脱 | Slack | P3 |
| 搬入BR | 退職SOPのblocker | metrics | M-Day残作業>0 | Slack | P2 |
| A/B SRM(US-111) | 割当偏り | scheduled | p<0.001 | Slack | P3 |
| FF rollout error率(M-C6) | FF別エラー率 | Sentry tag | FF別+30% | Slack | P2 |
| CSPレポート(L-C2) | report-uri受信 | Sentry | 急増 | Slack | P2 |
| Idempotency conflict(T-5) | 409多発 | metrics | >10/min | Slack | P1 |
| ■ Round2指摘反映追加(v2.2) |  |  |  |  |  |
| 分類 | 要件 | 実装 | しきい値 | 通知先 | Phase |
| audit chain SLA | 破断検知→通報 | q_audit_chain_verify | 破断検知から15分以内 | Slack/PD+admin email | P2 |
| audit chain修復SLA | 検知→修復着手 | - | 60分以内 | Slack/PD | P2 |
| ■ v2.3 追加(実演シミュ反映) |  |  |  |  |  |
| 分類 | 要件 | 実装 | しきい値 | 通知先 | Phase |
| 録画停止検知(F-S4-5) | webhook recording.paused | Zoom webhook → Push+SMS | 検知から30秒以内 | 本人+admin | P1 |
| handoff SLA 48h/72h(F-S9-1) | 違反検出 | q_handoff_sla_check | 48h: 本人+上長cc / 72h: 強制割当 | Slack | P2 |
| behavioral anomaly(F-S8-4) | 本人+上長通知 | q_behavioral_anomaly | -2σ以上 | Push(本人) +Slack(上長) | P3 |
| audit chain incident SLA(F-S10-3) | 検知15分以内通報 | Slack/PD | 破断1件 | Slack/PD+admin email | P2 |
| コスト top over cap(F-S10-4) | Top3 over cap自動Slack | q_cost_actuals_aggregate | cap 100%超のTop3 | Slack | P2 |
| DR restore audit | 承認/実行ログ | dangerous_action_audits | - | admin email | P3 |
| meeting_brief degraded率 | 縮退版で完了の割合 | metrics | 週次>20%でinvestigate | Slack | P2 |
| partial_artifacts利用率 | stage3未完で部分発行率 | metrics | - | ダッシュ | P2 |
| sync success backlog(F-S14-3) | 古いオフラインキューをmonitor | metrics | 24h超過件数>0 | 本人+admin | P2 |
| notification dedup効率(F-UX-4) | 抑制率 | metrics | 抑制率<10%なら設定見直し | 週次レポート | P2 |
| ■ v2.4 追加(再シミュ残課題) |  |  |  |  |  |
| 分類 | 要件 | 実装 | しきい値 | 通知先 | Phase |
| pre_consent buffer ロック比率(NF-S4-1) | verbal時のロック発動率監視 | metrics | verbal比率>10%でinvestigate | Slack/legal | P2 |
| taxonomy承認SLA(NF-S9-1) | 法務→情シス承認待機 | metrics | 各48h超過でリマインド | Slack | P3 |
| AI予測信頼区間(NF-S8-1) | 低信頼ケース監視 | metrics | <0.6 hit率>30%で再学習 | Slack | P3 |
| 翻訳ボリューム(NF-UX-1) | コスト管理 | metrics | 月次cap | Slack | P3 |
| DLQ件数(F-S14-4再) | Zoom historical DLQ | metrics | 累計>10件で手動レビュー | Slack | P3 |
| recording_pause本人vsadmin(NF-S4-2) | SMS送信先分岐確認 | metrics | 誤分岐検知 | Slack | P1 |
| ■ v2.5 追加(R3 minor) |  |  |  |  |  |
| 分類 | 要件 | 実装 | しきい値 | 通知先 | Phase |
| review_backlog_per_manager(NF3-S8-1) | 信頼区間<0.4退避の累積 | q_review_backlog_aggregate | 部下平均>3件 or 最古>14日 | 週次Slack | P3 |
| 人手翻訳SLA(NF3-UX-2) | 5営業日 | q_voice_memo_translate_human | 残2日 | Slack/担当者 | P3 |
| DLQ件数 監視(改v2.5) | SC-126で可視化 | - | 累計>10件で手動レビュー | Slack+SC-126バッジ | P3 |
| away heuristic 多言語誤検出(NF3-S2-1) | 誤検出率 | metrics | >5%で再学習 | Slack | P2 |