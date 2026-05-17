# 18_search_knowledge_quality

| 検索/ナレッジ品質 |  |  |  |  |  |
| --- | --- | --- | --- | --- | --- |
| ハイブリッド検索/ハルシネーション抑止/古い情報 |  |  |  |  |  |
| 項目 | 要件 | 実装 | しきい値 | 計測 | Phase |
| ハイブリッド検索 | BM25+vector+recency | 重み 0.4/0.4/0.2 | top200→rerank top20 | NDCG@10 | P1 |
| ランキング理由 | 透明性 | explain(BM25/vec/recency分解) | UIで提示 | - | P1 |
| 時系列パース | 「○年○月頃」 | LP-22 | range±2週 | 回帰テスト | P2 |
| 話者フィルタ | 自分宛/特定話者 | speaker_filter | - | - | P1 |
| 古い情報 | deprecated_at | badge+filter+検索除外オプション | UI明示 | - | P2 |
| 撤回情報 | replaced_by | 次バージョン誘導 | - | - | P2 |
| ハルシネーション | 出典必須 | RAG router+引用必須プロンプト+no_answer許容 | 引用率100% | 週次audit | P3 |
| 引用の検証 | ソース内検索 | candidate_docsから限定 | - | - | P3 |
| 重複統合 | 近似結果統合 | minhash/simhash | - | - | P3 |
| 最近見たもの | UX | recent_views | 直近50 | - | P1 |
| プリセット | ロール別 | CS=クレーム,営業=ニーズ,新人=反論 | - | - | P2 |
| 検索ログ | 学習用 | search_logs | 個人特定除外 | - | P2 |
| フィードバックループ | 役立った/立たなかった | reward signal | ranker再学習 | 月次 | P3 |
| クエリ補完 | オートコンプリート | trie+履歴 | - | - | P2 |
| フィルタファセット | date/role/customer/sensitivity | - | - | - | P1 |
| クロスtenant漏洩防止 | RLS+vector RLS | - | - | - | P1 |
| sensitiveの扱い | 検索除外OR本人のみ | sensitivity tier | - | - | P2 |
| multilingual | ja+en | tokenizer切替 | - | - | P3 |
| 性能 | p95<400ms | prefilter→rerank | - | Vitals | P1 |
| コスト管理 | embedding費用 | バッチ生成+差分 | - | 月次 | P2 |
| ■ Round1指摘反映追加(v2.1) |  |  |  |  |  |
| 項目 | 要件 | 実装 | しきい値 | 計測 | Phase |
| BM25実装(T-4) | 本物のBM25 | paradedb(pg_search) | - | CI bench | P1 |
| HNSW チューニング(T-4) | ef_search/ef_construction | ef_search=64,ef_construction=128 | - | p95 latency | P1 |
| partition(T-4) | org_id+date | partitioned table | - | - | P1 |
| embedding metadata(T-2) | sensitivity/org_id複製 | prefilter | - | - | P1 |
| context_hint(G-10) | アクティブ顧客自動絞 | API param | - | - | P2 |
| ゼロ件補助(G-20) | did_you_mean+broaden | AP-94 0件分岐 | - | - | P2 |
| ranking ゴールデン(M-15) | golden set>=200,四半期更新 | - | NDCG@10>=0.7,95%CI | - | P3 |
| ハルシネーションKPI(M-15) | 引用必須+0-3% | 週次audit | 逸脱でSlack | - | P3 |
| RAG cost cap(M-9) | $0.10/conversation | アプリ層 | - | - | P2 |
| context tokens cap(M-9) | 1k×上位8件 | retrieval制限 | - | - | P2 |
| prompt cache(M-9) | Anthropic prompt cache | systemプロンプト固定部分 | - | コスト削減 | P3 |
| ■ Round2指摘反映追加(v2.2) |  |  |  |  |  |
| 項目 | 要件 | 実装 | しきい値 | 計測 | Phase |
| HNSW ベンチ(N-2) | P1ローンチ前必須 | ef_search=64,ef_construction=128 を実測ベンチで再調整 | Recall@10>=0.95, p95<400ms | ベンチ結果を docs/ に保存 | P1 |
| HNSW チューニング履歴 | 変更ログ | - | - | ADRに記録 | P1 |