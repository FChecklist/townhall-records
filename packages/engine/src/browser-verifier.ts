// Entry point bundled into every report/live page (see scripts/build-verifier.ts). Exposes the SAME verifier the server tests use.
import { countdowns, dayParts } from "./schedule";
import { verifyEmbedded, verifyReportHtml, extractData, extractSeal } from "./model";
(globalThis as any).aoaTimers = { countdowns, dayParts };
(globalThis as any).aoaVerify = { verifyEmbedded, verifyReportHtml, extractData, extractSeal };
