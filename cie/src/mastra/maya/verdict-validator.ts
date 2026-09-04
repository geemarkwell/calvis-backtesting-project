import {
  mayaJudgeInputSchema,
  mayaVerdictSchema,
  type MayaJudgeInput,
  type MayaMeasurementValue,
  type MayaVerdict,
} from './schemas';

export interface ValidateMayaVerdictInput {
  verdict: unknown;
  input: unknown;
}

export class MayaVerdictValidationError extends Error {
  constructor(public readonly issues: readonly string[]) {
    super(`Invalid Maya verdict:\n- ${issues.join('\n- ')}`);
    this.name = 'MayaVerdictValidationError';
  }
}

function formatSchemaIssue(
  scope: string,
  issue: { readonly path: readonly PropertyKey[]; readonly message: string },
): string {
  const path =
    issue.path.length > 0 ? issue.path.map(String).join('.') : '<root>';
  return `${scope}.${path}: ${issue.message}`;
}

function canonicalJson(value: MayaMeasurementValue): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function hasMeasurementPair(
  input: MayaJudgeInput,
  oldValue: MayaMeasurementValue,
  candidateValue: MayaMeasurementValue,
): boolean {
  const expectedOld = canonicalJson(oldValue);
  const expectedCandidate = canonicalJson(candidateValue);
  const candidateByKey = new Map(
    input.measurements.trajectories.candidate.map((measurement) => [
      measurement.key,
      measurement.value,
    ]),
  );

  return input.measurements.trajectories.old.some(
    (measurement) =>
      canonicalJson(measurement.value) === expectedOld &&
      candidateByKey.has(measurement.key) &&
      canonicalJson(candidateByKey.get(measurement.key)!) === expectedCandidate,
  );
}

export function completeMayaVerdictEvidence({
  verdict: unparsedVerdict,
  input: unparsedInput,
}: ValidateMayaVerdictInput): unknown {
  const inputResult = mayaJudgeInputSchema.safeParse(unparsedInput);
  const verdictResult = mayaVerdictSchema.safeParse(unparsedVerdict);
  if (!inputResult.success || !verdictResult.success) {
    return unparsedVerdict;
  }

  const input = inputResult.data;
  const verdict = verdictResult.data;
  const oldFallback = input.evidence.trajectories.old.turns[0]?.ref;
  const candidateFallback = input.evidence.trajectories.candidate.turns[0]?.ref;

  return {
    ...verdict,
    criteria: verdict.criteria.map((criterion) => {
      const evidence = new Set(criterion.evidence);
      const pair = matchingMeasurementPair(
        input,
        criterion.old_measurement,
        criterion.candidate_measurement,
      );

      if (![...evidence].some((reference) => reference.startsWith('old:'))) {
        const oldReferences =
          pair?.old.evidenceRefs.filter((reference) =>
            reference.startsWith('old:'),
          ) ?? [];
        for (const reference of oldReferences.length > 0
          ? oldReferences
          : oldFallback
            ? [oldFallback]
            : []) {
          evidence.add(reference);
        }
      }

      if (
        ![...evidence].some((reference) => reference.startsWith('candidate:'))
      ) {
        const candidateReferences =
          pair?.candidate.evidenceRefs.filter((reference) =>
            reference.startsWith('candidate:'),
          ) ?? [];
        for (const reference of candidateReferences.length > 0
          ? candidateReferences
          : candidateFallback
            ? [candidateFallback]
            : []) {
          evidence.add(reference);
        }
      }

      return { ...criterion, evidence: [...evidence] };
    }),
  };
}

function matchingMeasurementPair(
  input: MayaJudgeInput,
  oldValue: MayaMeasurementValue,
  candidateValue: MayaMeasurementValue,
) {
  const expectedOld = canonicalJson(oldValue);
  const expectedCandidate = canonicalJson(candidateValue);
  const candidateByKey = new Map(
    input.measurements.trajectories.candidate.map((measurement) => [
      measurement.key,
      measurement,
    ]),
  );

  for (const old of input.measurements.trajectories.old) {
    const candidate = candidateByKey.get(old.key);
    if (
      canonicalJson(old.value) === expectedOld &&
      candidate !== undefined &&
      canonicalJson(candidate.value) === expectedCandidate
    ) {
      return { old, candidate };
    }
  }
  return undefined;
}

function evidenceReferences(input: MayaJudgeInput): Set<string> {
  const references = new Set<string>();
  for (const trajectory of Object.values(input.evidence.trajectories)) {
    for (const turn of trajectory.turns) {
      references.add(turn.ref);
      turn.events.forEach((event) => references.add(event.ref));
      turn.guardReplies.forEach((reply) => references.add(reply.ref));
      turn.copilotMessages.forEach((message) => references.add(message.ref));
      turn.actions.forEach((action) => references.add(action.ref));
    }
  }
  return references;
}

export function validateMayaVerdict({
  verdict: unparsedVerdict,
  input: unparsedInput,
}: ValidateMayaVerdictInput): MayaVerdict {
  const inputResult = mayaJudgeInputSchema.safeParse(unparsedInput);
  const verdictResult = mayaVerdictSchema.safeParse(unparsedVerdict);
  const schemaIssues = [
    ...(inputResult.success
      ? []
      : inputResult.error.issues.map((issue) =>
          formatSchemaIssue('input', issue),
        )),
    ...(verdictResult.success
      ? []
      : verdictResult.error.issues.map((issue) =>
          formatSchemaIssue('verdict', issue),
        )),
  ];

  if (!inputResult.success || !verdictResult.success) {
    throw new MayaVerdictValidationError(schemaIssues);
  }

  const input = inputResult.data;
  const verdict = verdictResult.data;
  const issues: string[] = [];
  const expectedVerdict = verdict.fixed ? 'yes' : 'no';

  if (verdict.verdict !== expectedVerdict) {
    issues.push(
      `fixed=${String(verdict.fixed)} requires verdict=${expectedVerdict}.`,
    );
  }

  const allCriteriaPassed = verdict.criteria.every(
    (criterion) => criterion.passed,
  );
  if (verdict.fixed !== allCriteriaPassed) {
    issues.push('fixed=yes if and only if every criterion passed.');
  }

  const knownReferences = evidenceReferences(input);
  verdict.criteria.forEach((criterion, index) => {
    const unknownReferences = criterion.evidence.filter(
      (reference) => !knownReferences.has(reference),
    );
    if (unknownReferences.length > 0) {
      issues.push(
        `criteria.${index}.evidence contains unknown reference(s): ${[
          ...new Set(unknownReferences),
        ].join(', ')}.`,
      );
    }

    if (!criterion.evidence.some((reference) => reference.startsWith('old:'))) {
      issues.push(
        `criteria.${index}.evidence must include an old replay reference.`,
      );
    }
    if (
      !criterion.evidence.some((reference) =>
        reference.startsWith('candidate:'),
      )
    ) {
      issues.push(
        `criteria.${index}.evidence must include a candidate replay reference.`,
      );
    }

    if (
      !hasMeasurementPair(
        input,
        criterion.old_measurement,
        criterion.candidate_measurement,
      )
    ) {
      issues.push(
        `criteria.${index} measurements must copy values from one shared precomputed old/candidate measurement key.`,
      );
    }
  });

  if (issues.length > 0) {
    throw new MayaVerdictValidationError(issues);
  }

  return verdict;
}
