import { describe, expect, it } from 'vitest';
import {
  auditAction,
  generateEmbeddingsPayload,
  processBusinessCardPayload,
  processRecordingPayload,
} from './types.js';

describe('processBusinessCardPayload', () => {
  it('parses a valid payload', () => {
    const payload = {
      contactId: '11111111-1111-1111-1111-111111111111',
      imageStorageKey: 'business-cards/foo.jpg',
      uploadedBy: '22222222-2222-2222-2222-222222222222',
    };
    expect(() => processBusinessCardPayload.parse(payload)).not.toThrow();
  });

  it('rejects non-uuid contactId', () => {
    expect(() =>
      processBusinessCardPayload.parse({
        contactId: 'not-a-uuid',
        imageStorageKey: 'k',
        uploadedBy: '22222222-2222-2222-2222-222222222222',
      }),
    ).toThrow();
  });
});

describe('processRecordingPayload', () => {
  it('parses a valid payload', () => {
    expect(() =>
      processRecordingPayload.parse({
        zoomRecordingId: 'abc-123',
        meetingId: '11111111-1111-1111-1111-111111111111',
        downloadUrl: 'https://example.com/file.mp4',
        expiresAt: '2026-05-09T10:00:00.000Z',
      }),
    ).not.toThrow();
  });

  it('rejects malformed downloadUrl', () => {
    expect(() =>
      processRecordingPayload.parse({
        zoomRecordingId: 'x',
        meetingId: '11111111-1111-1111-1111-111111111111',
        downloadUrl: 'not-a-url',
        expiresAt: '2026-05-09T10:00:00.000Z',
      }),
    ).toThrow();
  });
});

describe('generateEmbeddingsPayload', () => {
  it('parses a valid payload', () => {
    expect(() =>
      generateEmbeddingsPayload.parse({
        sourceType: 'knowledge_item',
        sourceId: '11111111-1111-1111-1111-111111111111',
        chunks: [{ index: 0, text: 'hello', metadata: { lang: 'ja' } }],
      }),
    ).not.toThrow();
  });

  it('rejects unknown sourceType', () => {
    expect(() =>
      generateEmbeddingsPayload.parse({
        sourceType: 'unknown_source',
        sourceId: '11111111-1111-1111-1111-111111111111',
        chunks: [{ index: 0, text: 'x' }],
      }),
    ).toThrow();
  });

  it('rejects empty chunk text', () => {
    expect(() =>
      generateEmbeddingsPayload.parse({
        sourceType: 'knowledge_item',
        sourceId: '11111111-1111-1111-1111-111111111111',
        chunks: [{ index: 0, text: '' }],
      }),
    ).toThrow();
  });
});

describe('auditAction', () => {
  it('accepts known actions', () => {
    for (const a of [
      'view',
      'create',
      'update',
      'delete',
      'share',
      'export',
      'login',
      'admin_action',
    ]) {
      expect(() => auditAction.parse(a)).not.toThrow();
    }
  });

  it('rejects unknown actions', () => {
    expect(() => auditAction.parse('hack')).toThrow();
  });
});
