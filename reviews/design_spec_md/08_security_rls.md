# 08_security_rls

| セキュリティ・認証・RLS設計 |  |  |  |  |
| --- | --- | --- | --- | --- |
| ■ ロールと権限マトリクス |  |  |  |  |
| リソース | sales | cs | manager | admin |
| contacts(自分の) | CRUD | R | CRUD | CRUD |
| contacts(他人の) | R | R | CRUD | CRUD |
| meetings(自分の) | CRUD | R | CRUD | CRUD |
| meetings(他人の) | R | R | CRUD | CRUD |
| recordings | R(全社) | R(全社) | R(全社) | CRUD |
| recording.insights編集 | 担当者のみU | × | U | U |
| knowledge_items | C, R(approved), U(自分) | R, C | CRUD | CRUD |
| roleplay_scenarios | R, C(自作) | R | CRUD, 公開承認 | CRUD |
| roleplay_sessions | CRUD(自分) | CRUD(自分) | R(チーム), C(コーチ) | CRUD |
| handoffs | C(送り元), U(自分宛) | R(自分宛), U | R, U | CRUD |
| admin_users | × | × | × | CRUD |
| audit_logs | × | × | R(チーム) | R |
| email_templates | CRUD(自作) | × | CRUD | CRUD |
| ■ Supabase RLS ポリシー(主要) |  |  |  |  |
| テーブル | RLS定義(SQL) |  |  |  |
| contacts | -- SELECT: 全社員が閲覧可
CREATE POLICY contacts_select_all ON contacts FOR SELECT
  TO authenticated USING (true);

-- INSERT: 認証済みユーザーが自分をownerに
CREATE POLICY contacts_insert_self ON contacts FOR INSERT
  TO authenticated WITH CHECK (owner_user_id = auth.uid());

-- UPDATE: 自分が担当するか、manager以上
CREATE POLICY contacts_update_owner ON contacts FOR UPDATE
  TO authenticated USING (
    owner_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('manager','admin'))
  );

-- DELETE: admin のみ
CREATE POLICY contacts_delete_admin ON contacts FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
  ); |  |  |  |
| recordings | -- SELECT: 全認証ユーザー(録画は全社共有が前提)
CREATE POLICY recordings_select_all ON recordings FOR SELECT
  TO authenticated USING (true);

-- ただし共有リンク経由の閲覧は service_role で別経路 |  |  |  |
| roleplay_sessions | -- SELECT: 自分 or 共有許可済 or マネージャー(同チーム)
CREATE POLICY roleplay_sessions_select ON roleplay_sessions FOR SELECT
  TO authenticated USING (
    user_id = auth.uid()
    OR shared_with_team = true
    OR EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('manager','admin'))
  ); |  |  |  |
| audit_logs | -- SELECT: manager と admin のみ
CREATE POLICY audit_logs_select_priv ON audit_logs FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('manager','admin'))
  );

-- INSERT: service_role のみ(API経由で記録) |  |  |  |
| ■ シークレット管理 |  |  |  |  |
| 保管先 | 対象 | 実装 |  |  |
| Supabase Vault | OAuth refresh_token, アクセス・トークン | pgsodium 暗号化 |  |  |
| Render Secret Files | GOOGLE_SERVICE_ACCOUNT_KEY (JSON) | ファイルマウント |  |  |
| Render 環境変数 | API Keys, DB URL | 通常の env |  |  |
| 共有リンクtoken | crypto.randomBytes(32).toString("base64url") | DB保存はハッシュ化推奨 |  |  |
| ■ 監査対象アクション |  |  |  |  |
| action | 対象 |  |  |  |
| view | recordings/[id], contacts/[id], shares アクセス |  |  |  |
| create | 全 CUD アクション |  |  |  |
| update | 同上 |  |  |  |
| delete | 同上 |  |  |  |
| share | 共有リンク作成 |  |  |  |
| export | CSVダウンロード等 |  |  |  |
| login/logout | Supabase Auth event subscription |  |  |  |
| admin_action | ユーザー招待/退職処理/上限変更 |  |  |  |
| ■ 追加RLS/権限/監査(v2) |  |  |  |  |
| 対象 | ルール | SELECT | INSERT/UPDATE/DELETE | Phase |
| business_card_images | 所有者or同orgのadmin | owner OR admin | owner | P1 |
| contact_memos | contactアクセス権者 | linked contact RLS | 作成者OR admin | P1 |
| events | org内 | org_member | org_admin | P2 |
| offline_queue | 本人のみ | self | self | P1 |
| non_card_attachments | 所有者or同meetingメンバー | owner/meeting | owner | P1 |
| user_availability_settings | 本人のみ | self | self | P2 |
| meeting_rooms / room_reservations | org_member | org | org_admin or 本人 | P2 |
| calendar_holds | 本人のみ | self | self | P2 |
| customer_timezones | contactアクセス権 | linked contact | linked contact | P2 |
| internal_attendee_invites | invitee/inviter/admin | 関係者 | invitee/inviter | P2 |
| delegate_grants | grantor/delegate/admin | 関係者 | grantor/admin | P3 |
| meeting_duplicates | 担当営業/admin | 関係者 | trigger only | P2 |
| email_intents/email_attachments | メールアクセス権者 | 継承 | 継承 | P2 |
| meeting_briefs | 商談アクセス権者 | 継承 | system+owner | P2 |
| recording_stages/recording_segments | 録画アクセス権者+sensitivity考慮 | public/internal/sensitive 段階 | owner/admin | P1 |
| pii_redactions | 録画アクセス権 | 継承 | system | P2 |
| external_summaries | 録画アクセス権 + 共有token | 継承+token | owner | P2 |
| complaints | 担当CS+営業+admin | 関係者 | 担当者 | P3 |
| complaint_meeting_links | 関連商談アクセス権 | 継承 | 担当者 | P3 |
| alignment_reports | 関連handoff権限 | 関係者 | reporter | P2 |
| contract_renewals | 契約担当+CS+admin | 関係者 | 担当者 | P2 |
| upsell_signals | 営業/CS | 関係者 | trigger+担当者 | P3 |
| email_undo_tokens | 本人のみ | self | self | P2 |
| sync_failure_log | 本人+admin | self/admin | system | P1 |
| permission_requests | requester+approver | 関係者 | requester | P2 |
| autosave_drafts | 本人のみ | self | self | P1 |
| dangerous_action_audits | admin readonly | admin | system | P2 |
| meeting_consent_captures | 商談アクセス権 | 継承 | system | P2 |
| data_deletion_requests | admin/legal | admin | admin/system | P2 |
| ex_employee_speech_policies | admin | admin | admin | P3 |
| legal_disclosure_requests | admin/legal | admin/legal | admin | P3 |
| data_residency_config | org_admin | org | org_admin | P1 |
| recent_views | 本人のみ | self | self | P1 |
| chat_citations | 本人+admin | self/admin | system | P3 |
| push_subscriptions | 本人のみ | self | self | P2 |
| voice_memos | 本人+紐付商談アクセス権 | 関係者 | 本人 | P2 |
| data_exports | 本人のみ | self | self | P3 |
| backup_status | admin | admin | system | P2 |
| feature_flags | admin write / 全員read | all | admin | P2 |
| ab_test_* | admin write / 本人read自分の割当 | admin/self | admin | P3 |
| optimistic_lock_versions | resource RLS継承 | 継承 | 継承 | P2 |
| ■ 横断ポリシー |  |  |  |  |
| MFA要 | 破壊的アクション(rollback/legal export/policy変更) | - | require_mfa | P2 |
| Audit | INSERT/UPDATE/DELETEのうち sensitive table 全件 | - | triggers→audit_logs | P2 |
| Sensitivity tier | public/internal/sensitive で SELECT を段階適用 | - | - | P1 |
| Soft delete | 主要テーブルに deleted_at; 30日purge | - | triggers | P2 |
| Idempotency | mutating endpointsで Idempotency-Key header | - | - | P1 |
| Rate limit | /api/* user毎 60rpm; admin系 10rpm | - | - | P1 |
| CORS | 明示allowlist; preflight cache | - | - | P1 |
| CSP | strict; nonce-based | - | - | P1 |
| 署名URL | R2はexpires≤300s; メールクリックで再発行 | - | - | P1 |
| Webhook secret rotation | 90日 | - | - | P2 |
| ■ Round1指摘反映の横断追記(v2.1) |  |  |  |  |
| 対象 | ルール | SELECT | INSERT/UPDATE/DELETE | Phase |
| org_id 統一 | 全テーブルに org_id NOT NULL,RLS基本句 (org_id=current_setting('app.org_id')::uuid AND ...) | - | - | P1 |
| recording_segments(改) | sensitivity tier段階(public/internal/sensitive)で SELECT 段階適用 | public:org/internal:owner+manager/sensitive:owner+admin+legal | owner+admin | P1 |
| audit_logs(改) | append-only(全role REVOKE UPDATE/DELETE; service_role INSERTのみ)+prev_hash chain | admin/legal | service_role only | P2 |
| share-link RPC | share_link_access専用Edge Function/RPC、token verify+rate limit+audit強制 | - | Route Handlerからservice_role直接DB禁止 | P1 |
| embeddings RPC | SECURITY DEFINER+関数内auth.uid権限判定+sensitivity prefilter | - | - | P1 |
| MFA要 | admin大量削除/PITR rollback/legal export/policy変更/llm killswitch | - | require_mfa+dual_approver | P2 |
| dual approval | legal export/policy変更 | - | admin+legal両方の承認 | P3 |
| service_role分離 | Next.js Route Handlerでは service_role禁止、worker専用 | - | - | P1 |
| gitleaks CI | secret push検知 | - | CI gate | P1 |
| Idempotency-Key必須エンドポイント | 副作用ある全mutating(send/confirm/delete/export等) | - | middleware強制 | P1 |
| Rate limit endpoint group | webhook=外形+secret/search=30rpm/ocr=10/min/admin=10rpm | - | - | P1 |
| share_links token | sha256でDB保存、URLのみ平文 | - | - | P1 |
| share_links password_hash | argon2id強制 | - | - | P2 |
| customer_timezones参照夜間ブロック | 顧客ローカル23-7時送信ブロック | - | - | P2 |
| IndexedDB暗号化 | libsodium、key=session-bound | - | - | P1 |
| CSP report-uri/report-to | Sentry CSPレポート受信 | - | - | P2 |
| WORM export | audit_logs日次R2 Object Lock(compliance mode) | - | - | P2 |
| pen test | P1終盤+年次 | - | - | P1 |
| DPA: 委託先一覧 | Anthropic/OpenAI/Cloudflare/Render/Supabase明記、追加時30日前事前通知 | - | - | P1 |