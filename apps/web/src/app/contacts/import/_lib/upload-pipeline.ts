/**
 * Business card upload pipeline (client side).
 *
 * 5 ステップ (各ステップは onProgress で進捗を返す):
 *   1. sha256 ハッシュ計算 (重複検知 + ストレージキー作成のため)
 *   2. EXIF 剥離 + canvas 経由で再描画 (GPS / Maker note 完全削除)
 *   3. 長辺 2048 にリサイズ (4MB 超を 1MB 以下にする目安)
 *   4. /api/contacts/upload-url で署名 URL 取得
 *   5. PUT で Storage に直接アップロード
 *   6. /api/contacts に register 通知 → contact_id 返却
 *
 * 設計原則:
 *  - すべて純関数 (React 依存ゼロ)。テスト容易性のため
 *  - SHA-256 は剥離 & resize "後" の blob で計算する (Storage 中身と一致させる)
 *  - duplicateOf が返れば即時 short-circuit して PUT を skip しても良いが、
 *    本実装では UX 上 PUT を完了させ "register 時" にも duplicateOf を返す前提
 *    (PUT 失敗のリスクを考慮し、UI 側は register の duplicateOf を採用する)
 */

import {
  type BusinessCardUploadRequest,
  type BusinessCardUploadResponse,
  type ContactRegisterRequest,
  type ContactRegisterResponse,
  businessCardUploadResponseSchema,
  contactRegisterResponseSchema,
} from '@ksp/shared';

// ---------------------------------------------------------------------------
// 0. 型と定数
// ---------------------------------------------------------------------------

export type UploadStage =
  | 'preparing' // sha256 + exif + resize
  | 'requesting' // POST /api/contacts/upload-url
  | 'uploading' // PUT signed url
  | 'registering' // POST /api/contacts
  | 'done'
  | 'failed';

export interface UploadProgress {
  stage: UploadStage;
  /** 0-100 で連続値。stage 進行 + putToSignedUrl の bytes 進捗を合成 */
  percent: number;
  message?: string;
}

export interface UploadOneResult {
  contactId: string;
  duplicateOf: string | null;
  enqueuedForOcr: boolean;
  /** UI が後で URL.revokeObjectURL するため、生成済みなら返す */
  processedSize: number;
  processedContentType: 'image/jpeg' | 'image/png' | 'image/webp';
}

export class UploadPipelineError extends Error {
  constructor(
    message: string,
    public readonly stage: UploadStage,
    public override readonly cause?: unknown,
    /**
     * "API 未準備" を示す軽量フラグ。UI 側で赤エラーではなく cinnabar/15 の
     * "アップロード先がまだ準備中です" 表示に切り替えるため。
     */
    public readonly endpointUnavailable: boolean = false,
  ) {
    super(message);
    this.name = 'UploadPipelineError';
  }
}

const MAX_EDGE_DEFAULT = 2048;
const REGISTER_MAX_RETRIES = 2;

// ---------------------------------------------------------------------------
// 1. SHA-256
// ---------------------------------------------------------------------------

export async function computeSha256(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return bytesToHex(new Uint8Array(digest));
}

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] ?? 0;
    out += b.toString(16).padStart(2, '0');
  }
  return out;
}

// ---------------------------------------------------------------------------
// 2. EXIF strip (exifr + canvas 二段)
// ---------------------------------------------------------------------------

/**
 * EXIF / GPS / コメント / Maker note を完全に剥離する。
 *
 * 一段目: exifr.gps の存在チェック (副作用無し、診断用)
 * 二段目: <canvas> に再描画 → toBlob で吐き直す。
 *         これで EXIF + ICC profile + コメントが全て落ちる。
 *
 * 失敗時は元 file をそのまま返さず throw する (privacy guarantee のため)。
 */
export async function stripExif(file: File | Blob): Promise<Blob> {
  // canvas 経由で再描画するだけで EXIF は剥がれる。
  // exifr は意図せず import すると bundle 肥大するので動的 import。
  // ただし HEIC は canvas が直接デコードできない端末あり → JPEG に統一する。
  const bitmap = await safeCreateImageBitmap(file);
  const canvas = makeCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new UploadPipelineError('canvas 2D context が取得できません', 'preparing');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();

  // HEIC / その他は JPEG に統一して圧縮率を稼ぐ。
  // PNG は透過レイヤを残す意味が無い (名刺) ので JPEG 化する。
  const outType = pickOutputType(file);
  const blob = await canvasToBlob(canvas, outType, outType === 'image/jpeg' ? 0.92 : undefined);
  return blob;
}

function pickOutputType(file: File | Blob): 'image/jpeg' | 'image/webp' | 'image/png' {
  const t = (file as File).type;
  if (t === 'image/png') return 'image/png';
  if (t === 'image/webp') return 'image/webp';
  // jpeg / heic / 不明は全て JPEG に統一
  return 'image/jpeg';
}

async function safeCreateImageBitmap(file: File | Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file);
  } catch (err) {
    throw new UploadPipelineError(
      '画像をデコードできませんでした。形式を確認してください。',
      'preparing',
      err,
    );
  }
}

function makeCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(w, h);
  }
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

async function canvasToBlob(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  type: 'image/jpeg' | 'image/webp' | 'image/png',
  quality?: number,
): Promise<Blob> {
  if (canvas instanceof OffscreenCanvas) {
    return await canvas.convertToBlob({ type, quality });
  }
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new UploadPipelineError('canvas → blob 変換に失敗', 'preparing'));
      },
      type,
      quality,
    );
  });
}

// ---------------------------------------------------------------------------
// 3. リサイズ (長辺 2048)
// ---------------------------------------------------------------------------

export async function clientResize(
  blob: Blob,
  maxEdge = MAX_EDGE_DEFAULT,
): Promise<{ blob: Blob; contentType: 'image/jpeg' | 'image/png' | 'image/webp' }> {
  const bitmap = await safeCreateImageBitmap(blob);
  const longest = Math.max(bitmap.width, bitmap.height);
  if (longest <= maxEdge) {
    // すでに十分小さい → そのまま blob を返す。
    // ただし contentType は元 blob を尊重 (stripExif 後の出力に揃える)。
    bitmap.close?.();
    const type = blob.type as 'image/jpeg' | 'image/png' | 'image/webp';
    return {
      blob,
      contentType:
        type === 'image/png' ? 'image/png' : type === 'image/webp' ? 'image/webp' : 'image/jpeg',
    };
  }
  const scale = maxEdge / longest;
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new UploadPipelineError('canvas 2D context が取得できません', 'preparing');
  // 縮小は image-rendering smooth で十分。bilinear で OCR 品質を維持。
  if ('imageSmoothingEnabled' in ctx) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const outType: 'image/jpeg' | 'image/webp' | 'image/png' =
    blob.type === 'image/png'
      ? 'image/png'
      : blob.type === 'image/webp'
        ? 'image/webp'
        : 'image/jpeg';
  const out = await canvasToBlob(canvas, outType, outType === 'image/jpeg' ? 0.9 : undefined);
  return { blob: out, contentType: outType };
}

// ---------------------------------------------------------------------------
// 4. /api/contacts/upload-url
// ---------------------------------------------------------------------------

export async function requestUploadUrl(
  req: BusinessCardUploadRequest,
  opts: { idempotencyKey: string; signal?: AbortSignal } = { idempotencyKey: crypto.randomUUID() },
): Promise<BusinessCardUploadResponse> {
  const res = await safeFetch('/api/contacts/upload-url', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': opts.idempotencyKey,
    },
    body: JSON.stringify(req),
    signal: opts.signal,
  });
  if (res === 'endpoint_unavailable') {
    throw new UploadPipelineError('アップロード先がまだ準備中です', 'requesting', undefined, true);
  }
  if (!res.ok) {
    const text = await safeText(res);
    throw new UploadPipelineError(`署名 URL の取得に失敗 (${res.status}): ${text}`, 'requesting');
  }
  const json = await res.json();
  const parsed = businessCardUploadResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new UploadPipelineError('サーバ応答の形式が想定外でした', 'requesting', parsed.error);
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------
// 5. PUT signed url
// ---------------------------------------------------------------------------

export async function putToSignedUrl(
  url: string,
  blob: Blob,
  uploadToken: string,
  opts: { signal?: AbortSignal; onProgress?: (loaded: number, total: number) => void } = {},
): Promise<void> {
  // fetch には byte 単位の progress API が無いので、サイズが大きいときだけ
  // XHR にフォールバックする。256KB 以下なら progress 不要。
  if (opts.onProgress && blob.size > 256 * 1024) {
    await putViaXhr(url, blob, uploadToken, opts);
    return;
  }
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'content-type': blob.type || 'application/octet-stream',
      authorization: `Bearer ${uploadToken}`,
    },
    body: blob,
    signal: opts.signal,
  });
  if (!res.ok) {
    const text = await safeText(res);
    throw new UploadPipelineError(`ストレージへの送信に失敗 (${res.status}): ${text}`, 'uploading');
  }
  opts.onProgress?.(blob.size, blob.size);
}

function putViaXhr(
  url: string,
  blob: Blob,
  uploadToken: string,
  opts: { signal?: AbortSignal; onProgress?: (loaded: number, total: number) => void },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    xhr.setRequestHeader('content-type', blob.type || 'application/octet-stream');
    xhr.setRequestHeader('authorization', `Bearer ${uploadToken}`);
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && opts.onProgress) {
        opts.onProgress(ev.loaded, ev.total);
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(
          new UploadPipelineError(
            `ストレージへの送信に失敗 (${xhr.status}): ${xhr.responseText.slice(0, 200)}`,
            'uploading',
          ),
        );
      }
    };
    xhr.onerror = () => reject(new UploadPipelineError('ネットワークエラー (PUT)', 'uploading'));
    xhr.onabort = () =>
      reject(new UploadPipelineError('アップロードがキャンセルされました', 'uploading'));
    if (opts.signal) {
      if (opts.signal.aborted) {
        xhr.abort();
        return;
      }
      opts.signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }
    xhr.send(blob);
  });
}

// ---------------------------------------------------------------------------
// 6. /api/contacts (register)
// ---------------------------------------------------------------------------

export async function registerContact(
  req: ContactRegisterRequest,
  opts: { idempotencyKey: string; signal?: AbortSignal },
): Promise<ContactRegisterResponse> {
  // 軽い retry: 502/503/504/429 のみ 2 回まで、指数バックオフ。
  let lastErr: unknown;
  for (let attempt = 0; attempt <= REGISTER_MAX_RETRIES; attempt++) {
    try {
      const res = await safeFetch('/api/contacts', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': opts.idempotencyKey,
        },
        body: JSON.stringify(req),
        signal: opts.signal,
      });
      if (res === 'endpoint_unavailable') {
        throw new UploadPipelineError(
          'アップロード先がまだ準備中です',
          'registering',
          undefined,
          true,
        );
      }
      if (res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504) {
        if (attempt < REGISTER_MAX_RETRIES) {
          await delay(300 * 2 ** attempt);
          continue;
        }
      }
      if (!res.ok) {
        const text = await safeText(res);
        throw new UploadPipelineError(`登録に失敗 (${res.status}): ${text}`, 'registering');
      }
      const json = await res.json();
      const parsed = contactRegisterResponseSchema.safeParse(json);
      if (!parsed.success) {
        throw new UploadPipelineError(
          'サーバ応答の形式が想定外でした',
          'registering',
          parsed.error,
        );
      }
      return parsed.data;
    } catch (err) {
      lastErr = err;
      if (err instanceof UploadPipelineError && err.endpointUnavailable) throw err;
      // AbortError は即 throw
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      if (attempt >= REGISTER_MAX_RETRIES) break;
      await delay(300 * 2 ** attempt);
    }
  }
  if (lastErr instanceof UploadPipelineError) throw lastErr;
  throw new UploadPipelineError('登録に失敗しました', 'registering', lastErr);
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// 7. uploadOne (高レベル orchestrator)
// ---------------------------------------------------------------------------

export interface UploadOneOptions {
  signal?: AbortSignal;
  onProgress?: (p: UploadProgress) => void;
  /** 既定 2048。テスト用に注入可能 */
  maxEdge?: number;
  /** Idempotency key 生成器 (テスト用) */
  makeIdempotencyKey?: () => string;
}

export async function uploadOne(file: File, opts: UploadOneOptions = {}): Promise<UploadOneResult> {
  const onProgress = opts.onProgress ?? (() => {});
  const makeKey = opts.makeIdempotencyKey ?? (() => crypto.randomUUID());

  try {
    onProgress({ stage: 'preparing', percent: 2, message: '画像を整えています' });

    // 1. EXIF 剥離 + 2. リサイズ
    const stripped = await stripExif(file);
    if (opts.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    onProgress({ stage: 'preparing', percent: 12, message: '位置情報を削除しました' });

    const { blob: processed, contentType } = await clientResize(
      stripped,
      opts.maxEdge ?? MAX_EDGE_DEFAULT,
    );
    if (opts.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    onProgress({ stage: 'preparing', percent: 22, message: 'サイズを最適化しました' });

    // 3. SHA-256 (送る blob と一致させるため、最終 blob で計算)
    const contentSha256 = await computeSha256(processed);
    if (opts.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    onProgress({ stage: 'preparing', percent: 30, message: 'ハッシュを計算しました' });

    // 4. 署名 URL
    onProgress({ stage: 'requesting', percent: 34, message: '送信先を準備しています' });
    const idemUploadUrl = makeKey();
    const signed = await requestUploadUrl(
      {
        fileName: file.name.slice(0, 256),
        contentSha256,
        contentType,
        contentLength: processed.size,
      },
      { idempotencyKey: idemUploadUrl, signal: opts.signal },
    );
    onProgress({ stage: 'requesting', percent: 42, message: '送信先が決まりました' });

    // 5. PUT
    onProgress({ stage: 'uploading', percent: 46, message: '送信中' });
    await putToSignedUrl(signed.uploadUrl, processed, signed.uploadToken, {
      signal: opts.signal,
      onProgress: (loaded, total) => {
        // 46 → 86 を PUT に割り当てる
        const pct = 46 + Math.round((loaded / Math.max(1, total)) * 40);
        onProgress({
          stage: 'uploading',
          percent: Math.min(86, pct),
          message: '送信中',
        });
      },
    });
    onProgress({ stage: 'uploading', percent: 88, message: '送信完了' });

    // 6. register
    onProgress({ stage: 'registering', percent: 90, message: '登録しています' });
    const idemRegister = makeKey();
    const registered = await registerContact(
      {
        storageKey: signed.storageKey,
        contentSha256,
      },
      { idempotencyKey: idemRegister, signal: opts.signal },
    );

    onProgress({ stage: 'done', percent: 100, message: '完了' });
    return {
      contactId: registered.contactId,
      duplicateOf: registered.duplicateOf,
      enqueuedForOcr: registered.enqueuedForOcr,
      processedSize: processed.size,
      processedContentType: contentType,
    };
  } catch (err) {
    if (err instanceof UploadPipelineError) {
      onProgress({ stage: 'failed', percent: 0, message: err.message });
      throw err;
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      onProgress({ stage: 'failed', percent: 0, message: 'キャンセルしました' });
      throw err;
    }
    onProgress({
      stage: 'failed',
      percent: 0,
      message: err instanceof Error ? err.message : '不明なエラー',
    });
    throw new UploadPipelineError(
      err instanceof Error ? err.message : '不明なエラー',
      'failed',
      err,
    );
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/**
 * fetch ラッパ。404/Network エラーを "endpoint_unavailable" sentinel に正規化する。
 * UI は赤エラーではなく cinnabar/15 の "準備中" 帯で表示するため。
 */
async function safeFetch(
  input: RequestInfo,
  init?: RequestInit,
): Promise<Response | 'endpoint_unavailable'> {
  try {
    const res = await fetch(input, init);
    if (res.status === 404) return 'endpoint_unavailable';
    return res;
  } catch (err) {
    // AbortError は素通り
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    // TypeError: Failed to fetch (ネットワーク断 or API 未デプロイ) は endpoint 未準備扱い
    if (err instanceof TypeError) return 'endpoint_unavailable';
    throw err;
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    const text = await res.text();
    return text.slice(0, 240);
  } catch {
    return '';
  }
}
