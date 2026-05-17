import { Card } from '@/components/ui/card';
import { env } from '@/lib/env';
import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { SharePasswordForm } from './_components/share-password-form';
import { ShareVideoPlayer } from './_components/share-video-player';

/**
 * /share/[code] — 公開クリップ閲覧ページ (SC-46 / GAP-R-P0-01)。
 *
 * - middleware の PUBLIC_PREFIXES `/share/` で auth ガード対象外
 * - SSR で /api/share-links/[code] を絶対 URL で呼び、結果に応じて
 *   - 200 → 動画プレーヤー (#t=start,end でブラウザ標準のクリップ表示)
 *   - 401 password_required → パスワード入力フォーム
 *   - 401 password_invalid → エラー + 再入力フォーム
 *   - 410 (revoked / expired / view_count_exceeded) → 失効エラーページ
 *   - 404 → 見つからないエラー
 * - sumi & cinnabar トーン / 落款 accent を維持
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '共有された録画',
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ p?: string; err?: string }>;
}

interface ResolveOk {
  videoUrl: string;
  startSec: number;
  endSec: number;
  expiresAt: string;
}

type ResolveResult =
  | { kind: 'ok'; data: ResolveOk }
  | { kind: 'password_required'; bad?: boolean }
  | { kind: 'expired' | 'revoked' | 'view_count_exceeded' | 'video_unavailable' | 'recording_deleted' }
  | { kind: 'not_found' }
  | { kind: 'forbidden' }
  | { kind: 'error'; status: number; code: string };

async function resolveShare(code: string, password?: string): Promise<ResolveResult> {
  // 自分自身を fetch するため絶対 URL を組み立てる。Render / preview 環境では env.APP_URL が
  // 正しく設定されている前提だが、なければ request の host header を fallback に使う。
  const reqHeaders = await headers();
  const host = reqHeaders.get('host');
  const proto = reqHeaders.get('x-forwarded-proto') ?? 'https';
  const base = host
    ? `${proto}://${host}`
    : env.APP_URL.replace(/\/$/, '');
  // [id] dynamic route が 7-char short_code と UUID の両方を受ける統合実装になっている
  const url = new URL(`/api/share-links/${encodeURIComponent(code)}`, base);
  if (password) {
    url.searchParams.set('p', password);
  }

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: 'GET',
      cache: 'no-store',
      headers: {
        // server-to-server。同一 origin なので csrf 評価対象外 (GET なので元から不要)
        'x-share-server-fetch': '1',
      },
    });
  } catch (err) {
    console.error('[share/[code]] fetch failed', err);
    return { kind: 'error', status: 500, code: 'fetch_failed' };
  }

  if (res.status === 200) {
    try {
      const data = (await res.json()) as ResolveOk;
      return { kind: 'ok', data };
    } catch {
      return { kind: 'error', status: 500, code: 'parse_failed' };
    }
  }

  if (res.status === 401) {
    let bodyCode = 'password_required';
    try {
      const body = (await res.json()) as { code?: string };
      bodyCode = body.code ?? bodyCode;
    } catch {
      /* noop */
    }
    return { kind: 'password_required', bad: bodyCode === 'password_invalid' };
  }
  if (res.status === 410) {
    try {
      const body = (await res.json()) as { code?: string };
      const c = body.code;
      if (
        c === 'expired' ||
        c === 'revoked' ||
        c === 'view_count_exceeded' ||
        c === 'video_unavailable' ||
        c === 'recording_deleted'
      ) {
        return { kind: c };
      }
    } catch {
      /* noop */
    }
    return { kind: 'expired' };
  }
  if (res.status === 404) return { kind: 'not_found' };
  if (res.status === 403) return { kind: 'forbidden' };
  return { kind: 'error', status: res.status, code: 'unknown' };
}

const ERROR_TEXT: Record<string, { title: string; detail: string }> = {
  expired: {
    title: 'このリンクは有効期限が切れました',
    detail: '送信元の担当者に新しいリンクの発行を依頼してください。',
  },
  revoked: {
    title: 'このリンクは取り消されました',
    detail: '社内ポリシー変更または送信元の操作により無効化されています。',
  },
  view_count_exceeded: {
    title: '閲覧回数の上限に達しました',
    detail: '送信元に閲覧回数の引き上げ、または新規発行を依頼してください。',
  },
  video_unavailable: {
    title: '録画ファイルが見つかりません',
    detail: '一時的なストレージ障害の可能性があります。時間をおいて再度お試しください。',
  },
  recording_deleted: {
    title: '元の録画が削除されています',
    detail: '保持期間の満了または削除依頼により取り消されました。',
  },
  not_found: {
    title: 'リンクが見つかりません',
    detail: 'URL を再度ご確認ください。',
  },
  forbidden: {
    title: 'このリンクは公開できません',
    detail: '機密区分 (restricted) の録画は外部共有できません。',
  },
};

function ShareErrorView({ kind }: { kind: string }) {
  const info = ERROR_TEXT[kind] ?? {
    title: '共有リンクを開けませんでした',
    detail: '時間をおいて再度お試しください。',
  };
  return (
    <Card className="p-6 md:p-8 space-y-4 max-w-xl mx-auto">
      <p className="kicker">共有エラー</p>
      <h1 className="display text-2xl md:text-3xl font-semibold tracking-crisp text-balance">
        {info.title}
      </h1>
      <p className="text-sm leading-relaxed text-muted-foreground">{info.detail}</p>
      <div className="flex justify-end pt-2">
        <span
          aria-hidden
          className="inline-block size-3.5 rounded-[3px] bg-cinnabar/35"
          title="落款"
        />
      </div>
    </Card>
  );
}

export default async function SharePage({ params, searchParams }: PageProps) {
  const { code } = await params;
  const sp = await searchParams;
  const password = sp.p?.trim() || undefined;

  // 軽い形式チェック (404 を早期に返す)
  if (!/^[A-Za-z0-9_-]{7}$/.test(code)) {
    return (
      <main className="mx-auto min-h-dvh max-w-3xl px-6 py-12 md:py-20 flex flex-col justify-center gap-8">
        <ShareErrorView kind="not_found" />
      </main>
    );
  }

  const result = await resolveShare(code, password);

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="relative mx-auto min-h-dvh max-w-4xl px-6 py-12 md:py-16 outline-none flex flex-col gap-8"
    >
      <div className="flex items-baseline justify-between border-t-2 border-foreground pt-3">
        <p className="kicker">共有された録画</p>
        <p className="kicker font-mono">/{code}</p>
      </div>

      {result.kind === 'ok' ? (
        <Card className="p-4 md:p-6 space-y-4">
          <header className="space-y-1">
            <h1 className="display text-2xl font-semibold tracking-crisp">
              切り出しクリップ
            </h1>
            <p className="text-xs text-muted-foreground font-mono">
              {Math.floor(result.data.startSec / 60)}:
              {String(Math.floor(result.data.startSec % 60)).padStart(2, '0')}
              {' — '}
              {Math.floor(result.data.endSec / 60)}:
              {String(Math.floor(result.data.endSec % 60)).padStart(2, '0')}
              {' / '}
              有効期限 {new Date(result.data.expiresAt).toLocaleString('ja-JP')}
            </p>
          </header>
          <ShareVideoPlayer
            videoUrl={result.data.videoUrl}
            startSec={result.data.startSec}
            endSec={result.data.endSec}
          />
          <p className="text-xs leading-relaxed text-muted-foreground border-l-2 border-border pl-3">
            この共有リンクは送信元の担当者によって発行されています。再共有・ダウンロードは
            ご遠慮ください。法令上の機密情報を含む場合があります。
          </p>
        </Card>
      ) : result.kind === 'password_required' ? (
        <SharePasswordForm code={code} bad={result.bad ?? false} />
      ) : result.kind === 'error' ? (
        <ShareErrorView kind="unknown" />
      ) : (
        <ShareErrorView kind={result.kind} />
      )}

      <div className="flex justify-end pt-2">
        <span
          aria-hidden
          className="inline-block size-3.5 rounded-[3px] bg-cinnabar/35"
          title="落款"
        />
      </div>
    </main>
  );
}
