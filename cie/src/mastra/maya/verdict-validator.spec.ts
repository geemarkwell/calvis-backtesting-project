import type { MayaJudgeInput, MayaVerdict } from './schemas';
import {
  completeMayaVerdictEvidence,
  MayaVerdictValidationError,
  validateMayaVerdict,
} from './verdict-validator';

function trajectory(name: 'historical' | 'old' | 'candidate') {
  return {
    name,
    turns: [
      {
        ref: `${name}:turn:18` as const,
        turn: 18,
        trigger: 'guard_message',
        timestamp: '2026-08-04T03:12:00.000Z',
        events: [],
        guardReplies: [],
        copilotMessages: [],
        actions: [],
        silent: true,
        skipped: false,
      },
    ],
  };
}

const validInput: MayaJudgeInput = {
  evidence: {
    callout: 'Copilot pushed back repeatedly.',
    jobId: '56370',
    startTurn: 18,
    endTurn: 18,
    trajectories: {
      historical: trajectory('historical'),
      old: trajectory('old'),
      candidate: trajectory('candidate'),
    },
    warnings: [],
  },
  measurements: {
    selectedKinds: ['message_count'],
    trajectories: {
      historical: [{ key: 'pushback_count', value: 3, evidenceRefs: [] }],
      old: [
        {
          key: 'pushback_count',
          value: 3,
          evidenceRefs: ['old:turn:18'],
        },
      ],
      candidate: [
        {
          key: 'pushback_count',
          value: 0,
          evidenceRefs: ['candidate:turn:18'],
        },
      ],
    },
  },
};

const validVerdict: MayaVerdict = {
  fixed: true,
  verdict: 'yes',
  summary: 'Candidate stopped pushing back.',
  confidence: 90,
  criteria: [
    {
      claim: 'Copilot repeatedly pushed back.',
      old_measurement: 3,
      candidate_measurement: 0,
      passed: true,
      evidence: ['old:turn:18', 'candidate:turn:18'],
    },
  ],
  limitations: [],
};

function validate(verdict: unknown = validVerdict) {
  return validateMayaVerdict({ verdict, input: validInput });
}

describe('Maya verdict validator', () => {
  it('returns a valid verdict', () => {
    expect(validate()).toEqual(validVerdict);
  });

  it('requires fixed and verdict to agree', () => {
    expect(() => validate({ ...validVerdict, verdict: 'no' })).toThrow(
      /fixed=true requires verdict=yes/,
    );
  });

  it('requires fixed=yes if and only if every criterion passes', () => {
    expect(() =>
      validate({
        ...validVerdict,
        criteria: [
          validVerdict.criteria[0],
          { ...validVerdict.criteria[0], passed: false },
        ],
      }),
    ).toThrow(/if and only if every criterion passed/);

    expect(() =>
      validate({ ...validVerdict, fixed: false, verdict: 'no' }),
    ).toThrow(/if and only if every criterion passed/);
  });

  it('rejects evidence references absent from trajectories', () => {
    expect(() =>
      validate({
        ...validVerdict,
        criteria: [
          {
            ...validVerdict.criteria[0],
            evidence: ['old:turn:18', 'candidate:turn:999'],
          },
        ],
      }),
    ).toThrow(/unknown reference\(s\): candidate:turn:999/);
  });

  it('requires both old and candidate evidence for every criterion', () => {
    expect(() =>
      validate({
        ...validVerdict,
        criteria: [
          {
            ...validVerdict.criteria[0],
            evidence: ['historical:turn:18', 'candidate:turn:18'],
          },
        ],
      }),
    ).toThrow(/must include an old replay reference/);
  });

  it('deterministically completes missing trajectory evidence', () => {
    const incompleteVerdict = {
      ...validVerdict,
      criteria: [
        {
          ...validVerdict.criteria[0],
          evidence: ['historical:turn:18', 'candidate:turn:18'],
        },
      ],
    };

    const completed = completeMayaVerdictEvidence({
      verdict: incompleteVerdict,
      input: validInput,
    });

    expect(completed).toEqual({
      ...incompleteVerdict,
      criteria: [
        {
          ...incompleteVerdict.criteria[0],
          evidence: ['historical:turn:18', 'candidate:turn:18', 'old:turn:18'],
        },
      ],
    });
    expect(() =>
      validateMayaVerdict({ verdict: completed, input: validInput }),
    ).not.toThrow();
  });

  it('uses a trajectory turn when matching measurement has no evidence refs', () => {
    const input = structuredClone(validInput);
    input.measurements.trajectories.old[0].evidenceRefs = [];
    const incompleteVerdict = {
      ...validVerdict,
      criteria: [
        {
          ...validVerdict.criteria[0],
          evidence: ['historical:turn:18', 'candidate:turn:18'],
        },
      ],
    };

    const completed = completeMayaVerdictEvidence({
      verdict: incompleteVerdict,
      input,
    });

    expect((completed as MayaVerdict).criteria[0].evidence).toContain(
      'old:turn:18',
    );
  });

  it('requires measurement values to be precomputed per trajectory', () => {
    expect(() =>
      validate({
        ...validVerdict,
        criteria: [{ ...validVerdict.criteria[0], old_measurement: 99 }],
      }),
    ).toThrow(/shared precomputed old\/candidate measurement key/);

    expect(() =>
      validate({
        ...validVerdict,
        criteria: [
          {
            ...validVerdict.criteria[0],
            candidate_measurement: 99,
          },
        ],
      }),
    ).toThrow(/shared precomputed old\/candidate measurement key/);
  });

  it('rejects unknown verdict and judge-input fields', () => {
    expect(() =>
      validate({ ...validVerdict, hypothesis: 'Prompt should improve.' }),
    ).toThrow(MayaVerdictValidationError);

    expect(() =>
      validateMayaVerdict({
        verdict: validVerdict,
        input: { ...validInput, promptDiff: 'secret edit' },
      }),
    ).toThrow(/input/);
  });
});
