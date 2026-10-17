import { z } from "zod";
export const feedbackSchema = z
  .object({
    requestId: z.uuid(),
    placeId: z.uuid(),
    rating: z.number().int().min(1).max(5),
    text: z.string().trim().max(1000),
    visitedOn: z.iso.date(),
    affiliated: z.boolean(),
    endorsementVersionId: z.uuid().optional(),
    helpfulness: z.number().int().min(1).max(5).optional(),
  })
  .refine((v) => Boolean(v.endorsementVersionId) === Boolean(v.helpfulness), {
    message: "도움 평가는 선택한 추천 하나에만 남길 수 있어요.",
  });
export const correctionSchema = z.object({
  requestId: z.uuid(),
  placeId: z.uuid(),
  field: z.enum(["name", "address", "hours", "menu", "other"]),
  value: z.string().trim().min(2).max(1000),
  evidence: z.string().trim().min(5).max(2000),
  contact: z.string().trim().max(200).optional(),
  consent: z.literal(true),
});
export const reportSchema = z.object({
  requestId: z.uuid(),
  kind: z.enum(["place", "endorsement", "user", "appeal"]),
  entityId: z.uuid(),
  reason: z.string().trim().min(5).max(2000),
});
export const decisionSchema = z.object({
  requestId: z.uuid(),
  kind: z.enum([
    "place",
    "endorsement",
    "submission",
    "correction",
    "report",
    "photo",
  ]),
  id: z.uuid(),
  decision: z.enum(["approve", "reject"]),
  reason: z.string().trim().min(5).max(1000),
  placeId: z.uuid().optional(),
  confirmNew: z.boolean().optional(),
});
export type Feedback = z.infer<typeof feedbackSchema>;
export type Correction = z.infer<typeof correctionSchema>;
export type QueueItem = {
  id: string;
  kind:
    "place" | "endorsement" | "submission" | "correction" | "report" | "photo";
  title: string;
  body: string;
  status: string;
  createdAt: string;
  userId?: string;
  placeId?: string;
  candidates?: { id: string; name: string; address: string }[];
};
export type Workspace = {
  homeCity?:string|null;homeArea?:string|null;localityScope?:'auto'|'city'|'area';
  homeRegion?: string | null;
  publicLocalArea?: boolean;
  id: string;
  role: "traveler" | "moderator" | "admin";
  displayName: string;
  contributions: {
    id: string;
    versionId: string;
    placeName: string;
    text: string;
    status: string;
    version: number;
  }[];
};
export type AdminData = {
  queue: QueueItem[];
  history: {
    id: number;
    action: string;
    created_at: string;
    details: Record<string, unknown>;
  }[];
};
