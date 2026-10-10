import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const ENCRYPTION_KEY_LENGTH = 32;

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken(byteLength = 32): string {
  return randomBytes(byteLength).toString("base64url");
}

export function randomChars(length: number, alphabet: string): string {
  if (alphabet.length === 0) {
    throw new Error("randomChars requires a non-empty alphabet");
  }
  const bytes = randomBytes(length);
  let result = "";
  for (let index = 0; index < length; index += 1) {
    result += alphabet[bytes[index] % alphabet.length];
  }
  return result;
}

export function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function safeEqualHex(leftHex: string, rightHex: string): boolean {
  const leftBuffer = Buffer.from(leftHex, "hex");
  const rightBuffer = Buffer.from(rightHex, "hex");
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function encryptAesGcm(plaintext: string, base64Key: string): string {
  const key = decodeEncryptionKey(base64Key);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

export function decryptAesGcm(payload: string, base64Key: string): string {
  const key = decodeEncryptionKey(base64Key);
  const data = Buffer.from(payload, "base64");
  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

function decodeEncryptionKey(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== ENCRYPTION_KEY_LENGTH) {
    throw new Error(
      `DATA_ENCRYPTION_KEY must decode to ${ENCRYPTION_KEY_LENGTH} bytes (got ${key.length})`,
    );
  }
  return key;
}
