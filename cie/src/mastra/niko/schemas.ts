import { z } from 'zod';

const nonEmptyTextSchema = z
  .string()
  .trim()
  .min(1, 'Text must contain a non-whitespace character.');

export const nikoConversationMessageSchema = z
  .object({
    role: z.enum(['guard', 'copilot']),
    content: nonEmptyTextSchema,
  })
  .strict();

export const nikoInputSchema = z
  .object({
    guardProfile: z.record(z.string(), z.unknown()),
    shiftContext: z.record(z.string(), z.unknown()),
    recentConversation: z.array(nikoConversationMessageSchema),
    candidateCopilotMessage: nonEmptyTextSchema.nullable(),
    historicalGuardReply: nonEmptyTextSchema,
  })
  .strict();

export const nikoReplySchema = z
  .object({
    reply: nonEmptyTextSchema.nullable(),
  })
  .strict();

export type NikoConversationMessage = z.infer<
  typeof nikoConversationMessageSchema
>;
export type NikoInput = z.infer<typeof nikoInputSchema>;
export type NikoReply = z.infer<typeof nikoReplySchema>;
