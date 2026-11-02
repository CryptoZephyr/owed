export type StampKind = "paid" | "released" | "unclaimed";

export const STAMP_WORDS: Record<StampKind, string> = {
  paid: "Paid",
  released: "Released",
  unclaimed: "Payout unclaimed",
};
