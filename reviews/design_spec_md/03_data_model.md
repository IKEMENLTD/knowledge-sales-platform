# 03_data_model

| DBスキーマ |  |  |  |
| --- | --- | --- | --- |
| Supabase Postgres / Drizzle ORM 想定 |  |  |  |
| ■ テーブル一覧 |  |  |  |
| テーブル名 | 概要 | Phase |  |
| users | ユーザー(Supabase Auth と紐付け) | P1 |  |
| user_oauth_tokens | OAuthトークン(Supabase Vaultで暗号化) | P1 |  |
| companies | 顧客企業 | P1 |  |
| contacts | コンタクト(名刺由来含む) | P1 |  |
| contact_duplicates | 重複検知の保留キュー | P1 |  |
| meetings | 商談(中心テーブル) | P1 |  |
| meeting_attendees | 商談同席者(社内/社外) | P1 |  |
| meeting_notes | リアルタイムメモ | P2 |  |
| recordings | 録画+文字起こし+AI抽出 | P1 |  |
| recording_clips | 部分切り出しクリップ | P2 |  |
| email_threads | メールスレッド | P2 |  |
| email_messages | 個別メールメッセージ | P2 |  |
| email_templates | メールテンプレート | P2 |  |
| scheduling_proposals | 日程候補と返信パース状態 | P2 |  |
| contracts | 契約 | P2 |  |
| handoffs | 引き継ぎ書 | P2 |  |
| knowledge_items | ナレッジアイテム(資料/FAQ等) | P2 |  |
| knowledge_embeddings | ベクトル検索インデックス | P1 |  |
| roleplay_scenarios | ロープレシナリオ | P3 |  |
| roleplay_sessions | ロープレ実施記録 | P3 |  |
| roleplay_evaluations | ロープレ評価詳細 | P3 |  |
| share_links | 期限付き共有リンク | P2 |  |
| audit_logs | 監査ログ | P2 |  |
| notifications | 通知 | P1 |  |
| llm_usage_logs | LLM API使用量ログ | P2 |  |
| usage_limits | ユーザー/組織別上限設定 | P3 |  |
| feature_flags | 機能フラグ | P2 |  |
| ■ テーブル詳細(主要22テーブル) |  |  |  |
| ▼ users |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PRIMARY KEY | Supabase auth.users.id と一致 | 必須 |
| email | text NOT NULL UNIQUE | 会社メール | 必須 |
| name | text NOT NULL | 表示名 | 必須 |
| role | text CHECK (role IN ('sales','cs','manager','admin')) | 権限 | 必須 |
| avatar_url | text | アバター画像URL | 任意 |
| timezone | text DEFAULT 'Asia/Tokyo' | タイムゾーン | 任意 |
| zoom_user_id | text | Zoom側ユーザーID | 任意 |
| is_active | boolean DEFAULT true | 退職フラグ | 必須 |
| created_at | timestamptz DEFAULT now() | 作成日時 | 必須 |
| updated_at | timestamptz DEFAULT now() | 更新日時 | 必須 |
| ▼ user_oauth_tokens |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PRIMARY KEY DEFAULT gen_random_uuid() |  | 必須 |
| user_id | uuid REFERENCES users(id) ON DELETE CASCADE | 所有者 | 必須 |
| provider | text CHECK (provider IN ('google','zoom')) |  | 必須 |
| refresh_token_secret_id | uuid | Supabase Vault のシークレットID | 必須 |
| access_token_secret_id | uuid | 同上 | 必須 |
| expires_at | timestamptz | アクセストークン期限 | 必須 |
| scopes | text[] | 取得済スコープ | 必須 |
| created_at | timestamptz DEFAULT now() |  | 必須 |
| UNIQUE | (user_id, provider) |  |  |
| ▼ companies |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PRIMARY KEY DEFAULT gen_random_uuid() |  | 必須 |
| name | text NOT NULL | 会社名 | 必須 |
| domain | text | メールドメインで会社を集約 | 任意 |
| industry | text | 業種 | 任意 |
| size | text CHECK (size IN ('small','medium','large')) | 従業員規模 | 任意 |
| notes | text | メモ | 任意 |
| created_at | timestamptz DEFAULT now() |  | 必須 |
| updated_at | timestamptz DEFAULT now() |  | 必須 |
| INDEX | companies_domain_idx (domain) |  |  |
| ▼ contacts |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PRIMARY KEY DEFAULT gen_random_uuid() |  | 必須 |
| company_id | uuid REFERENCES companies(id) |  | 任意 |
| owner_user_id | uuid REFERENCES users(id) NOT NULL | 担当営業 | 必須 |
| name | text NOT NULL | 氏名 | 必須 |
| name_kana | text | フリガナ(OCR時に推定) | 任意 |
| title | text | 役職 | 任意 |
| email | text | メールアドレス | 任意 |
| phone | text | 電話番号 | 任意 |
| business_card_image_url | text | 名刺画像 (Supabase Storage) | 任意 |
| ocr_raw_json | jsonb | Vision API生レスポンス | 任意 |
| ocr_confidence | numeric(3,2) | 0.00-1.00 | 任意 |
| status | text CHECK (status IN ('new','contacted','scheduled','met','in_progress','closed_won','closed_lost','archived')) DEFAULT 'new' |  | 必須 |
| source | text DEFAULT 'business_card' | 流入経路 | 任意 |
| linkedin_url | text |  | 任意 |
| tags | text[] |  | 任意 |
| created_at | timestamptz DEFAULT now() |  | 必須 |
| updated_at | timestamptz DEFAULT now() |  | 必須 |
| INDEX | contacts_email_idx (email), contacts_owner_idx (owner_user_id) |  |  |
| ▼ contact_duplicates |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PRIMARY KEY DEFAULT gen_random_uuid() |  | 必須 |
| new_contact_id | uuid REFERENCES contacts(id) | 新規取込側 | 必須 |
| existing_contact_id | uuid REFERENCES contacts(id) | 既存 | 必須 |
| match_score | numeric(3,2) | 突合スコア | 必須 |
| match_fields | jsonb | 一致したフィールド配列 | 必須 |
| resolution | text CHECK (resolution IN ('pending','merged','kept_separate')) |  | 必須 |
| resolved_by | uuid REFERENCES users(id) |  | 任意 |
| created_at | timestamptz DEFAULT now() |  | 必須 |
| ▼ meetings |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PRIMARY KEY DEFAULT gen_random_uuid() |  | 必須 |
| contact_id | uuid REFERENCES contacts(id) NOT NULL | 主担当顧客 | 必須 |
| owner_user_id | uuid REFERENCES users(id) NOT NULL | 主担当営業 | 必須 |
| title | text NOT NULL | 商談タイトル | 必須 |
| scheduled_at | timestamptz | 開始日時 | 任意 |
| duration_minutes | integer DEFAULT 60 | 所要時間 | 必須 |
| status | text CHECK (status IN ('scheduling','scheduled','completed','cancelled','no_show')) |  | 必須 |
| stage | text CHECK (stage IN ('first','second','demo','proposal','negotiation','closing','kickoff','cs_regular','cs_issue')) |  | 任意 |
| google_calendar_event_id | text | Calendar連携ID | 任意 |
| zoom_meeting_id | text UNIQUE | Zoom Meeting ID | 任意 |
| zoom_join_url | text |  | 任意 |
| zoom_password | text |  | 任意 |
| manual_notes | text | 手書きメモ(議事録) | 任意 |
| deal_status | text CHECK (deal_status IN ('open','won','lost','on_hold')) | 商談ステータス | 任意 |
| deal_amount | integer | 受注額(円) | 任意 |
| deal_close_date | date | 受注/失注日 | 任意 |
| lost_reason | text | 失注理由 | 任意 |
| contract_id | uuid REFERENCES contracts(id) | 受注時の契約 | 任意 |
| created_at | timestamptz DEFAULT now() |  | 必須 |
| updated_at | timestamptz DEFAULT now() |  | 必須 |
| INDEX | meetings_scheduled_idx, meetings_contact_idx, meetings_zoom_idx |  |  |
| ▼ meeting_attendees |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PRIMARY KEY DEFAULT gen_random_uuid() |  | 必須 |
| meeting_id | uuid REFERENCES meetings(id) ON DELETE CASCADE NOT NULL |  | 必須 |
| attendee_type | text CHECK (attendee_type IN ('internal_user','external_contact')) |  | 必須 |
| user_id | uuid REFERENCES users(id) | 社内同席者 | 任意 |
| contact_id | uuid REFERENCES contacts(id) | 社外同席者 | 任意 |
| role | text CHECK (role IN ('owner','co_owner','observer')) |  | 必須 |
| speaker_label | text | 文字起こしの話者ラベル(speaker_1等と紐付け) | 任意 |
| CHECK | ((attendee_type = internal_user AND user_id IS NOT NULL) OR (attendee_type = external_contact AND contact_id IS NOT NULL)) |  |  |
| ▼ meeting_notes |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PRIMARY KEY DEFAULT gen_random_uuid() |  | 必須 |
| meeting_id | uuid REFERENCES meetings(id) ON DELETE CASCADE NOT NULL |  | 必須 |
| user_id | uuid REFERENCES users(id) NOT NULL |  | 必須 |
| timestamp_seconds | integer | 商談開始からの秒 | 任意 |
| content | text NOT NULL |  | 必須 |
| created_at | timestamptz DEFAULT now() |  | 必須 |
| ▼ recordings |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PRIMARY KEY DEFAULT gen_random_uuid() |  | 必須 |
| meeting_id | uuid REFERENCES meetings(id) NOT NULL UNIQUE |  | 必須 |
| zoom_recording_id | text UNIQUE | Zoom側ID(冪等性) | 任意 |
| video_storage_url | text | R2 のURL | 任意 |
| video_storage_key | text | R2 のオブジェクトキー | 任意 |
| video_duration_seconds | integer |  | 任意 |
| video_size_bytes | bigint |  | 任意 |
| transcript_full | text | 全文 | 任意 |
| transcript_segments | jsonb | [{speaker, start, end, text}] | 任意 |
| transcript_source | text CHECK (transcript_source IN ('zoom','whisper')) |  | 任意 |
| summary | text | AI要約 | 任意 |
| key_points | jsonb | 主要ポイント配列 | 任意 |
| customer_needs | jsonb | ニーズ抽出 | 任意 |
| objections | jsonb | 反論抽出 | 任意 |
| next_actions | jsonb | 次アクション | 任意 |
| commitments | jsonb | 約束事(言った言わない対策) | 任意 |
| sentiment_timeline | jsonb | 時間軸感情推移 | 任意 |
| processing_status | text CHECK (processing_status IN ('pending','downloading','transcribing','analyzing','embedding','completed','failed')) DEFAULT 'pending' |  | 必須 |
| processing_error | text | エラー詳細 | 任意 |
| processed_at | timestamptz |  | 任意 |
| created_at | timestamptz DEFAULT now() |  | 必須 |
| INDEX | recordings_status_idx, recordings_meeting_idx |  |  |
| ▼ recording_clips |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PRIMARY KEY DEFAULT gen_random_uuid() |  | 必須 |
| recording_id | uuid REFERENCES recordings(id) NOT NULL |  | 必須 |
| start_seconds | integer NOT NULL |  | 必須 |
| end_seconds | integer NOT NULL |  | 必須 |
| title | text |  | 任意 |
| clip_storage_url | text | R2 切り出し動画URL | 任意 |
| created_by | uuid REFERENCES users(id) NOT NULL |  | 必須 |
| created_at | timestamptz DEFAULT now() |  | 必須 |
| ▼ email_threads |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PRIMARY KEY DEFAULT gen_random_uuid() |  | 必須 |
| contact_id | uuid REFERENCES contacts(id) |  | 任意 |
| meeting_id | uuid REFERENCES meetings(id) |  | 任意 |
| owner_user_id | uuid REFERENCES users(id) NOT NULL |  | 必須 |
| gmail_thread_id | text NOT NULL | Gmail側ID | 必須 |
| subject | text |  | 任意 |
| purpose | text CHECK (purpose IN ('scheduling','follow_up','kickoff','general')) |  | 必須 |
| scheduling_state | jsonb | 日程調整の状態(後述) | 任意 |
| last_message_at | timestamptz |  | 任意 |
| is_active | boolean DEFAULT true |  | 必須 |
| created_at | timestamptz DEFAULT now() |  | 必須 |
| UNIQUE | (owner_user_id, gmail_thread_id) |  |  |
| ▼ email_messages |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PRIMARY KEY DEFAULT gen_random_uuid() |  | 必須 |
| thread_id | uuid REFERENCES email_threads(id) ON DELETE CASCADE NOT NULL |  | 必須 |
| gmail_message_id | text NOT NULL UNIQUE |  | 必須 |
| direction | text CHECK (direction IN ('inbound','outbound')) |  | 必須 |
| from_address | text NOT NULL |  | 必須 |
| to_addresses | text[] |  | 必須 |
| cc_addresses | text[] |  | 任意 |
| subject | text |  | 任意 |
| body_text | text |  | 任意 |
| body_html | text |  | 任意 |
| received_at | timestamptz |  | 必須 |
| parsed_intent | jsonb | パース結果(日程提案/承諾/拒否等) | 任意 |
| parse_confidence | numeric(3,2) |  | 任意 |
| ▼ email_templates |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PRIMARY KEY DEFAULT gen_random_uuid() |  | 必須 |
| owner_user_id | uuid REFERENCES users(id) | NULLは組織共通 | 任意 |
| name | text NOT NULL |  | 必須 |
| purpose | text NOT NULL | 日程調整初回/2回目/お礼等 | 必須 |
| subject_template | text NOT NULL | {{name}}等のプレースホルダ可 | 必須 |
| body_template | text NOT NULL |  | 必須 |
| variables | jsonb | 使えるプレースホルダ定義 | 任意 |
| created_at | timestamptz DEFAULT now() |  | 必須 |
| ▼ scheduling_proposals |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PRIMARY KEY DEFAULT gen_random_uuid() |  | 必須 |
| thread_id | uuid REFERENCES email_threads(id) NOT NULL |  | 必須 |
| proposed_slots | jsonb NOT NULL | [{start_at, end_at}] | 必須 |
| selected_slot | jsonb | 顧客が選んだ枠 | 任意 |
| parse_status | text CHECK (parse_status IN ('awaiting_reply','parsed','needs_review','expired','cancelled')) |  | 必須 |
| needs_review_reason | text | 人手確認が必要な理由 | 任意 |
| created_at | timestamptz DEFAULT now() |  | 必須 |
| ▼ contracts |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PRIMARY KEY DEFAULT gen_random_uuid() |  | 必須 |
| company_id | uuid REFERENCES companies(id) NOT NULL |  | 必須 |
| contract_number | text | 契約番号 | 任意 |
| product | text |  | 任意 |
| amount | integer |  | 任意 |
| start_date | date |  | 任意 |
| end_date | date |  | 任意 |
| document_url | text | 契約書PDF | 任意 |
| cs_owner_user_id | uuid REFERENCES users(id) | CS担当 | 任意 |
| sales_owner_user_id | uuid REFERENCES users(id) | 営業担当(履歴用) | 任意 |
| created_at | timestamptz DEFAULT now() |  | 必須 |
| ▼ handoffs |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PRIMARY KEY DEFAULT gen_random_uuid() |  | 必須 |
| contract_id | uuid REFERENCES contracts(id) NOT NULL |  | 必須 |
| from_user_id | uuid REFERENCES users(id) NOT NULL | 営業 | 必須 |
| to_user_id | uuid REFERENCES users(id) NOT NULL | CS | 必須 |
| content | jsonb NOT NULL | 構造化引き継ぎ書(後述スキーマ) | 必須 |
| status | text CHECK (status IN ('draft','submitted','accepted','revised')) |  | 必須 |
| reviewed_at | timestamptz |  | 任意 |
| comments | jsonb | やり取り | 任意 |
| created_at | timestamptz DEFAULT now() |  | 必須 |
| ▼ knowledge_items |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PRIMARY KEY DEFAULT gen_random_uuid() |  | 必須 |
| type | text CHECK (type IN ('document','image','slide','faq','playbook','meeting_transcript')) |  | 必須 |
| title | text NOT NULL |  | 必須 |
| content | text | 本文 | 任意 |
| file_url | text |  | 任意 |
| file_mime_type | text |  | 任意 |
| ai_description | text | 画像/資料のAI説明 | 任意 |
| ai_tags | jsonb | AI生成タグ | 任意 |
| manual_tags | text[] | 手動タグ | 任意 |
| source_meeting_id | uuid REFERENCES meetings(id) |  | 任意 |
| source_recording_id | uuid REFERENCES recordings(id) |  | 任意 |
| visibility | text CHECK (visibility IN ('private','team','org')) DEFAULT 'org' |  | 必須 |
| approval_status | text CHECK (approval_status IN ('draft','approved','rejected')) DEFAULT 'draft' |  | 必須 |
| uploaded_by_user_id | uuid REFERENCES users(id) NOT NULL |  | 必須 |
| created_at | timestamptz DEFAULT now() |  | 必須 |
| ▼ knowledge_embeddings |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PRIMARY KEY DEFAULT gen_random_uuid() |  | 必須 |
| source_type | text CHECK (source_type IN ('knowledge_item','recording_segment','meeting_notes','email','handoff')) |  | 必須 |
| source_id | uuid NOT NULL | 多態的参照 | 必須 |
| chunk_text | text NOT NULL |  | 必須 |
| chunk_index | integer DEFAULT 0 |  | 必須 |
| embedding | vector(1536) NOT NULL | OpenAI text-embedding-3-small | 必須 |
| metadata | jsonb | {meeting_stage, industry, speaker, ...} フィルタ用 | 任意 |
| created_at | timestamptz DEFAULT now() |  | 必須 |
| INDEX | embeddings_source_idx, HNSW(embedding) |  |  |
| ▼ roleplay_scenarios |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PRIMARY KEY DEFAULT gen_random_uuid() |  | 必須 |
| title | text NOT NULL |  | 必須 |
| description | text |  | 任意 |
| persona | jsonb NOT NULL | {industry, role, personality, pain_points, objections} | 必須 |
| opening_message | text | AIの最初の発話 | 任意 |
| generated_from_meeting_ids | uuid[] | 元商談 | 任意 |
| difficulty | text CHECK (difficulty IN ('easy','medium','hard')) |  | 任意 |
| stage | text | first/objection/closing等 | 任意 |
| evaluation_criteria | jsonb | 採点項目とウェイト | 必須 |
| is_published | boolean DEFAULT false |  | 必須 |
| created_by_user_id | uuid REFERENCES users(id) |  | 必須 |
| created_at | timestamptz DEFAULT now() |  | 必須 |
| ▼ roleplay_sessions |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PRIMARY KEY DEFAULT gen_random_uuid() |  | 必須 |
| scenario_id | uuid REFERENCES roleplay_scenarios(id) NOT NULL |  | 必須 |
| user_id | uuid REFERENCES users(id) NOT NULL |  | 必須 |
| mode | text CHECK (mode IN ('chat','voice')) DEFAULT 'chat' |  | 必須 |
| conversation | jsonb NOT NULL DEFAULT '[]'::jsonb | [{role, content, ts}] | 必須 |
| duration_seconds | integer |  | 任意 |
| is_completed | boolean DEFAULT false |  | 必須 |
| completed_at | timestamptz |  | 任意 |
| shared_with_team | boolean DEFAULT false | 任意公開 | 必須 |
| created_at | timestamptz DEFAULT now() |  | 必須 |
| ▼ roleplay_evaluations |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PRIMARY KEY DEFAULT gen_random_uuid() |  | 必須 |
| session_id | uuid REFERENCES roleplay_sessions(id) NOT NULL |  | 必須 |
| overall_score | integer | 0-100 | 必須 |
| rubric_scores | jsonb NOT NULL | {ヒアリング:80,提案:60,...} | 必須 |
| strengths | text[] |  | 任意 |
| improvements | text[] |  | 任意 |
| coach_comment | text | マネージャーコメント | 任意 |
| coach_user_id | uuid REFERENCES users(id) |  | 任意 |
| created_at | timestamptz DEFAULT now() |  | 必須 |
| ▼ share_links |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PRIMARY KEY DEFAULT gen_random_uuid() |  | 必須 |
| token | text NOT NULL UNIQUE | URL-safe random | 必須 |
| resource_type | text CHECK (resource_type IN ('recording_clip','meeting_summary','knowledge_item')) |  | 必須 |
| resource_id | uuid NOT NULL |  | 必須 |
| expires_at | timestamptz NOT NULL |  | 必須 |
| password_hash | text | パスワード保護(任意) | 任意 |
| access_count | integer DEFAULT 0 |  | 必須 |
| created_by | uuid REFERENCES users(id) NOT NULL |  | 必須 |
| created_at | timestamptz DEFAULT now() |  | 必須 |
| ▼ audit_logs |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PRIMARY KEY DEFAULT gen_random_uuid() |  | 必須 |
| user_id | uuid REFERENCES users(id) | NULLはシステム | 任意 |
| action | text NOT NULL | 'view','create','update','delete','share','export' | 必須 |
| resource_type | text NOT NULL |  | 必須 |
| resource_id | uuid |  | 任意 |
| metadata | jsonb | 差分やパラメタ | 任意 |
| ip_address | inet |  | 任意 |
| user_agent | text |  | 任意 |
| created_at | timestamptz DEFAULT now() |  | 必須 |
| INDEX | audit_user_idx, audit_resource_idx, audit_created_idx (created_at DESC) |  |  |
| ▼ notifications |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PRIMARY KEY DEFAULT gen_random_uuid() |  | 必須 |
| user_id | uuid REFERENCES users(id) NOT NULL |  | 必須 |
| type | text NOT NULL | 'recording_ready','reply_received','handoff_pending',... | 必須 |
| title | text NOT NULL |  | 必須 |
| body | text |  | 任意 |
| link_url | text |  | 任意 |
| is_read | boolean DEFAULT false |  | 必須 |
| created_at | timestamptz DEFAULT now() |  | 必須 |
| ▼ llm_usage_logs |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PRIMARY KEY DEFAULT gen_random_uuid() |  | 必須 |
| user_id | uuid REFERENCES users(id) |  | 任意 |
| provider | text NOT NULL | 'anthropic','openai' | 必須 |
| model | text NOT NULL |  | 必須 |
| purpose | text NOT NULL | 'recording_summary','roleplay','search','ocr_post' | 必須 |
| input_tokens | integer |  | 必須 |
| output_tokens | integer |  | 必須 |
| cost_usd | numeric(10,6) |  | 必須 |
| latency_ms | integer |  | 任意 |
| created_at | timestamptz DEFAULT now() |  | 必須 |
| ■ JSONB フィールドのスキーマ補足 |  |  |  |
| フィールド | スキーマ例 |  |  |
| recordings.transcript_segments | [{"speaker":"speaker_1","start":12.3,"end":18.7,"text":"...","speaker_label":"営業 田中"}] |  |  |
| recordings.commitments | [{"text":"月末までに見積書送付","speaker":"営業","timestamp":1245,"category":"deliverable"}] |  |  |
| recordings.customer_needs | [{"need":"既存システムとの連携","priority":"high","evidence_segment_idx":12}] |  |  |
| recordings.objections | [{"objection":"価格が高い","response":"ROI説明で納得","resolved":true,"timestamp":1800}] |  |  |
| email_threads.scheduling_state | {"current_step":"awaiting_customer_reply","proposal_id":"...","attempts":1,"last_action_at":"..."} |  |  |
| email_messages.parsed_intent | {"type":"accept_slot","slot_index":2,"confidence":0.92,"alternative_request":null} |  |  |
| roleplay_scenarios.persona | {"industry":"製造業","role":"情報システム部長","personality":"慎重・データ重視","pain_points":["既存システム老朽化"],"objections":["価格","導入コスト"],"speaking_style":"フォーマル"} |  |  |
| roleplay_scenarios.evaluation_criteria | {"rubric":[{"name":"ヒアリング","weight":0.3,"description":"顧客課題を引き出せたか"},{"name":"提案","weight":0.3},{"name":"反論対応","weight":0.2},{"name":"クロージング","weight":0.2}]} |  |  |
| handoffs.content | {"customer_overview":"...","decision_makers":[],"key_pain_points":[],"agreed_scope":[],"commitments":[],"risks":[],"next_steps":[]} |  |  |
| email_templates.variables | {"available":["{{contact_name}}","{{company_name}}","{{slots}}","{{my_name}}"]} |  |  |
| ■ 追加テーブル(現場UX補完 v2) |  |  |  |
| テーブル名 | 概要 | Phase |  |
| business_card_images | 名刺画像(表裏) | P1 |  |
| contact_memos | コンタクトメモ(音声/手書き) | P1 |  |
| events | 名刺取得イベント(交流会等) | P2 |  |
| contact_event_tags | コンタクト×イベントタグ | P2 |  |
| offline_queue | オフラインキュー | P1 |  |
| non_card_attachments | 非名刺添付物 | P1 |  |
| user_availability_settings | 業務時間/休日設定 | P2 |  |
| meeting_rooms | 会議室マスタ | P2 |  |
| room_reservations | 会議室予約 | P2 |  |
| calendar_holds | 仮押さえ | P2 |  |
| customer_timezones | 顧客TZキャッシュ | P2 |  |
| internal_attendee_invites | 社内同席依頼 | P2 |  |
| delegate_grants | 代理権限 | P3 |  |
| meeting_duplicates | 重複アプローチ警告 | P2 |  |
| email_intents | 返信意図分類結果 | P2 |  |
| email_attachments | 返信添付物 | P2 |  |
| thread_merge_log | スレッドマージログ | P2 |  |
| meeting_briefs | 商談前ブリーフィング | P2 |  |
| recording_stages | 段階的処理状態 | P1 |  |
| recording_segments | セグメント単位の発話/感度 | P1 |  |
| pii_redactions | PIIマスキングログ | P2 |  |
| external_summaries | 顧客向け要約 | P2 |  |
| complaints | クレーム | P3 |  |
| complaint_meeting_links | クレーム×商談紐付け | P3 |  |
| lessons_learned | 教訓 | P3 |  |
| roleplay_scenario_variants | シナリオバリエーション | P3 |  |
| roleplay_failure_patterns | 失敗パターン集計 | P3 |  |
| top_performer_phrases | トップ営業表現 | P3 |  |
| product_positioning_phrases | 製品説明テンプレ | P3 |  |
| loss_analyses | 失注分析 | P3 |  |
| alignment_reports | 認識ズレ報告 | P2 |  |
| contract_renewals | 契約更新スケジュール | P2 |  |
| upsell_signals | アップセル機会 | P3 |  |
| email_undo_tokens | メール送信undoトークン | P2 |  |
| sync_failure_log | 同期失敗ログ | P1 |  |
| permission_requests | 権限申請 | P2 |  |
| autosave_drafts | 自動保存ドラフト | P1 |  |
| dangerous_action_audits | 破壊的操作監査 | P2 |  |
| meeting_consent_captures | 録画同意ログ | P2 |  |
| data_deletion_requests | データ削除依頼 | P2 |  |
| ex_employee_speech_policies | 退職者発言ポリシー | P3 |  |
| legal_disclosure_requests | 法的開示請求 | P3 |  |
| data_residency_config | データ保管地域 | P1 |  |
| sample_data_seeds | サンプルデータシード | P1 |  |
| legacy_import_jobs | レガシーインポートjob | P2 |  |
| zoom_historical_imports | Zoom過去取り込みjob | P3 |  |
| onboarding_recommendations | 新人向け推奨 | P3 |  |
| recent_views | 最近見たもの | P1 |  |
| search_ranking_logs | 検索ランキング説明用 | P2 |  |
| knowledge_deprecations | ナレッジ撤回管理 | P2 |  |
| chat_citations | チャット引用必須 | P3 |  |
| push_subscriptions | Web Push購読 | P2 |  |
| voice_memos | 音声メモ | P2 |  |
| service_worker_cache_manifest | SWキャッシュ仕様 | P2 |  |
| data_exports | 個人データエクスポート | P3 |  |
| backup_status | バックアップ状態 | P2 |  |
| state_machine_definitions | 状態機械定義(参照用) | P2 |  |
| i18n_messages | 翻訳辞書 | P3 |  |
| accessibility_audits | a11y監査 | P3 |  |
| help_articles | ヘルプ記事 | P2 |  |
| feature_flags | 機能フラグ | P2 |  |
| ab_test_experiments | A/Bテスト | P3 |  |
| ab_test_assignments | A/Bテスト割当 | P3 |  |
| ab_test_metrics | A/Bテスト計測 | P3 |  |
| browser_notification_log | ブラウザ通知ログ | P2 |  |
| realtime_presence | リアルタイムプレゼンス | P2 |  |
| optimistic_lock_versions | 楽観ロック衝突 | P2 |  |
| ▼ business_card_images |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PK |  |  |
| contact_id | uuid REFERENCES contacts(id) ON DELETE CASCADE |  |  |
| side | text CHECK (side IN ('front','back')) | 表/裏 | 必須 |
| storage_url | text | R2 URL | 必須 |
| ocr_confidence | numeric(3,2) | 0-1 | 任意 |
| classification | text | ML分類(card|pamphlet|memo|qr_only|other) | 必須 |
| captured_lat | numeric(9,6) | 撮影緯度 | 任意 |
| captured_lng | numeric(9,6) | 撮影経度 | 任意 |
| captured_at | timestamptz DEFAULT now() |  |  |
| light_quality | text | 暗所/反射判定(ok|low_light|reflection|tilt) | 任意 |
| created_by | uuid REFERENCES users(id) |  |  |
| ▼ contact_memos |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PK |  |  |
| contact_id | uuid REFERENCES contacts(id) ON DELETE CASCADE |  |  |
| kind | text CHECK (kind IN ('voice','text')) |  |  |
| content | text | 音声はWhisper結果、textはそのまま | 必須 |
| audio_storage_url | text | 音声原本(R2) | 任意 |
| created_by | uuid REFERENCES users(id) |  |  |
| created_at | timestamptz DEFAULT now() |  |  |
| ▼ events |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PK |  |  |
| org_id | uuid |  |  |
| name | text NOT NULL | 「2026/4 Tech交流会」 | 必須 |
| started_at | timestamptz |  |  |
| ended_at | timestamptz |  |  |
| location | text |  |  |
| created_by | uuid REFERENCES users(id) |  |  |
| ▼ contact_event_tags |  |  |  |
| カラム | 型 | 説明 | 必須 |
| contact_id | uuid REFERENCES contacts(id) ON DELETE CASCADE |  |  |
| event_id | uuid REFERENCES events(id) ON DELETE CASCADE |  |  |
| PRIMARY KEY | (contact_id, event_id) |  |  |
| ▼ offline_queue |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PK |  |  |
| user_id | uuid REFERENCES users(id) ON DELETE CASCADE |  |  |
| client_id | text | Idempotency用 | 必須 |
| payload | jsonb |  |  |
| status | text CHECK (status IN ('queued','syncing','done','failed')) |  |  |
| error_message | text |  |  |
| queued_at | timestamptz DEFAULT now() |  |  |
| synced_at | timestamptz |  |  |
| UNIQUE | (user_id, client_id) | Idempotency | 必須 |
| ▼ non_card_attachments |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PK |  |  |
| uploader_id | uuid REFERENCES users(id) |  |  |
| storage_url | text |  |  |
| classification | text | pamphlet|memo|other | 必須 |
| linked_meeting_id | uuid |  |  |
| created_at | timestamptz DEFAULT now() |  |  |
| ▼ user_availability_settings |  |  |  |
| カラム | 型 | 説明 | 必須 |
| user_id | uuid PK REFERENCES users(id) |  |  |
| work_hours | jsonb | [{dow:1, start:'09:00', end:'18:00'}, ...] | 必須 |
| lunch_hours | jsonb | [{dow:1-5, start:'12:00', end:'13:00'}] | 任意 |
| days_off | jsonb | ['2026-04-29', ...] | 任意 |
| allow_after_hours | boolean DEFAULT false |  |  |
| timezone | text DEFAULT 'Asia/Tokyo' |  |  |
| ▼ meeting_rooms |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PK |  |  |
| org_id | uuid |  |  |
| name | text | 「会議室A」 | 必須 |
| google_resource_email | text | Workspace resource | 任意 |
| capacity | int |  |  |
| floor | text |  |  |
| ▼ room_reservations |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PK |  |  |
| meeting_id | uuid REFERENCES meetings(id) ON DELETE CASCADE |  |  |
| room_id | uuid REFERENCES meeting_rooms(id) |  |  |
| start_at | timestamptz |  |  |
| end_at | timestamptz |  |  |
| status | text | booked|cancelled | 必須 |
| ▼ calendar_holds |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PK |  |  |
| user_id | uuid REFERENCES users(id) ON DELETE CASCADE |  |  |
| scheduling_proposal_id | uuid |  |  |
| slot_start | timestamptz |  |  |
| slot_end | timestamptz |  |  |
| google_event_id | text |  |  |
| status | text CHECK (status IN ('held','released','confirmed')) |  |  |
| expires_at | timestamptz |  |  |
| created_at | timestamptz DEFAULT now() |  |  |
| ▼ customer_timezones |  |  |  |
| カラム | 型 | 説明 | 必須 |
| contact_id | uuid PK REFERENCES contacts(id) ON DELETE CASCADE |  |  |
| timezone | text | IANA | 必須 |
| source | text | auto|manual | 必須 |
| confidence | numeric(3,2) |  |  |
| updated_at | timestamptz DEFAULT now() |  |  |
| ▼ internal_attendee_invites |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PK |  |  |
| meeting_id | uuid REFERENCES meetings(id) ON DELETE CASCADE |  |  |
| invitee_id | uuid REFERENCES users(id) |  |  |
| inviter_id | uuid REFERENCES users(id) |  |  |
| status | text CHECK (status IN ('invited','accepted','declined','timed_out')) |  |  |
| deadline_at | timestamptz | 2時間後デフォルト | 必須 |
| responded_at | timestamptz |  |  |
| reason | text | decline時 | 任意 |
| ▼ delegate_grants |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PK |  |  |
| grantor_id | uuid REFERENCES users(id) | 本人 | 必須 |
| delegate_id | uuid REFERENCES users(id) | 代理人 | 必須 |
| scope | text[] | ['email_send'] | 必須 |
| valid_from | timestamptz |  |  |
| valid_to | timestamptz |  |  |
| audit | boolean DEFAULT true |  |  |
| ▼ meeting_duplicates |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PK |  |  |
| customer_company_id | uuid |  |  |
| existing_meeting_id | uuid |  |  |
| new_attempt_user_id | uuid |  |  |
| detected_at | timestamptz DEFAULT now() |  |  |
| resolution | text | ignored|merged|cancelled |  |
| ▼ email_intents |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PK |  |  |
| email_message_id | uuid REFERENCES email_messages(id) ON DELETE CASCADE |  |  |
| intent | text | accept|decline|all_no_propose|phone|onsite|reschedule|cc_add|other | 必須 |
| confidence | numeric(3,2) |  |  |
| raw_classifier_output | jsonb |  |  |
| ▼ email_attachments |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PK |  |  |
| email_message_id | uuid REFERENCES email_messages(id) ON DELETE CASCADE |  |  |
| filename | text |  |  |
| content_type | text |  |  |
| storage_url | text |  |  |
| category | text | NDA|requirements|RFP|quote|other | 必須 |
| meeting_id | uuid | auto-link | 任意 |
| ▼ meeting_briefs |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PK |  |  |
| meeting_id | uuid REFERENCES meetings(id) ON DELETE CASCADE UNIQUE |  |  |
| prior_summary | text | 前回要約 | 任意 |
| needs | text |  |  |
| recommended_assets | jsonb |  |  |
| generated_at | timestamptz DEFAULT now() |  |  |
| ▼ recording_stages |  |  |  |
| カラム | 型 | 説明 | 必須 |
| recording_id | uuid PK REFERENCES recordings(id) ON DELETE CASCADE |  |  |
| stage1_transcript_at | timestamptz |  |  |
| stage2_preview_at | timestamptz |  |  |
| stage3_full_at | timestamptz |  |  |
| current_stage | text CHECK (current_stage IN ('queued','transcript','preview','full','failed')) |  |  |
| ▼ recording_segments |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PK |  |  |
| recording_id | uuid REFERENCES recordings(id) ON DELETE CASCADE |  |  |
| start_sec | numeric |  |  |
| end_sec | numeric |  |  |
| speaker_id | text | 話者ID(diarization) | 必須 |
| text | text |  |  |
| sensitivity | text CHECK (sensitivity IN ('public','internal','sensitive')) | DEFAULT internal | 必須 |
| pii_detected | boolean DEFAULT false |  |  |
| ▼ pii_redactions |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PK |  |  |
| recording_segment_id | uuid REFERENCES recording_segments(id) ON DELETE CASCADE |  |  |
| pii_type | text | address|phone|amount|email | 必須 |
| start_offset | int |  |  |
| end_offset | int |  |  |
| ▼ external_summaries |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PK |  |  |
| meeting_id | uuid REFERENCES meetings(id) ON DELETE CASCADE |  |  |
| content_md | text |  |  |
| pdf_storage_url | text |  |  |
| share_link_id | uuid |  |  |
| generated_at | timestamptz DEFAULT now() |  |  |
| ▼ complaints |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PK |  |  |
| customer_company_id | uuid |  |  |
| recording_segment_id | uuid |  |  |
| summary | text |  |  |
| severity | text | low|med|high | 必須 |
| status | text | open|investigating|resolved | 必須 |
| created_by | uuid REFERENCES users(id) |  |  |
| created_at | timestamptz DEFAULT now() |  |  |
| ▼ complaint_meeting_links |  |  |  |
| カラム | 型 | 説明 | 必須 |
| complaint_id | uuid REFERENCES complaints(id) ON DELETE CASCADE |  |  |
| meeting_id | uuid REFERENCES meetings(id) ON DELETE CASCADE |  |  |
| PRIMARY KEY | (complaint_id, meeting_id) |  |  |
| ▼ alignment_reports |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PK |  |  |
| handoff_id | uuid REFERENCES handoffs(id) ON DELETE CASCADE |  |  |
| recording_segment_id | uuid | 引用 | 任意 |
| reporter_id | uuid REFERENCES users(id) |  |  |
| note | text |  |  |
| status | text | open|ack|resolved | 必須 |
| created_at | timestamptz DEFAULT now() |  |  |
| ▼ contract_renewals |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PK |  |  |
| contract_id | uuid REFERENCES contracts(id) ON DELETE CASCADE |  |  |
| renewal_date | date |  |  |
| alert_3m_sent | boolean DEFAULT false |  |  |
| alert_1m_sent | boolean DEFAULT false |  |  |
| status | text | upcoming|renewed|churned | 必須 |
| ▼ upsell_signals |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PK |  |  |
| customer_company_id | uuid |  |  |
| recording_segment_id | uuid |  |  |
| signal_type | text | expansion|new_use_case|complaint_with_demand | 必須 |
| confidence | numeric(3,2) |  |  |
| assigned_to | uuid REFERENCES users(id) |  |  |
| status | text | new|contacted|won|lost | 必須 |
| ▼ email_undo_tokens |  |  |  |
| カラム | 型 | 説明 | 必須 |
| token | text PK |  |  |
| email_draft_id | uuid REFERENCES email_drafts(id) |  |  |
| dispatch_at | timestamptz | 30秒後 | 必須 |
| status | text | pending|sent|cancelled | 必須 |
| created_at | timestamptz DEFAULT now() |  |  |
| ▼ sync_failure_log |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PK |  |  |
| user_id | uuid |  |  |
| target | text | google_calendar|zoom|gmail | 必須 |
| error | text |  |  |
| occurred_at | timestamptz DEFAULT now() |  |  |
| resolved_at | timestamptz |  |  |
| ▼ permission_requests |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PK |  |  |
| requester_id | uuid REFERENCES users(id) |  |  |
| resource | text |  |  |
| action | text |  |  |
| status | text | pending|approved|denied | 必須 |
| approver_id | uuid |  |  |
| created_at | timestamptz DEFAULT now() |  |  |
| ▼ autosave_drafts |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PK |  |  |
| user_id | uuid REFERENCES users(id) |  |  |
| form_key | text | 画面ID+resource_id | 必須 |
| payload | jsonb |  |  |
| updated_at | timestamptz DEFAULT now() |  |  |
| UNIQUE | (user_id, form_key) |  |  |
| ▼ dangerous_action_audits |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PK |  |  |
| actor_id | uuid REFERENCES users(id) |  |  |
| action | text | bulk_delete|rollback|export_all|policy_change | 必須 |
| scope | jsonb |  |  |
| reason | text | 入力必須 | 必須 |
| confirmed_via | text | mfa|password|none | 必須 |
| occurred_at | timestamptz DEFAULT now() |  |  |
| ▼ meeting_consent_captures |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PK |  |  |
| meeting_id | uuid REFERENCES meetings(id) ON DELETE CASCADE |  |  |
| captured_at | timestamptz |  |  |
| consent | boolean |  |  |
| captured_by | text | auto_announcement|manual | 必須 |
| recording_segment_id | uuid | 証跡発話 | 任意 |
| ▼ data_deletion_requests |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PK |  |  |
| ticket_id | text UNIQUE |  |  |
| requester_email | text |  |  |
| target_kind | text | recording_segment|contact|message | 必須 |
| target_id | uuid |  |  |
| reason | text |  |  |
| status | text | received|under_review|approved|denied|completed | 必須 |
| due_at | timestamptz | 受付+30日 | 必須 |
| created_at | timestamptz DEFAULT now() |  |  |
| ▼ ex_employee_speech_policies |  |  |  |
| カラム | 型 | 説明 | 必須 |
| org_id | uuid PK |  |  |
| policy | text CHECK (policy IN ('retain','anonymize','delete')) |  |  |
| legal_hold | boolean DEFAULT false |  |  |
| updated_by | uuid |  |  |
| updated_at | timestamptz DEFAULT now() |  |  |
| ▼ legal_disclosure_requests |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PK |  |  |
| case_id | text |  |  |
| scope | jsonb | 期間/対象 | 必須 |
| requested_by | text |  |  |
| custodian | uuid REFERENCES users(id) |  |  |
| chain_of_custody | jsonb |  |  |
| export_url | text |  |  |
| status | text |  |  |
| created_at | timestamptz DEFAULT now() |  |  |
| ▼ data_residency_config |  |  |  |
| カラム | 型 | 説明 | 必須 |
| org_id | uuid PK |  |  |
| region | text | ap-northeast-1 | 必須 |
| r2_bucket | text | tokyo-bucket | 必須 |
| enforced | boolean DEFAULT true |  |  |
| ▼ recent_views |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PK |  |  |
| user_id | uuid REFERENCES users(id) ON DELETE CASCADE |  |  |
| resource_kind | text | meeting|contact|recording|knowledge | 必須 |
| resource_id | uuid |  |  |
| viewed_at | timestamptz DEFAULT now() |  |  |
| INDEX | (user_id, viewed_at DESC) |  |  |
| ▼ knowledge_deprecations |  |  |  |
| カラム | 型 | 説明 | 必須 |
| knowledge_item_id | uuid PK REFERENCES knowledge_items(id) ON DELETE CASCADE |  |  |
| deprecated_at | timestamptz |  |  |
| replaced_by | uuid |  |  |
| reason | text |  |  |
| ▼ chat_citations |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PK |  |  |
| conversation_id | uuid |  |  |
| assistant_message_id | uuid |  |  |
| source_kind | text | recording_segment|knowledge_item | 必須 |
| source_id | uuid |  |  |
| snippet | text |  |  |
| UNIQUE | (assistant_message_id, source_id) |  |  |
| ▼ push_subscriptions |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PK |  |  |
| user_id | uuid REFERENCES users(id) ON DELETE CASCADE |  |  |
| endpoint | text UNIQUE |  |  |
| p256dh | text |  |  |
| auth | text |  |  |
| user_agent | text |  |  |
| created_at | timestamptz DEFAULT now() |  |  |
| ▼ voice_memos |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PK |  |  |
| user_id | uuid REFERENCES users(id) |  |  |
| meeting_id | uuid | 紐付け先 | 任意 |
| audio_storage_url | text |  |  |
| transcript | text |  |  |
| duration_sec | int | ≤60 | 必須 |
| created_at | timestamptz DEFAULT now() |  |  |
| ▼ data_exports |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PK |  |  |
| user_id | uuid REFERENCES users(id) |  |  |
| scope | text | personal|legal | 必須 |
| status | text | queued|running|done|failed | 必須 |
| export_url | text |  |  |
| expires_at | timestamptz |  |  |
| created_at | timestamptz DEFAULT now() |  |  |
| ▼ backup_status |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PK |  |  |
| org_id | uuid |  |  |
| last_pitr_at | timestamptz |  |  |
| pitr_window_days | int DEFAULT 7 |  |  |
| last_snapshot_at | timestamptz |  |  |
| snapshot_storage_url | text |  |  |
| ▼ feature_flags |  |  |  |
| カラム | 型 | 説明 | 必須 |
| key | text PK |  |  |
| enabled | boolean DEFAULT false |  |  |
| percentage | int CHECK (percentage BETWEEN 0 AND 100) |  |  |
| allowlist | uuid[] |  |  |
| blocklist | uuid[] |  |  |
| description | text |  |  |
| updated_by | uuid |  |  |
| updated_at | timestamptz DEFAULT now() |  |  |
| ▼ ab_test_experiments |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PK |  |  |
| name | text |  |  |
| metric | text |  |  |
| variants | jsonb |  |  |
| status | text | draft|running|stopped | 必須 |
| started_at | timestamptz |  |  |
| ended_at | timestamptz |  |  |
| ▼ ab_test_assignments |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PK |  |  |
| experiment_id | uuid REFERENCES ab_test_experiments(id) ON DELETE CASCADE |  |  |
| user_id | uuid REFERENCES users(id) |  |  |
| variant | text |  |  |
| assigned_at | timestamptz DEFAULT now() |  |  |
| UNIQUE | (experiment_id, user_id) |  |  |
| ▼ ab_test_metrics |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PK |  |  |
| experiment_id | uuid |  |  |
| user_id | uuid |  |  |
| metric | text |  |  |
| value | numeric |  |  |
| recorded_at | timestamptz DEFAULT now() |  |  |
| ▼ optimistic_lock_versions |  |  |  |
| カラム | 型 | 説明 | 必須 |
| resource_kind | text |  |  |
| resource_id | uuid |  |  |
| version | int |  |  |
| updated_by | uuid |  |  |
| updated_at | timestamptz |  |  |
| PRIMARY KEY | (resource_kind, resource_id) |  |  |
| ■ Round1指摘反映で追加・改修テーブル(v2.1) |  |  |  |
| テーブル名 | 概要 | Phase |  |
| org_id 追加(全テーブル) | マルチテナント基盤(T-1対応) | P1 |  |
| jobs_inflight | pgmq冪等性ガード(T-3) | P1 |  |
| idempotency_keys | API冪等性キー保管(T-5) | P1 |  |
| retention_policies | sensitivity tier別TTL(C-2) | P2 |  |
| audit_review_records | admin監査レビュー(M-C8) | P2 |  |
| secret_rotation_audit | シークレット rotation 監査(M-C1) | P2 |  |
| consent_logs | 利用規約版数+撤回(M-C5) | P2 |  |
| email_drafts | メールドラフト本体(M-20) | P2 |  |
| cti_calls | CTI着信ログ(G-1) | P3 |  |
| win_analyses | 勝因分析(G-24) | P3 |  |
| speaker_assignments | 話者命名+遡及伝搬(G-26) | P2 |  |
| per_attendee_consent | 参加者単位同意(C-1,G-2) | P2 |  |
| share_safety_filters | 共有時のフィルタ設定(G-3) | P2 |  |
| onboarding_kpis | オンボード habit-loop(G-13) | P3 |  |
| meeting_share_watermarks | 共有時透かし(M-C2) | P2 |  |
| dr_backup_regions | DR用クロスリージョン(M-C4) | P2 |  |
| ▼ jobs_inflight (T-3) |  |  |  |
| カラム | 型 | 説明 | 必須 |
| queue_name | text |  |  |
| idempotency_key | text |  |  |
| acquired_by | text | worker_id | 必須 |
| acquired_at | timestamptz |  |  |
| expires_at | timestamptz | visibility timeout | 必須 |
| PRIMARY KEY | (queue_name, idempotency_key) |  |  |
| ▼ idempotency_keys (T-5) |  |  |  |
| カラム | 型 | 説明 | 必須 |
| key | text PK | Idempotency-Key header | 必須 |
| user_id | uuid REFERENCES users(id) |  |  |
| request_hash | text | sha256(method+path+body) | 必須 |
| response_status | int |  |  |
| response_body | jsonb |  |  |
| status | text CHECK (status IN ('processing','done','failed')) |  |  |
| created_at | timestamptz DEFAULT now() |  |  |
| expires_at | timestamptz DEFAULT now()+interval '24 hours' |  |  |
| ▼ retention_policies (C-2) |  |  |  |
| カラム | 型 | 説明 | 必須 |
| org_id | uuid |  |  |
| resource_kind | text | recording|recording_segment|email|note|knowledge_item|audit_log | 必須 |
| sensitivity | text | public|internal|sensitive | 必須 |
| ttl_days | int | 受注/失注確定後 | 必須 |
| legal_hold_override | boolean DEFAULT true | legal hold時はTTL無視 | 必須 |
| dpa_synced_at | timestamptz | 契約書と最終同期 | 任意 |
| PRIMARY KEY | (org_id, resource_kind, sensitivity) |  |  |
| ▼ per_attendee_consent (C-1, G-2) |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PK |  |  |
| meeting_id | uuid REFERENCES meetings(id) ON DELETE CASCADE |  |  |
| attendee_id | uuid | meeting_attendees.id | 必須 |
| consent | boolean | NULL=未取得 | 任意 |
| captured_at | timestamptz |  |  |
| captured_via | text | auto_announcement|manual|join_dialog | 必須 |
| pre_consent_audio_purged | boolean DEFAULT false |  |  |
| recording_segment_id | uuid | 証跡発話 | 任意 |
| UNIQUE | (meeting_id, attendee_id) |  |  |
| ▼ email_drafts (M-20) |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PK |  |  |
| org_id | uuid |  |  |
| thread_id | text | Gmail Thread ID | 任意 |
| owner_user_id | uuid REFERENCES users(id) |  |  |
| recipient | jsonb | [{email,name},...] | 必須 |
| cc | jsonb |  |  |
| subject | text |  |  |
| body | text |  |  |
| status | text CHECK (status IN ('draft','queued','sent','cancelled','failed')) |  |  |
| scheduled_send_at | timestamptz | 30秒undo含む | 任意 |
| sent_at | timestamptz |  |  |
| version | int NOT NULL DEFAULT 1 | 楽観ロック(T-7) | 必須 |
| created_at | timestamptz DEFAULT now() |  |  |
| ▼ cti_calls (G-1) |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PK |  |  |
| user_id | uuid REFERENCES users(id) |  |  |
| caller_phone | text |  |  |
| matched_contact_id | uuid |  |  |
| matched_company_id | uuid |  |  |
| call_started_at | timestamptz |  |  |
| call_ended_at | timestamptz |  |  |
| ■ v2.3 追加テーブル(実演シミュ反映) |  |  |  |
| テーブル名 | 概要 | Phase |  |
| share_audience_presets | 共有時audience別マスキングテンプレ(F-S5-3) | P2 |  |
| transcript_anchors | 録画箇所×資料/コミットの双方向リンク(F-S9-4) | P2 |  |
| contract_special_terms | 特殊条件taxonomy(F-S9-2) | P2 |  |
| handoff_quality_metrics | 引継ぎ品質×継続率(F-S9-5) | P3 |  |
| audit_chain_incidents | 監査hash chain破断インシデント(F-S10-3) | P2 |  |
| cost_actuals | per-user/team/featureコスト実績(F-S10-4) | P2 |  |
| behavioral_anomalies | 部下行動異常検知(F-S8-4) | P3 |  |
| export_templates | i18n対応テンプレ(PDF/メール/透かし F-UX-1) | P3 |  |
| notification_dispatch_log | 通知重複抑制(F-UX-4) | P2 |  |
| role_default_notification_presets | ロール別通知初期値(F-S12-4) | P3 |  |
| sync_success_log | オフライン同期成功ログ(F-S14-3) | P2 |  |
| ▼ derived_artifacts_status (F-S5-1) |  |  |  |
| カラム | 型 | 説明 | 必須 |
| meeting_id | uuid PK REFERENCES meetings(id) ON DELETE CASCADE |  |  |
| summary_v | int DEFAULT 0 | external-summary version | 必須 |
| handoff_v | int DEFAULT 0 | handoff version | 必須 |
| embeddings_v | int DEFAULT 0 | embeddings version | 必須 |
| last_edit_at | timestamptz |  |  |
| regen_pending_kinds | text[] | ['summary','handoff','embeddings'] | 任意 |
| ▼ contract_special_terms (F-S9-2) |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PK |  |  |
| contract_id | uuid REFERENCES contracts(id) ON DELETE CASCADE |  |  |
| term_kind | text CHECK (term_kind IN ('billing_cycle','delivery','contact_freq','sla','legal_clause','other')) |  |  |
| description | text |  |  |
| required_action_owner | uuid REFERENCES users(id) |  |  |
| due_date | date |  |  |
| status | text | open|done|waived | 必須 |
| ▼ audit_chain_incidents (F-S10-3) |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PK |  |  |
| detected_at | timestamptz DEFAULT now() |  |  |
| broken_row_id | uuid | audit_logs内の対象行 | 必須 |
| expected_prev_hash | text |  |  |
| actual_prev_hash | text |  |  |
| status | text CHECK (status IN ('detected','investigating','closed')) |  |  |
| dual_approver_ids | uuid[2] | close時必須 | 任意 |
| rca_url | text |  |  |
| closed_at | timestamptz |  |  |
| ▼ behavioral_anomalies (F-S8-4) |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PK |  |  |
| user_id | uuid REFERENCES users(id) ON DELETE CASCADE |  |  |
| metric | text | meetings_count|outbound_emails|search_uses | 必須 |
| baseline | numeric | 直近4週平均 | 必須 |
| current | numeric |  |  |
| delta_pct | numeric |  |  |
| detected_at | timestamptz DEFAULT now() |  |  |
| acknowledged_by_user | boolean DEFAULT false | 透明性原則:本人にも通知 | 必須 |
| ▼ cost_actuals (F-S10-4) |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PK |  |  |
| org_id | uuid |  |  |
| scope | text | user|team|feature | 必須 |
| scope_id | text |  |  |
| period | date | 月初日 | 必須 |
| amount | numeric |  |  |
| cap | numeric |  |  |
| reached_pct | numeric |  |  |
| ▼ export_templates (F-UX-1) |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PK |  |  |
| locale | text | ja|en|... | 必須 |
| kind | text CHECK (kind IN ('pdf','email','watermark')) |  |  |
| name | text |  |  |
| body | text | テンプレ本体 | 必須 |
| updated_at | timestamptz DEFAULT now() |  |  |
| UNIQUE | (locale, kind, name) |  |  |
| ▼ notification_dispatch_log (F-UX-4) |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PK |  |  |
| event_id | text | 重複抑制キー | 必須 |
| user_id | uuid REFERENCES users(id) |  |  |
| channel | text CHECK (channel IN ('push','slack','email','sms')) |  |  |
| dispatched_at | timestamptz DEFAULT now() |  |  |
| suppressed_for | text | 他チャネルが抑制された場合 | 任意 |
| UNIQUE | (event_id, channel, user_id) |  |  |
| ▼ users 追加列(v2.3) |  |  |  |
| カラム | 型 | 説明 | 必須 |
| consent_blanket_for_internal_meetings | boolean DEFAULT false | 社内会議の包括同意(F-S4-3) | 必須 |
| observation_consent_level | text CHECK (...) DEFAULT 'pre_notify' | 常時/事前通知/個別承認(F-S8-2) | 必須 |
| new_user_until | date | 新人ハンドリング期限(F-S3-1) | 任意 |
| handedness | text CHECK (handedness IN ('left','right')) DEFAULT 'right' | 片手UI(F-S1-1) | 必須 |
| ▼ calendar_holds 追加列(F-S2-2) |  |  |  |
| カラム | 型 | 説明 | 必須 |
| transparency | text DEFAULT 'transparent' | Google CalendarでBlock可視性 | 必須 |
| hold_visibility | text CHECK (hold_visibility IN ('owner_only','attendees_dimmed','attendees_visible')) | 同席者の見え方 | 必須 |
| hold_title | text DEFAULT '[仮]商談調整中' | 表示文言 | 必須 |
| ▼ recording_stages 追加列(F-S5-2) |  |  |  |
| カラム | 型 | 説明 | 必須 |
| estimated_completion_at | timestamptz | p95から動的算出 | 任意 |
| partial_artifacts_allowed | boolean DEFAULT false | stage3未完でもsummary/handoff部分生成可 | 必須 |
| ▼ recording_segments 追加列(F-S6-2) |  |  |  |
| カラム | 型 | 説明 | 必須 |
| former_employee_utterance | boolean DEFAULT false | 退職者発言フラグ | 必須 |
| successor_user_id | uuid REFERENCES users(id) | 承継者 | 任意 |
| ▼ handoffs 追加列(F-S9-1, F-S9-3) |  |  |  |
| カラム | 型 | 説明 | 必須 |
| accept_deadline_at | timestamptz | 48h SLA | 必須 |
| escalation_state | text CHECK (escalation_state IN ('none','cc_supervisor','force_assigned')) |  |  |
| bundle_excluded_items | jsonb | [{kind,id,reason}] | 任意 |
| ▼ legacy_import_jobs 追加列(F-S12-2) |  |  |  |
| カラム | 型 | 説明 | 必須 |
| staged_state | jsonb | field_mapping_json/dedupe_keys/cursor | 必須 |
| dedupe_keys | text[] DEFAULT ARRAY['email','phone','company_name+contact_name'] | 優先順位 | 必須 |
| merge_undo_window_hours | int DEFAULT 72 |  |  |
| ▼ data_deletion_requests 追加列(F-S11-1, F-S11-4) |  |  |  |
| カラム | 型 | 説明 | 必須 |
| rejection_reason_code | text CHECK (rejection_reason_code IN ('worm_retention_required','legal_hold','identity_verification_failed','out_of_scope','already_deleted')) |  |  |
| identity_verification_method | text CHECK (identity_verification_method IN ('email_loopback','signed_pdf','id_document','share_token_originator')) |  |  |
| ■ v2.4 追加・改修テーブル(再シミュ残課題反映) |  |  |  |
| テーブル名 | 概要 | Phase |  |
| pre_consent_audio_buffers | 録画開始〜同意取得の事前バッファ。verbal同意時はpurge保留(NF-S4-1) | P2 |  |
| roleplay_consent | ロープレ共有同意(opt-in必須化)(F-S7-4再) | P3 |  |
| voice_memo_transcript_translations | 音声メモ多言語化(NF-UX-1) | P3 |  |
| contract_special_terms_taxonomy | taxonomyの版管理(NF-S9-1) | P3 |  |
| ▼ pre_consent_audio_buffers (NF-S4-1) |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PK |  |  |
| meeting_id | uuid REFERENCES meetings(id) ON DELETE CASCADE |  |  |
| start_at | timestamptz |  |  |
| end_at | timestamptz |  |  |
| storage_url | text | R2 URL | 必須 |
| purge_at | timestamptz | 通常 録画開始+5min | 必須 |
| verbal_proof_locked | boolean DEFAULT false | verbal同意の証跡として固定 | 必須 |
| locked_until | timestamptz | retention_policiesに連動 | 任意 |
| audio_proof_segment_id | uuid | verbal proof対応セグメント | 任意 |
| ▼ roleplay_consent (F-S7-4再) |  |  |  |
| カラム | 型 | 説明 | 必須 |
| user_id | uuid PK REFERENCES users(id) ON DELETE CASCADE |  |  |
| coach_share | text CHECK (coach_share IN ('none','review_only','team_blurred','full_share')) | DEFAULT 'review_only' = opt-in必須 | 必須 |
| scope | text | persona指定/全シナリオ | 必須 |
| consented_at | timestamptz |  |  |
| revoked_at | timestamptz |  |  |
| ▼ voice_memo_transcript_translations (NF-UX-1) |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PK |  |  |
| voice_memo_id | uuid REFERENCES voice_memos(id) ON DELETE CASCADE |  |  |
| locale | text | en/ja等 | 必須 |
| text | text |  |  |
| quality | text CHECK (quality IN ('machine','human')) |  |  |
| translator | text | anthropic|deepl|human | 必須 |
| created_at | timestamptz DEFAULT now() |  |  |
| UNIQUE | (voice_memo_id, locale) |  |  |
| ▼ contract_special_terms_taxonomy (NF-S9-1) |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PK |  |  |
| term_kind | text |  |  |
| status | text CHECK (status IN ('proposed','legal_review','admin_approve','active','archived')) |  |  |
| version | int NOT NULL |  |  |
| proposed_by | uuid |  |  |
| legal_approver_id | uuid | 法務承認 | 任意 |
| admin_approver_id | uuid | 情シス承認 | 任意 |
| activated_at | timestamptz |  |  |
| changelog | text |  |  |
| ▼ data_deletion_requests 追加列(F-S11-3再) |  |  |  |
| カラム | 型 | 説明 | 必須 |
| legal_hold_override_approver_id | uuid | 代理人承認 | 任意 |
| legal_hold_override_reason | text | 訴訟番号等 | 任意 |
| subject_representative_id | uuid | 本人代理人 | 任意 |
| approval_chain | jsonb | [{role,user_id,at}] | 任意 |
| ▼ chat_citations 追加列(F-S13-4再) |  |  |  |
| カラム | 型 | 説明 | 必須 |
| speaker_confidence | numeric(3,2) | 0-1 | 任意 |
| downgraded_for_low_confidence | boolean DEFAULT false | <0.4で自動降格 | 必須 |
| ▼ derived_artifacts_status 追加列(NF-S5-1) |  |  |  |
| カラム | 型 | 説明 | 必須 |
| regen_debounce_until | timestamptz | 60秒debounce | 任意 |
| regen_lock_version | int DEFAULT 0 | OCC | 必須 |
| ▼ users 追加列(NF-S2-1, NF-S4-2) |  |  |  |
| カラム | 型 | 説明 | 必須 |
| away_until | timestamptz | 出張中フラグ(手動/自動推定) | 任意 |
| away_source | text CHECK (away_source IN ('manual','calendar_ooo','flight_email_heuristic','hold_density_heuristic')) |  |  |
| ▼ calendar_holds 設計変更(NF-S2-2) |  |  |  |
| カラム | 型 | 説明 | 必須 |
| 注記 | - | hold_visibility='attendees_dimmed'は同席者カレンダーへinvite送信せず、ownerのみtransparent予定。確定時に正規inviteを発行 | - |
| ■ v2.5 追加・改修(R3 minor) |  |  |  |
| テーブル名 | 概要 | Phase |  |
| review_backlog_metrics | 信頼区間<0.4退避バックログ集計(NF3-S8-1) | P3 |  |
| ▼ voice_memo_transcript_translations 追加列(NF3-UX-2) |  |  |  |
| カラム | 型 | 説明 | 必須 |
| translation_status | text CHECK (translation_status IN ('machine','human_requested','human_in_progress','human_done')) |  |  |
| human_request_at | timestamptz |  |  |
| human_done_at | timestamptz |  |  |
| sla_business_days | int DEFAULT 5 |  |  |
| ▼ pre_consent_audio_buffers 追加列(NF3-S4-1) |  |  |  |
| カラム | 型 | 説明 | 必須 |
| extension_count | int DEFAULT 0 CHECK (extension_count <= 3) | verbal_proof_locked延長回数(最大3回) | 必須 |
| extension_log | jsonb | [{at, by_user_id, reason}] | 任意 |
| ▼ contract_special_terms_taxonomy 追加列(NF3-S9-1) |  |  |  |
| カラム | 型 | 説明 | 必須 |
| replaced_by_id | uuid REFERENCES contract_special_terms_taxonomy(id) | 代替版 | 任意 |
| archived_at | timestamptz |  |  |
| orphan_contract_count | int | archive時に紐付いていた契約数(参照保持用) | 任意 |
| ▼ review_backlog_metrics (NF3-S8-1) |  |  |  |
| カラム | 型 | 説明 | 必須 |
| id | uuid PK |  |  |
| manager_user_id | uuid REFERENCES users(id) ON DELETE CASCADE |  |  |
| subordinate_user_id | uuid REFERENCES users(id) |  |  |
| pending_count | int | 信頼区間<0.4退避件数 | 必須 |
| oldest_pending_days | int | 最古経過日数 | 必須 |
| computed_at | timestamptz DEFAULT now() |  |  |
| ▼ data_deletion_requests 追加列(NF3-S11-1) |  |  |  |
| カラム | 型 | 説明 | 必須 |
| representative_identity_verification_method | text CHECK (...) | power_of_attorney_doc|representative_id_doc | 任意 |
| power_of_attorney_doc_url | text | R2 URL | 任意 |
| representative_id_doc_url | text | R2 URL | 任意 |