// Masking of personal data (Amendment A6) and the scanner that proves no complete e-mail or phone number is left in public output.
const stars = (n: number) => "*".repeat(Math.max(1, n));

/** rajat@gmail.com -> ra****@g****.com */
export function maskEmail(email: string): string {
  const e = email.trim();
  const at = e.lastIndexOf("@");
  if (at < 1 || at === e.length - 1) return "****@****";
  const local = Array.from(e.slice(0, at)), domain = e.slice(at + 1);
  const labels = domain.split(".");
  const head = Array.from(labels[0] ?? "");
  const rest = labels.slice(1).join(".");
  const l = (local.length >= 3 ? local.slice(0, 2).join("") : local[0]!) + "****";
  const d = (head[0] ?? "*") + "****" + (rest ? "." + rest : "");
  return l + "@" + d;
}

/** 9876543210 -> 98******10 (digits only are kept; a leading 91 on a 12-digit number is dropped) */
export function maskPhone(phone: string): string {
  let d = phone.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length < 5) return "******";
  return d.slice(0, 2) + stars(d.length - 4) + d.slice(-2);
}

/** Rajat Agarwal -> R**** A***** (first letter of each word kept, at most 5 stars) */
export function maskName(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  if (!w.length) return "*";
  return w.map((x) => { const c = Array.from(x); return c[0]! + stars(Math.min(c.length - 1, 5)); }).join(" ");
}

export interface ScanOptions {
  /** Exact public strings (e.g. a 10-digit registration number) that are allowed to appear. */
  allow?: string[];
  /** Known private values (full e-mails, phones, names). None of them may appear, case-insensitively. */
  forbidden?: string[];
}
export interface ScanFinding { kind: "email" | "phone" | "forbidden"; sample: string }

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
const PHONE_SHAPES: RegExp[] = [
  /(?<![\w])\+?91[\s-]?\d{5}[\s-]?\d{5}(?![\w])/g, // +91 98765 43210
  /(?<![\w-])\d{5}[\s-]\d{5}(?![\w-])/g, // 98765 43210
  /(?<![\w-])\d{3}[\s-]\d{3}[\s-]\d{4}(?![\w-])/g, // 987-654-3210
  /(?<!\d)91\d{10}(?!\d)/g, // 919876543210
  /(?<!\d)0\d{10}(?!\d)/g, // 09876543210 (trunk prefix)
  /(?<!\d)\d{10}(?!\d)/g, // 9876543210
];
/** Hashes, signatures and ids are long opaque tokens; they can contain runs of digits by chance, so they are not phone numbers. */
const OPAQUE = /[A-Za-z0-9_-]{14,}/g;
/** A run of 11+ hex characters / digits that includes at least one hex LETTER (an id or hash fragment). Real phone numbers have no letters. */
const HEXID = /(?<![A-Za-z0-9_-])(?=[0-9a-fA-F_-]*[a-fA-F])[0-9a-fA-F_-]{11,}(?![A-Za-z0-9_-])/g;

export function scanPublic(text: string, opt: ScanOptions = {}): ScanFinding[] {
  const out: ScanFinding[] = [];
  let t = text;
  for (const a of opt.allow ?? []) if (a) t = t.split(a).join(" ");
  for (const m of t.match(EMAIL) ?? []) out.push({ kind: "email", sample: m });
  // opaque tokens that contain a letter are ids/hashes; pure digit tokens (13-digit timestamps) are numbers, kept visible only if exactly 10 or 12 digits
  const stripped = t.replace(OPAQUE, (tok) => (/[A-Za-z]/.test(tok) || /^\d{13,}$/.test(tok) ? " " : tok));
  const strippedHex = stripped.replace(HEXID, " "); // short id fragments such as 9761113379ed (digits then hex letters) are ids, not phone numbers
  for (const re of PHONE_SHAPES) for (const m of strippedHex.match(re) ?? []) out.push({ kind: "phone", sample: m });
  const low = text.toLowerCase();
  for (const f of opt.forbidden ?? []) if (f && low.includes(f.toLowerCase())) out.push({ kind: "forbidden", sample: f });
  return out;
}
