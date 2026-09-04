import type { DiagnosticInput } from './diagnostic-input';
import {
  TheoDiagnosisValidationError,
  validateTheoDiagnosis,
} from './diagnosis-validator';
import type { TheoDiagnosis } from './schemas';

const oldText =
  'If the guard answers, the ask is done. Ack it and close the loop.';
const messageRef = 'job:56370:baseline:63';
const turnRef = 'job:56370:baseline:62';
const eventRef = 'job:56370:events:668';

const input: DiagnosticInput = {
  whatWentWrong:
    'Copilot repeatedly challenged a completed patrol and flagged the guard.',
  expectedBehavior:
    'Acknowledge a credible completion report unless stronger evidence contradicts it.',
  badResponses: [
    {
      jobId: '56370',
      startTurn: 9,
      endTurn: 16,
      trace: [
        {
          ref: eventRef,
          source: 'events',
          sourceIndex: 668,
          timestamp: '2026-08-05T02:03:28.102686+00:00',
          type: 'guard_message',
          content: 'I walked the full site and checked both buildings.',
          turnRef,
          trigger: 'guard_message',
          instructionFile: 'instructions/guard_response.md',
        },
        {
          ref: turnRef,
          source: 'baseline',
          sourceIndex: 62,
          timestamp: '2026-08-05T02:03:51.791566+00:00',
          type: 'turn_start',
          content: { turn: 10 },
          turnRef,
          trigger: 'guard_message',
          instructionFile: 'instructions/guard_response.md',
        },
        {
          ref: messageRef,
          source: 'baseline',
          sourceIndex: 63,
          timestamp: '2026-08-05T02:03:55.000000+00:00',
          type: 'copilot_message',
          content: 'Please confirm the patrol again.',
          turnRef,
          trigger: 'guard_message',
          instructionFile: 'instructions/guard_response.md',
        },
      ],
    },
  ],
  shifts: [{ jobId: '56370', shift: { id: 56370 } }],
  promptFiles: {
    'core/identity.md': 'Copilot identity.',
    'core/context.md': 'Shift context:\n{COPILOT_CONTEXT}',
    'core/holding_the_post.md': 'Hold the post.',
    'core/obligations.md': `Before\n${oldText}\nAfter`,
    'core/comms_policy.md': 'Communicate clearly.',
    'core/tools.md': 'Use available tools.',
    'instructions/guard_response.md': 'Respond to guard messages.',
  },
};

const validDiagnosis: TheoDiagnosis = {
  job_ids: ['56370'],
  what_went_wrong: input.whatWentWrong,
  failure_mode: 'Repeated pushback after a credible completion report',
  evidence_windows: [
    {
      job_id: '56370',
      start_turn: 9,
      end_turn: 16,
      trace_refs: [eventRef, turnRef, messageRef],
    },
  ],
  observed_behavior: [
    {
      claim: 'Copilot challenged the completion report.',
      trace_refs: [eventRef, messageRef],
    },
  ],
  expected_behavior: input.expectedBehavior,
  relevant_turns: [
    {
      turn_ref: turnRef,
      trigger: 'guard_message',
      instruction_file: 'instructions/guard_response.md',
    },
  ],
  prompt_diagnosis: {
    file: 'core/obligations.md',
    section: 'One ask, one firm-up, then ops',
    exact_text: oldText,
    diagnosis_type: 'ambiguous',
    explanation: 'Instruction does not define sufficient completion evidence.',
  },
  hypothesis:
    'Clarifying completion evidence should prevent repeated follow-up.',
  proposed_edit: {
    file: 'core/obligations.md',
    old_text: oldText,
    new_text:
      'If the guard gives a credible answer, acknowledge it and close the loop unless stronger current evidence directly contradicts the report.',
    intended_effect: 'Stop repeated follow-up after credible completion.',
  },
  risks: ['Contradictory evidence must still trigger intervention.'],
  confidence: 0.8,
  uncertainties: [],
};

function validate(diagnosis: unknown = validDiagnosis): TheoDiagnosis {
  return validateTheoDiagnosis({ diagnosis, input });
}

describe('Theo diagnosis validator', () => {
  it('returns a valid structured diagnosis and prompt suggestion', () => {
    expect(validate()).toEqual(validDiagnosis);
  });

  it('requires exact supplied jobs, problem, and expected behavior', () => {
    expect(() => validate({ ...validDiagnosis, job_ids: ['50837'] })).toThrow(
      /job_ids must exactly match/,
    );
    expect(() =>
      validate({ ...validDiagnosis, what_went_wrong: 'Different problem.' }),
    ).toThrow(/what_went_wrong does not match/);
    expect(() =>
      validate({ ...validDiagnosis, expected_behavior: 'Different target.' }),
    ).toThrow(/expected_behavior does not match/);
  });

  it('requires one evidence window matching every requested range', () => {
    expect(() =>
      validate({
        ...validDiagnosis,
        evidence_windows: [
          { ...validDiagnosis.evidence_windows[0], start_turn: 10 },
        ],
      }),
    ).toThrow(/must match supplied job and turn bounds/);
    expect(() => validate({ ...validDiagnosis, evidence_windows: [] })).toThrow(
      TheoDiagnosisValidationError,
    );
  });

  it('rejects unknown references and citations outside their window', () => {
    expect(() =>
      validate({
        ...validDiagnosis,
        evidence_windows: [
          {
            ...validDiagnosis.evidence_windows[0],
            trace_refs: ['job:56370:baseline:999'],
          },
        ],
      }),
    ).toThrow(/Unknown trace reference/);

    const secondInput: DiagnosticInput = {
      ...input,
      badResponses: [
        input.badResponses[0],
        {
          jobId: '50837',
          startTurn: 7,
          endTurn: 8,
          trace: [
            {
              ...input.badResponses[0].trace[0],
              ref: 'job:50837:events:1',
              sourceIndex: 1,
            },
          ],
        },
      ],
      shifts: [...input.shifts, { jobId: '50837', shift: { id: 50837 } }],
    };
    expect(() =>
      validateTheoDiagnosis({
        input: secondInput,
        diagnosis: {
          ...validDiagnosis,
          job_ids: ['56370', '50837'],
          evidence_windows: [
            validDiagnosis.evidence_windows[0],
            {
              job_id: '50837',
              start_turn: 7,
              end_turn: 8,
              trace_refs: [eventRef],
            },
          ],
        },
      }),
    ).toThrow(/outside its requested turn range/);
  });

  it('keeps observations and relevant turns inside evidence windows', () => {
    expect(() =>
      validate({
        ...validDiagnosis,
        evidence_windows: [
          { ...validDiagnosis.evidence_windows[0], trace_refs: [eventRef] },
        ],
      }),
    ).toThrow(/not included in evidence_windows/);
  });

  it('allows quote punctuation and paraphrasing in natural-language claims', () => {
    expect(
      validate({
        ...validDiagnosis,
        observed_behavior: [
          {
            claim: 'Copilot said "Please confirm the patrol again,"',
            trace_refs: [messageRef],
          },
        ],
      }).observed_behavior[0].claim,
    ).toBe('Copilot said "Please confirm the patrol again,"');
  });

  it('verifies relevant-turn metadata', () => {
    expect(() =>
      validate({
        ...validDiagnosis,
        relevant_turns: [
          { ...validDiagnosis.relevant_turns[0], trigger: 'job_event' },
        ],
      }),
    ).toThrow(/trigger does not match/);
  });

  it('requires exact prompt evidence and a unique changed suggestion', () => {
    expect(() =>
      validate({
        ...validDiagnosis,
        prompt_diagnosis: {
          ...validDiagnosis.prompt_diagnosis,
          exact_text: 'Missing prompt passage.',
        },
      }),
    ).toThrow(/exact_text does not occur/);

    expect(() =>
      validateTheoDiagnosis({
        diagnosis: validDiagnosis,
        input: {
          ...input,
          promptFiles: {
            ...input.promptFiles,
            'core/obligations.md': `${oldText}\n${oldText}`,
          },
        },
      }),
    ).toThrow(/must occur exactly once.*found 2/);

    expect(() =>
      validate({
        ...validDiagnosis,
        proposed_edit: {
          ...validDiagnosis.proposed_edit,
          new_text: oldText,
        },
      }),
    ).toThrow(/new_text must differ from old_text/);
  });

  it('rejects replacements that break system prompt assembly', () => {
    const contextText = input.promptFiles['core/context.md'];

    expect(() =>
      validate({
        ...validDiagnosis,
        proposed_edit: {
          ...validDiagnosis.proposed_edit,
          file: 'core/context.md',
          old_text: contextText,
          new_text: 'Shift context without required placeholder.',
        },
      }),
    ).toThrow(/preserve exactly one \{COPILOT_CONTEXT\} placeholder.*found 0/);

    expect(() =>
      validate({
        ...validDiagnosis,
        proposed_edit: {
          ...validDiagnosis.proposed_edit,
          file: 'core/context.md',
          old_text: contextText,
          new_text: 'First: {COPILOT_CONTEXT}\nSecond: {COPILOT_CONTEXT}',
        },
      }),
    ).toThrow(/preserve exactly one \{COPILOT_CONTEXT\} placeholder.*found 2/);
  });

  it('rejects forbidden verdict fields anywhere in output', () => {
    expect(() => validate({ ...validDiagnosis, fixed: true })).toThrow(
      TheoDiagnosisValidationError,
    );
  });
});
