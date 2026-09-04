import type { MayaJudgeInput, MayaVerdict } from './schemas';
import { validateMayaVerdict } from './verdict-validator';

const timestamp = '2026-08-05T03:12:00.000Z';

function trajectory(name: 'historical' | 'old' | 'candidate', message: string) {
  return {
    name,
    turns: [
      {
        ref: `${name}:turn:18`,
        turn: 18,
        trigger: 'guard_message',
        timestamp,
        events: [],
        guardReplies: [],
        copilotMessages: [
          {
            ref: `${name}:turn:18:message:0`,
            timestamp,
            text: message,
          },
        ],
        actions: [],
        silent: false,
        skipped: false,
      },
    ],
  };
}

function judgeInput(candidatePushbacks: number): MayaJudgeInput {
  const measurement = (
    name: 'historical' | 'old' | 'candidate',
    pushbacks: number,
    flags: number,
  ) => [
    {
      key: 'copilot_message_count',
      value: pushbacks,
      evidenceRefs: [`${name}:turn:18`],
    },
    {
      key: 'flag_count',
      value: flags,
      evidenceRefs: [`${name}:turn:18`],
    },
  ];

  return {
    evidence: {
      callout:
        'Copilot pushed back three times after patrol completion and flagged the guard.',
      jobId: '56370',
      startTurn: 18,
      endTurn: 18,
      trajectories: {
        historical: trajectory(
          'historical',
          'Your location data does not show a patrol.',
        ),
        old: trajectory('old', 'I still need proof that patrol was completed.'),
        candidate: trajectory(
          'candidate',
          candidatePushbacks === 0
            ? 'Thanks for confirming patrol completion.'
            : 'Different wording, but I still need patrol proof.',
        ),
      },
      warnings: [],
    },
    measurements: {
      selectedKinds: ['message_count', 'flags'],
      trajectories: {
        historical: measurement('historical', 3, 1),
        old: measurement('old', 3, 1),
        candidate: measurement('candidate', candidatePushbacks, 0),
      },
    },
  };
}

function verdict(fixed: boolean, candidateMeasurement: number): MayaVerdict {
  return {
    fixed,
    verdict: fixed ? 'yes' : 'no',
    summary: fixed
      ? 'Candidate stopped repeated pushback.'
      : 'Candidate still exhibits repeated pushback.',
    confidence: 90,
    criteria: [
      {
        claim: 'Repeated pushback after patrol completion stopped.',
        old_measurement: 3,
        candidate_measurement: candidateMeasurement,
        passed: fixed,
        evidence: ['old:turn:18', 'candidate:turn:18'],
      },
    ],
    limitations: [],
  };
}

describe('Maya minimum calibration labels', () => {
  it.each([
    ['historical failing behavior', 3, false, 'no'],
    ['clearly corrected behavior', 0, true, 'yes'],
    ['different wording with same bad behavior', 3, false, 'no'],
    ['unrelated flag improvement with pushback remaining', 3, false, 'no'],
  ] as const)(
    'labels %s as %s',
    (_name, candidatePushbacks, fixed, expectedVerdict) => {
      const result = validateMayaVerdict({
        input: judgeInput(candidatePushbacks),
        verdict: verdict(fixed, candidatePushbacks),
      });

      expect(result.verdict).toBe(expectedVerdict);
    },
  );
});
