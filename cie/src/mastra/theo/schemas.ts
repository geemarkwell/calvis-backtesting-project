import { z } from 'zod';

export const traceReferenceSchema = z
  .string()
  .regex(
    /^job:\d+:(?:simulation:[1-9]\d*:)?(?:events|baseline):(0|[1-9]\d*)$/,
    'Trace reference must use job:<job-id>:[simulation:<number>:]events:<index> or job:<job-id>:[simulation:<number>:]baseline:<index>.',
  );

export const mutablePromptFileSchema = z
  .string()
  .regex(
    /^(?:core|instructions)\/[^/]+\.md$/,
    'Prompt file must be a Markdown file directly under core/ or instructions/.',
  );

export const instructionPromptFileSchema = z
  .string()
  .regex(
    /^instructions\/[^/]+\.md$/,
    'Turn instruction file must be a Markdown file directly under instructions/.',
  );

const nonEmptyTextSchema = z
  .string()
  .min(1)
  .regex(/\S/, 'Text must contain a non-whitespace character.');

export const diagnosisTypeSchema = z.enum([
  'missing',
  'ambiguous',
  'conflicting',
  'overly_forceful',
  'incorrectly_prioritized',
]);

export const theoDiagnosisSchema = z
  .object({
    job_ids: z
      .array(z.string().regex(/^\d+$/, 'Job ID must contain only digits.'))
      .min(1),
    what_went_wrong: nonEmptyTextSchema,
    failure_mode: nonEmptyTextSchema,
    evidence_windows: z
      .array(
        z
          .object({
            job_id: z
              .string()
              .regex(/^\d+$/, 'Job ID must contain only digits.'),
            start_turn: z.number().int().positive(),
            end_turn: z.number().int().positive(),
            trace_refs: z.array(traceReferenceSchema).min(1),
          })
          .strict()
          .refine((window) => window.start_turn <= window.end_turn, {
            path: ['start_turn'],
            message: 'start_turn cannot be greater than end_turn.',
          }),
      )
      .min(1),
    observed_behavior: z
      .array(
        z
          .object({
            claim: nonEmptyTextSchema,
            trace_refs: z.array(traceReferenceSchema).min(1),
          })
          .strict(),
      )
      .min(1),
    expected_behavior: nonEmptyTextSchema,
    relevant_turns: z
      .array(
        z
          .object({
            turn_ref: traceReferenceSchema,
            trigger: nonEmptyTextSchema,
            instruction_file: instructionPromptFileSchema,
          })
          .strict(),
      )
      .min(1),
    prompt_diagnosis: z
      .object({
        file: mutablePromptFileSchema,
        section: nonEmptyTextSchema,
        exact_text: nonEmptyTextSchema,
        diagnosis_type: diagnosisTypeSchema,
        explanation: nonEmptyTextSchema,
      })
      .strict(),
    hypothesis: nonEmptyTextSchema,
    proposed_edit: z
      .object({
        file: mutablePromptFileSchema,
        old_text: nonEmptyTextSchema,
        new_text: nonEmptyTextSchema,
        intended_effect: nonEmptyTextSchema,
      })
      .strict(),
    risks: z.array(nonEmptyTextSchema),
    confidence: z.number().min(0).max(1),
    uncertainties: z.array(nonEmptyTextSchema),
  })
  .strict();

export type TheoDiagnosis = z.infer<typeof theoDiagnosisSchema>;
export type TheoDiagnosisType = z.infer<typeof diagnosisTypeSchema>;
