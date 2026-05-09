# Google OAuth セットアップ完全ガイド

> 目的: ナレッジホールディングス社員が「Googleでサインイン」ボタン1つで本システムにログインし、
> 同時に Calendar / Gmail へのアクセス権限も取得する状態を作る。

---

## 全体像

```
┌────────────────┐  ① Click "Googleでサインイン"
│  /login (Web)  │ ─────────────────────────┐
└────────────────┘                          ▼
                                  ┌──────────────────┐
                                  │ Supabase Auth    │
                                  │ (signInWithOAuth)│
                                  └─────────┬────────┘
                                            │ ② リダイレクト
                                            ▼
                              ┌─────────────────────────┐
                              │ Google 同意画面          │
                              │ (Calendar/Gmail 権限要求)│
                              └─────────┬───────────────┘
                                        │ ③ 同意
                                        ▼
                              ┌─────────────────────────┐
                              │ Google が code を発行    │
                              └─────────┬───────────────┘
                                        │ ④ callback
                                        ▼
                  https://<your-project-ref>.supabase.co/auth/v1/callback
                                        │ ⑤ token交換
                                        ▼
                              ┌─────────────────────────┐
                              │ Supabase が session作成  │
                              │ + auth.users に行追加    │
                              │ + (我々のtrigger)        │
                              │   public.users 自動作成  │
                              └─────────┬───────────────┘
                                        │ ⑥ APP_URL/auth/callback へ転送
                                        ▼
                              ┌─────────────────────────┐
                              │ Next.js が cookieにセット│
                              │ → /dashboard へ         │
                              └─────────────────────────┘
```

これを実現するには、**Google Cloud 側** と **Supabase 側** の両方を設定する必要があります。

---

## Phase A. Google Cloud Console で OAuth Client を作る

### A-1. プロジェクトを用意する
1. https://console.cloud.google.com/ にアクセス
2. 画面上部の **プロジェクト選択ドロップダウン** をクリック
3. 既存の「ナレッジホールディングス」用プロジェクトがあれば選択。なければ「新しいプロジェクト」で作成
   - プロジェクト名例: `knowledge-sales-platform`
   - 組織は「組織なし」のままでもOK

### A-2. 必要な API を有効化
左メニュー → **APIとサービス → ライブラリ** で、以下3つを検索して「有効にする」を押す:

| API | 用途 |
|---|---|
| **Google Calendar API** | 商談スケジューリング (T-021/022/026) |
| **Gmail API** | メール返信パース (T-024) |
| **Cloud Vision API** | 名刺OCR (T-009) — Phase1 W2で必要 |

### A-3. OAuth 同意画面を構成
左メニュー → **APIとサービス → OAuth 同意画面**

1. **User Type を選択**
   - Google Workspace でナレッジHDのドメインを使っていれば → **内部** (Internal) を推奨
   - 外部ユーザー(社外メール)も使うなら → **外部** (External)
   - 外部の場合、**公開ステータス** が「テスト中」だと100人まで。本番運用前に「本番環境」に切替申請が必要

2. **アプリ情報** を入力
   - アプリ名: `Knowledge Sales Platform`
   - ユーザーサポートメール: ナレッジHDの管理者メール
   - アプリのロゴ: 任意
   - アプリのドメイン:
     - アプリのホームページ: 当面 `https://<your-project-ref>.supabase.co` (本番デプロイ後にRenderのURLに変更)
     - プライバシーポリシー / 利用規約: 任意（外部公開時は必須）
   - 承認済みドメイン: `supabase.co` を追加
   - デベロッパー連絡先: 自分のメール

3. **スコープ** で以下を追加（「スコープを追加または削除」ボタン）
   ```
   .../auth/userinfo.email
   .../auth/userinfo.profile
   openid
   .../auth/calendar.events    ← 必須(P1)
   .../auth/gmail.readonly     ← 必須(P2)
   .../auth/gmail.send         ← 必須(P2)
   ```
   - `gmail.send` / `gmail.readonly` は **制限付きスコープ (restricted scope)** なので、本番公開時は Google の審査(セキュリティ評価込み)が要る。Phase1の検証フェーズはテストユーザーのみで進める想定でOK
   
4. **テストユーザー** に自分のメールを追加（テスト中の場合のみ）

5. **保存して続行**

### A-4. OAuth クライアント ID を作成（ここが本番）

左メニュー → **APIとサービス → 認証情報 (Credentials)**

1. 上部の **+ 認証情報を作成 → OAuthクライアントID** をクリック
2. **アプリケーションの種類**: `ウェブアプリケーション`
3. **名前**: `KSP Web Client` など分かりやすい名前
4. **承認済みのJavaScript生成元**:
   ```
   https://<your-project-ref>.supabase.co
   http://localhost:3000
   ```
5. **承認済みのリダイレクトURI**: ⚠ ここがハマりポイント。**Supabase の Callback URL** を指定:
   ```
   https://<your-project-ref>.supabase.co/auth/v1/callback
   ```
   - ⚠ パスは `/auth/v1/callback` で、`/auth/callback` ではない（`/auth/callback`は我々のNext.js側のパス）
6. **作成** をクリック → ダイアログが出て **Client ID** と **Client Secret** が表示される
7. ⚠ **両方コピーして安全な場所に保存** (後で Supabase に貼る)
   - 形式: Client ID は `xxxx.apps.googleusercontent.com`、Secret は `GOCSPX-xxx`

---

## Phase B. Supabase で Google Provider を有効化

いま開いている画面（Authentication > Users）の **左サイドバー** から:

### B-1. Sign In / Providers を開く
- 左サイドバー (薄いグレー部分) で:
  - MANAGE 配下: Users / OAuth Apps
  - NOTIFICATIONS 配下: Email
  - **CONFIGURATION 配下: Policies / Sign In / Providers** ← ★ここをクリック★
  - Sessions / Rate Limits / Multi-Factor ...

### B-2. Google を有効化
1. プロバイダー一覧から **Google** を見つけてクリック
2. **Enable Sign in with Google** トグルを ON
3. 入力フィールドが展開される:
   | 項目 | 値 |
   |---|---|
   | Client ID (for OAuth) | A-4 でコピーした **Client ID** を貼る |
   | Client Secret (for OAuth) | A-4 でコピーした **Client Secret** を貼る |
   | Authorized Client IDs | 空でOK (iOS/Android用なので) |
   | Skip nonce check | OFF のまま (重要) |
4. **Callback URL (for OAuth)** という項目がコピー可能な状態で表示されているはず。値は:
   ```
   https://<your-project-ref>.supabase.co/auth/v1/callback
   ```
   これは A-4 で Google 側に登録したものと**完全一致**している必要あり
5. **Save** をクリック

### B-3. Calendar / Gmail スコープを追加（最重要）

⚠ **デフォルトでは email/profile しか取得できない**。Calendar/Gmail を使うために追加スコープが必要。

同じ Google Provider 設定画面の下部に **Additional scopes** という入力欄があります:

```
https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send
```

- スペース区切りで貼り付け
- **Save** で保存

> 💡 もし「Additional scopes」フィールドが見当たらない場合は、Supabase Dashboard の UI バージョンに依存。
> 我々のコード側 (`apps/web/src/lib/auth/actions.ts`) で `scopes:` パラメータとして送っているので、UI で設定しなくても動きます。
> ただし UI で設定する方が「同意画面に何が表示されるか」を Supabase が正しく認識できるので推奨。

### B-4. URL Configuration を設定

左サイドバー → **CONFIGURATION → URL Configuration**

| 項目 | 値 |
|---|---|
| **Site URL** | `http://localhost:3000` (ローカル開発中) → 本番デプロイ後 Render URL に変更 |
| **Redirect URLs (Allow list)** | `http://localhost:3000/**` を追加 + 後で `https://<render-url>/**` も追加 |

⚠ Site URL は1つしか設定できない。Allow list 側に開発用と本番用を両方入れる運用。

---

## Phase C. ローカルで動作確認

### C-1. 依存導入（初回のみ）
```bash
cd C:\Users\ooxmi\Downloads\knowledge-sales-platform
corepack enable
pnpm install
```
- 初回は5-10分かかる (Next.js / @supabase/ssr 等のDLで500MB前後)

### C-2. 開発サーバ起動
```bash
pnpm dev
```
- 並列で web (port 3000) と worker (port 8080) が立ち上がる
- ブラウザで http://localhost:3000 を開く

### C-3. ログイン試行
1. トップページ右側の **「サインイン」** ボタン → `/login` へ
2. **「Googleでサインイン」** ボタンをクリック
3. Google 同意画面に飛ぶ → アカウント選択 → **「Knowledge Sales Platform が以下を許可することを求めています」** に Calendar / Gmail が並ぶ
4. **「許可」** をクリック
5. Supabase に戻り → 我々の `/auth/callback` → `/dashboard` に到達
6. ダッシュボードに「ようこそ、{your-email}さん」と表示されれば成功 🎉

### C-4. データベース側の確認
Supabase Dashboard → **Table Editor → public.users** を開く
- ログインしたユーザーの行が自動で1件挿入されているはず
  - id: auth.users と同じUUID
  - email: ログインしたメール
  - role: `'sales'` (デフォルト、admin が後で更新する)
  - is_active: true

これは `0005_auth_sync_trigger.sql` で仕込んだトリガーが効いている証拠です。

---

## トラブルシューティング

### ❌ "redirect_uri_mismatch" エラー
- A-4 の **承認済みのリダイレクトURI** に `https://<your-project-ref>.supabase.co/auth/v1/callback` を**完全一致**で入れたか確認
- 末尾スラッシュ `/` を入れると別物扱いされる
- httpsとhttpを間違えてないか
- Supabase project ref のスペル

> **ナレッジHD本番**: project ref は `arylptrsgxiwcnprzszo` (`.env.local` の `NEXT_PUBLIC_SUPABASE_URL` から取得可能)

### ❌ "scope not authorized" 系
- A-3 の OAuth 同意画面で Calendar/Gmail スコープを **保存した** か確認（追加して保存しないと反映されない）
- アプリが「テスト中」状態で、ログインしようとしたメールが **テストユーザーリストに登録されていない**

### ❌ "user not provisioned" など Supabase 側のエラー
- `0005_auth_sync_trigger.sql` の `handle_new_auth_user()` トリガーが効いてない可能性
- Supabase Dashboard → SQL Editor で:
  ```sql
  select * from public.users;
  select * from auth.users;
  ```
  両方の行数を確認

### ❌ /dashboard に着く前に /login に戻される
- `middleware.ts` のリダイレクト
- ブラウザのCookie検査で `sb-<ref>-auth-token` cookie が設定されているか
- `.env.local` の値とブラウザに来てる Supabase URL が同じプロジェクトか

### ❌ Calendar/Gmail スコープが同意画面に出ない
- A-3 の OAuth 同意画面で追加 → 保存 を実施したか
- B-3 で Additional scopes を保存したか
- ログイン時に **「別のアカウントを使う」** で再ログインすると、新しいスコープでの再同意が走る

---

## 次のステップ

Google OAuth が通ったら、次は:

1. **Render に web/worker をデプロイ** → 本番 APP_URL を取得
2. その APP_URL を A-4 の Authorized JavaScript 生成元 + Supabase URL Configuration に追加
3. **Zoom Server-to-Server OAuth App** を作成 (T-011 で必要)
4. **OpenAI / Anthropic API key** を取得して `.env.local` に投入
5. **Cloudflare R2 bucket** 作成 (T-012 で必要)
6. **T-007 名刺アップロードUI から実装着手**

---

## 設定値の最終チェックリスト

- [ ] Google Cloud Console プロジェクト作成
- [ ] Calendar API / Gmail API / Vision API 有効化
- [ ] OAuth 同意画面: アプリ名・スコープ追加・テストユーザー登録
- [ ] OAuth Client (Web): Authorized redirect URI に Supabase callback 登録
- [ ] Client ID / Secret コピー
- [ ] Supabase: Sign In / Providers > Google を Enable
- [ ] Supabase: Client ID / Secret 投入
- [ ] Supabase: Additional scopes に Calendar / Gmail 3本追加
- [ ] Supabase: URL Configuration に localhost と本番URL登録
- [ ] ローカルで `pnpm install && pnpm dev` 起動
- [ ] http://localhost:3000/login → Googleサインイン → /dashboard 到達
- [ ] Table Editor で public.users にレコード作成確認
