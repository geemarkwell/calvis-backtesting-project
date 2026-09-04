import { theoDiagnosisSchema, type TheoDiagnosis } from './schemas';

const validDiagnosis: TheoDiagnosis = {
  job_ids: ['56370'],
  what_went_wrong: 'The Copilot repeatedly pushed back.',
  failure_mode: 'Repeated pushback after a credible completion report',
  evidence_windows: [
    {
      job_id: '56370',
      start_turn: 9,
      end_turn: 16,
      trace_refs: ['job:56370:events:81', 'job:56370:baseline:141'],
    },
  ],
  observed_behavior: [
    {
      claim: 'Copilot challenged the completion report.',
      trace_refs: ['job:56370:events:81', 'job:56370:baseline:141'],
    },
  ],
  expected_behavior: 'Acknowledge a credible completion report.',
  relevant_turns: [
    {
      turn_ref: 'job:56370:baseline:141',
      trigger: 'guard_message',
      instruction_file: 'instructions/guard_response.md',
    },
  ],
  prompt_diagnosis: {
    file: 'core/obligations.md',
    section: 'Completion reports',
    exact_text: 'Verify every obligation before marking it complete.',
    diagnosis_type: 'ambiguous',
    explanation: 'Instruction does not define when a report is sufficient.',
  },
  hypothesis:
    'Defining sufficient completion evidence should stop repeated follow-up.',
  proposed_edit: {
    file: 'core/obligations.md',
    old_text: 'Verify every obligation before marking it complete.',
    new_text:
      'Accept a credible guard completion report unless stronger evidence contradicts it.',
    intended_effect: 'Stop repeated follow-up after credible completion.',
  },
  risks: [
    'Copilot must still challenge reports contradicted by stronger evidence.',
  ],
  confidence: 0.8,
  uncertainties: [],
};

describe('Theo diagnosis schema', () => {
  it('accepts the complete structured diagnosis contract', () => {
    expect(theoDiagnosisSchema.parse(validDiagnosis)).toEqual(validDiagnosis);
  });

  it.each(['fixed', 'passed', 'verdict'])(
    'rejects forbidden or unknown top-level field %s',
    (field) => {
      expect(
        theoDiagnosisSchema.safeParse({ ...validDiagnosis, [field]: true })
          .success,
      ).toBe(false);
    },
  );

  it('rejects unknown nested fields', () => {
    expect(
      theoDiagnosisSchema.safeParse({
        ...validDiagnosis,
        proposed_edit: {
          ...validDiagnosis.proposed_edit,
          passed: false,
        },
      }).success,
    ).toBe(false);
  });

  it.each([
    '../core/obligations.md',
    'prompts/core/obligations.md',
    'other/policy.md',
    'core/nested/policy.md',
  ])('rejects non-canonical mutable path %s', (file) => {
    expect(
      theoDiagnosisSchema.safeParse({
        ...validDiagnosis,
        proposed_edit: { ...validDiagnosis.proposed_edit, file },
      }).success,
    ).toBe(false);
  });

  it('rejects an instruction mapping outside instructions/', () => {
    expect(
      theoDiagnosisSchema.safeParse({
        ...validDiagnosis,
        relevant_turns: [
          {
            ...validDiagnosis.relevant_turns[0],
            instruction_file: 'core/obligations.md',
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('rejects malformed trace references and out-of-range confidence', () => {
    expect(
      theoDiagnosisSchema.safeParse({
        ...validDiagnosis,
        confidence: 1.1,
        evidence_windows: [
          {
            ...validDiagnosis.evidence_windows[0],
            trace_refs: ['events:81'],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('accepts simulation-qualified trace references', () => {
    expect(
      theoDiagnosisSchema.safeParse({
        ...validDiagnosis,
        evidence_windows: [
          {
            ...validDiagnosis.evidence_windows[0],
            trace_refs: ['job:56370:simulation:3:baseline:4'],
          },
        ],
        observed_behavior: [
          {
            ...validDiagnosis.observed_behavior[0],
            trace_refs: ['job:56370:simulation:3:baseline:4'],
          },
        ],
        relevant_turns: [
          {
            ...validDiagnosis.relevant_turns[0],
            turn_ref: 'job:56370:simulation:3:baseline:4',
          },
        ],
      }).success,
    ).toBe(true);
  });
});
