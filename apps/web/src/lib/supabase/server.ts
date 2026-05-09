import { type CookieOptions, createServerClient as create } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function createServerClient() {
  const cookieStore = await cookies();
  return create(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet: CookieToSet[]) => {
        try {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component から呼ばれた場合は middleware が後でセッション更新する
        }
      },
    },
  });
}
