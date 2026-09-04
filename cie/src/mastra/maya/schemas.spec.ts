import {
  mayaJudgeInputSchema,
  mayaVerdictSchema,
  type MayaJudgeInput,
  type MayaVerdict,
} from './schemas';

function turn(
  name: 'historical' | 'old' | 'candidate',
  message: string,
  source: 'historical' | 'simulated' = 'historical',
) {
  const ref = `${name}:turn:18` as const;
  return {
    ref,
    turn: 18,
    trigger: 'guard_message',
    timestamp: '2026-08-04T03:12:00.000Z',
    events: [
      {
        ref: `${ref}:event:0` as const,
        timestamp: '2026-08-04T03:11:30.000Z',
        type: 'guard_message',
        data: { body: 'I completed the patrol.' },
      },
    ],
    guardReplies: [
      {
        ref: `${ref}:guard-reply:0` as const,
        timestamp: '2026-08-04T03:12:00.000Z',
        message: 'I completed the patrol.',
        source,
        historicalMessage: 'I completed the patrol.',
      },
    ],
    copilotMessages: [
      {
        ref: `${ref}:message:0` as const,
        timestamp: '2026-08-04T03:12:00.000Z',
        text: message,
      },
    ],
    actions: [],
    silent: false,
    skipped: false,
  };
}

export const validMayaJudgeInput: MayaJudgeInput = {
  evidence: {
    callout: 'Copilot pushed back repeatedly and flagged the guard.',
    jobId: '56370',
    startTurn: 18,
    endTurn: 18,
    trajectories: {
      historical: {
        name: 'historical',
        turns: [turn('historical', 'Please repeat the patrol.')],
      },
      old: {
        name: 'old',
        turns: [turn('old', 'Please repeat the patrol.')],
      },
      candidate: {
        name: 'candidate',
        turns: [turn('candidate', 'Thanks for confirming.', 'simulated')],
      },
    },
    warnings: ['Candidate guard reply was simulated.'],
  },
  measurements: {
    selectedKinds: ['message_count'],
    trajectories: {
      historical: [
        {
          key: 'pushback_count',
          value: 3,
          evidenceRefs: ['historical:turn:18'],
        },
      ],
      old: [
        {
          key: 'pushback_count',
          value: { count: 3, timestamps: ['2026-08-04T03:12:00.000Z'] },
          evidenceRefs: ['old:turn:18'],
        },
      ],
      candidate: [
        {
          key: 'pushback_count',
          value: { timestamps: [], count: 0 },
          evidenceRefs: ['candidate:turn:18'],
        },
      ],
    },
  },
};

export const validMayaVerdict: MayaVerdict = {
  fixed: true,
  verdict: 'yes',
  summary: 'Candidate stopped pushing back.',
  confidence: 82,
  criteria: [
    {
      claim: 'Copilot repeatedly pushed back after patrol completion.',
      old_measurement: 3,
      candidate_measurement: 0,
      passed: true,
      evidence: ['old:turn:18', 'candidate:turn:18'],
    },
  ],
  limitations: ['Candidate guard reply was simulated.'],
};

describe('Maya schemas', () => {
  it('accepts wrapped evidence, JSON input measurements, and strict verdict', () => {
    expect(mayaJudgeInputSchema.parse(validMayaJudgeInput)).toEqual(
      validMayaJudgeInput,
    );
    expect(mayaVerdictSchema.parse(validMayaVerdict)).toEqual(validMayaVerdict);
  });

  it('rejects incorrect trajectory references', () => {
    const input = structuredClone(validMayaJudgeInput);
    input.evidence.trajectories.candidate.turns[0].ref = 'old:turn:18';

    expect(mayaJudgeInputSchema.safeParse(input).success).toBe(false);
  });

  it('rejects turn item references inconsistent with array position', () => {
    const input = structuredClone(validMayaJudgeInput);
    input.evidence.trajectories.old.turns[0].events[0].ref =
      'old:turn:18:event:9';

    expect(mayaJudgeInputSchema.safeParse(input).success).toBe(false);
  });

  it('rejects unknown measurement evidence references', () => {
    const input = structuredClone(validMayaJudgeInput);
    input.measurements.trajectories.old[0].evidenceRefs = ['old:turn:999'];

    expect(mayaJudgeInputSchema.safeParse(input).success).toBe(false);
  });

  it('keeps measurement evidence in its matching trajectory', () => {
    const input = structuredClone(validMayaJudgeInput);
    input.measurements.trajectories.old[0].evidenceRefs = ['candidate:turn:18'];

    expect(mayaJudgeInputSchema.safeParse(input).success).toBe(false);
  });

  it.each(['prompt_edit', 'hypothesis'])(
    'rejects unknown verdict field %s',
    (field) => {
      expect(
        mayaVerdictSchema.safeParse({
          ...validMayaVerdict,
          [field]: 'not allowed',
        }).success,
      ).toBe(false);
    },
  );

  it.each([0, 100])('accepts confidence boundary %s', (confidence) => {
    expect(
      mayaVerdictSchema.safeParse({ ...validMayaVerdict, confidence }).success,
    ).toBe(true);
  });

  it.each([-1, 101, 82.5, '82'])(
    'rejects invalid confidence %s',
    (confidence) => {
      expect(
        mayaVerdictSchema.safeParse({ ...validMayaVerdict, confidence })
          .success,
      ).toBe(false);
    },
  );

  it('requires confidence', () => {
    const withoutConfidence: Partial<MayaVerdict> = { ...validMayaVerdict };
    delete withoutConfidence.confidence;

    expect(mayaVerdictSchema.safeParse(withoutConfidence).success).toBe(false);
  });

  it('rejects unknown nested verdict fields', () => {
    expect(
      mayaVerdictSchema.safeParse({
        ...validMayaVerdict,
        criteria: [
          {
            ...validMayaVerdict.criteria[0],
            promptSuggestion: 'Change policy wording.',
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('rejects free-form evidence descriptions', () => {
    expect(
      mayaVerdictSchema.safeParse({
        ...validMayaVerdict,
        criteria: [
          {
            ...validMayaVerdict.criteria[0],
            evidence: ['old turn 18 at 03:12', 'candidate:turn:18'],
          },
        ],
      }).success,
    ).toBe(false);
  });
});
