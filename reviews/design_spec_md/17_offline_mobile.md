# 17_offline_mobile

| オフライン・モバイル仕様 |  |  |  |  |  |
| --- | --- | --- | --- | --- | --- |
| Service Worker / IndexedDB / 片手UI / PWA |  |  |  |  |  |
| 領域 | 要件 | 実装 | 容量/上限 | フォールバック | Phase |
| 撮影 | 暗所/反射補正 | OpenCV.js+静止検出+ガイド枠 | - | 手動補正+ヘルプ | P1 |
| 撮影 | フラッシュON | MediaDevices torch | - | 明度補正 | P1 |
| 撮影 | ハプティクス | navigator.vibrate | - | 視覚フィードバック | P1 |
| オフラインキュー | 100件 | IndexedDB(idb)+SW sync | 100件/100MB | UI badge | P1 |
| オフライン議事録 | 直近10件 | SW cache(stale-while-revalidate) | 100MB | online要 | P2 |
| 音声メモ | 60秒 | MediaRecorder+upload | 60秒/5MB | - | P2 |
| プッシュ通知 | Web Push | VAPID+SW | - | Email/Slack | P2 |
| 片手UI | bottom_action_bar | Tailwind+Safe Area | - | - | P1 |
| クイック検索 | オフライン優先 | IndexedDB index+online merge | - | online検索 | P1 |
| イベントタグ | セッション中アクティブ | SW activeEvent state | - | 手動入力 | P2 |
| GPS(任意) | 撮影位置 | Geolocation API | - | 入力なし | P2 |
| バッテリー配慮 | 負荷軽減 | WebWorker分離 | - | - | P2 |
| 端末性能 | 旧端末配慮 | frame skip+品質ダウン | - | - | P2 |
| PWA Install | ホーム追加 | manifest.json+SW | - | ブラウザ | P1 |
| クロス端末 | Realtime同期 | Supabase channels | 100conn | reconnect | P2 |
| 権限要求 | カメラ/マイク/位置/通知 | UIプロンプト | - | - | P1 |
| ストレージ枯渇 | 容量警告 | quota API監視 | - | 古いデータ削除 | P2 |
| バックグラウンド同期 | SW Background Sync | - | - | アプリ起動時同期 | P2 |
| ■ Round1指摘反映追加(v2.1) |  |  |  |  |  |
| 領域 | 要件 | 実装 | 容量/上限 | フォールバック | Phase |
| IndexedDB暗号化(M-18) | PII保護 | libsodium wrap, key=session-bound | - | ログアウトでwipe | P1 |
| LRU eviction(M-18) | 容量超過 | FIFO/LRU+未同期データ保持 | - | - | P1 |
| 音声中断ハンドリング(G-4) | 電話/BG/BT切替 | onInterrupt→部分IndexedDB保存→再開prompt | - | UI明示 | P2 |
| 騒音抑制(G-9) | 録音前処理 | RNNoise/WebAudio noise suppression | - | SNR<10dB warning+再録 | P2 |
| Pin for offline(G-14) | ユーザー指定キャッシュ | service_worker_cache_manifest pinned_items | 100MB | SW+UI | P2 |
| 撮影前ガイド(G-7) | blur/exposure 即時算出 | CameraView | - | - | P1 |
| バーストreview(G-8) | 100枚連続 | 横スワイプ+共通項目一括適用+チャンク非同期OCR | - | - | P1 |
| iOS PWA install(G-25) | 通知前提 | SC-66 install gate | - | - | P2 |
| CTI着信(G-1) | 電話アプリ連動 | WebRTC or デスクトップアプリ橋渡し | - | manual pad | P3 |
| ■ v2.3 追加(実演シミュ反映) |  |  |  |  |  |
| 領域 | 要件 | 実装 | 容量/上限 | フォールバック | Phase |
| fallback_capture_mode(F-S1-1) | 揺れ/暗所代替シャッター | volume_button_shutter+long_press_shutter+voice_command+静止判定3s→1s | - | 手動シャッター | P1 |
| handedness P1昇格(F-S1-1) | 左右利きCSSミラーリング | Tailwind logical+ユーザ設定 | - | UI rev | P1 |
| voice_memo segments(F-S14-2) | 中断分割 | onInterrupt→IndexedDB+segment[]+最終連結 | 60秒/合計 | abandon時部分保存 | P2 |
| sync_success_badge(F-S14-3) | 同期成功通知 | toast(throttle 10s bundle) | - | - | P2 |
| IndexedDB wipe強化(F-S14-1) | is_active=false即時wipe | SW boot時+session-bound key TTL+logout | - | - | P1 |
| MeetingPicker offlineキャッシュ範囲 | 直近30日 or pinned | SW cache | 100MB | - | P2 |
| Zoom historical retry UI(F-S14-4) | 429 backoff+残り本数 | SC-63に進捗表示 | - | リトライキュー | P3 |
| Recorder handedness mirror | 片手UI Recorder | bottom_action_bar+CSS logical | - | - | P1 |
| ■ v2.4 追加(再シミュ残課題) |  |  |  |  |  |
| 領域 | 要件 | 実装 | 容量/上限 | フォールバック | Phase |
| voice_command shutter フォールバック(NF-S1-1再点検) | 騒音時の誤検知 | SNR<10dB時はvoice_commandを無効化、volume_button_shutterをデフォルト昇格 | - | tap手動 | P1 |
| fallback順序明記 | - | volume_button > long_press > 3s_relax > voice_command(SNR>10) | - | - | P1 |