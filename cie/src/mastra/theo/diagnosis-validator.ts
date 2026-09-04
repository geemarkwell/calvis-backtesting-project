import { theoDiagnosisSchema, type TheoDiagnosis } from './schemas';
import type { DiagnosticInput } from './diagnostic-input';

export type TheoValidationTraceEntry =
  | string
  | {
      readonly ref: string;
      readonly content?: unknown;
      readonly timestamp?: string;
      readonly type?: string;
      readonly trigger?: string;
      readonly instructionFile?: string;
    };

export type TheoValidationPromptFile =
  | { readonly file: string; readonly content: string }
  | { readonly filename: string; readonly content: string };
type TheoValidationPromptFiles =
  Readonly<Record<string, string>> | readonly TheoValidationPromptFile[];

export interface ValidateTheoDiagnosisInput {
  diagnosis: unknown;
  input: DiagnosticInput;
}

const FORBIDDEN_VERDICT_FIELDS = new Set([
  'fixed',
  'passed',
  'verdict',
  'finalverdict',
  'qualityverdict',
  'finalqualityverdict',
  'passfail',
]);
const REQUIRED_CORE_PROMPT_FILES = [
  'core/identity.md',
  'core/context.md',
  'core/holding_the_post.md',
  'core/obligations.md',
  'core/comms_policy.md',
  'core/tools.md',
] as const;
const COPILOT_CONTEXT_PLACEHOLDER = '{COPILOT_CONTEXT}';

export class TheoDiagnosisValidationError extends Error {
  constructor(public readonly issues: readonly string[]) {
    super(`Invalid Theo diagnosis:\n- ${issues.join('\n- ')}`);
    this.name = 'TheoDiagnosisValidationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizedFieldName(field: string): string {
  return field.toLowerCase().replace(/[\s_-]/g, '');
}

function findForbiddenVerdictFields(value: unknown, path = '<root>'): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      findForbiddenVerdictFields(item, `${path}[${index}]`),
    );
  }

  if (!isRecord(value)) {
    return [];
  }

  return Object.entries(value).flatMap(([key, child]) => {
    const childPath = path === '<root>' ? key : `${path}.${key}`;
    const ownIssue = FORBIDDEN_VERDICT_FIELDS.has(normalizedFieldName(key))
      ? [`${childPath}: verdict fields are not allowed in Theo output.`]
      : [];

    return [...ownIssue, ...findForbiddenVerdictFields(child, childPath)];
  });
}

function formatSchemaIssue(issue: {
  readonly path: readonly PropertyKey[];
  readonly message: string;
}): string {
  const path =
    issue.path.length > 0 ? issue.path.map(String).join('.') : '<root>';
  return `${path}: ${issue.message}`;
}

function normalizePromptFilename(file: string): string {
  const normalized = file.replaceAll('\\', '/');
  const promptsSegment = '/prompts/';
  const promptsIndex = normalized.lastIndexOf(promptsSegment);

  if (promptsIndex >= 0) {
    return normalized.slice(promptsIndex + promptsSegment.length);
  }

  return normalized.startsWith('prompts/')
    ? normalized.slice('prompts/'.length)
    : normalized;
}

function isPromptFileArray(
  promptFiles: TheoValidationPromptFiles,
): promptFiles is readonly TheoValidationPromptFile[] {
  return Array.isArray(promptFiles);
}

function indexPromptFiles(
  promptFiles: TheoValidationPromptFiles,
): Map<string, string> {
  const entries: ReadonlyArray<readonly [string, string]> = isPromptFileArray(
    promptFiles,
  )
    ? promptFiles.map((promptFile) => [
        'file' in promptFile ? promptFile.file : promptFile.filename,
        promptFile.content,
      ])
    : Object.entries(promptFiles);

  return new Map(
    entries.map(([file, content]) => [normalizePromptFilename(file), content]),
  );
}

function traceReferenceSet(
  trace: readonly TheoValidationTraceEntry[],
): Set<string> {
  return new Set(
    trace.map((entry) => (typeof entry === 'string' ? entry : entry.ref)),
  );
}

function traceEntryMap(
  trace: readonly TheoValidationTraceEntry[],
): Map<string, Exclude<TheoValidationTraceEntry, string>> {
  return new Map(
    trace
      .filter(
        (entry): entry is Exclude<TheoValidationTraceEntry, string> =>
          typeof entry !== 'string',
      )
      .map((entry) => [entry.ref, entry]),
  );
}

function diagnosisTraceReferences(diagnosis: TheoDiagnosis): string[] {
  return [
    ...diagnosis.evidence_windows.flatMap((window) => window.trace_refs),
    ...diagnosis.observed_behavior.flatMap((item) => item.trace_refs),
    ...diagnosis.relevant_turns.map((turn) => turn.turn_ref),
  ];
}

function countOccurrences(contents: string, search: string): number {
  let count = 0;
  let offset = 0;

  while (offset <= contents.length - search.length) {
    const index = contents.indexOf(search, offset);

    if (index < 0) {
      break;
    }

    count += 1;
    offset = index + 1;
  }

  return count;
}

function validateReplacementResult(
  promptFiles: Map<string, string>,
  file: string,
  originalContents: string,
  oldText: string,
  newText: string,
): string[] {
  const replacementIndex = originalContents.indexOf(oldText);
  const candidateContents = `${originalContents.slice(0, replacementIndex)}${newText}${originalContents.slice(replacementIndex + oldText.length)}`;
  const candidatePromptFiles = new Map(promptFiles);
  candidatePromptFiles.set(file, candidateContents);
  const issues: string[] = [];

  if (!candidateContents.trim()) {
    issues.push(`Proposed edit would leave ${file} empty.`);
  }

  const missingOrEmptyCoreFiles = REQUIRED_CORE_PROMPT_FILES.filter(
    (coreFile) => !candidatePromptFiles.get(coreFile)?.trim(),
  );
  if (missingOrEmptyCoreFiles.length > 0) {
    issues.push(
      `Proposed replacement cannot produce a valid system prompt; missing or empty core file(s): ${missingOrEmptyCoreFiles.join(', ')}.`,
    );
    return issues;
  }

  const assembledCorePrompt = REQUIRED_CORE_PROMPT_FILES.map((coreFile) =>
    candidatePromptFiles.get(coreFile)!.trimEnd(),
  ).join('\n\n');
  const contextPlaceholderCount = countOccurrences(
    assembledCorePrompt,
    COPILOT_CONTEXT_PLACEHOLDER,
  );
  if (contextPlaceholderCount !== 1) {
    issues.push(
      `Proposed replacement must preserve exactly one ${COPILOT_CONTEXT_PLACEHOLDER} placeholder across core prompts; found ${contextPlaceholderCount}.`,
    );
  }

  return issues;
}

export function validateTheoDiagnosis({
  diagnosis: unparsedDiagnosis,
  input,
}: ValidateTheoDiagnosisInput): TheoDiagnosis {
  const schemaResult = theoDiagnosisSchema.safeParse(unparsedDiagnosis);
  const schemaIssues = schemaResult.success
    ? []
    : schemaResult.error.issues.map(formatSchemaIssue);
  const forbiddenFieldIssues = findForbiddenVerdictFields(unparsedDiagnosis);

  if (!schemaResult.success) {
    throw new TheoDiagnosisValidationError([
      ...schemaIssues,
      ...forbiddenFieldIssues,
    ]);
  }

  if (forbiddenFieldIssues.length > 0) {
    throw new TheoDiagnosisValidationError(forbiddenFieldIssues);
  }

  const diagnosis = schemaResult.data;
  const issues: string[] = [];
  const expectedJobIds = [
    ...new Set(input.badResponses.map((window) => window.jobId)),
  ];
  if (
    diagnosis.job_ids.length !== expectedJobIds.length ||
    diagnosis.job_ids.some((jobId, index) => jobId !== expectedJobIds[index])
  ) {
    issues.push(
      `Diagnosis job_ids must exactly match supplied jobs: ${expectedJobIds.join(', ')}.`,
    );
  }
  if (diagnosis.what_went_wrong !== input.whatWentWrong) {
    issues.push('Diagnosis what_went_wrong does not match supplied problem.');
  }
  if (diagnosis.expected_behavior !== input.expectedBehavior) {
    issues.push(
      'Diagnosis expected_behavior does not match supplied expected behavior.',
    );
  }

  const trace = input.badResponses.flatMap((window) => window.trace);
  const knownTraceReferences = traceReferenceSet(trace);
  const indexedTraceEntries = traceEntryMap(trace);
  const missingTraceReferences = [
    ...new Set(
      diagnosisTraceReferences(diagnosis).filter(
        (reference) => !knownTraceReferences.has(reference),
      ),
    ),
  ];

  if (missingTraceReferences.length > 0) {
    issues.push(
      `Unknown trace reference(s): ${missingTraceReferences.join(', ')}.`,
    );
  }

  if (diagnosis.evidence_windows.length !== input.badResponses.length) {
    issues.push(
      `Diagnosis must include exactly ${input.badResponses.length} evidence window(s).`,
    );
  }

  diagnosis.evidence_windows.forEach((window, index) => {
    const suppliedWindow = input.badResponses[index];
    if (!suppliedWindow) {
      return;
    }
    if (
      window.job_id !== suppliedWindow.jobId ||
      window.start_turn !== suppliedWindow.startTurn ||
      window.end_turn !== suppliedWindow.endTurn
    ) {
      issues.push(
        `Evidence window ${index} must match supplied job and turn bounds.`,
      );
    }
    const suppliedReferences = traceReferenceSet(suppliedWindow.trace);
    const outsideReferences = window.trace_refs.filter(
      (reference) => !suppliedReferences.has(reference),
    );
    if (outsideReferences.length > 0) {
      issues.push(
        `Evidence window ${index} cites reference(s) outside its requested turn range: ${outsideReferences.join(', ')}.`,
      );
    }
  });

  const evidenceReferences = new Set(
    diagnosis.evidence_windows.flatMap((window) => window.trace_refs),
  );

  for (const observation of diagnosis.observed_behavior) {
    for (const reference of observation.trace_refs) {
      if (!evidenceReferences.has(reference)) {
        issues.push(
          `Observed-behavior reference ${reference} is not included in evidence_windows.`,
        );
      }
    }
  }

  for (const relevantTurn of diagnosis.relevant_turns) {
    if (!evidenceReferences.has(relevantTurn.turn_ref)) {
      issues.push(
        `Relevant turn ${relevantTurn.turn_ref} is not included in evidence_windows.`,
      );
    }
    const traceEntry = indexedTraceEntries.get(relevantTurn.turn_ref);
    if (!traceEntry) {
      continue;
    }
    if (traceEntry.type !== undefined && traceEntry.type !== 'turn_start') {
      issues.push(
        `Relevant turn ${relevantTurn.turn_ref} does not reference a turn_start entry.`,
      );
    }
    if (
      traceEntry.trigger !== undefined &&
      traceEntry.trigger !== relevantTurn.trigger
    ) {
      issues.push(
        `Relevant turn ${relevantTurn.turn_ref} trigger does not match normalized trace.`,
      );
    }
    if (
      traceEntry.instructionFile !== undefined &&
      traceEntry.instructionFile !== relevantTurn.instruction_file
    ) {
      issues.push(
        `Relevant turn ${relevantTurn.turn_ref} instruction file does not match normalized trace.`,
      );
    }
  }

  const indexedPromptFiles = indexPromptFiles(input.promptFiles);
  const diagnosisPrompt = indexedPromptFiles.get(
    diagnosis.prompt_diagnosis.file,
  );

  if (diagnosisPrompt === undefined) {
    issues.push(
      `Prompt diagnosis file was not supplied: ${diagnosis.prompt_diagnosis.file}.`,
    );
  } else if (!diagnosisPrompt.includes(diagnosis.prompt_diagnosis.exact_text)) {
    issues.push(
      `Prompt diagnosis exact_text does not occur in ${diagnosis.prompt_diagnosis.file}.`,
    );
  }

  const editPrompt = indexedPromptFiles.get(diagnosis.proposed_edit.file);

  if (editPrompt === undefined) {
    issues.push(
      `Proposed edit file was not supplied: ${diagnosis.proposed_edit.file}.`,
    );
  } else {
    const oldTextOccurrences = countOccurrences(
      editPrompt,
      diagnosis.proposed_edit.old_text,
    );

    if (oldTextOccurrences !== 1) {
      issues.push(
        `Proposed edit old_text must occur exactly once in ${diagnosis.proposed_edit.file}; found ${oldTextOccurrences}.`,
      );
    } else {
      issues.push(
        ...validateReplacementResult(
          indexedPromptFiles,
          diagnosis.proposed_edit.file,
          editPrompt,
          diagnosis.proposed_edit.old_text,
          diagnosis.proposed_edit.new_text,
        ),
      );
    }
  }

  if (diagnosis.proposed_edit.new_text === diagnosis.proposed_edit.old_text) {
    issues.push('Proposed edit new_text must differ from old_text.');
  }

  if (issues.length > 0) {
    throw new TheoDiagnosisValidationError(issues);
  }

  return diagnosis;
}
