# 04_api_endpoints

| APIエンドポイント仕様 |  |  |  |  |  |  |  |  |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Next.js Route Handlers + Worker内部エンドポイント |  |  |  |  |  |  |  |  |
| ID | Method | Path | 概要 | Request | Response | 認証 | 副作用 | Phase |
| API-01 | POST | /api/auth/callback | Google OAuth コールバック | code, state | redirect | なし | users upsert, user_oauth_tokens保存 | P1 |
| API-02 | POST | /api/oauth/scopes/refresh | OAuthスコープ追加取得 | provider, scopes[] | redirect_url | session |  | P1 |
| API-03 | POST | /api/zoom/connect | Zoom Server-to-Server OAuth設定 | - | {ok:true} | admin | organizationsに保存 | P1 |
| API-04 | POST | /api/ocr/business-card | 名刺OCR(複数枚対応) | multipart/form-data: files[] | {batch_id, items:[{image_url, extracted}]} | session | pgmq:process_business_card 投入 | P1 |
| API-05 | GET | /api/contacts | コンタクト一覧 | ?q=&owner=&status=&page= | {items:[], total} | session |  | P1 |
| API-06 | GET | /api/contacts/[id] | コンタクト詳細 | - | Contact + meetings + threads | session |  | P1 |
| API-07 | PATCH | /api/contacts/[id] | コンタクト編集 | Partial<Contact> | Contact | session(owner) | audit_logs | P1 |
| API-08 | POST | /api/contacts/duplicates/resolve | 重複マージ処理 | {duplicate_id, resolution, merge_strategy} | Contact | session |  | P1 |
| API-09 | GET | /api/availability | 空き枠取得 | ?user_ids=&duration=&range_days= | [{start, end}] | session | Google Calendar API freebusy 呼び出し | P2 |
| API-10 | POST | /api/scheduling/start | 日程調整起動 | {contact_id, attendee_user_ids, slots, template_id, custom_message} | {thread_id, draft_id} | session | email_threads作成、scheduling_proposals作成、ドラフト保存 | P2 |
| API-11 | POST | /api/email-drafts/[id]/send | ドラフト送信 | - | {message_id} | session(owner) | Gmail API送信、email_messages作成 | P2 |
| API-12 | GET | /api/scheduling/pending | パース確認待ち | - | [ProposalWithReply] | session |  | P2 |
| API-13 | POST | /api/scheduling/[id]/confirm | 日程確定 | {slot_index} or {custom_slot} | {meeting_id} | session | meetings作成、Calendar event作成、Zoom作成、確認メール送信 | P2 |
| API-14 | GET | /api/meetings | 商談一覧 | ?stage=&status=&q= | [Meeting] | session |  | P1 |
| API-15 | GET | /api/meetings/[id] | 商談詳細 | - | Meeting + attendees + recording + notes | session |  | P1 |
| API-16 | PATCH | /api/meetings/[id] | 商談編集 | Partial<Meeting> | Meeting | session | audit_logs | P1 |
| API-17 | POST | /api/meetings/[id]/notes | リアルタイムメモ追加 | {content, timestamp_seconds} | Note | session |  | P2 |
| API-18 | POST | /api/meetings/[id]/reschedule | リスケ | {new_proposal_slots} | {thread_id} | session | Calendar/Zoom更新、再提案メール送信 | P2 |
| API-19 | POST | /api/webhooks/zoom | Zoom Webhook | Zoom event payload | 200 OK | Zoom署名検証 | pgmq:process_recording 投入 | P1 |
| API-20 | GET | /api/recordings | 録画一覧 | ?q=&meeting_id=&date_range= | [Recording] | session |  | P1 |
| API-21 | GET | /api/recordings/[id] | 録画詳細 | - | Recording + clips | session | audit:view | P1 |
| API-22 | PATCH | /api/recordings/[id]/insights | AI抽出修正 | {commitments?, customer_needs?, objections?} | Recording | session | 修正後に該当embedding再生成 | P1 |
| API-23 | POST | /api/clips | クリップ生成 | {recording_id, start_seconds, end_seconds, title} | Clip | session | pgmq:generate_clip 投入 | P2 |
| API-24 | POST | /api/search | ハイブリッド検索 | {query, filters?} | {groups:{recordings:[],documents:[],contacts:[]}} | session |  | P1 |
| API-25 | POST | /api/chat | ナレッジチャット(SSE) | {messages:[]} | streaming text + sources | session | llm_usage_logs記録 | P3 |
| API-26 | POST | /api/knowledge | ナレッジ追加 | multipart: file, metadata | KnowledgeItem | session | pgmq:generate_embeddings + analyze_document投入 | P2 |
| API-27 | GET | /api/knowledge | ナレッジ一覧 | ?type=&tag=&q= | [KnowledgeItem] | session |  | P2 |
| API-28 | PATCH | /api/knowledge/[id] | 編集・タグ変更 | Partial | KnowledgeItem | session | 更新時embed再生成 | P2 |
| API-29 | POST | /api/admin/knowledge/[id]/approve | 承認 | - | {ok} | manager | visibilityをorgに昇格 | P2 |
| API-30 | GET | /api/roleplay/scenarios | シナリオ一覧 | ?difficulty=&stage= | [Scenario] | session |  | P3 |
| API-31 | POST | /api/roleplay/scenarios/generate | 自動生成 | {from_meeting_ids:[], persona_overrides?} | Scenario | session | Claude呼び出し、scenarios保存 | P3 |
| API-32 | POST | /api/roleplay/sessions | セッション開始 | {scenario_id, mode} | Session | session |  | P3 |
| API-33 | POST | /api/roleplay/sessions/[id]/turns | ユーザー発話送信 | {content} | {ai_response, conversation} | session | Claude streaming、conversation更新 | P3 |
| API-34 | POST | /api/roleplay/sessions/[id]/complete | セッション完了+評価 | - | Evaluation | session | Claude評価生成、roleplay_evaluations保存 | P3 |
| API-35 | POST | /api/roleplay/voice/stt | 音声→テキスト | audio/webm | {text} | session |  | P3 |
| API-36 | POST | /api/roleplay/voice/tts | テキスト→音声 | {text, voice_id} | audio/mp3 | session |  | P3 |
| API-37 | POST | /api/handoffs | 引き継ぎ書作成(自動充填) | {contract_id, to_user_id} | Handoff(draft) | session | Claudeが過去商談から構造化引き継ぎ書生成 | P2 |
| API-38 | PATCH | /api/handoffs/[id] | 編集 | Partial | Handoff | session |  | P2 |
| API-39 | POST | /api/handoffs/[id]/submit | 提出 | - | Handoff | session | 通知送信 | P2 |
| API-40 | POST | /api/handoffs/[id]/accept | CS側承認 | {comments?} | Handoff | session(to_user) |  | P2 |
| API-41 | POST | /api/shares | 共有リンク作成 | {resource_type, resource_id, expires_in, password?} | {token, url} | session |  | P2 |
| API-42 | GET | /api/share/[token] | 共有先閲覧 | ?password= | Resource | 不要(token) | access_count++, audit | P2 |
| API-43 | POST | /api/webhooks/gmail | Gmail Pub/Sub通知 | Pub/Sub message | 200 | JWT検証 | pgmq:parse_email_reply投入 | P2 |
| API-44 | GET | /api/admin/users | ユーザー一覧 | - | [User] | admin |  | P1 |
| API-45 | POST | /api/admin/users/invite | 招待 | {email, role} | {ok} | admin | 招待メール送信 | P1 |
| API-46 | POST | /api/admin/users/[id]/offboard | 退職処理 | {transfer_to_user_id} | {ok} | admin | is_active=false, OAuthトークン削除, 担当移管 | P1 |
| API-47 | GET | /api/admin/audit | 監査ログ | ?user_id=&action=&from=&to= | [AuditLog] | admin |  | P2 |
| API-48 | GET | /api/admin/usage | 使用量 | ?user_id=&month= | 集計 | admin |  | P3 |
| API-49 | POST | /api/admin/limits | 上限設定 | {user_id?, monthly_usd} | {ok} | admin |  | P3 |
| API-50 | GET | /api/notifications | 通知一覧 | ?unread= | [Notification] | session |  | P1 |
| API-51 | POST | /api/notifications/[id]/read | 既読化 | - | {ok} | session |  | P1 |
| ■ 追加APIエンドポイント(v2) |  |  |  |  |  |  |  |  |
| ID | メソッド | パス | 概要 | リクエスト | レスポンス | 認証 | エラー | Phase |
| AP-50 | POST | /api/ocr/business-card | 片手/暗所最適化OCR | multipart(image, side=front|back, event_id?, voice_memo?) | {contact_draft, confidence, classification(card|pamphlet|memo|qr_only)} | Auth | 413(>10MB)/422(low_conf) | P1 |
| AP-51 | POST | /api/ocr/qr | 裏面QR(vCard)読取 | {image_id} | {vcard_fields} | Auth | 422 | P1 |
| AP-52 | POST | /api/contact-memos | 音声/手書きメモ添付 | {contact_id, kind=voice|text, payload} | {memo_id} | Auth | - | P1 |
| AP-53 | POST | /api/offline-queue | オフラインキュー登録 | {client_id, payload, idempotency_key} | {queued: true} | Auth | - | P1 |
| AP-54 | GET | /api/offline-queue | キュー一覧 | - | {items} | Auth | - | P1 |
| AP-55 | GET | /api/contacts/quick-search | 会場即時検索(オフライン優先) | ?q=, ?event_id= | {matches[]} | Auth | - | P1 |
| AP-56 | POST | /api/events | イベント作成 | {name, started_at, ended_at} | {event_id} | Auth | - | P2 |
| AP-57 | POST | /api/internal-invites | 社内同席依頼 | {meeting_id, invitee_id, deadline} | {invite_id} | Auth | - | P2 |
| AP-58 | POST | /api/internal-invites/[id]/accept | 受諾 | - | {ok} | Auth | 403 | P2 |
| AP-59 | POST | /api/internal-invites/[id]/decline | 辞退 | {reason?} | {ok} | Auth | 403 | P2 |
| AP-60 | GET | /api/availability | 空き枠抽出(改修) | ?attendees=&duration=&tz=&exclude_holds=&room= | {slots[]} | Auth | 422 | P2 |
| AP-61 | PUT | /api/availability-settings | 業務時間更新 | {work_hours, lunch, days_off} | {ok} | Auth | - | P2 |
| AP-62 | POST | /api/calendar-holds | 仮押さえ | {slots[]} | {hold_ids} | Auth | - | P2 |
| AP-63 | DELETE | /api/calendar-holds/[id] | 解放 | - | {ok} | Auth | - | P2 |
| AP-64 | POST | /api/scheduling/parse | 返信パース(改修) | {message_id} | {intent, slots, cc_added, attachments_routed} | Auth | - | P2 |
| AP-65 | POST | /api/scheduling/redraft | 全NG時の再ドラフト | {thread_id} | {draft_id} | Auth | - | P2 |
| AP-66 | POST | /api/scheduling/[id]/reschedule | リスケ起動 | {reason} | {draft_id} | Auth | - | P2 |
| AP-67 | GET | /api/meetings/[id]/brief | 商談前ブリーフィング | - | {brief} | Auth | - | P2 |
| AP-68 | POST | /api/recordings/[id]/clip | クリップ作成 | {start_sec, end_sec, redact_pii?} | {clip_id, share_token} | Auth | 422 | P2 |
| AP-69 | POST | /api/recordings/[id]/segments/[seg]/sensitivity | sensitive化 | {level: public|internal|sensitive} | {ok} | Auth | - | P2 |
| AP-70 | POST | /api/recordings/[id]/reprocess | 抽出やり直し | {model?} | {job_id} | Auth | - | P2 |
| AP-71 | POST | /api/meetings/[id]/external-summary | 顧客向け要約生成 | {exclude_internal_notes?: true} | {summary, pdf_url} | Auth | - | P2 |
| AP-72 | GET | /api/support/quick-search | クレーム30秒検索 | ?customer_id=&q= | {utterances_top3, context_window} | Auth | - | P2 |
| AP-73 | POST | /api/complaints | クレーム登録/紐付け | {customer_id, recording_segment_id, summary} | {complaint_id} | Auth | - | P3 |
| AP-74 | POST | /api/roleplay/scenarios/from-recording | 録画→シナリオ | {recording_id} | {scenario_id} | Auth | - | P3 |
| AP-75 | WS | /api/roleplay/observe | 観戦WebSocket | - | stream | Auth(manager) | - | P3 |
| AP-76 | GET | /api/dashboard/diagnostics | 受注率診断 | - | {factors, narrative} | Auth(manager) | - | P3 |
| AP-77 | GET | /api/dashboard/losses | 失注分析 | - | {matrix} | Auth(manager) | - | P3 |
| AP-78 | POST | /api/handoffs/[id]/alignment-report | 認識ズレ報告 | {recording_segment_id, note} | {report_id} | Auth | - | P2 |
| AP-79 | GET | /api/handoffs/[id]/preview | 引き継ぎ予習 | - | {handoff, highlight_clips} | Auth | - | P2 |
| AP-80 | POST | /api/email-drafts/[id]/send | 送信(undo付き) | {undo_window_seconds=30} | {message_id, undo_token, expires_at} | Auth | - | P2 |
| AP-81 | POST | /api/email-drafts/[id]/undo | 送信取消 | {undo_token} | {ok} | Auth | 410(expired) | P2 |
| AP-82 | POST | /api/admin/trash/[id]/restore | Soft delete復旧 | - | {ok} | Auth(admin) | - | P2 |
| AP-83 | POST | /api/admin/rollback | PITRロールバック | {point_in_time, scope} | {job_id} | Auth(admin)+MFA | - | P3 |
| AP-84 | POST | /api/permission-requests | 権限申請 | {resource, action} | {request_id} | Auth | - | P2 |
| AP-85 | POST | /api/conflicts/[id]/resolve | 編集衝突解決 | {merge_strategy, version} | {ok} | Auth | 409 | P2 |
| AP-86 | POST | /api/meetings/[id]/consent-capture | 録画同意ログ | {consent: true|false, captured_at} | {ok} | Auth | - | P2 |
| AP-87 | POST | /api/share/[token]/deletion-request | 削除依頼受付 | {kind, target_id, requester_email} | {ticket_id} | - | - | P2 |
| AP-88 | GET | /api/admin/legal/export | 法的開示エクスポート | ?period=&customer= | {export_url} | Auth(admin)+MFA | - | P3 |
| AP-89 | POST | /api/admin/policy | 退職者発言ポリシー設定 | {policy} | {ok} | Auth(admin) | - | P3 |
| AP-90 | POST | /api/contacts/import/legacy | 既存名刺移行 | multipart(file, type=csv|sansan|eight) | {job_id} | Auth | - | P2 |
| AP-91 | POST | /api/recordings/import | 録画移行 | {provider=zoom, period} | {job_id} | Auth | - | P3 |
| AP-92 | GET | /api/onboarding/recommendations | 新人推奨 | - | {items[]} | Auth | - | P3 |
| AP-93 | GET | /api/dashboard/recent-views | 最近見たもの | - | {items[]} | Auth | - | P1 |
| AP-94 | GET | /api/search | 検索改修 | ?q=&speaker_filter=&from=&to=&exclude_deprecated=true | {results, ranking_explain} | Auth | - | P1 |
| AP-95 | POST | /api/chat | ナレッジチャット(出典必須) | {question} | stream{tokens, sources_required: true} | Auth | - | P3 |
| AP-96 | GET | /api/exports/personal | 個人データエクスポート | - | {export_url} | Auth | - | P3 |
| AP-97 | GET | /api/admin/backup | バックアップ状態 | - | {last_pitr, range, snapshots} | Auth(admin) | - | P2 |
| AP-98 | POST | /api/voice-memos | 音声メモ→商談紐付け | multipart(audio, meeting_id?) | {transcript, memo_id} | Auth | - | P2 |
| AP-99 | GET | /api/help | FAQ | ?q= | {articles[]} | Auth | - | P2 |
| AP-100 | POST | /api/admin/feature-flags | FF更新 | {flag, percentage, allowlist} | {ok} | Auth(admin) | - | P2 |
| AP-101 | POST | /api/admin/experiments | A/Bテスト作成 | {name, variants, metric} | {exp_id} | Auth(admin) | - | P3 |
| AP-102 | POST | /api/push/subscribe | Web Pushサブスク | {endpoint, keys} | {ok} | Auth | - | P2 |
| AP-103 | POST | /api/realtime/presence | プレゼンス更新 | {resource_id} | {ok} | Auth | - | P2 |
| AP-104 | GET | /api/i18n/[locale] | 翻訳辞書 | - | {messages} | - | - | P3 |
| ■ Round1指摘反映で追加API(v2.1) |  |  |  |  |  |  |  |  |
| ID | メソッド | パス | 概要 | リクエスト | レスポンス | 認証 | エラー | Phase |
| AP-105 | POST | /api/cti/incoming | CTI着信受信(G-1) | {caller_phone} | {contact_id?,company_id?,recent_meetings,top_complaints} | Auth(CTI gateway shared secret) | - | P3 |
| AP-106 | POST | /api/meetings/[id]/consent/per-attendee | 参加者個別同意(C-1,G-2) | {attendee_id, consent, captured_via} | {ok,segments_to_redact[]} | Auth | - | P2 |
| AP-107 | POST | /api/meetings/[id]/share-safe-clip | 内部メモ除外で共有(G-3) | {start,end,exclude_internal=true,exclude_sensitive=true} | {share_token,preview_url} | Auth | - | P2 |
| AP-108 | POST | /api/voice-memos/[id]/resume | 録音中断後再開(G-4) | {partial_chunks[]} | {memo_id,combined_url} | Auth | - | P2 |
| AP-109 | WS | /api/roleplay/observe (改修) | 観戦時observer_joined/left発火 | - | stream(events) | Auth(manager)+本人合意 | - | P3 |
| AP-110 | POST | /api/admin/trash/reminders | Soft delete期限通知発送(G-6) | - | {count_sent} | Auth(admin) | - | P2 |
| AP-111 | POST | /api/admin/legal/export(改修) | チェーンオブカストディ(C-4) | {period,scope,warrant_type,requesting_authority,dual_approver_id} | {manifest_url,gpg_signature_url} | Auth(admin+legal+MFA) | - | P3 |
| AP-112 | POST | /api/exports/personal/[user]/offboarding | 退職時データ可搬性(C-6) | - | {export_url} | Auth(admin)+self | - | P3 |
| AP-113 | POST | /api/admin/audit/verify-chain | audit_logs ハッシュチェーン検証(C-5) | {period} | {ok,broken_links?} | Auth(admin) | - | P2 |
| AP-114 | GET | /api/admin/dr/restore-points | DRポイント一覧(M-C4) | - | {points[]} | Auth(admin) | - | P2 |
| AP-115 | GET | /api/admin/policies/consent | 利用規約版数(M-C5) | - | {current,history} | Auth(admin) | - | P2 |
| AP-116 | POST | /api/admin/policies/consent/[v]/revoke-impact | 撤回時影響範囲(M-C5) | {user_id} | {ai_processing_stop,embeddings_to_remove} | Auth(admin) | - | P2 |
| AP-117 | POST | /api/admin/llm-killswitch | LLMコストkill switch(M-C6) | {disabled:true,reason} | {ok} | Auth(admin)+MFA | - | P2 |
| AP-118 | POST | /api/internal/jobs-inflight/acquire | pgmq冪等性ガード(T-3) | {queue,idempotency_key,ttl_sec} | {acquired:bool} | Auth(service) | - | P1 |
| AP-119 | POST | /api/admin/users/offboarding | 退職処理起動(C-6) | {user_id,target_owner,policy} | {ticket_id} | Auth(admin) | - | P2 |
| AP-120 | GET | /api/admin/users/offboarding/[id] | 退職処理進捗 | - | {checklist_state} | Auth(admin) | - | P2 |
| ■ Round2指摘反映追加・改修(v2.2) |  |  |  |  |  |  |  |  |
| ID | メソッド | パス | 概要 | リクエスト | レスポンス | 認証 | エラー | Phase |
| AP-22(改) | PATCH | /api/recordings/[id]/insights | AI抽出のインライン編集 | {commitments?, needs?, objections?, next_actions?} | {ok, embedding_status: 'pending'|'fresh', impacted_chunks: int, version: int} | Auth | 409(楽観ロック) | P2 |
| AP-121 | GET | /api/settings/handedness | 左右利き設定取得(NG-1) | - | {handedness:'left'|'right'} | Auth | - | P3 |
| AP-122 | PUT | /api/settings/handedness | 設定保存 | {handedness} | {ok} | Auth | - | P3 |
| AP-123 | POST | /api/onboarding/pwa-installed | PWAインストール記録(NG-2) | {platform:'ios'|'android'|'desktop'} | {ok} | Auth | - | P2 |
| AP-124 | GET | /api/admin/audit/verify-chain/range | 期間指定のhash chain検証(NG-4補足) | ?from=&to= | {ok, broken_links:[{row_id,prev_hash,actual_hash}]} | Auth(admin) | - | P2 |
| ■ v2.3 追加・改修API(実演シミュ反映) |  |  |  |  |  |  |  |  |
| ID | メソッド | パス | 概要 | リクエスト | レスポンス | 認証 | エラー | Phase |
| AP-50(改) | POST | /api/ocr/business-card | 低信頼度時はdeferred_review返却(F-S1-2) | multipart(image,...) | {contact_draft, confidence, classification, status: 'ok'|'deferred_review'} | Auth | - | P1 |
| AP-57(改) | POST | /api/internal-invites | 発火点=proposal送信時のみ(F-S2-5)+deadline_override対応(F-S2-1) | {meeting_id, invitee_id, deadline?, deadline_override?:true} | {invite_id, deadline_at} | Auth | - | P2 |
| AP-60(改) | GET | /api/availability | work_hours未設定attendee警告含む(F-S2-3) | ?attendees=&duration=&tz=&exclude_holds=&room= | {slots[], warnings:[{attendee_id, missing_work_hours:true}]} | Auth | - | P2 |
| AP-62(改) | POST | /api/calendar-holds | transparency='transparent'+hold_visibility指定(F-S2-2) | {slots[], hold_visibility?:'owner_only'|'attendees_dimmed'|'attendees_visible'} | {hold_ids} | Auth | - | P2 |
| AP-64(改) | POST | /api/scheduling/parse | suggested_action必須(F-S3-2)+counter_propose intent(F-S2-4) | {message_id} | {intent, slots, cc_added, attachments_routed, suggested_action: 'reply_with_phone_template'|'convert_to_visit_meeting'|'mark_unrelated'|'escalate_to_manager'|'counter_propose_from_share_token'} | Auth | - | P2 |
| AP-67(改) | GET | /api/meetings/[id]/brief | 縮退版/完全版の段階提供(F-S4-4) | - | {brief: {version: 'degraded'|'full', generated_at, content}} | Auth | - | P2 |
| AP-72(改) | GET | /api/support/quick-search | customer_id必須高速パス(F-S6-1)+前30s/ヒット/後15sスニペット(F-S6-3) | ?customer_id=&q=&speaker_filter= | {utterances_top3: [{...,context_pre_30s, hit, context_post_15s}], former_employee_utterance_count} | Auth | - | P2 |
| AP-95(改) | POST | /api/chat | SSE event:progress(F-S7-1)+citations完全形(F-S13-1) | {question} | SSE: token / source(meeting_id+segment_id+t_start_ms+t_end_ms) / progress(eta_sec, stage) / done / error | Auth | - | P3 |
| AP-94(改) | GET | /api/search | exclude_deprecated default=true(F-S13-2)+speaker_status pending含む(F-S13-4) | ?q=&speaker_filter=&from=&to=&exclude_deprecated=true | {results:[{...,speaker_status:'confirmed'|'pending'}], ranking_explain, did_you_mean[]} | Auth | - | P1 |
| AP-96(改) | GET | /api/exports/personal | 対象種別+パスフレーズ二経路(F-UX-3) | ?include_recordings_audio=&include_recordings_video=&include_voice_memos=&passphrase_channel='sms'|'alt_email'&alt_email=&alt_phone= | {job_id} | Auth | - | P3 |
| AP-107(改) | POST | /api/meetings/[id]/share-safe-clip | 拒否時deny_reason付与(F-S6-4)+audience selector(F-S5-3) | {start,end,audience: 'internal'|'customer'|'legal'|'external_partner', exclude_internal=true, exclude_sensitive=true} | {share_token, preview_url} | {error, deny_reason: 'sensitive_segment'|'pii_detected'|'former_employee_speech', approval_request_url} | Auth | - | P2 |
| AP-125 | POST | /api/admin/audit-evidence/generate | 監査エビデンスパック自動生成(F-S10-2) | {period:'YYYY-MM'} | {pdf_url, sha256, gpg_signature_url, contents_summary} | Auth(admin)+MFA | - | P2 |
| AP-126 | GET | /api/admin/external-usage-export | 外部委託送信ログ(F-S10-5) | ?org_id=&period=&vendor= | {export_url} | Auth(admin+legal dual) | - | P3 |
| AP-127 | GET | /api/admin/cost-actuals | コスト実績(F-S10-4) | ?scope=user|team|feature&period= | {actuals[], top_over_cap[]} | Auth(admin) | - | P2 |
| AP-128 | POST | /api/admin/anomalies/[id]/acknowledge | 行動異常本人確認(F-S8-4) | {by_user:true} | {ok} | Auth | - | P3 |
| AP-129 | POST | /api/dr/restore-request | PITR管理者セルフサービス(F-S10-1) | {point_in_time, scope, reason} | {request_id, dual_approval_required:true} | Auth(admin) | - | P3 |
| AP-130 | POST | /api/dr/restore-request/[id]/approve | PITR承認 | {approver_id} | {ok, eta_sec} | Auth(admin/legal)+MFA | - | P3 |
| AP-131 | GET | /api/contacts/unreviewed-count | 未レビュー名刺件数(F-S1-2) | - | {count, oldest_at} | Auth | - | P1 |
| AP-132 | POST | /api/voice-memos/[id]/segments | 録音中断/再開セグメント追加(F-S14-2) | {segment_index, audio_chunk_id} | {combined:true|false} | Auth | - | P2 |
| AP-133 | POST | /api/notifications/dispatch | 重複抑制ロジック適用(F-UX-4) | {event_id, user_id, kind, payload} | {dispatched_channels[], suppressed_channels[]} | Auth(service) | - | P2 |
| AP-134 | GET | /api/admin/handoffs/sla-breaches | handoff SLA違反一覧(F-S9-1) | - | {breaches:[{handoff_id, owner, hours_overdue}]} | Auth(manager) | - | P2 |
| AP-135 | POST | /api/admin/handoffs/[id]/escalate | 上長cc/強制割当(F-S9-1) | {action:'cc_supervisor'|'force_assign', target_user_id?} | {ok} | Auth(manager) | - | P2 |
| AP-136 | POST | /api/transcript-anchors | 録画箇所×資料/コミット紐付け(F-S9-4) | {recording_segment_id, artifact_kind, artifact_id} | {anchor_id} | Auth | - | P2 |
| AP-137 | GET | /api/recordings/[id]/derived-status | 派生成果物のstaleness(F-S5-1) | - | {summary_v, handoff_v, embeddings_v, regen_pending_kinds[], last_edit_at} | Auth | - | P2 |
| AP-138 | POST | /api/onboarding/sample-mode | 新人パス『見るだけ』モード(F-S12-3) | {step5_view_only:true} | {ok} | Auth | - | P3 |
| AP-139 | POST | /api/admin/import-templates/test | インポート前のmappingテスト(F-S12-2) | {file_id, dedupe_keys[]} | {preview, dupes_found, errors[]} | Auth | - | P2 |
| AP-140 | POST | /api/admin/audit-chain-incidents/[id]/close | チェーン破断クローズ(F-S10-3) | {rca_url, dual_approver_id} | {ok} | Auth(admin)+dual approval | - | P2 |
| ■ v2.4 追加API(再シミュ残課題) |  |  |  |  |  |  |  |  |
| ID | メソッド | パス | 概要 | リクエスト | レスポンス | 認証 | エラー | Phase |
| AP-64(改v2.4) | POST | /api/scheduling/parse | required_followup_fields返却(NF-S3-1) | {message_id} | {intent, slots, suggested_action, required_followup_fields:['address','phone','company']} | Auth | - | P2 |
| AP-129(改v2.4) | POST | /api/dr/restore-request | RTO/RPO/eta返却(NF-S10-1) | {point_in_time,scope,reason} | {request_id, dual_approval_required:true, rto_min, rpo_min, queue_eta_min} | Auth(admin) | - | P3 |
| AP-139(改v2.4) | POST | /api/voice-memos/[id]/translate | オンザフライ翻訳(NF-UX-1) | {target_locale, translator?:'anthropic'|'deepl'} | {translation_id, text, quality_disclaimer} | Auth or shared token | - | P3 |
| AP-141 | POST | /api/admin/deletion-requests/[id]/legal-hold-override | 3者承認(F-S11-3再) | {role:'legal'|'it'|'representative', approver_id, reason} | {ok, chain_status} | Auth+role-specific MFA | - | P2 |
| AP-142 | POST | /api/admin/import-dlq/[id]/retry | DLQ再実行(F-S14-4再) | - | {job_id} | Auth(admin) | - | P3 |
| AP-143 | POST | /api/users/away-mark | 手動awayトグル(NF-S2-1) | {from,until,reason?} | {ok} | Auth | - | P2 |
| AP-144 | POST | /api/admin/contract-taxonomy | taxonomy追加申請(NF-S9-1) | {term_kind,description} | {taxonomy_id,status:'proposed'} | Auth | - | P3 |
| AP-145 | POST | /api/admin/contract-taxonomy/[id]/approve | taxonomy承認 | {role:'legal'|'admin'} | {ok,status} | Auth(role)+MFA | - | P3 |
| AP-146 | POST | /api/roleplay/consent | コーチ共有同意(F-S7-4再) | {coach_share,scope} | {ok} | Auth | - | P3 |
| AP-147 | GET | /api/contacts/from-cc-prompt | 未登録CCのcontact化prompt fields(NF-S3-1) | ?meeting_attendee_id= | {required_fields[]} | Auth | - | P2 |
| ■ v2.5 追加・改修(R3 minor) |  |  |  |  |  |  |  |  |
| ID | メソッド | パス | 概要 | リクエスト | レスポンス | 認証 | エラー | Phase |
| AP-139(改v2.5) | POST | /api/voice-memos/[id]/translate | 人手翻訳エスカレ対応(NF3-UX-2) | {target_locale, translator?} | {translation_id, text, quality_disclaimer, can_request_human:true, sla_business_days:5} | Auth or shared token | - | P3 |
| AP-141(改v2.5) | POST | /api/admin/deletion-requests/[id]/legal-hold-override | 代理人KYC追加(NF3-S11-1) | {role, approver_id, reason, representative_identity_verification_method?, power_of_attorney_doc_url?, representative_id_doc_url?} | {ok, chain_status} | Auth+role-specific MFA | - | P2 |
| AP-146(改v2.5) | POST | /api/roleplay/consent | downgrade時のaffected_clip_count返却(NF3-S7-1) | {coach_share, scope} | {ok, downgrade_effects:{affected_clip_count, reencode_job_ids:[]}} | Auth | - | P3 |
| AP-148 | POST | /api/recordings/[id]/regen-now | debounce手動上書き(NF3-S5-1) | {kind:'summary'|'handoff'|'embeddings', force:true} | {job_id, debounce_remaining_sec} | Auth | - | P2 |
| AP-149 | POST | /api/voice-memos/[id]/translate-human | 人手翻訳依頼(NF3-UX-2) | {target_locale} | {request_id, eta_at} | Auth | - | P3 |
| AP-150 | GET | /api/admin/import-dlq | DLQ一覧(NF3-S14-1) | - | {items[]} | Auth(admin) | - | P3 |
| AP-151 | GET | /api/dashboard/manager/review-backlog | マネージャー退避バックログ(NF3-S8-1) | - | {by_subordinate:[{user_id,pending,oldest_days}]} | Auth(manager) | - | P3 |
| AP-152 | POST | /api/admin/contract-taxonomy/[id]/migrate | archive版から代替版へmigration(NF3-S9-1) | {replaced_by_id} | {job_id, affected_contract_count} | Auth(admin) | - | P3 |