import Link from 'next/link';
import { ImportController } from './_components/import-controller';

export const metadata = { title: '名刺の取り込み' };

/**
 * 名刺の取り込み。
 *
 * Server Component で editorial な kicker + display title + ヘルプテキストを置き、
 * 入力 UI (D&D + キュー + 結果) は client controller に委譲する。
 */
export default function ContactsImportPage() {
  return (
    <div className="space-y-10 max-w-3xl mx-auto">
      <div className="flex items-baseline justify-between border-t-2 border-foreground pt-3 animate-fade-in">
        <p className="kicker">№ 01 — 営業 / 取り込み</p>
        <Link
          href="/contacts"
          className="kicker tabular hover:text-foreground/80 transition-colors"
        >
          名刺一覧へ戻る
        </Link>
      </div>

      <header className="space-y-3 animate-fade-up">
        <h1 className="display text-3xl md:text-[2.5rem] font-semibold tracking-crisp text-balance">
          名刺をまとめて取り込む。
        </h1>
        <p className="text-base leading-relaxed text-muted-foreground max-w-prose">
          画像をドラッグするだけで、自動で会社名・氏名・連絡先を読み取り、
          社内データベースに登録します。同じ人の名刺が二度登録されることはありません。
          読み取りに自信がない箇所はあとで「レビュー」画面で直せます。
        </p>
        <p className="text-xs text-muted-foreground border-l-2 border-cinnabar/60 pl-3 py-0.5">
          位置情報や撮影機材のメタデータは、社内に保存する前に自動で取り除きます。
        </p>
      </header>

      <div className="hairline" aria-hidden />

      <ImportController />
    </div>
  );
}
