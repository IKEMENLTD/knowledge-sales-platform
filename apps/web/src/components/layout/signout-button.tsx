'use client';

import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';
import { useFormStatus } from 'react-dom';

/** form action={signOut} 用の SubmitButton。pending 時に disabled + aria-busy。 */
export function SignOutButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="ghost"
      size="sm"
      disabled={pending}
      aria-busy={pending}
      aria-label="サインアウト"
      className="gap-1.5 text-muted-foreground hover:text-foreground"
    >
      <LogOut aria-hidden strokeWidth={1.6} />
      <span className="hidden sm:inline">サインアウト</span>
    </Button>
  );
}
