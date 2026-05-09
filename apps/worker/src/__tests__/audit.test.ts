import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * appendAudit() のユニットテスト。
 *
 * supabase mock は idempotency.test.ts と同じ「method-chain ビルダ」パターン。
 * audit_logs.insert(...).select('id').maybeSingle() を支える最小限のチェーンと、
 * 失敗ケース (テーブル不在 / unique violation) を切り替えられる挙動を実装する。
 */

interface MockState {
  inserted: Array<Record<string, unknown>>;
  /** insert 時に返すエラー (null = 成功) */
  insertError: { code?: string; message: string } | null;
  /** maybeSingle 時に返す row id */
  returnId: string | null;
}

const state: MockState = {
  inserted: [],
  insertError: null,
  returnId: null,
};

vi.mock('../lib/supabase.js', () => {
  function makeBuilder(table: string) {
    let pendingInsert: Record<string, unknown> | null = null;
    let tableMissing = false;
    const builder: Record<string, unknown> = {
      insert(values: Record<string, unknown>) {
        pendingInsert = values;
        if (table !== 'audit_logs') {
          tableMissing = true;
        } else if (!state.insertError) {
          state.inserted.push(values);
        }
        return builder;
      },
      select(_: string) {
        return builder;
      },
      maybeSingle() {
        if (tableMissing) {
          return Promise.resolve({
            data: null,
            error: { code: '42P01', message: 'no table' },
          });
        }
        if (state.insertError) {
          return Promise.resolve({ data: null, error: state.insertError });
        }
        if (!pendingInsert) {
          return Promise.resolve({ data: null, error: null });
        }
        return Promise.resolve({
          data: state.returnId ? { id: state.returnId } : { id: null },
          error: null,
        });
      },
    };
    return builder;
  }

  return {
    supabaseAdmin: {
      from: (table: string) => makeBuilder(table),
    },
  };
});

describe('appendAudit', () => {
  beforeEach(() => {
    state.inserted = [];
    state.insertError = null;
    state.returnId = '11111111-1111-1111-1111-111111111111';
  });

  it('inserts row with required fields and returns the new id', async () => {
    const { appendAudit } = await import('../lib/audit.js');
    const res = await appendAudit({
      orgId: '00000000-0000-0000-0000-000000000001',
      actorUserId: '22222222-2222-2222-2222-222222222222',
      action: 'create',
      resourceType: 'recording',
      resourceId: '33333333-3333-3333-3333-333333333333',
      payload: { test: true },
      ipAddress: '127.0.0.1',
      userAgent: 'vitest',
    });

    expect(res.error).toBeNull();
    expect(res.id).toBe('11111111-1111-1111-1111-111111111111');
    expect(state.inserted).toHaveLength(1);

    const row = state.inserted[0];
    expect(row).toBeDefined();
    if (!row) return;
    expect(row.org_id).toBe('00000000-0000-0000-0000-000000000001');
    expect(row.action).toBe('create');
    expect(row.resource_type).toBe('recording');
    expect(row.resource_id).toBe('33333333-3333-3333-3333-333333333333');
    expect(row.actor_user_id).toBe('22222222-2222-2222-2222-222222222222');
    expect(row.ip_address).toBe('127.0.0.1');
    expect(row.user_agent).toBe('vitest');
    // hash chain trigger 用 placeholder。実 DB では trigger が上書きする。
    expect(row.row_hash).toBe('pending');
  });

  it('omits optional fields cleanly when not provided', async () => {
    const { appendAudit } = await import('../lib/audit.js');
    const res = await appendAudit({
      orgId: '00000000-0000-0000-0000-000000000001',
      actorUserId: null,
      action: 'admin_action',
      resourceType: 'webhook',
    });

    expect(res.error).toBeNull();
    const row = state.inserted[0];
    expect(row).toBeDefined();
    if (!row) return;
    // actorUserId=null, resourceId/payload/ip/ua 未指定 → row には含まれない
    expect(row.actor_user_id).toBeUndefined();
    expect(row.resource_id).toBeUndefined();
    expect(row.payload).toBeUndefined();
    expect(row.ip_address).toBeUndefined();
    expect(row.user_agent).toBeUndefined();
  });

  it('returns {id:null,error} on supabase error and does not throw', async () => {
    state.insertError = { code: '23505', message: 'duplicate row_hash' };
    const { appendAudit } = await import('../lib/audit.js');
    const res = await appendAudit({
      orgId: '00000000-0000-0000-0000-000000000001',
      actorUserId: null,
      action: 'view',
      resourceType: 'meeting',
    });

    expect(res.id).toBeNull();
    expect(res.error).toContain('duplicate');
    // 失敗時は state.inserted は増えない
    expect(state.inserted).toHaveLength(0);
  });
});
