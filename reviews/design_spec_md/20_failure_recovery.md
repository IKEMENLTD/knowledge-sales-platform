# 20_failure_recovery

| 失敗・例外運用 |  |  |  |  |
| --- | --- | --- | --- | --- |
| Undo/Soft delete/Rollback/権限申請/競合解決 |  |  |  |  |
| 分類 | 要件 | 実装 | UI | Phase |
| メール送信 | 30秒undo | email_undo_tokens+q_email_undo_finalize | 送信後30秒バナー | P2 |
| メール訂正 | 訂正テンプレ | template_id=correction | 別テンプレ提示 | P2 |
| コンタクト誤削除 | 30日復旧 | soft delete+/admin/trash | Restoreボタン | P2 |
| AI抽出全体やり直し | モデル選択+差分 | AP-70 | Reprocess+Diff View | P2 |
| 同期失敗 | 可視化 | sync_failure_log+badge | 右上badge+リトライ | P1 |
| 権限不足 | 申請動線 | permission_requests | SC-70 申請ボタン | P2 |
| モバイル断線 | autosave | autosave_drafts(5秒) | 復元バナー | P1 |
| 管理者大量削除 | reason+MFA+PITR | dangerous_action_audits | 確認ダイアログ | P2 |
| 2デバイス衝突 | 楽観ロック+merge | optimistic_lock_versions | Diffマージ | P2 |
| 録画失敗 | retry+admin通知 | recordings.failed | admin Slackアラート | P1 |
| Webhook失敗 | DLQ | retry exp 5+admin | ダッシュボード | P1 |
| Long job失敗 | 部分復元 | stage毎チェックポイント | Resumeボタン | P2 |
| 署名URL失効 | 再発行 | /share/regenerate | リンク再生成 | P2 |
| メール失敗 | Postfixキュー | Gmail送信失敗→3回retry | 通知 | P2 |
| LLM API障害 | fallback model | Sonnet→Haiku | 通知 | P1 |
| embedding失敗 | retry+marker | stage再実行 | - | P1 |
| 削除依頼期限 | 30日SLA超過防止 | admin reminder | ダッシュボード | P2 |
| ■ v2.3 追加(実演シミュ反映) |  |  |  |  |
| 分類 | 要件 | 実装 | UI | Phase |
| 録画ライブ停止(F-S4-5) | Zoom recording.pausedを即時警告 | webhook→Push+SMS+ライブインジケータ | BriefCard右上 | P1 |
| meeting_brief縮退(F-S4-4) | 完全版失敗時に縮退表示 | q_meeting_brief_degraded即時+full失敗フォールバック | BriefCardにmode badge | P2 |
| live-search別ウィンドウ(F-S4-1) | Zoom画面共有との両立 | window.open popup | ドラッグ&ドロップ共有 | P2 |
| インライン編集の整合(F-S5-1) | 派生成果物pending時disable | derived_artifacts_status | 発行ボタン+理由表示 | P2 |
| voice_memo中断(F-S14-2) | 部分保存→再開 | onInterrupt segments[] | UI再開prompt+波形中断点 | P2 |
| legacy_import resume(F-S12-2) | ブラウザ閉じても再開 | staged_state(field_mapping/cursor) | SC-62 Resume button | P2 |
| audit chain破断クローズ(F-S10-3) | incident管理 | dual approval+RCA | SC-77改修+SC-80 | P2 |
| DR restore セルフサービス(F-S10-1) | admin UI | SC-78+AP-129/130 | Approval queue | P3 |