#!/usr/bin/env node
// Decrypt to stdout only, so it can be piped directly to a restore tool.
import { createDecipheriv } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, stat } from "node:fs/promises";
import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";

const [input, option] = process.argv.slice(2);
const keyHex = process.env.BACKUP_ENCRYPTION_KEY;
if (!input || !/^[0-9a-f]{64}$/i.test(keyHex ?? "")) {
  console.error("Usage: BACKUP_ENCRYPTION_KEY=<64 hex chars> node decrypt-file.mjs backup.enc");
  process.exit(2);
}

const file = await open(input, "r");
try {
  const size = (await stat(input)).size;
  if (size < 37) throw new Error("Invalid encrypted backup");
  const header = Buffer.alloc(20);
  const tag = Buffer.alloc(16);
  await file.read(header, 0, 20, 0);
  await file.read(tag, 0, 16, size - 16);
  if (!header.subarray(0, 8).equals(Buffer.from("AFBK001\0"))) throw new Error("Invalid backup header");
  const decrypt = () => {
    const decipher = createDecipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), header.subarray(8));
    decipher.setAuthTag(tag);
    return decipher;
  };
  const encrypted = () => createReadStream(input, { start: 20, end: size - 17 });
  // Authenticate the whole ciphertext before releasing any plaintext to a
  // restore command; a GCM stream can otherwise emit bytes before final auth.
  await pipeline(encrypted(), decrypt(), new Writable({ write(_chunk, _enc, callback) { callback(); } }));
  if (option === "--verify") {
    let bytes = 0;
    let prefix = "";
    await pipeline(encrypted(), decrypt(), createGunzip(), new Writable({
      write(chunk, _enc, callback) {
        bytes += chunk.length;
        if (prefix.length < 256) prefix += chunk.subarray(0, 256 - prefix.length).toString("utf8");
        callback();
      },
    }));
    if (bytes === 0) throw new Error("Backup is empty");
    if (!/^(--|SET\s)/.test(prefix)) throw new Error("Backup does not start with SQL");
    console.info(`Encrypted backup verified (${bytes} uncompressed bytes).`);
  } else {
    await pipeline(encrypted(), decrypt(), createGunzip(), process.stdout);
  }
} finally {
  await file.close();
}
