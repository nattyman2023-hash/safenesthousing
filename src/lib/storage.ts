import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
export { storageAdapterStatus } from './storage-status';

const allowedTypes = new Map([
  ['application/pdf', '.pdf'],
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['text/plain', '.txt']
]);

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export type MalwareScanStatus = 'CLEAN' | 'SKIPPED';

export function privateStorageRoot() {
  if ((process.env.STORAGE_PROVIDER ?? 'local') !== 'local') throw new Error('STORAGE_PROVIDER_UNSUPPORTED');
  const root = resolve(/* turbopackIgnore: true */ process.env.PRIVATE_STORAGE_PATH ?? join(/* turbopackIgnore: true */ process.cwd(), 'storage', 'private'));
  const publicRoot = resolve(/* turbopackIgnore: true */ process.cwd(), 'public');
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

export async function scanDocument(bytes: Buffer, input: { displayName: string; mimeType: string; sha256: string }): Promise<{ status: MalwareScanStatus; provider: string; sha256: string; scannedAt: Date }> {
  const provider = process.env.MALWARE_SCAN_PROVIDER ?? 'disabled';
  const required = process.env.NODE_ENV === 'production' || process.env.REQUIRE_MALWARE_SCAN === 'true';
  const scannedAt = new Date();
  if (provider === 'disabled') {
    if (required) throw new Error('MALWARE_SCAN_REQUIRED');
    return { status: 'SKIPPED', provider, sha256: input.sha256, scannedAt };
  }
  if (provider !== 'http' || !process.env.MALWARE_SCAN_URL || !process.env.MALWARE_SCAN_TOKEN) throw new Error('MALWARE_SCAN_UNAVAILABLE');
  try {
    const response = await fetch(process.env.MALWARE_SCAN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': input.mimeType,
        'X-Scan-Token': process.env.MALWARE_SCAN_TOKEN,
        'X-File-Name': input.displayName,
        'X-File-SHA256': input.sha256
      },
      body: bytes as unknown as BodyInit
    });
    if (!response.ok) throw new Error('scanner response');
    const result = await response.json() as { clean?: unknown; verdict?: unknown };
    if (result.clean === false || result.verdict === 'infected') throw new Error('MALWARE_DETECTED');
    if (result.clean !== true && result.verdict !== 'clean') throw new Error('scanner verdict');
    return { status: 'CLEAN', provider, sha256: input.sha256, scannedAt };
  } catch (error) {
    if (error instanceof Error && error.message === 'MALWARE_DETECTED') throw error;
    throw new Error('MALWARE_SCAN_UNAVAILABLE');
  }
}

function safeStorageTarget(storageKey: string) {
  const root = privateStorageRoot();
  const target = resolve(/* turbopackIgnore: true */ root, storageKey);
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
