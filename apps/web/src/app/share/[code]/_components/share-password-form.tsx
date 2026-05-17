'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * 共有リンク パスワード入力フォーム。
 *
 * URL クエリ `?p=` に平文で乗せて再ナビゲーション。サーバ側で sha256 比較して
 * 一致時のみ動画 signed URL を返す。失敗時は bad=true でエラー表示。
 */
export function SharePasswordForm({ code, bad }: { code: string; bad: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  return (
    <Card className="p-6 md:p-8 space-y-5 max-w-md mx-auto w-full">
      <header className="space-y-2">
        <p className="kicker">パスワード保護</p>
        <h1 className="display text-2xl font-semibold tracking-crisp">
          パスワードを入力してください
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          このリンクには送信元によりパスワードが設定されています。受信したパスワードを
          入力すると動画が再生できます。
        </p>
      </header>

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!password.trim()) return;
          setSubmitting(true);
          // p クエリで再ナビゲーション。next/navigation で SSR を再実行させる。
          const url = new URL(window.location.href);
          url.searchParams.set('p', password);
          router.replace(`/share/${code}?${url.searchParams.toString()}`);
        }}
        noValidate
      >
        <div className="space-y-1.5">
          <Label htmlFor="share-pw">パスワード</Label>
          <Input
            id="share-pw"
            preset="password"
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            placeholder="受信したパスワード"
            autoFocus
            aria-invalid={bad}
            aria-describedby={bad ? 'share-pw-err' : undefined}
          />
        </div>
        {bad ? (
          <p
            id="share-pw-err"
            role="alert"
            className="text-xs text-destructive border-l-2 border-destructive pl-2 py-1"
          >
            パスワードが一致しません。再度ご確認ください。
          </p>
        ) : null}
        <div className="flex justify-end">
          <Button
            type="submit"
            variant="cinnabar"
            disabled={submitting || !password.trim()}
          >
            {submitting ? '確認中…' : '開く'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
