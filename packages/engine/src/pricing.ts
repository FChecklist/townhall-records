// Price per event (pay per event). India: Rs 499 per meeting, Rs 1499 per election. Everywhere else: USD 5 per meeting, USD 15 per election.
// Amounts are integers in the smallest unit (paise / cents). The country is chosen when the event is created and recorded in the log.
export interface Price { amountMinor: number; currency: "INR" | "USD" }
export type EventKind = "meeting" | "election";

export const PRICES: Record<"IN" | "WORLD", Record<EventKind, Price>> = {
  IN: { meeting: { amountMinor: 49_900, currency: "INR" }, election: { amountMinor: 149_900, currency: "INR" } },
  WORLD: { meeting: { amountMinor: 500, currency: "USD" }, election: { amountMinor: 1_500, currency: "USD" } },
};
export const priceFor = (kind: EventKind, country: string): Price => PRICES[country.toUpperCase() === "IN" ? "IN" : "WORLD"][kind];
export const isCountry = (c: unknown): c is string => typeof c === "string" && /^[A-Za-z]{2}$/.test(c);
export const formatPrice = (p: Price): string => `${p.currency === "USD" ? "USD " : "Rs "}${Math.floor(p.amountMinor / 100)}`;
