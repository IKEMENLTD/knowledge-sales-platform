import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  computeUrlValidationToken,
  verifyZoomSignature,
} from '../lib/zoom-webhook.js';

const CURRENT = 'zoom-webhook-current';
const PREVIOUS = 'zoom-webhook-previous';

function sign(secret: string, ts: string, body: string): string {
  const hash = createHmac('sha256', secret).update(`v0:${ts}:${body}`).digest('hex');
  return `v0=${hash}`;
}

describe('verifyZoomSignature', () => {
  const now = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({ event: 'recording.completed', payload: { object: { id: '123' } } });

  it('returns true on valid HMAC with current secret', () => {
    const ts = String(now);
    const sig = sign(CURRENT, ts, body);
    const ok = verifyZoomSignature({
      signatureHeader: sig,
      timestampHeader: ts,
      rawBody: body,
      secrets: [CURRENT],
      nowSeconds: now,
    });
    expect(ok).toBe(true);
  });

  it('returns false on invalid HMAC', () => {
    const ts = String(now);
    const sig = sign('wrong-secret', ts, body);
    const ok = verifyZoomSignature({
      signatureHeader: sig,
      timestampHeader: ts,
      rawBody: body,
      secrets: [CURRENT],
      nowSeconds: now,
    });
    expect(ok).toBe(false);
  });

  it('rejects timestamps older than 5 minutes', () => {
    const old = now - 301;
    const ts = String(old);
    const sig = sign(CURRENT, ts, body);
    const ok = verifyZoomSignature({
      signatureHeader: sig,
      timestampHeader: ts,
      rawBody: body,
      secrets: [CURRENT],
      nowSeconds: now,
    });
    expect(ok).toBe(false);
  });

  it('rejects timestamps in the future beyond 5 minutes', () => {
    const future = now + 301;
    const ts = String(future);
    const sig = sign(CURRENT, ts, body);
    const ok = verifyZoomSignature({
      signatureHeader: sig,
      timestampHeader: ts,
      rawBody: body,
      secrets: [CURRENT],
      nowSeconds: now,
    });
    expect(ok).toBe(false);
  });

  it('accepts within ±5 minutes window edge', () => {
    const edge = now - 299;
    const ts = String(edge);
    const sig = sign(CURRENT, ts, body);
    const ok = verifyZoomSignature({
      signatureHeader: sig,
      timestampHeader: ts,
      rawBody: body,
      secrets: [CURRENT],
      nowSeconds: now,
    });
    expect(ok).toBe(true);
  });

  it('returns false when signature header is missing', () => {
    const ok = verifyZoomSignature({
      signatureHeader: null,
      timestampHeader: String(now),
      rawBody: body,
      secrets: [CURRENT],
      nowSeconds: now,
    });
    expect(ok).toBe(false);
  });

  it('returns false when timestamp header is missing', () => {
    const ok = verifyZoomSignature({
      signatureHeader: sign(CURRENT, String(now), body),
      timestampHeader: null,
      rawBody: body,
      secrets: [CURRENT],
      nowSeconds: now,
    });
    expect(ok).toBe(false);
  });

  it('returns false when timestamp header is non-numeric', () => {
    const ok = verifyZoomSignature({
      signatureHeader: sign(CURRENT, 'NaN', body),
      timestampHeader: 'NaN',
      rawBody: body,
      secrets: [CURRENT],
      nowSeconds: now,
    });
    expect(ok).toBe(false);
  });

  describe('secret rotation (90日 dual-window)', () => {
    it('accepts signature signed with previous secret while current is rotated', () => {
      const ts = String(now);
      const sig = sign(PREVIOUS, ts, body);
      const ok = verifyZoomSignature({
        signatureHeader: sig,
        timestampHeader: ts,
        rawBody: body,
        secrets: [CURRENT, PREVIOUS],
        nowSeconds: now,
      });
      expect(ok).toBe(true);
    });

    it('still accepts signature signed with current secret during rotation window', () => {
      const ts = String(now);
      const sig = sign(CURRENT, ts, body);
      const ok = verifyZoomSignature({
        signatureHeader: sig,
        timestampHeader: ts,
        rawBody: body,
        secrets: [CURRENT, PREVIOUS],
        nowSeconds: now,
      });
      expect(ok).toBe(true);
    });

    it('rejects signature when neither secret matches', () => {
      const ts = String(now);
      const sig = sign('other-secret', ts, body);
      const ok = verifyZoomSignature({
        signatureHeader: sig,
        timestampHeader: ts,
        rawBody: body,
        secrets: [CURRENT, PREVIOUS],
        nowSeconds: now,
      });
      expect(ok).toBe(false);
    });

    it('returns false when no secrets are configured', () => {
      const ts = String(now);
      const sig = sign(CURRENT, ts, body);
      const ok = verifyZoomSignature({
        signatureHeader: sig,
        timestampHeader: ts,
        rawBody: body,
        secrets: [],
        nowSeconds: now,
      });
      expect(ok).toBe(false);
    });
  });
});

describe('computeUrlValidationToken', () => {
  it('matches Zoom-style HMAC-SHA256 of plainToken', () => {
    const plain = 'abc123';
    const expected = createHmac('sha256', CURRENT).update(plain).digest('hex');
    const got = computeUrlValidationToken(plain, CURRENT);
    expect(got).toBe(expected);
  });

  it('produces stable output for the same input', () => {
    const plain = 'stable-token';
    const a = computeUrlValidationToken(plain, CURRENT);
    const b = computeUrlValidationToken(plain, CURRENT);
    expect(a).toBe(b);
  });

  it('changes when secret changes (rotation)', () => {
    const plain = 'rotated';
    const a = computeUrlValidationToken(plain, CURRENT);
    const b = computeUrlValidationToken(plain, PREVIOUS);
    expect(a).not.toBe(b);
  });
});
