import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Phase1 W1 でまだ実装が無い画面用の共通プレースホルダー。
 * 設計書 02_screens の SC コードと、関連 task (T-XX) を明示する。
 */
export function PagePlaceholder({
  scCode,
  taskCode,
  title,
  description,
  helpText,
  children,
}: {
  scCode: string;
  taskCode?: string;
  title: string;
  description: string;
  helpText: string;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
          {scCode}
          {taskCode ? ` / ${taskCode}` : ''}
        </p>
        <h1 className="mt-1 text-2xl md:text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-2xl">{description}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>このページについて</CardTitle>
          <CardDescription>Phase1 進行中・近日公開予定</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
            {helpText}
          </p>
          {children}
        </CardContent>
      </Card>
    </div>
  );
}
