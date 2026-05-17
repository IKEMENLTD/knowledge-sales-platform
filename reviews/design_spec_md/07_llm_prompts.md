# 07_llm_prompts

| LLM プロンプト集 |  |  |  |  |  |  |
| --- | --- | --- | --- | --- | --- | --- |
| Claude Sonnet 4.5 / OpenAI Embeddings |  |  |  |  |  |  |
| ID | 用途 | モデル | 概要 | 入力 | 出力 | プロンプト |
| PROMPT-01 | recording_summary | claude-sonnet-4-5 | 商談録画の構造化抽出 | recordings.transcript_full + meeting文脈 | JSON: summary, key_points[], customer_needs[], objections[], commitments[], next_actions[] | system: あなたは経験豊富な営業マネージャーです。商談文字起こしから営業に重要な情報を抽出します。次のJSON Schemaに厳密に従って出力してください。

user: 以下は{{stage}}フェーズの商談文字起こしです。同席者: {{attendees}}。商品: {{product}}。

文字起こし:
{{transcript}}

以下のJSON形式で抽出してください:
{
  "summary": "300字以内の要約",
  "key_points": ["重要ポイント箇条書き"],
  "customer_needs": [{"need": "具体的なニーズ", "priority": "high|medium|low", "evidence": "発言の引用"}],
  "objections": [{"objection": "反論内容", "response": "営業の対応", "resolved": true|false}],
  "commitments": [{"text": "約束事", "speaker": "営業|顧客", "due": "期日 or null", "category": "deliverable|next_meeting|info_share"}],
  "next_actions": [{"action": "次アクション", "owner": "営業|顧客", "due": "期日"}]
} |
| PROMPT-02 | business_card_post_ocr | claude-sonnet-4-5 | 名刺OCR後処理(Vision結果を構造化) | Vision Document AI raw response | JSON: name, name_kana, title, company, email, phone, address | system: 名刺OCR結果を構造化します。日本人名の姓名分離、フリガナ推定、敬称・部署除去を行います。

user: {{vision_raw_text}}

JSON出力:
{
  "name": "氏名(姓名スペース区切り)",
  "name_kana": "推定フリガナ(全角カタカナ)",
  "title": "役職",
  "department": "部署",
  "company": "会社名",
  "email": "...",
  "phone": "...",
  "mobile": "...",
  "address": "...",
  "confidence": 0.0-1.0
} |
| PROMPT-03 | email_reply_parse | claude-sonnet-4-5 | 日程調整返信のパース | email body + 提示候補日時 | JSON: intent, slot_index, custom_datetime, confidence | system: 日程調整メールの返信を分類します。曖昧な日本語(「来週火曜の午後」「24日14時で」など)を正規化します。

user: 提示済み候補:
{{proposed_slots}}

返信本文:
{{reply_body}}

意図分類して JSON 出力:
{
  "intent": "accept_existing | counter_propose | reject | unclear | unrelated",
  "selected_slot_index": 0-based or null,
  "counter_proposal": [{"start_at_iso": "...", "end_at_iso": "..."}] or null,
  "needs_human_review": true|false,
  "review_reason": "...",
  "confidence": 0.0-1.0
} |
| PROMPT-04 | document_describe | claude-sonnet-4-5(vision) | アップロード資料・画像の説明生成 | image or document text | {ai_description, ai_tags} | user: 以下の資料を営業ナレッジに登録します。中身を簡潔に説明し、検索に有用なタグを生成してください。

[image or text]

JSON:
{
  "title_suggestion": "...",
  "ai_description": "200字程度の中身説明",
  "ai_tags": ["タグ1", "タグ2", ...],
  "type_guess": "proposal|case_study|product_brochure|pricing|comparison|other",
  "key_topics": [...]
} |
| PROMPT-05 | roleplay_customer_turn | claude-sonnet-4-5 | ロープレ顧客役応答 | persona + conversation history | streaming text | system: あなたは{{persona.industry}}の{{persona.role}}を演じます。
性格: {{persona.personality}}
抱えている課題: {{persona.pain_points}}
よく出す反論: {{persona.objections}}
話し方: {{persona.speaking_style}}

ロープレ目的: 営業マンの{{stage}}スキルを鍛える。本物の顧客のように振る舞う。簡単に納得しすぎず、一方で理不尽な対応もしない。 |
| PROMPT-06 | roleplay_evaluation | claude-sonnet-4-5 | ロープレ評価 | conversation + scenario.evaluation_criteria | JSON: rubric_scores, strengths, improvements | system: ロープレを採点します。

user: シナリオ: {{scenario}}
評価基準: {{rubric}}
会話履歴: {{conversation}}

JSON:
{
  "overall_score": 0-100,
  "rubric_scores": {"ヒアリング": 0-100, "提案": 0-100, ...},
  "strengths": ["強み1", "強み2"],
  "improvements": ["改善点1(具体例付き)", ...],
  "missed_opportunities": ["やればよかったこと"],
  "model_response_examples": ["こう言えばさらに良かった例"]
} |
| PROMPT-07 | roleplay_scenario_generate | claude-sonnet-4-5 | 過去商談からシナリオ生成 | 商談録画の抽出データ集約 | Scenario JSON | user: 以下は実際の商談データです。これに似た顧客像でロープレシナリオを作成してください。

商談抽出データ:
{{aggregated_meetings}}

JSON:
{
  "title": "...",
  "description": "...",
  "persona": {industry, role, personality, pain_points, objections, speaking_style},
  "opening_message": "顧客が最初に言うセリフ",
  "evaluation_criteria": {rubric: [...]},
  "difficulty": "easy|medium|hard",
  "stage": "first|objection|closing"
} |
| PROMPT-08 | knowledge_chat | claude-sonnet-4-5 | ナレッジ検索チャット | user query + retrieved chunks | streaming text + sources | system: あなたは社内ナレッジアシスタントです。提供された文脈情報のみを根拠に回答し、出典を [1][2] のように明記します。情報が不足していれば「該当する情報が見つかりません」と答えます。憶測で答えないこと。

user: 質問: {{query}}

参考情報:
{{retrieved_chunks_with_indices}} |
| PROMPT-09 | handoff_draft | claude-sonnet-4-5 | 引き継ぎ書ドラフト生成 | 関連商談+契約情報 | handoffs.content JSON | system: 営業からCSへの引き継ぎ書を作成します。漏れがないよう網羅的に。

user: 契約: {{contract}}
関連商談: {{meetings_with_extractions}}

JSON:
{
  "customer_overview": "...",
  "decision_makers": [{name, role, influence}],
  "key_pain_points": [...],
  "agreed_scope": [...],
  "out_of_scope": [...],
  "commitments": [...],
  "risks": ["懸念点"],
  "communication_preferences": "...",
  "next_steps": [...]
} |
| PROMPT-10 | meeting_search_query_expansion | claude-sonnet-4-5 | 検索クエリ拡張 | user query | 拡張クエリ配列 | user: 検索クエリ「{{query}}」を、商談録画から関連する内容を見つけるために、類義表現を3-5個生成してください。配列のみ出力。 |
| ■ 追加LLMプロンプト(v2) |  |  |  |  |  |  |
| プロンプトID | 用途 | モデル | 入力 | 出力 | 温度 | Phase |
| LP-10 | OCR後処理(漢字社名/役職補正) | claude-haiku-4-5 | raw_ocr_text + 業界辞書 | corrected_fields(name,company,title,email) | 0.0 | P1 |
| LP-11 | 名刺以外の判別 | gemini-flash or claude-haiku | image+text | classification(card|pamphlet|memo|qr_only|other) | 0.0 | P1 |
| LP-12 | 返信意図分類 | claude-haiku | email_body | intent(accept|decline|all_no_propose|phone|onsite|reschedule|cc_add|other)+confidence | 0.0 | P2 |
| LP-13 | 返信添付振り分け | claude-haiku | filename+content_type+text_excerpt | category(NDA|requirements|RFP|quote|other) | 0.0 | P2 |
| LP-14 | 全NG時の再提案ドラフト | claude-sonnet | prior thread+availability | email draft(再候補3-5枠) | 0.4 | P2 |
| LP-15 | リスケ検出 | claude-haiku | email_body+existing_meeting | is_reschedule+new_proposed_slots | 0.0 | P2 |
| LP-16 | 商談前ブリーフィング | claude-sonnet | past_summaries+commitments+contact | brief_card(needs/promises/recommended_assets) | 0.3 | P2 |
| LP-17 | 段階1: 文字起こし整形 | claude-haiku | raw_transcript | cleaned_transcript with diarization | 0.0 | P1 |
| LP-18 | 段階2: プレビュー要約 | claude-sonnet | cleaned_transcript | preview(2行要約+Top3 needs) | 0.3 | P1 |
| LP-19 | 段階3: 詳細抽出 | claude-sonnet | cleaned_transcript | needs+objections+commitments+next_actions | 0.2 | P1 |
| LP-20 | 顧客向け要約 | claude-sonnet | internal_summary - sensitive segments | external_summary(社内メモ抜き) | 0.3 | P2 |
| LP-21 | PII検出 | claude-haiku | transcript_segment | pii_spans(address/phone/amount/email) | 0.0 | P2 |
| LP-22 | 曖昧時系列パース | claude-haiku | query+now | date_range(start,end)+confidence | 0.0 | P2 |
| LP-23 | クレーム検索カード | claude-haiku | customer+keyword | top3_utterances+context_window | 0.0 | P2 |
| LP-24 | ロープレ評価(降参モード) | claude-sonnet | conversation+stuck_point | coach_hints+next_move | 0.4 | P3 |
| LP-25 | 失注分析 | claude-sonnet | loss_records[] | industry×objection matrix+narrative | 0.3 | P3 |
| LP-26 | アップセルシグナル検出 | claude-haiku | cs_segments | signal_type+confidence | 0.0 | P3 |
| LP-27 | 認識ズレ報告ドラフト | claude-haiku | recording_segment+handoff_doc | gap_report | 0.2 | P2 |
| LP-28 | 検索ハルシネーション抑止(no-source-no-answer) | claude-sonnet | question+candidate_sources | answer with required citations OR 'no_answer' | 0.0 | P3 |
| LP-29 | 音声メモ商談紐付け | claude-haiku | transcript+recent_meetings | best_match meeting_id | 0.0 | P2 |
| LP-30 | A/Bメールテンプレ生成 | claude-sonnet | persona+intent+past_perf | 2 variants | 0.6 | P3 |
| LP-31 | 退職者発言匿名化 | claude-haiku | segments | speaker→'退職者A' | 0.0 | P3 |
| LP-32 | 受注率診断ナラティブ | claude-sonnet | metrics+win/loss data | narrative+top factors | 0.3 | P3 |
| LP-33 | 録画→ロープレ シナリオ生成 | claude-sonnet | recording | persona+situation+objections | 0.5 | P3 |
| ■ Round1指摘反映で追加プロンプト(v2.1) |  |  |  |  |  |  |
| プロンプトID | 用途 | モデル | 入力 | 出力 | 温度 | Phase |
| LP-34 | 商談中検索の安全フィルタ(G-3) | claude-haiku | candidate_segments+share_target | filtered_segments(internal/sensitive除外) | 0.0 | P2 |
| LP-35 | 録画同意アナウンス文面生成(C-1) | claude-haiku | org_name+meeting_context+language | announcement script | 0.2 | P2 |
| LP-36 | 削除依頼の拒否事由判定(C-3) | claude-haiku | request+legal_obligations | reason_code+notice_text | 0.0 | P2 |
| LP-37 | 退職者発言匿名化-scope自動推定(G-22) | claude-haiku | segments+policy | scope(self_voice|all_segments|customer_facing_only) | 0.0 | P3 |
| LP-38 | ナラティブカード生成(G-11) | claude-sonnet | metrics+history+1on1_history | narrative+talking_points | 0.4 | P3 |
| LP-39 | 失注+勝因対比(G-24) | claude-sonnet | wins+losses+industry | matrix+narrative | 0.3 | P3 |
| LP-40 | 共通: tool_use(JSON mode) ラッパ | - | - | zod schema強制+1回再生成→needs_review | - | - |
| LP-41 | RAGコスト保護 | - | - | per-conversation $0.10 cap+context tokens cap (1k×8件) | - | - |