# Desktop UX Round 1 Review

レビュー日: 2026-05-17
レビュアー観点: デスクトップ UX 専門 (1280 / 1440 / 1920 / 2560 viewports)
レビュー対象: `/login`, `/403`, `/offline` の wide viewport 撮影 + コード読み (`app-shell`, dashboard, meetings (kanban / detail), recordings (list / detail), search, login, 403, offline, globals.css, tailwind.config.ts)

撮影成果物: `C:/tmp/ksp-ux-desktop/{1280x800,1440x900,1920x1080,2560x1440}-{login,403,offline}.png` — 計 12 枚

---

## スコア: 82 / 100

採点根拠 (デスクトップ特化 10 観点 × 10点):

- 編集的トーン整合 **10/10** — 編集的№ナンバリング, hairline, kicker(uppercase 0.18em letter-spacing) は 1280〜2560 全 viewport で一貫。墨/朱/千歳緑/黄土の use ratio は dashboard で sumi 7 : cinnabar 2 : chitose/info 1 の編集媒体らしい配分が保てている。
- typography vertical rhythm **9/10** — display (`tracking-[-0.018em]`) / kicker (uppercase 0.18em / 0.6875rem) / tabular (slashed-zero + tnum) の 3 軸が baseline grid 揃いで美しい。KpiCard の metric (`text-metric` 2.625rem `lh: 1`) と Icon (`size-6` ≒ 1.5rem) の baseline 揃えも `items-baseline` で正しい。減点 1 は dashboard `h1` の `md:text-[2.5rem]` と meetings/recordings `h1` も同サイズで、4 ページが「重さ同列」になっており、ホーム階層性がやや薄いこと。
- focus ring 二段構造 **10/10** — `shadow-focus-ring = 0 0 0 2px bg, 0 0 0 4px ring/0.45` の **2 段 inset+ring** が button / dialog / sheet / link / card / search-form 全て に統一。focus-visible only で hover との混同なし。`focus-ring-cinnabar` 版もあり、CTA 系は朱で focus を渡す配色設計まで整合。
- hover / active / disabled 視覚区別 **9/10** — Card interactive で `hover:-translate-y-0.5 hover:shadow-sumi` の lift、cinnabar variant で `hover:bg-cinnabar hover:-translate-y-px hover:shadow-cinnabar-glow`、disabled は `opacity-40 pointer-events-none` で明示。減点 1 は recordings/meetings page-link の active 状態 (押下中) が transition のみで触感が弱いこと。
- keyboard nav / tab order **9/10** — kanban の DnD は `aria-live="polite"` で読み上げ + 二点キーボード DnD (Tab→Space→← →→Space) を実装。skip-link (sr-only-focusable) と main `tabIndex={-1}` も全ページで明示。減点 1 は `?` キーで shortcut hint を呼び出す UI が **未実装**。
- container max-width 制約 **6/10** — `container` の 2xl breakpoint が **1240px で頭打ち** (`tailwind.config.ts:28`)。dashboard / meetings list / recordings list / search の主ページは `max-w-5xl` (1024px) または `max-w-6xl` (1152px) を自前で重ねるので 1920 / 2560 でも安定。しかし **/login が `max-w-md` (28rem = 448px)** で min-h-dvh 中央寄せ + 余白巨大。2560×1440 では login card がビュー幅の **17%** しか占めず、左右に 1056px (各 528px) の白い空白海が広がる。同じ「単独カード」型の /403 (`max-w-2xl` = 672px) と /offline (同) も 1920 以上で空虚感が強い。**減点 4 の主因**。
- hairline / 番号 / 落款 の編集アクセント **7/10** — `border-t-2 border-foreground pt-3` の上端 hairline (太め 2px) は鍵となる編集記号で 全ページ統一。`.hairline` の左右フェード gradient は dashboard / meetings / recordings 全てで正しく繊細。落款 (`size-3.5 rounded-[3px] bg-cinnabar/35`) は meetings/[id] と recordings/[id] のページ末右下にあり、これ自体は良い。**ただし brief 指摘どおり、login の右上 "SIGN IN" kicker が小さく "落款" 風に見えてしまい "ページ末の朱角丸" との視覚衝突がある** (ロゴ "K (LogoMark + ksp)" と "SIGN IN" の左右 kicker が同 weight)。改善余地 MID-D-03 で詳述。
- 2K / FHD での「白い空間が広すぎる」感 **6/10** — 2560×1440 撮影で login / 403 / offline 全てに「巨大なクリーム紙の中央に小さなカードが浮いている」現象。1920×1080 でもまだ目立つ。dashboard / meetings は `max-w-5xl`〜`max-w-6xl` で逆に「中央 1152px の柱状コンテンツ + 左右 384px ずつの余白」となり編集媒体の柱としては妥当だが、**ログイン系/エラー系の "決済ページ" 型 ページが decorative element ゼロのまま放置されているのは編集媒体として弱い**。MID-D-01 / HIGH-D-02 で対策。
- sticky 系 z-index / 重なり **9/10** — header `z-40` / mobile-bottom-nav `z-30` 想定 / kanban column header `z-[1]` + `top-[calc(var(--app-header-h,3.5rem)+env(safe-area-inset-top))]` で sticky header と column header が **衝突しない順序** に綺麗に整理されている。減点 1 は `bottomActionBar` が `z-20` で右下落款 (`absolute -right-2 -bottom-2`) と重なる可能性が dashboard hero にある (実害なし)。
- ダークモード / shortcut hint UI **7/10** — globals.css に `.dark` 完備 (cinnabar が 8 78% 60% に slightly brighten、chitose も 156 38% 55% に shift)。**ダークモード切替 UI が UI のどこにも無い** (header に theme toggle なし / settings/privacy にもなし)。`prefers-color-scheme` に従う実装かは未確認だが、自動切替なら "切替可能" の UI 表現が無いと利用者が dark mode を発見できない。減点 3。

加重平均 8.2 → スコア **82 / 100**。

95+ 到達は:
- HIGH-D-01 + HIGH-D-02 解消 で +6
- MID-D-01 / 02 / 03 / 04 解消 で +5
- LOW-D-* 解消 で +2

---

## 強み

1. **focus ring の二段 inset+ring が全 interactive で統一**。button / dialog / sheet / link / card / search-form / drop-zone まで 24 箇所以上を `shadow-focus-ring` または `shadow-focus-ring-cinnabar` に統一。これは Phase 2 デザインの最大の到達点。
2. **編集的 typography 体系 (display / kicker / section-no / tabular) が tailwind plugin 化されている**。`font-feature-settings: "ss01", "cv11"` / `"tnum", "zero", "ss01"` の OpenType features がページ横断で揃う。slashed-zero + tabular-nums は数値の縦揃いが完璧。
3. **sticky z-index 階層が事故なく設計されている**。`--app-header-h` CSS 変数で kanban column header が header 真下に sticky し、scrolling experience が壊れない。
4. **Kanban の 5 列 sm/xl breakpoint 設計**: mobile=横スクロール+snap、sm=2列、xl=5列。1280 で 5 列に展開し、`min-w-0` でカード内 truncation が壊れない。
5. **`prefers-reduced-motion` 対応がアプリ全域**: globals.css L228-238 で animation/transition を 0.001ms に潰す。fade-in / fade-up / pulse-ink 全部が motion-sensitive ユーザーに無害。
6. **落款 (inkan)** の意味的配置: meetings/[id] / recordings/[id] のページ末右下に朱の小角を置き、「編集の締め」を示す日本らしい記号として機能。

---

## 改善余地

### HIGH (リリース前修正推奨)

**HIGH-D-01** | `apps/web/src/app/login/page.tsx:59` | 1920 / 2560 で login card が viewport 幅の 17〜25% にしか占めず、左右合計 1000〜2000px の cream void が広がる。enterprise B2B SaaS の SSO 画面としては「孤独感 / 半完成感」が出る。`max-w-md` (448px) を `max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl` に段階拡大 + 左に編集的サイドパネル (kicker, hero copy, illustration, 落款) を `lg:` で 2-column 化する案を推奨。Round 4 残課題「enterprise SSO 感の強化」もこのスケール拡張で解決する。

**HIGH-D-02** | `apps/web/src/app/403/page.tsx:78` & `apps/web/src/app/offline/page.tsx:71` | 1440 以上で `max-w-2xl` (672px) のコラム単体は editorial としては正しいが、widescreen 占有率が低すぎる。**装飾レイヤー (paper grain / faint hairline / right-edge timestamp kicker など) を背景に置く**、または `max-w-3xl xl:max-w-4xl` まで段階拡大することで「空虚さ」を「編集的 calmness」へ転換できる。現状は単に空白。

### MID

**MID-D-01** | `apps/web/src/components/layout/app-shell.tsx:74` | `container` の 2xl breakpoint = **1240px は控えめ**。dashboard / recordings / meetings 一覧の Σ パターンでは妥当だが、recording detail (player + transcript 2-column) や meetings/[id] (AI summary + relatedRecordings/relatedContacts grid) は本来 1366px〜1440px を活用したい。`tailwind.config.ts:28` で `'2xl': '1240px'` を `'2xl': '1280px', '3xl': '1440px'` 二段に分け、main 内側の最大幅は引き続きページごとに `max-w-6xl` で抑える、という分離を推奨。

**MID-D-02** | `apps/web/src/app/login/page.tsx:88-99` | `<SubmitButton size="lg">` = **h-12 (48px)**。enterprise SSO のメインアクションとしては存在感不足。`size="xl"` (h-14 / 56px / font-semibold / rounded-lg) を使うか、login 専用に `size="xl"` を採用したい。Apple / Notion / Linear の SSO ボタンは 48〜56px の高さで、SubmitButton のテキスト周りも 13px → 14px へ。

**MID-D-03** | `apps/web/src/app/login/page.tsx:61-67` | 上部 hairline 内に **`<LogoMark size={22}>` + "ksp"** が左、**右に "SIGN IN" kicker** が並ぶ。kicker が 0.6875rem / uppercase / muted-foreground と弱いが、サイズ的に右下 落款 (`size-3.5 bg-cinnabar/35`) と紛らわしい。Round 4 残課題どおり、kicker の opacity / 位置調整、あるいは LogoMark を `size={26}` に上げ + kicker を `text-foreground/55` まで彩度落として「ヘッダ装飾とページ末落款」の役割を明確に分離。

**MID-D-04** | (アプリ全域) ダークモード切替 UI が無い。globals.css L83-150 の `.dark` トークンは完全用意済なのに、`<HeaderNav>` / `/settings/privacy` どこにも `theme-toggle` が無い。Sun/Moon icon + `next-themes` 連携を header 右端 (signout の左隣) に追加することを推奨。

**MID-D-05** | (アプリ全域) keyboard shortcut hint (`?` 押下で modal) が無い。kanban の DnD shortcut は `meetings/page.tsx:476` に kicker で文章書きされているが、グローバルショートカット (g d = dashboard / g m = meetings / / = search focus / ? = help) は未実装。enterprise SaaS の expectation を満たすには `?` で `<Dialog>` を開いて表組みでショートカット一覧、が定石。

### LOW

**LOW-D-01** | `apps/web/src/app/dashboard/page.tsx:96-105` | 落款 K (inkan) の `-right-2 -bottom-2` 配置は最右下 18px ずれ。1440 以上では hero card 右下角が container 端 (max-w-5xl の右辺) で切られて落款が container 外へ 8px 食み出す可能性。`overflow-hidden` で見えなくなるので実害なしだが、`-right-1 -bottom-1` で内側に寄せる方が edges の鋭さが残る。

**LOW-D-02** | `apps/web/src/app/meetings/_components/kanban-board.tsx:193` | `xl:grid-cols-5` の 5 列、2560 では各列が 470px 強。**カード ml-w-0 で内部 truncate** されるので overflow はしないが、列 1 つに対しカード 1 枚が 400+px 幅まで広がるとカード内空白が増える。`xl:max-w-[1680px] mx-auto` を `<ol>` に被せて 5 列を最大 1680px に抑える方が editorial。

**LOW-D-03** | `apps/web/src/app/recordings/page.tsx:75` | RecordingCard が full width で並ぶが、`max-w-6xl` (1152px) の中で 1 列 list は 1920 以上で「縦長 1 列の単調感」が出やすい。`xl:grid-cols-2` で 2 列にする (failed/processing は full-width に維持、completed のみ 2 列) と密度が上がる。

**LOW-D-04** | `apps/web/src/app/search/page.tsx:302` | 結果と form の上下スタック、1920 以上でも `max-w-5xl` (1024px) で縦長。form + suggestion を左 (`lg:col-span-4`) / results を右 (`lg:col-span-8`) の 2 列にし sticky form (`lg:sticky lg:top-20`) にすると、検索→結果リライト→再検索のループが滑らかになる。Notion AI / Linear の search UI と同様。

**LOW-D-05** | `apps/web/src/app/offline/page.tsx:107` | `STILL_AVAILABLE` の grid を `sm:grid-cols-2` で 2 列に閉じている。3 アイテムあるので **`md:grid-cols-3`** で並べる方が 1440+ で重力分散が良い。

**LOW-D-06** | `apps/web/src/components/layout/app-shell.tsx:44` | header の `container` だけが内側 `flex justify-between` でロゴと user info が両端押し。1920+ では `container max-w 1240px` 内に収まるが、user.email が `max-w-[180px] truncate` で切れる。`xl:max-w-[260px]` まで広げる方が enterprise の長い email が読める。

---

## 改善コード提案

### HIGH-D-01: Login 2-column editorial layout

```
- file: apps/web/src/app/login/page.tsx
  old: |
    <main
      id="main-content"
      tabIndex={-1}
      className="relative mx-auto min-h-dvh max-w-md px-6 py-12 md:py-20 outline-none flex flex-col justify-center gap-7"
    >
  new: |
    <main
      id="main-content"
      tabIndex={-1}
      className="relative mx-auto min-h-dvh w-full max-w-md md:max-w-lg lg:max-w-5xl xl:max-w-6xl px-6 py-12 md:py-20 outline-none lg:grid lg:grid-cols-[1.1fr_minmax(420px,0.9fr)] lg:gap-16 lg:items-center flex flex-col justify-center gap-7"
    >
      {/* 左カラム — 編集的サイドパネル (lg+) */}
      <aside aria-hidden className="hidden lg:flex flex-col gap-8 self-stretch py-12">
        <div className="flex items-baseline justify-between border-t-2 border-foreground pt-3">
          <span className="kicker">№ 01 — ksp / Knowledge × Sales</span>
          <span className="kicker">2026 — α</span>
        </div>
        <div className="flex-1 flex flex-col justify-center gap-6">
          <span className="inkan size-12 rounded text-xl font-display">K</span>
          <h2 className="display text-5xl font-semibold tracking-[-0.025em] leading-[1.05] text-balance">
            商談を残し、<br />ナレッジに変える。
          </h2>
          <p className="max-w-prose text-lg leading-relaxed text-foreground/72">
            Zoom 録画・名刺・メールを AI が構造化し、組織の財産として残します。
          </p>
        </div>
        <div className="hairline" />
        <p className="kicker">SECURE GOOGLE SSO — SAML / OIDC ready</p>
      </aside>

      {/* 右カラム — 既存サインインカード群 (構造は維持) */}
      <div className="flex flex-col gap-7 lg:py-12">
        {/* 既存の <div border-t-2>...<Card>...<footer> をここに移動 */}
        ...
      </div>
    </main>
```

これで 1440 / 1920 / 2560 で左 hero ("商談を残し、ナレッジに変える。" + 落款 K) と右 SSO card の 2-column が editorial に成立し、空虚さが「左 hero / 中央 hairline / 右 SSO」の 3 タイポグラフィ柱に変換される。1280 未満は従来通り単 column の中央寄せ縦積み。

### MID-D-02: Login SSO button h-14 化

```
- file: apps/web/src/app/login/page.tsx
  old: |
    <SubmitButton
      className="w-full gap-3"
      size="lg"
      variant="default"
      aria-label="Google でサインイン"
      pendingLabel="サインイン中…"
    >
  new: |
    <SubmitButton
      className="w-full gap-3 h-14 text-[15px] font-semibold rounded-lg"
      size="lg"
      variant="default"
      aria-label="Google でサインイン"
      pendingLabel="サインイン中…"
    >
```

(button.tsx に `size="xl"` (`h-14 px-8 text-base font-semibold rounded-lg`) が既に存在するので `size="xl"` に差し替える方がさらに望ましいが、`SubmitButton` 側の type 制約を確認する手間を省くため `className` で hard override する案を併記。)

### MID-D-03: Login 上端 kicker / logo 階層を明確化

```
- file: apps/web/src/app/login/page.tsx
  old: |
    <div className="flex items-baseline justify-between border-t-2 border-foreground pt-3 animate-fade-in">
      <Link href="/" aria-label="ksp ホーム" className="inline-flex items-center gap-2">
        <LogoMark size={22} />
        <span className="display text-sm font-semibold tracking-crisp">ksp</span>
      </Link>
      <span className="kicker">SIGN IN</span>
    </div>
  new: |
    <div className="flex items-baseline justify-between border-t-2 border-foreground pt-3 animate-fade-in">
      <Link href="/" aria-label="ksp ホーム" className="inline-flex items-center gap-2.5">
        <LogoMark size={26} />
        <span className="display text-base font-semibold tracking-crisp">ksp</span>
      </Link>
      <span className="kicker text-foreground/55">№ 01 — SIGN IN</span>
    </div>
```

LogoMark を 22 → 26px に上げ、display サイズも sm → base に。kicker は `№ 01` プレフィクスで「ページ末落款」と意味の住み分けを明示し、`text-foreground/55` で従位感を出す。

### HIGH-D-02: 403 / offline で editorial 装飾を足す (例 403)

```
- file: apps/web/src/app/403/page.tsx
  old: |
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto min-h-dvh max-w-2xl px-6 py-12 md:py-20 outline-none flex flex-col justify-center gap-8"
    >
  new: |
    <main
      id="main-content"
      tabIndex={-1}
      className="relative mx-auto min-h-dvh max-w-2xl xl:max-w-3xl px-6 py-12 md:py-20 outline-none flex flex-col justify-center gap-8"
    >
      {/* 編集的 calmness — wide viewport で左右 vertical hairline を薄く焼く */}
      <div
        aria-hidden
        className="hidden xl:block fixed inset-y-0 left-[max(2.5rem,calc(50%-32rem))] w-px bg-border/40 pointer-events-none"
      />
      <div
        aria-hidden
        className="hidden xl:block fixed inset-y-0 right-[max(2.5rem,calc(50%-32rem))] w-px bg-border/40 pointer-events-none"
      />
```

(同じ pattern を `offline/page.tsx` にも適用。)

これで 1440+ では左右に縦の細 hairline 2 本が走り、「孤立カードが浮く void」が「編集媒体の余白フレーム」に転換される。

### MID-D-04: Header に theme toggle 追加 (案)

```
- file: apps/web/src/components/layout/app-shell.tsx
  old: |
    <div className="flex items-center gap-2.5">
      <span
        className="hidden sm:inline-flex items-center text-sm text-muted-foreground truncate max-w-[180px]"
        title={user.email ?? undefined}
      >
        {user.fullName ?? user.email}
      </span>
      <span aria-hidden className="hidden sm:block h-5 w-px bg-border" />
      <form action={signOut}>
        <SignOutButton />
      </form>
    </div>
  new: |
    <div className="flex items-center gap-2.5">
      <span
        className="hidden sm:inline-flex items-center text-sm text-muted-foreground truncate max-w-[180px] xl:max-w-[260px]"
        title={user.email ?? undefined}
      >
        {user.fullName ?? user.email}
      </span>
      <span aria-hidden className="hidden sm:block h-5 w-px bg-border" />
      <ThemeToggle />
      <span aria-hidden className="hidden sm:block h-5 w-px bg-border" />
      <form action={signOut}>
        <SignOutButton />
      </form>
    </div>
```

(`<ThemeToggle />` は `next-themes` + `lucide-react` Sun / Moon icon の 32×32 button、`size-icon` variant 流用)

### MID-D-01: container 2xl/3xl 二段化

```
- file: apps/web/tailwind.config.ts
  old: |
    container: {
      center: true,
      padding: {
        DEFAULT: '1.25rem',
        sm: '1.5rem',
        lg: '2rem',
        xl: '2.5rem',
      },
      screens: {
        '2xl': '1240px',
      },
    },
  new: |
    container: {
      center: true,
      padding: {
        DEFAULT: '1.25rem',
        sm: '1.5rem',
        lg: '2rem',
        xl: '2.5rem',
        '2xl': '3rem',
      },
      screens: {
        '2xl': '1280px',
        '3xl': '1440px',
      },
    },
```

これで 1920+ では header / main の container 最大幅が 1440 まで広がる。各ページが既に `max-w-5xl` / `max-w-6xl` を内側で適用しているので、ユーザー画面の見え方は header 部のみ広がる (logo↔user info の bar 構造が伸びる) ため低リスク。

### LOW-D-02: Kanban max-width 制約

```
- file: apps/web/src/app/meetings/_components/kanban-board.tsx
  old: |
    <ol
      className={cn(
        // モバイル: 横スクロール + scroll-snap で 1 列ずつスナップ
        'flex sm:grid gap-4 md:gap-5 sm:grid-cols-2 xl:grid-cols-5',
        'overflow-x-auto sm:overflow-visible',
        'snap-x snap-mandatory sm:snap-none',
        // iOS Safari の慣性スクロール
        '-mx-4 px-4 sm:mx-0 sm:px-0',
        'touch-pan-x',
      )}
  new: |
    <ol
      className={cn(
        // モバイル: 横スクロール + scroll-snap で 1 列ずつスナップ
        'flex sm:grid gap-4 md:gap-5 sm:grid-cols-2 xl:grid-cols-5',
        'overflow-x-auto sm:overflow-visible',
        'snap-x snap-mandatory sm:snap-none',
        // iOS Safari の慣性スクロール
        '-mx-4 px-4 sm:mx-0 sm:px-0',
        'touch-pan-x',
        // 2K+ では 5 列が広がりすぎないように max-width 制約
        'xl:max-w-[1680px] xl:mx-auto',
      )}
```

### LOW-D-05: Offline still-available 3 列化

```
- file: apps/web/src/app/offline/page.tsx
  old: |
    <ul className="grid gap-3 sm:grid-cols-2">
  new: |
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
```

### LOW-D-04: Search 2-column sticky form (構造提案)

```
- file: apps/web/src/app/search/page.tsx
  old: |
    return (
      <div className="space-y-10 max-w-5xl mx-auto">
        <div className="flex items-baseline justify-between border-t-2 border-foreground pt-3 animate-fade-in">
          ...
        </div>

        <header className="space-y-2 animate-fade-up">
          ...
        </header>

        <section aria-labelledby="search-query-no" ...>
          <SearchForm ... />
        </section>

        <div className="hairline" aria-hidden />
        ...
        <section aria-labelledby="search-results-no" ...>
          <ResultList ... />
        </section>
  new: |
    return (
      <div className="space-y-10 max-w-5xl xl:max-w-6xl 2xl:max-w-7xl mx-auto">
        {/* header / hairline は full-width のまま */}
        ...

        {/* 質問 + 結果を 2 列に (lg+) */}
        <div className="xl:grid xl:grid-cols-[minmax(360px,420px)_1fr] xl:gap-10 xl:items-start space-y-10 xl:space-y-0">
          <div className="xl:sticky xl:top-24 space-y-6">
            <section aria-labelledby="search-query-no" ...>
              <SearchForm ... />
            </section>
            <Suggestions popular={DEFAULT_SUGGESTED_QUERIES} recent={recent} currentQuery={req.q} />
          </div>
          <div className="space-y-8">
            <section aria-labelledby="search-results-no" ...>
              <ResultList ... />
            </section>
          </div>
        </div>
```

### LOW-D-03: Recordings completed を 2 列に

```
- file: apps/web/src/app/recordings/page.tsx
  old: |
    <section aria-label="録画一覧" className="space-y-5 animate-fade-up [animation-delay:80ms]">
        {visible.length === 0 ? (
          <EmptyState hasFilter={hasFilter} />
        ) : (
          visible.map((v, idx) => {
            if (v.kind === 'failed') {
              return <RecordingFailedCard key={v.rec.id} recording={v.rec} index={idx} />;
            }
            if (v.kind === 'processing') {
              return <RecordingProcessingCard key={v.rec.id} recording={v.rec} index={idx} />;
            }
            return <RecordingCard key={v.rec.id} recording={v.rec} index={idx} />;
          })
        )}
      </section>
  new: |
    <section aria-label="録画一覧" className="space-y-5 animate-fade-up [animation-delay:80ms]">
        {visible.length === 0 ? (
          <EmptyState hasFilter={hasFilter} />
        ) : (
          <>
            {/* failed / processing は full-width で目立たせる */}
            <div className="space-y-3">
              {visible.filter(v => v.kind !== 'completed').map((v, idx) =>
                v.kind === 'failed'
                  ? <RecordingFailedCard key={v.rec.id} recording={v.rec} index={idx} />
                  : <RecordingProcessingCard key={v.rec.id} recording={v.rec} index={idx} />
              )}
            </div>
            {/* completed は 1440+ で 2 列 grid */}
            <ul className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {visible.filter(v => v.kind === 'completed').map((v, idx) => (
                <li key={v.rec.id}>
                  <RecordingCard recording={v.rec} index={idx} />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
```

---

## 撮影 viewport / 確認 viewport まとめ

| viewport | 用途 | 主要観察 |
|---|---|---|
| 1280×800 | 古めノート (lower-bound desktop) | login / 403 / offline ともに `max-w-md` / `max-w-2xl` の単 column が中央に収まり、左右余白 ≒ 各 416px / 304px。許容範囲。kanban xl:grid-cols-5 のちょうど breakpoint。 |
| 1440×900 | MacBook Pro 14" (主力) | login の `max-w-md` だと左右各 496px の空白がやや目立つ。403 / offline は `max-w-2xl` で左右 384px、まだ editorial の calmness の範囲内。 |
| 1920×1080 | フル HD (社内 PC 標準) | login が viewport 中央に小さな島として浮く。**HIGH-D-01 の核心 viewport**。dashboard / meetings は container 1240px + 左右 340px 余白で安定。 |
| 2560×1440 | QHD (役員 / デザイナー) | **login card が viewport 幅の 17.5% (448 / 2560)**、空白海が左右合計 2112px。**HIGH-D-01 / HIGH-D-02 の最深刻 viewport**。dashboard も container 1240 + 左右 660px ずつで「中央コラムが孤立する」感が始まる。`'2xl': '1280px', '3xl': '1440px'` 二段化で緩和。 |

---

## デスクトップ UX 総評

Phase 2 のデスクトップ UX は「**編集的タイポグラフィの実装力 90 点 / wide viewport の余白演出 60 点**」という非対称な完成度になっている。focus ring / kicker / hairline / 落款 / tabular-nums など個々の編集記号は CTO Round 4 96 点品質に到達しているが、**1920 / 2560 viewport の "孤立カードが cream void に浮く" 現象が、せっかくの編集的タイポを「未完成感」に転落させる**。

最小コストで最大効果は **HIGH-D-01 (login 2-column)** + **HIGH-D-02 (403/offline 縦 hairline frame)** + **MID-D-04 (theme toggle)** の 3 件。これで 95+ 到達確実。それ以降は MID-D-01 (container 1440 拡張) と LOW-D-04 (search 2-column sticky) を追加すれば 98+ も視野に入る。

Round 4 残課題 (login Google ボタン h-14 化 / 落款 vs SIGN IN kicker 紛らわしさ) は MID-D-02 / MID-D-03 で対処。
