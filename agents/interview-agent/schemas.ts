import { z } from "zod";

export const sessionToolInputSchema = z.object({
  sessionId: z.string().uuid()
});

export const recordTurnInputSchema = sessionToolInputSchema.extend({
  speaker: z.enum(["agent", "candidate", "system"]),
  content: z.string().trim().min(1).max(4000),
  audioRef: z.string().trim().max(500).optional()
});

export const markConsentInputSchema = sessionToolInputSchema.extend({
  consentStatus: z.enum(["granted", "declined"])
});

export const saveCandidateIdentityInputSchema = sessionToolInputSchema.extend({
  candidateFirstName: z.string().trim().min(1).max(80).optional(),
  candidateLastName: z.string().trim().min(1).max(120).optional(),
  candidateDisplayName: z.string().trim().min(1).max(160).optional()
});

export const saveCandidateEmailInputSchema = sessionToolInputSchema.extend({
  candidateEmail: z.string().trim().email().max(254)
});

export const summaryInputSchema = sessionToolInputSchema.extend({
  profileSummary: z.string().trim().max(3000).default(""),
  experienceSummary: z.string().trim().max(3000).default(""),
  toolsSummary: z.string().trim().max(3000).default(""),
  availabilitySummary: z.string().trim().max(3000).default(""),
  humanReviewNotes: z.array(z.string().trim().max(500)).max(12).default([])
});
