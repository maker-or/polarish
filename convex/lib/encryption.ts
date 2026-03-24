/**
 * AES-GCM encryption/decryption helpers using the Web Crypto API (crypto.subtle).
 *
 * Requires the environment variable ENCRYPTION_KEY to be set as a
 * Base64-encoded 32-byte (256-bit) key.
 *
 * Generate one with:
 *   node -e "console.log(Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64'))"
 */

const ALGORITHM = "AES-GCM";
const IV_LENGTH = 12; // 96-bit IV recommended for AES-GCM

function getEncryptionKey(): string {
  const key = process.env.WORKOS_COOKIE_PASSWORD;
  if (!key) {
    throw new Error("ENCRYPTION_KEY environment variable is not set.");
  }
  return key;
}

async function importKey(base64Key: string) {
  const rawKey = Uint8Array.from(atob(base64Key), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", rawKey, { name: ALGORITHM }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/**
 * Encrypts a plain-text string.
 * Returns a Base64-encoded string in the format: <iv>:<ciphertext>
 */
export async function encrypt(plaintext: string): Promise<string> {
  const key = await importKey(getEncryptionKey());

  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);

  const cipherBuffer = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoded,
  );

  const ivBase64 = btoa(String.fromCharCode(...Array.from(iv)));
  const cipherBase64 = btoa(
    String.fromCharCode(...Array.from(new Uint8Array(cipherBuffer))),
  );

  return `${ivBase64}:${cipherBase64}`;
}

/**
 * Decrypts a Base64-encoded string produced by `encrypt`.
 * Expects the format: <iv>:<ciphertext>
 */
export async function decrypt(encryptedValue: string): Promise<string> {
  const key = await importKey(getEncryptionKey());

  const [ivBase64, cipherBase64] = encryptedValue.split(":");
  if (!ivBase64 || !cipherBase64) {
    throw new Error(
      "Invalid encrypted value format. Expected '<iv>:<ciphertext>'.",
    );
  }

  const iv = Uint8Array.from(atob(ivBase64), (c) => c.charCodeAt(0));
  const cipherBuffer = Uint8Array.from(atob(cipherBase64), (c) =>
    c.charCodeAt(0),
  );

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    cipherBuffer,
  );

  return new TextDecoder().decode(decryptedBuffer);
}
