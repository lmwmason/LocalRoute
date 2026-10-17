import { z } from "zod";
const text = (min: number, max = 2000) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => [...v].every((c) => c.charCodeAt(0) >= 32 || c === "\n"));
export const visitRequestSchema = z
  .object({
    requestId: z.uuid(),
    ratingId: z.uuid(),
    expectedHelpfulness: z.number().int().min(1).max(5),
    expectedVisitedOn: z.iso.date(),
    affiliated: z.boolean(),
    evidence: text(10),
    consent: z.literal(true),
  })
  .strict();
export const visitDecisionSchema = z
  .object({
    requestId: z.uuid(),
    id: z.uuid(),
    decision: z.enum(["approve", "reject"]),
    reason: text(10),
    evidenceSummary: text(20),
    independentEvidence: z.boolean().default(false),
    affiliationsChecked: z.boolean().default(false),
    collusionChecked: z.boolean().default(false),
  })
  .strict()
  .refine(
    (v) =>
      v.decision === "reject" ||
      (v.independentEvidence && v.affiliationsChecked && v.collusionChecked),
  );
export const visitPolicySchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    enabled: z.boolean(),
    amounts: z
      .tuple([z.number(), z.number(), z.number(), z.number(), z.number()])
      .refine((v) =>
        v.every((n) => Number.isInteger(n) && n >= 0 && n <= 10000),
      ),
    placeMonthCap: z.number().int().min(0).max(1000000),
    curatorMonthCap: z.number().int().min(0).max(1000000),
    reason: text(10),
  })
  .strict();
export const affiliationSchema = z
  .object({
    userId: z.uuid(),
    placeId: z.uuid(),
    kind: z.enum(["owner", "affiliate"]),
    active: z.boolean(),
    reason: text(10),
  })
  .strict();
export type VisitRequestInput = z.infer<typeof visitRequestSchema>;
export type VisitDecisionInput = z.infer<typeof visitDecisionSchema>;
export type VisitPolicyInput = z.infer<typeof visitPolicySchema>;
export type VisitRewardPolicy = {
  version: number;
  enabled: boolean;
  effectiveEnabled: boolean;
  amounts: number[];
  place_month_cap: number;
  curator_month_cap: number;
};
export type VisitTarget = {
  ratingId: string;
  placeId: string;
  placeName: string;
  endorsementVersionId: string;
  versionNumber: number;
  versionText: string;
  helpfulness: number;
  visitedOn: string;
};
export type VisitRewardRequest = {
  placeName: string;
  knownAffiliations?: { userId: string; kind: "owner" | "affiliate" }[];
  id: string;
  requestId: string;
  visitorId: string;
  placeId: string;
  curatorId: string;
  ratingId: string;
  endorsementVersionId: string;
  versionNumber: number;
  versionText: string;
  visitedOn: string;
  helpfulness: number;
  affiliated: boolean;
  evidence: string;
  state: "pending" | "approved" | "rejected";
  createdAt: string;
  decision: {
    decision: "approve" | "reject";
    reason: string;
    evidenceSummary: string;
    reviewerId: string;
    createdAt: string;
  } | null;
  grant: {
    amount: number;
    ledgerId: string | null;
    policyVersion: number;
    createdAt: string;
  } | null;
};
