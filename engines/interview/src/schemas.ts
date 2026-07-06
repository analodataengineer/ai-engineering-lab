import { z } from "zod";

export const sessionStatusSchema = z.enum([
  "created",
  "consent_pending",
  "in_progress",
  "completed",
  "cancelled",
  "failed"
]);

export const consentStatusSchema = z.enum(["pending", "granted", "declined"]);
export const speakerSchema = z.enum(["agent", "candidate", "system"]);

export const createSessionSchema = z.object({
  candidateFirstName: z.string().trim().min(1).max(80).optional(),
  candidateLastName: z.string().trim().min(1).max(120).optional(),
  candidateDisplayName: z.string().trim().min(1).max(120).optional(),
  candidateEmail: z.string().trim().email().max(254).optional(),
  interviewToken: z.string().trim().min(12).max(160).optional(),
  targetRole: z.string().trim().min(1).max(160).optional()
});

export const candidateEmailSchema = z.object({
  candidateEmail: z.string().trim().email().max(254)
});

export const candidateIdentitySchema = z.object({
  candidateFirstName: z.string().trim().min(1).max(80).optional(),
  candidateLastName: z.string().trim().min(1).max(120).optional(),
  candidateDisplayName: z.string().trim().min(1).max(160).optional()
});

export const markConsentSchema = z.object({
  consentStatus: consentStatusSchema
});

export const recordTurnSchema = z.object({
  speaker: speakerSchema,
  content: z.string().trim().min(1).max(4000),
  audioRef: z.string().trim().max(500).optional()
});

export const summarySchema = z.object({
  profileSummary: z.string().trim().max(3000).default(""),
  experienceSummary: z.string().trim().max(3000).default(""),
  toolsSummary: z.string().trim().max(3000).default(""),
  availabilitySummary: z.string().trim().max(3000).default(""),
  humanReviewNotes: z.array(z.string().trim().max(500)).max(12).default([])
});

export type SessionStatus = z.infer<typeof sessionStatusSchema>;
export type ConsentStatus = z.infer<typeof consentStatusSchema>;
export type Speaker = z.infer<typeof speakerSchema>;
export type InterviewSummaryInput = z.infer<typeof summarySchema>;
