import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { MalwareScanStatus } from './malware-scan';
export { storageAdapterStatus } from './storage-status';
export type { MalwareScanStatus } from './malware-scan';

const allowedTypes = new Map([
  ['application/pdf', '.pdf'],
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['text/plain', '.txt']
]);

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
/** Bounded so a slow or hostile scanner can never hold an upload request open indefinitely. */
export const MALWARE_SCAN_TIMEOUT_MS = 20_000;
/** The scanner contract is a small JSON verdict; refuse anything larger instead of buffering it. */
export const MAX_SCANNER_RESPONSE_BYTES = 64 * 1024;
/** Cloudmersive's documented virus-scan endpoint, fixed in code so no endpoint URL is configurable. */
export const CLOUDMERSIVE_SCAN_URL = 'https://api.cloudmersive.com/virus/scan/file';

export function privateStorageRoot() {
  if ((process.env.STORAGE_PROVIDER ?? 'local') !== 'local') throw new Error('STORAGE_PROVIDER_UNSUPPORTED');
  const root = process.env.PRIVATE_STORAGE_PATH
    ? resolve(/*turbopackIgnore: true*/ process.env.PRIVATE_STORAGE_PATH)
    : resolve(/*turbopackIgnore: true*/ process.cwd(), 'storage', 'private');
  const publicRoot = resolve(/*turbopackIgnore: true*/ process.cwd(), 'public');
  if (root === publicRoot || root.startsWith(`${publicRoot}${sep}`)) throw new Error('PRIVATE_STORAGE_PATH must be outside the public web root.');
  return root;
}

function s3Configuration() {
  const region = process.env.STORAGE_REGION;
  const bucket = process.env.STORAGE_BUCKET;
  const accessKeyId = process.env.STORAGE_ACCESS_KEY;
  const secretAccessKey = process.env.STORAGE_SECRET_KEY;
  if (!region || !bucket || !accessKeyId || !secretAccessKey) throw new Error('STORAGE_NOT_CONFIGURED');
  return { region, bucket, accessKeyId, secretAccessKey, endpoint: process.env.STORAGE_ENDPOINT || undefined, forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE === 'true' };
}

function s3Client() {
  const configuration = s3Configuration();
  return { client: new S3Client({ region: configuration.region, endpoint: configuration.endpoint, forcePathStyle: configuration.forcePathStyle, credentials: { accessKeyId: configuration.accessKeyId, secretAccessKey: configuration.secretAccessKey } }), bucket: configuration.bucket };
}

async function writeObject(storageKey: string, bytes: Buffer, mimeType: string) {
  if ((process.env.STORAGE_PROVIDER ?? 'local') === 'local') {
    const target = safeStorageTarget(storageKey);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes, { flag: 'wx' });
    return;
  }
  if (process.env.STORAGE_PROVIDER !== 's3') throw new Error('STORAGE_PROVIDER_UNSUPPORTED');
  const { client, bucket } = s3Client();
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: storageKey, Body: bytes, ContentType: mimeType, ServerSideEncryption: 'AES256' }));
}

export function sanitiseDisplayName(name: string) {
  return name.replace(/[\\/\0\r\n]/g, '').replace(/\.\.+/g, '.').replace(/[^\p{L}\p{N}._ -]/gu, '').trim().slice(0, 160) || 'document';
}

export function validateDocumentUpload(file: File) {
  const extension = extname(file.name).toLowerCase();
  const expectedExtension = allowedTypes.get(file.type);
  if (!expectedExtension || extension !== expectedExtension) throw new Error('Unsupported file type. Upload a PDF, PNG, JPG, or TXT file with the correct extension.');
  if (file.size <= 0 || file.size > MAX_DOCUMENT_BYTES) throw new Error('Files must be smaller than 10 MB.');
}

function validateFileSignature(bytes: Buffer, mimeType: string) {
  if (mimeType === 'application/pdf' && bytes.subarray(0, 5).toString() !== '%PDF-') throw new Error('The PDF signature could not be verified.');
  if (mimeType === 'image/png' && bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('The PNG signature could not be verified.');
  if (mimeType === 'image/jpeg' && bytes.subarray(0, 3).toString('hex') !== 'ffd8ff') throw new Error('The JPG signature could not be verified.');
  if (mimeType === 'text/plain') {
    if (bytes.includes(0)) throw new Error('The text document contains binary data.');
    try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw new Error('The text document is not valid UTF-8.'); }
  }
}

export function sha256Bytes(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Header values must be printable ASCII, bounded, and free of separators or quotes. */
function scannerFileName(displayName: string) {
  return displayName.replace(/[^\x20-\x7E]/g, '_').replace(/[\\"\r\n]/g, '_').trim().slice(0, 120) || 'document';
}

/**
 * Read at most `MAX_SCANNER_RESPONSE_BYTES` from the scanner. A body that exceeds the limit is
 * cancelled and treated as an invalid verdict, so a broken or hostile endpoint cannot exhaust
 * application memory during an upload.
 */
async function readScannerResponse(response: Response) {
  if (!response.body) throw new Error('MALWARE_SCAN_UNAVAILABLE');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_SCANNER_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new Error('MALWARE_SCAN_RESPONSE_TOO_LARGE');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}

/** Fail closed: only an unambiguous clean verdict clears a file. Contradictory payloads are infected. */
function parseScannerVerdict(body: Buffer): 'clean' | 'infected' | 'unknown' {
  let parsed: unknown;
  try { parsed = JSON.parse(body.toString('utf8')); } catch { return 'unknown'; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return 'unknown';
  const result = parsed as { clean?: unknown; verdict?: unknown };
  if (result.clean === false || result.verdict === 'infected') return 'infected';
  if (result.clean === true || result.verdict === 'clean') return 'clean';
  return 'unknown';
}

/**
 * Fail closed for Cloudmersive too: only `CleanResult === true` is clean. An explicit `false` is an
 * infection; any other shape (missing key, string `"true"`, null, non-object JSON) is invalid.
 */
function parseCloudmersiveVerdict(body: Buffer): 'clean' | 'infected' | 'unknown' {
  let parsed: unknown;
  try { parsed = JSON.parse(body.toString('utf8')); } catch { return 'unknown'; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return 'unknown';
  const cleanResult = (parsed as { CleanResult?: unknown }).CleanResult;
  if (cleanResult === true) return 'clean';
  if (cleanResult === false) return 'infected';
  return 'unknown';
}

/**
 * Build the documented Cloudmersive multipart request. The API key travels only in the `Apikey`
 * header, never in the URL or form body, and FormData supplies the multipart boundary itself.
 */
function cloudmersiveScanRequest(bytes: Buffer, input: { displayName: string; mimeType: string }, apiKey: string, signal: AbortSignal) {
  const fileBytes = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const form = new FormData();
  form.append('inputFile', new Blob([fileBytes], { type: input.mimeType }), scannerFileName(input.displayName));
  return fetch(CLOUDMERSIVE_SCAN_URL, {
    method: 'POST',
    // A scanner endpoint must not bounce the document (and its API key) to another origin.
    redirect: 'error',
    signal,
    headers: { Apikey: apiKey },
    body: form
  });
}

/**
 * Scan a document before it is written anywhere.
 *
 * Supported providers:
 * - `disabled`: no scanner is contacted; allowed only when enforcement is off, and the resulting
 *   status is `SKIPPED` (never `CLEAN`).
 * - `http`: the SafeNest generic contract using `MALWARE_SCAN_URL` and `MALWARE_SCAN_TOKEN`.
 * - `cloudmersive`: the documented Cloudmersive file-scan API using `CLOUDMERSIVE_API_KEY`.
 *
 * The call is bounded (timeout, response size, request size), sends only the allow-listed
 * Content-Type and a printable filename, and never logs credentials, bytes or response bodies.
 * Every failure throws; the caller must refuse the upload rather than fall back to storing the file.
 */
export async function scanDocument(bytes: Buffer, input: { displayName: string; mimeType: string; sha256: string }): Promise<{ status: MalwareScanStatus; provider: string; sha256: string; scannedAt: Date }> {
  if (!allowedTypes.has(input.mimeType)) throw new Error('MALWARE_SCAN_UNSUPPORTED_TYPE');
  if (bytes.byteLength <= 0 || bytes.byteLength > MAX_DOCUMENT_BYTES) throw new Error('MALWARE_SCAN_FILE_TOO_LARGE');
  const computedSha256 = sha256Bytes(bytes);
  if (computedSha256 !== input.sha256) throw new Error('MALWARE_SCAN_INTEGRITY');
  const provider = process.env.MALWARE_SCAN_PROVIDER ?? 'disabled';
  const required = process.env.REQUIRE_MALWARE_SCAN === 'true';
  const scannedAt = new Date();
  if (provider === 'disabled') {
    if (required) throw new Error('MALWARE_SCAN_REQUIRED');
    return { status: 'SKIPPED', provider, sha256: computedSha256, scannedAt };
  }
  // Unknown providers fail closed even when enforcement is off: a typo must never skip a scan.
  if (provider !== 'http' && provider !== 'cloudmersive') throw new Error('MALWARE_SCAN_UNAVAILABLE');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MALWARE_SCAN_TIMEOUT_MS);
  try {
    let verdict: 'clean' | 'infected' | 'unknown';
    if (provider === 'http') {
      const url = process.env.MALWARE_SCAN_URL;
      const token = process.env.MALWARE_SCAN_TOKEN;
      if (!url || !token) throw new Error('MALWARE_SCAN_UNAVAILABLE');
      const response = await fetch(url, {
        method: 'POST',
        // A scanner endpoint must not bounce the document (and its token) to another origin.
        redirect: 'error',
        signal: controller.signal,
        headers: {
          'Content-Type': input.mimeType,
          'X-Scan-Token': token,
          'X-File-Name': scannerFileName(input.displayName),
          'X-File-SHA256': computedSha256
        },
        body: bytes as unknown as BodyInit
      });
      if (!response.ok) throw new Error('MALWARE_SCAN_UNAVAILABLE');
      verdict = parseScannerVerdict(await readScannerResponse(response));
    } else {
      const apiKey = process.env.CLOUDMERSIVE_API_KEY;
      if (!apiKey) throw new Error('MALWARE_SCAN_UNAVAILABLE');
      const response = await cloudmersiveScanRequest(bytes, input, apiKey, controller.signal);
      if (!response.ok) throw new Error('MALWARE_SCAN_UNAVAILABLE');
      verdict = parseCloudmersiveVerdict(await readScannerResponse(response));
    }
    if (verdict === 'infected') throw new Error('MALWARE_DETECTED');
    if (verdict !== 'clean') throw new Error('MALWARE_SCAN_UNAVAILABLE');
    return { status: 'CLEAN', provider, sha256: computedSha256, scannedAt };
  } catch (error) {
    if (error instanceof Error && error.message === 'MALWARE_DETECTED') throw error;
    throw new Error('MALWARE_SCAN_UNAVAILABLE');
  } finally {
    clearTimeout(timeout);
  }
}

function safeStorageTarget(storageKey: string) {
  const root = privateStorageRoot();
  const target = resolve(/*turbopackIgnore: true*/ root, storageKey);
  const withinRoot = target !== root && relative(root, target) && !relative(root, target).startsWith(`..${sep}`) && !relative(root, target).includes(`${sep}..${sep}`);
  if (!withinRoot) throw new Error('Invalid storage key.');
  return target;
}

export async function storePrivateDocument(file: File) {
  validateDocumentUpload(file);
  const bytes = Buffer.from(await file.arrayBuffer());
  validateFileSignature(bytes, file.type);
  const safeName = sanitiseDisplayName(file.name);
  const sha256 = sha256Bytes(bytes);
  const scan = await scanDocument(bytes, { displayName: safeName, mimeType: file.type, sha256 });
  const storageKey = `${new Date().toISOString().slice(0, 10)}/${randomBytes(24).toString('hex')}${extname(safeName).toLowerCase()}`;
  await writeObject(storageKey, bytes, file.type);
  return { storageKey, displayName: safeName, mimeType: file.type, sizeBytes: file.size, sha256, malwareScanStatus: scan.status, malwareScannedAt: scan.scannedAt };
}

export async function removePrivateDocument(storageKey: string) {
  if ((process.env.STORAGE_PROVIDER ?? 'local') === 'local') {
    await unlink(safeStorageTarget(storageKey)).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
    return;
  }
  if (process.env.STORAGE_PROVIDER !== 's3') throw new Error('STORAGE_PROVIDER_UNSUPPORTED');
  const { client, bucket } = s3Client();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: storageKey }));
}

export async function readPrivateDocument(storageKey: string): Promise<Buffer> {
  if ((process.env.STORAGE_PROVIDER ?? 'local') === 'local') return readFile(safeStorageTarget(storageKey));
  if (process.env.STORAGE_PROVIDER !== 's3') throw new Error('STORAGE_PROVIDER_UNSUPPORTED');
  const { client, bucket } = s3Client();
  const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: storageKey }));
  if (!result.Body) throw new Error('STORAGE_OBJECT_EMPTY');
  return Buffer.from(await result.Body.transformToByteArray());
}
