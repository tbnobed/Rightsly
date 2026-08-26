import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { createReadStream } from 'fs';
import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';
import { File, Storage } from '@google-cloud/storage';

import {
  canAccessObject,
  getObjectAclPolicy,
  ObjectAclPolicy,
  ObjectPermission,
  setObjectAclPolicy,
} from './objectAcl';

const REPLIT_SIDECAR_ENDPOINT = 'http://127.0.0.1:1106';
const LOCAL_UPLOAD_TTL_SECONDS = 900;

// This client deliberately remains configured for Replit App Storage. Local
// storage is selected only when LOCAL_OBJECT_STORAGE_DIR is explicitly set.
export const objectStorageClient = new Storage({
  credentials: {
    audience: 'replit', subject_token_type: 'access_token',
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`, type: 'external_account',
    credential_source: { url: `${REPLIT_SIDECAR_ENDPOINT}/credential`, format: { type: 'json', subject_token_field_name: 'access_token' } },
    universe_domain: 'googleapis.com',
  },
  projectId: '',
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super('Object not found');
    this.name = 'ObjectNotFoundError';
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

interface LocalObject {
  kind: 'local';
  filePath: string;
  contentType: string;
  size: number;
}
type StoredObject = File | LocalObject;

export class ObjectStorageService {
  private get localRoot(): string | null {
    const configured = process.env.LOCAL_OBJECT_STORAGE_DIR?.trim();
    return configured ? path.resolve(configured) : null;
  }

  isLocalStorage(): boolean {
    return this.localRoot !== null;
  }

  getPublicObjectSearchPaths(): Array<string> {
    const paths = Array.from(new Set((process.env.PUBLIC_OBJECT_SEARCH_PATHS || '').split(',').map((value) => value.trim()).filter(Boolean)));
    if (!paths.length) throw new Error('PUBLIC_OBJECT_SEARCH_PATHS not set.');
    return paths;
  }

  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || '';
    if (!dir) throw new Error('PRIVATE_OBJECT_DIR not set.');
    return dir;
  }

  async searchPublicObject(filePath: string): Promise<File | null> {
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const { bucketName, objectName } = parseObjectPath(`${searchPath}/${filePath}`);
      const file = objectStorageClient.bucket(bucketName).file(objectName);
      const [exists] = await file.exists();
      if (exists) return file;
    }
    return null;
  }

  async downloadObject(file: StoredObject, cacheTtlSec = 3600): Promise<Response> {
    if (isLocalObject(file)) {
      const nodeStream = createReadStream(file.filePath);
      return new Response(Readable.toWeb(nodeStream) as ReadableStream, {
        headers: {
          'Content-Type': file.contentType || 'application/octet-stream',
          'Content-Length': String(file.size),
          'Cache-Control': `private, max-age=${cacheTtlSec}`,
        },
      });
    }
    const [metadata] = await file.getMetadata();
    const aclPolicy = await getObjectAclPolicy(file);
    const nodeStream = file.createReadStream();
    const headers: Record<string, string> = {
      'Content-Type': (metadata.contentType as string) || 'application/octet-stream',
      'Cache-Control': `${aclPolicy?.visibility === 'public' ? 'public' : 'private'}, max-age=${cacheTtlSec}`,
    };
    if (metadata.size) headers['Content-Length'] = String(metadata.size);
    return new Response(Readable.toWeb(nodeStream) as ReadableStream, { headers });
  }

  async getObjectEntityUploadURL(contentType?: string): Promise<string> {
    const objectId = randomUUID();
    if (this.localRoot) {
      const expires = Math.floor(Date.now() / 1000) + LOCAL_UPLOAD_TTL_SECONDS;
      const contentTypeValue = contentType || '';
      const signature = this.signLocalUpload(`uploads/${objectId}`, expires, contentTypeValue);
      return `/api/storage/uploads/local/${objectId}?expires=${expires}&contentType=${encodeURIComponent(contentTypeValue)}&signature=${signature}`;
    }
    const { bucketName, objectName } = parseObjectPath(`${this.getPrivateObjectDir().replace(/\/$/, '')}/uploads/${objectId}`);
    return signObjectURL({ bucketName, objectName, method: 'PUT', ttlSec: LOCAL_UPLOAD_TTL_SECONDS });
  }

  async writeLocalUpload(id: string, expires: string, contentType: string, signature: string, body: AsyncIterable<Buffer>, maxSize: number): Promise<void> {
    if (!this.localRoot || !isObjectId(id) || !this.verifyLocalUpload(`uploads/${id}`, expires, contentType, signature)) {
      throw new Error('Invalid local upload signature');
    }
    const destination = this.localFilePath(`uploads/${id}`);
    await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    const temporary = `${destination}.${randomUUID()}.uploading`;
    let size = 0;
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(temporary, 'wx', 0o600);
      for await (const chunk of body) {
        size += chunk.length;
        if (size > maxSize) throw new Error('Upload exceeds maximum size');
        await handle.write(Buffer.from(chunk));
      }
      await handle.close();
      handle = undefined;
      await writeFile(`${temporary}.meta.json`, JSON.stringify({ contentType }), { mode: 0o600 });
      await rename(temporary, destination);
      await rename(`${temporary}.meta.json`, `${destination}.meta.json`);
    } catch (error) {
      await handle?.close();
      await Promise.allSettled([rm(temporary, { force: true }), rm(`${temporary}.meta.json`, { force: true })]);
      throw error;
    }
  }

  async getObjectEntityFile(objectPath: string): Promise<StoredObject> {
    const entityId = this.objectEntityId(objectPath);
    if (this.localRoot) {
      const filePath = this.localFilePath(entityId);
      try {
        const [info, rawMeta] = await Promise.all([stat(filePath), readFile(`${filePath}.meta.json`, 'utf8')]);
        const metadata = JSON.parse(rawMeta) as { contentType?: string };
        return { kind: 'local', filePath, contentType: metadata.contentType || 'application/octet-stream', size: info.size };
      } catch {
        throw new ObjectNotFoundError();
      }
    }
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith('/')) entityDir += '/';
    const { bucketName, objectName } = parseObjectPath(`${entityDir}${entityId}`);
    const objectFile = objectStorageClient.bucket(bucketName).file(objectName);
    const [exists] = await objectFile.exists();
    if (!exists) throw new ObjectNotFoundError();
    return objectFile;
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (rawPath.startsWith('/api/storage/uploads/local/')) {
      const id = rawPath.split('/').pop()?.split('?')[0] || '';
      return isObjectId(id) ? `/objects/uploads/${id}` : rawPath;
    }
    if (!rawPath.startsWith('https://storage.googleapis.com/')) return rawPath;
    const rawObjectPath = new URL(rawPath).pathname;
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith('/')) entityDir += '/';
    return rawObjectPath.startsWith(entityDir) ? `/objects/${rawObjectPath.slice(entityDir.length)}` : rawObjectPath;
  }

  async trySetObjectEntityAclPolicy(rawPath: string, aclPolicy: ObjectAclPolicy): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith('/')) return normalizedPath;
    const objectFile = await this.getObjectEntityFile(normalizedPath);
    if (!isLocalObject(objectFile)) await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }

  async canAccessObjectEntity({ userId, objectFile, requestedPermission }: { userId?: string; objectFile: StoredObject; requestedPermission?: ObjectPermission }): Promise<boolean> {
    // Local private objects are authorized by the application DB routes.
    if (isLocalObject(objectFile)) return Boolean(userId);
    return canAccessObject({ userId, objectFile, requestedPermission: requestedPermission ?? ObjectPermission.READ });
  }

  private objectEntityId(objectPath: string): string {
    if (!objectPath.startsWith('/objects/')) throw new ObjectNotFoundError();
    const entityId = objectPath.slice('/objects/'.length);
    if (!/^uploads\/[0-9a-f-]{36}$/i.test(entityId)) throw new ObjectNotFoundError();
    return entityId;
  }

  private localFilePath(entityId: string): string {
    const root = this.localRoot!;
    const resolved = path.resolve(root, entityId);
    if (!resolved.startsWith(`${root}${path.sep}`)) throw new ObjectNotFoundError();
    return resolved;
  }

  private localUploadSecret(): string {
    const secret = process.env.SESSION_SECRET || process.env.JWT_SECRET;
    if (!secret) throw new Error('LOCAL_OBJECT_STORAGE_DIR requires SESSION_SECRET or JWT_SECRET');
    return secret;
  }
  private signLocalUpload(key: string, expires: number, contentType: string): string {
    return createHmac('sha256', this.localUploadSecret()).update(`${key}\n${expires}\n${contentType}`).digest('hex');
  }
  private verifyLocalUpload(key: string, expiresRaw: string, contentType: string, signature: string): boolean {
    const expires = Number(expiresRaw);
    if (!Number.isSafeInteger(expires) || expires < Math.floor(Date.now() / 1000)) return false;
    const expected = this.signLocalUpload(key, expires, contentType);
    if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
  }
}

function isLocalObject(file: StoredObject): file is LocalObject { return 'kind' in file; }
function isObjectId(value: string): boolean { return /^[0-9a-f-]{36}$/i.test(value); }
function parseObjectPath(value: string): { bucketName: string; objectName: string } {
  const parts = (value.startsWith('/') ? value : `/${value}`).split('/');
  if (parts.length < 3 || !parts[1] || !parts.slice(2).join('/')) throw new Error('Invalid object storage path');
  return { bucketName: parts[1], objectName: parts.slice(2).join('/') };
}
async function signObjectURL({ bucketName, objectName, method, ttlSec }: { bucketName: string; objectName: string; method: 'GET' | 'PUT' | 'DELETE' | 'HEAD'; ttlSec: number }): Promise<string> {
  const response = await fetch(`${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bucket_name: bucketName, object_name: objectName, method, expires_at: new Date(Date.now() + ttlSec * 1000).toISOString() }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Failed to sign object URL, errorcode: ${response.status}`);
  return ((await response.json()) as { signed_url: string }).signed_url;
}