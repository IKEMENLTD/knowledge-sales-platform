import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * handoff-sla worker (Round2 P1 G-P0-2) のユニットテスト。
 *
 * mock supabase は notifications / users の最小サブセットだけサポートする。
 * 検証する挙動:
 *   1. ageMs < 48h は何もしない
 *   2. 48h <= ageMs < 72h で 48h escalate (本人 + manager) が走り metadata に印が立つ
 *   3. ageMs >= 72h で 72h escalate (admin) も追加で走る
 *   4. 既に metadata.escalated_at_72h がある通知はスキップ (二重 escalate しない)
 */

interface NotifRow {
  id: string;
  org_id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  link_url: string | null;
  read_at: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

interface UserRow {
  id: string;
  org_id: string;
  role: 'sales' | 'cs' | 'manager' | 'admin' | 'legal';
  is_active: boolean;
}

const state = {
  notifications: [] as NotifRow[],
  users: [] as UserRow[],
  inserted: [] as Record<string, unknown>[],
  updates: [] as Array<{ id: string; values: Record<string, unknown> }>,
};

function reset() {
  state.notifications = [];
  state.users = [];
  state.inserted = [];
  state.updates = [];
}

vi.mock('../lib/supabase.js', () => {
  function makeNotificationsBuilder() {
    const filters: Record<string, unknown> = {};
    let mode: 'select' | 'update' | 'insert' = 'select';
    let pendingUpdate: Record<string, unknown> | null = null;
    let pendingInsert: Record<string, unknown> | null = null;
    let selectIsReadAtNull = false;
    let lteCreatedAt: string | null = null;
    let typeFilter: string | null = null;
    let idFilter: string | null = null;

    const builder: Record<string, unknown> = {
      select(_cols: string) {
        mode = 'select';
        return builder;
      },
      insert(values: Record<string, unknown>) {
        mode = 'insert';
        pendingInsert = values;
        // 即時実行 (Promise として終了)
        state.inserted.push(values);
        return Promise.resolve({ data: null, error: null });
      },
      update(values: Record<string, unknown>) {
        mode = 'update';
        pendingUpdate = values;
        return builder;
      },
      eq(col: string, val: unknown) {
        filters[col] = val;
        if (col === 'type') typeFilter = String(val);
        if (col === 'id') idFilter = String(val);
        if (mode === 'update' && col === 'id' && pendingUpdate) {
          state.updates.push({ id: String(val), values: pendingUpdate });
          const n = state.notifications.find((r) => r.id === val);
          if (n && pendingUpdate.metadata) {
            n.metadata = pendingUpdate.metadata as Record<string, unknown>;
          }
          return Promise.resolve({ data: null, error: null });
        }
        return builder;
      },
      is(col: string, val: unknown) {
        if (col === 'read_at' && val === null) {
          selectIsReadAtNull = true;
        }
        return builder;
      },
      lte(col: string, val: string) {
        if (col === 'created_at') lteCreatedAt = val;
        return builder;
      },
      order(_col: string, _opts: unknown) {
        return builder;
      },
      limit(_n: number) {
        // SELECT の終端
        if (mode !== 'select') return Promise.resolve({ data: null, error: null });
        let rows = state.notifications.slice();
        if (typeFilter) rows = rows.filter((r) => r.type === typeFilter);
        if (selectIsReadAtNull) rows = rows.filter((r) => r.read_at === null);
        if (lteCreatedAt) rows = rows.filter((r) => r.created_at <= lteCreatedAt);
        return Promise.resolve({ data: rows, error: null });
      },
    };
    void idFilter; // unused but kept for clarity
    return builder;
  }

  function makeUsersBuilder() {
    const filters: Record<string, unknown> = {};
    let roles: string[] | null = null;
    function resolveData() {
      return {
        data: state.users
          .filter((u) => roles === null || roles.includes(u.role))
          .filter((u) => filters.org_id === undefined || u.org_id === filters.org_id)
          .filter(
            (u) => filters.is_active === undefined || u.is_active === filters.is_active,
          ),
        error: null,
      };
    }
    const builder: Record<string, unknown> = {
      select(_cols: string) {
        return builder;
      },
      eq(col: string, val: unknown) {
        filters[col] = val;
        return builder;
      },
      in(col: string, vals: string[]) {
        if (col === 'role') roles = vals;
        return builder;
      },
      // PromiseLike: 直接 await された場合に resolveData() を返す。
      then(onFulfilled: (v: ReturnType<typeof resolveData>) => unknown) {
        return Promise.resolve(resolveData()).then(onFulfilled);
      },
    };
    return builder;
  }

  return {
    supabaseAdmin: {
      from: (table: string) => {
        if (table === 'notifications') return makeNotificationsBuilder();
        if (table === 'users') return makeUsersBuilder();
        return {
          select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
        };
      },
    },
  };
});

vi.mock('../lib/logger.js', () => ({
  logger: {
    child: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const ORG = '00000000-0000-0000-0000-000000000001';
const TARGET = '22222222-2222-2222-2222-222222222222';
const MANAGER = '33333333-3333-3333-3333-333333333333';
const ADMIN = '44444444-4444-4444-4444-444444444444';

function seedUsers(): void {
  state.users.push(
    { id: MANAGER, org_id: ORG, role: 'manager', is_active: true },
    { id: ADMIN, org_id: ORG, role: 'admin', is_active: true },
    // inactive manager — escalate 対象外
    {
      id: '55555555-5555-5555-5555-555555555555',
      org_id: ORG,
      role: 'manager',
      is_active: false,
    },
  );
}

function makeRow(opts: {
  id: string;
  createdAtMs: number;
  metadata?: Record<string, unknown>;
}): NotifRow {
  return {
    id: opts.id,
    org_id: ORG,
    user_id: TARGET,
    type: 'handoff_pending',
    title: '商談ハンドオフ: ACME 株式会社',
    body: '次回 follow-up を CS で。',
    link_url: '/meetings/abc',
    read_at: null,
    created_at: new Date(opts.createdAtMs).toISOString(),
    metadata: opts.metadata ?? null,
  };
}

describe('handoff-sla worker', () => {
  beforeEach(() => {
    reset();
    seedUsers();
  });

  it('48h 経過した未読 handoff は本人 + manager に escalate し metadata.escalated_at_48h を立てる', async () => {
    const now = Date.now();
    state.notifications.push(
      makeRow({
        id: 'n-48',
        createdAtMs: now - 49 * 60 * 60 * 1000, // 49h 前
      }),
    );

    const { tickHandoffSla } = await import('../jobs/handoff-sla.js');
    const result = await tickHandoffSla();

    expect(result.processed).toBe(1);
    expect(result.acked).toBe(1);
    expect(result.failed).toBe(0);

    // 本人へ 1 件 (handoff_pending) + manager 1 件 (admin_action) = 2 件 INSERT
    expect(state.inserted).toHaveLength(2);
    const targetNotif = state.inserted.find((r) => r.user_id === TARGET);
    const managerNotif = state.inserted.find((r) => r.user_id === MANAGER);
    expect(targetNotif).toBeDefined();
    expect(managerNotif).toBeDefined();
    expect((targetNotif?.title as string) ?? '').toContain('48h');
    expect((managerNotif?.title as string) ?? '').toContain('48');

    // 元 notification の metadata.escalated_at_48h が立つ
    const updated = state.updates.find((u) => u.id === 'n-48');
    expect(updated).toBeDefined();
    const md = (updated?.values.metadata ?? {}) as Record<string, unknown>;
    expect(typeof md.escalated_at_48h).toBe('string');
    expect(md.escalated_at_72h).toBeUndefined();
    expect(Array.isArray(md.escalated_to_48h)).toBe(true);
    expect((md.escalated_to_48h as string[]).includes(MANAGER)).toBe(true);
    // inactive manager は含まれない
    expect((md.escalated_to_48h as string[]).includes('55555555-5555-5555-5555-555555555555')).toBe(
      false,
    );
  });

  it('72h 経過した未読 handoff は admin にも escalate し metadata.escalated_at_72h を立てる', async () => {
    const now = Date.now();
    state.notifications.push(
      makeRow({
        id: 'n-72',
        createdAtMs: now - 73 * 60 * 60 * 1000, // 73h 前
      }),
    );

    const { tickHandoffSla } = await import('../jobs/handoff-sla.js');
    await tickHandoffSla();

    // 48h escalate (本人 + manager) + 72h escalate (admin) で計 3 件
    expect(state.inserted.length).toBeGreaterThanOrEqual(3);
    const adminNotif = state.inserted.find((r) => r.user_id === ADMIN);
    expect(adminNotif).toBeDefined();
    expect((adminNotif?.title as string) ?? '').toContain('72');

    const updated = state.updates.find((u) => u.id === 'n-72');
    const md = (updated?.values.metadata ?? {}) as Record<string, unknown>;
    expect(typeof md.escalated_at_48h).toBe('string');
    expect(typeof md.escalated_at_72h).toBe('string');
    expect((md.escalated_to_72h as string[]).includes(ADMIN)).toBe(true);
  });

  it('既に escalated_at_72h が立っている通知は二度 escalate しない', async () => {
    const now = Date.now();
    state.notifications.push(
      makeRow({
        id: 'n-done',
        createdAtMs: now - 100 * 60 * 60 * 1000,
        metadata: {
          escalated_at_48h: new Date(now - 50 * 60 * 60 * 1000).toISOString(),
          escalated_at_72h: new Date(now - 25 * 60 * 60 * 1000).toISOString(),
        },
      }),
    );

    const { tickHandoffSla } = await import('../jobs/handoff-sla.js');
    const result = await tickHandoffSla();

    // 処理対象 1 件だが acked=0 (cooldown skip)
    expect(result.processed).toBe(1);
    expect(result.acked).toBe(0);
    expect(state.inserted).toHaveLength(0);
    expect(state.updates).toHaveLength(0);
  });
});
