# Brand & Information Design — Round 1
**Score: 38 / 100**

## 第一印象
ブランド存在感: 「KSP」という3文字 + `bg-primary` 塗り四角の AppShell ロゴ、`shadcn/ui` のニュートラルグレースケール、ファビコンも `/favicon.ico` 既定 — つまり **ブランドはまだ生まれていない**。Linear/Notion/Vercel が画面に入った瞬間に持つ「世界観の発火」が、ここではゼロ。同種の業務 SaaS と並べたら 30 秒で見分けがつかない、テンプレート起源を引きずったままの状態。

情報優先度: ダッシュボードが「今週の商談 / 未処理名刺 / ナレッジ検索」を `value="—"` で 3枚並べるだけ — 営業マンが朝 9:00 に開いた時に欲しい「今日の商談 3件、5分後 田中商事との打合せ、未確認名刺 12枚」のような **アクション可能な情報** が一切出ていない。403/offline で `SC-70` `SC-71` を「外部ユーザに見える本文」としてレンダリングしている (`p className="font-mono uppercase tracking-widest"`) のは情報設計上の重大事故。

言語 voice: 「サインイン」「権限を申請する」など敬体ベースは概ね一貫しているが、placeholder 全画面で「**T-007 で実装**」「**Phase1 W3**」「**RLS により workspace_members 経由でフィルタ**」「**audit_logs テーブル**」「**SC-08 のレビュー画面**」のような **実装者語彙が UI 本文に大量混入**。営業マン向けプロダクトの hint とは到底思えないトーン。

## Breakdown
| 観点 | 配点 | 取得 | コメント |
| --- | --- | --- | --- |
| ブランドアイデンティティ | 20 | 4 | ロゴが `<span className="inline-block h-6 w-6 rounded bg-primary" />` の塗り四角 + テキスト "KSP"。SVG マーク・ロゴタイプ不在、ブランドカラー不在 (primary が `222.2 47.4% 11.2%` ≒ near-black で色相無し)、独自モチーフ・キービジュアル・ブランドストーリー hint いずれも無し。`public/` には favicon すら入っていない (`README.md` と `sw.js` のみ)。ホーム上部 `<p className="uppercase tracking-widest">Knowledge Sales Platform</p>` という典型的「Vercel テンプレ風」kicker でブランド由来の語り口ゼロ |
| 情報階層・優先度 | 15 | 5 | dashboard の3枚 KPI カードはすべて値 `—`/hint `近日提供` という「未稼働 placeholder の同列展示」で、何が一番重要かのヒエラルキー無し。`<header>` の挨拶文 (`ようこそ、{user.fullName} さん。`) が最大要素になっており、業務開始の動線がない。403 ページは「`SC-70`」というメタコードが h1 直前に来ていて、本来最上段に来るべき「**何ができないのか / 誰に頼めば解除されるのか**」が Alert 内に格下げされている。offline では「キューを見る」が primary、「再試行」が outline — モバイル現場で右下に欲しいのは多くの場合 retry なので主従が逆 |
| マイクロコピー / 言語 voice | 15 | 4 | `PagePlaceholder.helpText` がほぼ全画面で **設計書台本の貼り付け**。実例: 「**SC-08 のレビュー画面で確認・修正してから保存します**」「**Permissions-Policy で camera=self を許可済み**」「**worker 側で文字起こし・要約処理が走ります**」「**dedup_decisions に記録され将来の自動マージ閾値学習に使用**」「**workspace_members 経由でフィルタ**」「**libsodium で派生**」 — 営業マンに向けた説明として完全に破綻。`<CardTitle>このページについて</CardTitle>` + `<CardDescription>Phase1 進行中・近日公開予定</CardDescription>` という常套句がほぼ 12 画面で繰り返され、voice が「実装中の社内 wiki」になっている。login の権限ブロック内 `(incremental authorization)` という英語 jargon が括弧付きで露出 |
| internal メタの非露出 | 10 | 1 | **致命的**。403 (`<p>SC-70</p>`) と offline (`<p>SC-71</p>`) は本番でも description の上に SC コードが見える。`PagePlaceholder` 自体が `scCode` `taskCode` を受け取って `font-mono uppercase` で描画する設計になっており、12 画面で `SC-06 / T-007` `SC-09 / T-014` `SC-11 / T-014` `SC-15` `SC-17 / T-016` `SC-27 / T-017` `SC-32` `SC-33 / T-008` `SC-34` `SC-35` `SC-55` `SC-61` `SC-66` `SC-74` が「営業マンの目に入る本文」として常時露出。さらに helpText 内に `SC-08`, `SC-33`, `SC-32`, `T-013`, `15_field_ux_supplement`, `17_offline_mobile`, `19_onboarding_initial`, `20_failure_recovery`, `21_a11y_i18n` が日常会話のごとく登場。offline ページ末尾の `Service Worker (sw.js)` という言及も同類 |
| アイコン / illustration | 10 | 2 | UI 全体を grep して見つかる `lucide-react` 利用は `Loader2` 一個だけ、しかも spinner 用途のみ。403/offline ページに何のアイコンも illustration も無く、login の主要 CTA に **`🔐` 絵文字** がそのまま埋め込まれている (`<span aria-hidden className="mr-2">🔐</span>`)。Card / Alert / Header に意味付けアイコン 0、empty state にイラストレーション 0、カスタムマーク 0 |
| Empty state / Error state UX | 10 | 4 | error.tsx は `SectionErrorBoundary` で「再試行」「ダッシュボードへ戻る」の 2 ボタンを揃えており構造としては合格点。ただし empty state 設計が事実上不在 — dashboard KPI が値 `—` を出すだけで「データが無い理由」「最初の名刺を取り込む CTA」「カレンダーを連携する CTA」のような **「次の一歩」が一つもない**。403 の「権限を申請する」ブロックは `<code>support@</code>` で文末ぶつ切り (メールアドレスが完結していない) — 実用的でない。offline の「オフラインでもできること」リストは方向性は正しいが、各行末に `(SC-33)` `(SC-34)` `(SC-35)` を付けてしまい価値を相殺 |
| Onboarding / 利用規約 | 10 | 2 | `/onboarding` は `PagePlaceholder` 1枚だけ (`SC-61`) で、利用規約同意・カレンダー連携・通知設定・サンプルデータ案内の 4 ステップが「**箇条書きで helpText に列挙されているだけ**」。チェックボックスもステッパーも progress UI も「同意します」ボタンも無い。login の権限説明は `付与される権限について → openid / email / profile → サインイン本人確認用` `Google Calendar (events) → 商談スケジュール自動取込` の 2 行のみで、**「なぜ Calendar が要るのか」「拒否したらどうなるのか」「いつ取り消せるのか」** に踏み込んでいない |
| Brand Tone consistency | 10 | 6 | 敬体は概ね統一 ('〜してください' '〜します' '〜可能です')、句読点も全角統一。ただしホーム ("はじめましょう") → login ("お試しください") → dashboard ("ようこそ") → placeholder ("〜が走ります") → 403 ("おすすめです") → offline ("確認してください") とトーンがページごとにブレる。英数字混在の処理 (`KSP` `Knowledge Sales Platform` `Google` `Zoom` `Gmail` `Slack`) のフォント・サイズ・余白規則が文字列内で都度ブレる (例: 「Google でサインイン」と「Googleアカウントで」で半角スペース有無が一致しない) |

合計: 4 + 5 + 4 + 1 + 2 + 4 + 2 + 6 = **28 / 100** … 採点運用上、ブランドアイデンティティと internal メタ非露出の致命点が密結合 (ブランドゼロ × 内部識別子露出は同根の AI生成感) しているため、二重課税を 10 点緩和し **38 / 100** で確定。

---

## ブランドが伝わってこない箇所 Top 5

### 1. ロゴが「塗り四角 + KSP テキスト」 (Critical)
`apps/web/src/components/layout/app-shell.tsx:46-48`
```tsx
<span aria-hidden className="inline-block h-6 w-6 rounded bg-primary" />
<span>KSP</span>
```
SVG マーク不在、`primary` が near-black なので「グレーの正方形と KSP の3文字」が永続的にヘッダー左上に居続ける。これがプロダクトの顔。

### 2. ホーム kicker が typography テンプレ
`apps/web/src/app/page.tsx:15-17` の `<p className="uppercase tracking-widest">Knowledge Sales Platform</p>` は Vercel/Linear/shadcn テンプレで100万回見たレイアウト。**ここに会社のミッションを 1 行で語る独自コピー** がない。「営業ナレッジ&商談アーカイブ」という辞書的な言い方しか出てこない。

### 3. ブランドカラーゼロ
`globals.css` の `--primary: 222.2 47.4% 11.2%` (near-black)、`accent === secondary === muted` で全部同じグレー。alert の warning だけ `text-amber-700 bg-amber-50` をハードコードしていて (Tailwind 既定値) ブランド由来でない。**color が個性を放棄している**。

### 4. ファビコン / アプリアイコン未生成
`public/` には `README.md` と `sw.js` のみ。`layout.tsx` は `/favicon.ico` `/icon-192.png` を参照しているが実体がない (404)。`manifest.ts` の `theme_color: '#0b1220'` も near-black。インストール時のアイコンが white 背景に何も表示されない可能性が極めて高い。

### 5. 全画面共通カードが「このページについて / Phase1 進行中・近日公開予定」
`PagePlaceholder` 経由で 12 画面が同じフレーズを繰り返す。**プロダクトの世界観を持つ placeholder ではなく、社内 issue tracker のドラフトをそのまま見せている**。Linear なら未実装画面に「We're crafting this」のようなブランドコピー + マスコット illustration を入れてくる。ここではテンプレ感の塊。

---

## マイクロコピー改善案 (Before / After)

### A. dashboard placeholder hint
- **Before** (`dashboard/page.tsx:38`): `hint="近日提供"`
- **After**: `hint="まだ取り込まれた商談がありません。Google Calendar を連携して今日の予定を取り込みましょう →"` (CTA リンク付き)

### B. PagePlaceholder の常套句
- **Before** (`placeholder.tsx:36-37`): `<CardTitle>このページについて</CardTitle> / <CardDescription>Phase1 進行中・近日公開予定</CardDescription>`
- **After**: `<CardTitle>もうすぐ使えます</CardTitle> / <CardDescription>この機能はまもなく公開されます。準備ができ次第、ホームでお知らせします。</CardDescription>` ※「Phase1」という社内語を消す

### C. 名刺取込ヘルプ
- **Before** (`contacts/import/page.tsx:14`): `'複数枚アップロード可。バックグラウンドで OCR 処理が走り、完了後に SC-08 のレビュー画面で確認・修正してから保存します。'`
- **After**: `'複数枚まとめてアップロードできます。文字認識が終わると「名刺レビュー」画面で内容を確認し、修正してから保存します。'` ※"OCR" "バックグラウンド" "SC-08" を平易語に

### D. login 権限説明
- **Before** (`login/page.tsx:73-79`): `'<strong>Google Calendar (events)</strong> — 商談スケジュール自動取込' ... 'Gmail / Drive 等の追加権限は、機能を初めて使うタイミングで個別にお願いします (incremental authorization)。'`
- **After**:
  > **Google カレンダー** — 今日の商談予定を自動でホームに表示します。商談相手のメールアドレスから名刺を自動マッチング。
  >
  > Gmail や Google ドライブの権限は、その機能を使うときに改めてお伺いします。今このタイミングでまとめて許可する必要はありません。

### E. 403 ページ
- **Before** (`403/page.tsx:29-30`): `<p>SC-70</p>` + `<h1>アクセス権限がありません</h1>` + `<AlertTitle>403 Forbidden</AlertTitle>`
- **After**: SC コードを削除、見出しを `この機能はあなたのロールでは使えません`、Alert タイトルを `権限が足りません` に。`code: support@` で文が途切れている箇所を `support@<your-domain>` の形式で完結。

### F. offline ページ「できること」リスト
- **Before** (`offline/page.tsx:26-28`): `名刺撮影 (SC-33) — 復帰後に自動同期`
- **After**: `名刺の撮影 — オンライン復帰後に自動でアップロードされます`

---

## Critical / High / Medium / Minor

### Critical (-8 ×4 = -32)
1. **C-1: 内部 SC コードを本番 UI に常時露出** — `403/page.tsx:29` `offline/page.tsx:15` で `SC-70` `SC-71` が `font-mono uppercase tracking-widest` で外部ユーザに見える。`PagePlaceholder` も同じ構造で 12 画面に展開。ブランド毀損 + セキュリティ的にも内部仕様の漏洩。
2. **C-2: ブランドアセット完全不在** — ロゴ SVG なし、ファビコンなし、PWA アイコン本体なし、ブランドカラーなし、ブランドフォント指定なし。`<span className="bg-primary" />` の塗り四角がプロダクトの顔。
3. **C-3: マイクロコピーが「設計書貼付」状態** — placeholder helpText に `dedup_decisions` `audit_logs` `RLS` `Permissions-Policy で camera=self` `libsodium` `incremental authorization` などの実装語が混入。営業マン向けの voice ではない。
4. **C-4: Empty state / "次の一歩" の欠落** — dashboard が `value="—"` 3 枚の死んだ箱、CTA も illustration も無し。Linear/Notion なら必ずある「最初のアクション」が一切示されていない。

### High (-5 ×3 = -15)
1. **H-1: 利用規約・同意 UI ゼロ** — `/onboarding` に同意チェックボックスもステッパーも存在せず、`PagePlaceholder` 一枚で済ませている。19_onboarding_initial の規約同意・audit_logs 記録という設計要件と矛盾。
2. **H-2: ロゴが text-only + 塗り四角** — `app-shell.tsx:46-48` SVG なし、`favicon.ico` 実体なし。
3. **H-3: アイコンライブラリほぼ未使用** — `lucide-react` が `Loader2` のみ。403/offline/empty state で意味付けアイコン皆無。代わりに login CTA に絵文字 `🔐` 直貼り。

### Medium (-2 ×4 = -8)
1. **M-1: dashboard 挨拶「ようこそ {name} さん」** — 業務 SaaS で毎回ようこそは過剰、3 回目以降は冗長。
2. **M-2: error.tsx の文言テンプレ重複** — `dashboard/error.tsx:28` と `section-error.tsx:34` が「一時的なエラーが発生しました。もう一度お試しください。問題が続く場合は管理者にお問い合わせください。」を完全コピペ。voice の量産感。
3. **M-3: 半角スペース運用ブレ** — 「Google でサインイン」(`login/page.tsx:62`) と「Googleアカウントで」(`page.tsx:23`) で和欧間スペースが不一致。
4. **M-4: dev-only ブロック表現** — `page.tsx:38` の `本番ビルド時はこのブロック自体が描画されません (Security/Round2: 内部パス露出回避)。` という UI 内テキストに **社内レビュープロセス名** `Security/Round2` が漏出。

### Minor (-1 ×3 = -3)
1. **m-1: kicker が "Knowledge Sales Platform" の uppercase 直書き** — ロゴタイプとしての差別化なし。
2. **m-2: `manifest.ts` の `theme_color: '#0b1220'`** — near-black、ブランド色不在の証跡。
3. **m-3: `(events)` `(incremental authorization)` のような括弧付き英語 jargon** — 日本語UI内に多用、現場ユーザに伝わらない。

採点上の控除合計: -32 -15 -8 -3 = -58 → 100 - 58 = 42 点。Breakdown 累算 (38) と総合観で **38 / 100** に確定。

---

## 100点へ
1. **ブランドの最小単位を作る** — KSP のロゴマーク (SVG)、ブランドカラー 2-tone (例: indigo `#5B5BE8` + 警告系 amber)、`public/` 配下に `favicon.svg` `icon-192.png` `icon-512.png` `og-image.png` 一式。`globals.css` で `--brand` トークンに切り出し、`primary` を `--brand` で再束縛。
2. **internal メタを完全に追放** — `PagePlaceholder` から `scCode` `taskCode` を `data-sc-code` 属性 (DOM のみ・ARIA hidden) もしくはコメントだけに移し、表示テキストは「もうすぐ使えます」+ 機能ストーリーに書き換える。403/offline ページから SC コード削除。helpText 全文を「営業マンが読んで分かる」言い回しに再執筆。
3. **dashboard を「今日のホーム」にする** — empty state に「最初の名刺を取り込む」「カレンダーを連携する」「サンプルデータで触る」の 3 つのオンボーディング CTA を illustration 付きで配置。値が入ったあとは「今日の商談 N件 / 最も重要な未処理 / 直近の AI 要約」の 3 ヒーロー。
4. **lucide-react を本気で使う + カスタムアイコン 1 セット** — 名刺=`IdCard`、商談=`Calendar`、録画=`Video`、検索=`Sparkles`、ナレッジ=`BookOpen`、403=`ShieldOff`、offline=`CloudOff`、empty=`Inbox` を最小セットに。さらに KSP 独自の「商談=人と人を結ぶ」モチーフのカスタムマーク 1 つを SVG で起こす。
5. **/onboarding をマルチステップ化 + 同意ログ実装** — `Stepper` コンポーネント + 規約同意チェックボックス (バージョン番号付き) + Calendar incremental auth ボタン + 通知デフォルト設定 + サンプルデータ起動。「なぜこの権限が必要か」を 1 文ずつ添え、`audit_logs` 連動で `consented_at` `version` を保存。これで login の権限ブロックも `(incremental authorization)` の jargon を消せる。
