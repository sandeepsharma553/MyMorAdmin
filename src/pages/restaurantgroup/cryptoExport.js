/* Passphrase-based AES-GCM encryption for exports (no external deps — Web Crypto).
 * File format (base64): "MYMOR1" magic(6) | salt(16) | iv(12) | ciphertext.
 * Reversible via decryptText with the same passphrase, so an encrypted export can be reopened. */

const enc = new TextEncoder();
const dec = new TextDecoder();

const keyFromPass = async (pass, salt) => {
  const base = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
  );
};

export const encryptText = async (text, pass) => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFromPass(pass, salt);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(text)));
  const out = new Uint8Array(6 + 16 + 12 + ct.length);
  out.set(enc.encode("MYMOR1"), 0); out.set(salt, 6); out.set(iv, 22); out.set(ct, 34);
  let bin = ""; out.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
};

export const decryptText = async (b64, pass) => {
  const raw = Uint8Array.from(atob((b64 || "").trim()), (c) => c.charCodeAt(0));
  if (dec.decode(raw.slice(0, 6)) !== "MYMOR1") throw new Error("Not a MyMor encrypted file");
  const salt = raw.slice(6, 22), iv = raw.slice(22, 34), ct = raw.slice(34);
  const key = await keyFromPass(pass, salt);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return dec.decode(pt);
};

export const downloadText = (filename, text, mime = "text/plain;charset=utf-8") => {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
