// Terms and conditions every person must tick before acting (organizers, hosts, attendance officers) or voting (every flat).
// The acceptance is a signed log entry that names the exact version and the SHA-256 of this text. Plain words; Hindi text is added by the UI session under the same version key.
import { sha256Hex } from "./crypto";
import { BRAND } from "./brand";

export const TERMS_VERSION = "2026-10-23.4";
export const TERMS_TEXT = `By using ${BRAND} you agree to the following.

1. Everything is recorded. Every action you take on this service is written to a tamper-evident record. For each action we also keep, privately and encrypted: your IP address, a device identifier and a browser-session identifier created by your browser, a small cookie that lets us recognise your browser when you open your link again, your browser type, screen, language and time-zone settings, the approximate place the network reports for your address, and the time. This is required, for everyone, so that the meeting or election can be checked afterwards.

2. Who can see it. The public page shows what happened, by flat number, and only a short coded fingerprint of the IP address and device for each entry, never the address itself. The society's Organizer and Hosts can see a shortened form (part of the IP address, a short device code). The full details are shown only to the platform owner when a society, a court or a law-enforcement authority lawfully asks for them, and every such viewing is itself recorded on the public page.

3. Secret ballots stay secret. For a secret ballot, the system records THAT your flat voted, when, and from which device. It does not record, and cannot show, WHAT you voted. Your choice is kept in a separate box that holds no flat number and no time. You receive a receipt code that proves your ballot is counted without revealing your choice.

4. Personal details. Your name, e-mail address and mobile number are never published in full; they appear partly hidden with * . If the society turns it on, the Attendance Monitor may take your photo, with your agreement, together with the date, time and place of the photo. The photo is stored encrypted, is not public, and can be seen only by the Organizer and Hosts; only its fingerprint and time are in the public record. You may refuse the photo and ask for the Organizer's alternative.

5. The records are permanent. The public record cannot be edited or deleted by anyone, including the platform owner. Private details (contacts, IP addresses, device identifiers) can be made unreadable on a lawful erasure request; the public fingerprints then remain but cannot be traced back to you.

6. Your duties. Use your own passcode, never share it, and do not try to vote more than once for a flat or for a flat that is not yours. Attempts are recorded.

7. This service records and checks. It does not give legal advice. A society remains responsible for following its own bye-laws and the law that applies to it.

By ticking the box you confirm that you have read and accept these terms.`;

export const termsSha256 = (): Promise<string> => sha256Hex(`${TERMS_VERSION}\n${TERMS_TEXT}`);
