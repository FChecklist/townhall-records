// Ballot paper design (chosen by the Organizer, mobile-friendly by construction) and election formats.
// Every option is a CHECKBOX: ticked = "yes" (selected), not ticked = "no" (not selected).
export type EventFormat = "single_post" | "ranked_posts" | "top_n";
export interface BallotDesign {
  layout: "list" | "cards" | "grid";   // how the options are laid out; on a narrow phone every layout shows one column
  columns: 1 | 2;                       // wide screens only
  order: "listed" | "shuffled";         // shuffled = each voter sees the options in a different order (display only, the UI shuffles)
  accent: string;                       // #RRGGBB
  title: string;                        // heading on the ballot paper (defaults to the point title)
  instruction: string;                  // extra line for voters (optional)
  showNumbers: boolean;                 // number the options 1, 2, 3 ...
  size: "normal" | "large";             // touch target size
}
export const defaultBallotDesign = (): BallotDesign => ({ layout: "list", columns: 1, order: "listed", accent: "#1C2B3A", title: "", instruction: "", showNumbers: true, size: "large" });

/** Fills defaults and validates; throws a plain-words Error for anything unusable. */
export function normalizeBallotDesign(d: unknown): BallotDesign {
  const base = defaultBallotDesign();
  if (d === undefined || d === null) return base;
  if (typeof d !== "object") throw new Error("The ballot design is not valid.");
  const x = d as Record<string, unknown>, out: BallotDesign = { ...base };
  const pick = <T extends string | number>(k: keyof BallotDesign, allowed: readonly T[]) => { if (x[k] !== undefined) { if (!allowed.includes(x[k] as T)) throw new Error(`Ballot design: ${k} must be one of ${allowed.join(", ")}.`); (out as any)[k] = x[k]; } };
  pick("layout", ["list", "cards", "grid"] as const); pick("columns", [1, 2] as const); pick("order", ["listed", "shuffled"] as const); pick("size", ["normal", "large"] as const);
  if (x.accent !== undefined) { if (typeof x.accent !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(x.accent)) throw new Error("Ballot design: accent must be a colour like #1C2B3A."); out.accent = x.accent.toLowerCase(); }
  for (const k of ["title", "instruction"] as const) if (x[k] !== undefined) { if (typeof x[k] !== "string" || (x[k] as string).length > 200) throw new Error(`Ballot design: ${k} is too long.`); out[k] = (x[k] as string).normalize("NFC").trim(); }
  if (x.showNumbers !== undefined) { if (typeof x.showNumbers !== "boolean") throw new Error("Ballot design: showNumbers must be yes or no."); out.showNumbers = x.showNumbers; }
  return out;
}

/** The sentence printed on the ballot, in plain words. */
export function ballotInstruction(minChoices: number, maxChoices: number): string {
  const rule = maxChoices === 1 ? (minChoices === 0 ? "Tick at most 1." : "Tick 1.") : minChoices === maxChoices ? `Tick exactly ${maxChoices}.` : minChoices === 0 ? `Tick up to ${maxChoices} (or none).` : `Tick ${minChoices} to ${maxChoices}.`;
  return `${rule} A ticked box means yes (selected). A box not ticked means no (not selected).`;
}

export const FORMAT_LABEL: Record<EventFormat, string> = {
  single_post: "One post, one election",
  ranked_posts: "One election for all posts: the highest vote gets the first post, the next the second, and so on",
  top_n: "Selection of the first N candidates",
};
