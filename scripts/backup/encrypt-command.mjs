#!/usr/bin/env node
// Stream a command's stdout through gzip and AES-256-GCM without a plaintext file.
// Usage: BACKUP_ENCRYPTION_KEY=<64 hex chars> node encrypt-command.mjs out.enc -- command args...
import { spawn } from "node:child_process";
import { createCipheriv, randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";

const [output, separator, command, ...args] = process.argv.slice(2);
const keyHex = process.env.BACKUP_ENCRYPTION_KEY;
if (!output || separator !== "--" || !command || !/^[0-9a-f]{64}$/i.test(keyHex ?? "")) {
  console.error("Usage: BACKUP_ENCRYPTION_KEY=<64 hex chars> node encrypt-command.mjs out.enc -- command args...");
  process.exit(2);
}

const iv = randomBytes(12);
const cipher = createCipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), iv);
const outputStream = createWriteStream(output, { flags: "wx", mode: 0o600 });
outputStream.write(Buffer.concat([Buffer.from("AFBK001\0"), iv]));
const appendTag = new Transform({
  transform(chunk, _encoding, callback) { callback(null, chunk); },
  flush(callback) { this.push(cipher.getAuthTag()); callback(); },
});
const child = spawn(command, args, {
  stdio: ["ignore", "pipe", "inherit"],
  env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1" },
  windowsHide: true,
});

try {
  const [exitCode] = await Promise.all([
    new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    }),
    pipeline(child.stdout, createGzip(), cipher, appendTag, outputStream),
  ]);
  if (exitCode !== 0) throw new Error(`Dump process exited with code ${exitCode}`);
  console.info("Encrypted backup written successfully.");
} catch (error) {
  await unlink(output).catch(() => {});
  console.error(error instanceof Error ? error.message : "Encrypted backup failed");
  process.exitCode = 1;
}
