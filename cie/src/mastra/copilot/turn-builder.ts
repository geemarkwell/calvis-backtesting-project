import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { CopilotTurnInput } from './types';

const TRIGGER_INSTRUCTION_FILES: Record<string, string> = {
  session_start: 'session_start.md',
  guard_message: 'guard_response.md',
  operator_message: 'operator_message.md',
  approval_decision: 'approval_decision.md',
  scheduled_check_in: 'scheduled_check_in.md',
  obligation_due: 'obligation_due.md',
  job_event: 'job_event.md',
  guard_in_transit: 'job_event.md',
  guard_checked_in: 'job_event.md',
};

export function instructionFileForTrigger(trigger: string): string {
  return TRIGGER_INSTRUCTION_FILES[trigger] ?? 'default.md';
}

export async function loadTriggerInstruction(
  promptRoot: string,
  trigger: string,
): Promise<string> {
  const fileName = instructionFileForTrigger(trigger);
  const instruction = await readFile(
    resolve(promptRoot, 'instructions', fileName),
    'utf8',
  );

  if (!instruction.trim()) {
    throw new Error(`Trigger instruction file is empty: ${fileName}`);
  }

  return instruction;
}

function optionalSection(title: string, content?: string): string | undefined {
  if (!content?.trim()) {
    return undefined;
  }

  return `## ${title}\n${content.trim()}`;
}

export async function buildCopilotTurnMessage(
  input: CopilotTurnInput,
): Promise<string> {
  const hasTimeLeft = input.timeLeftMinutes !== undefined;
  const hasTimeUntilStart = input.minutesUntilShiftStart !== undefined;

  if (hasTimeLeft === hasTimeUntilStart) {
    throw new Error(
      'Provide exactly one of timeLeftMinutes or minutesUntilShiftStart.',
    );
  }

  if (input.assignedGuards.length === 0) {
    throw new Error('At least one assigned guard is required.');
  }

  const guards = input.assignedGuards
    .map((guard) => `${guard.name} (id \`${guard.id}\`)`)
    .join(', ');
  const instruction = await loadTriggerInstruction(
    input.promptRoot,
    input.trigger,
  );
  const timingLine = hasTimeLeft
    ? `**Time left on shift (authoritative):** ${input.timeLeftMinutes} min`
    : `**Minutes until shift start (authoritative):** ${input.minutesUntilShiftStart} min`;

  const sections = [
    [
      '## Session',
      `- **Session ID:** \`${input.sessionId}\``,
      `- **Job ID:** \`${input.jobId}\` — pass as \`job_id\` to job-scoped data tools (get_guard_locations, get_job_logs, get_job_incidents, get_site_history)`,
      `- **Assigned guard(s):** ${guards} — the only confirmed guards on this shift. Use these guard_id(s) for guard-scoped tools and DMs; treat anyone else (e.g. a stale ping from a guard since removed) as not on this shift.`,
      '- Use this session_id for all copilot tool calls (create_copilot_task, request_copilot_dm, add_copilot_note, get_copilot_context)',
    ].join('\n'),
    optionalSection('Job Context', input.jobContext),
    optionalSection('Previous Session Analysis', input.previousSessionAnalysis),
    optionalSection('Turn History', input.turnHistory),
    instruction,
    optionalSection(
      'Operator Messages (new since last turn)',
      input.operatorMessages,
    ),
    optionalSection(
      'Approval Decisions (new since last turn)',
      input.approvalDecisions,
    ),
    optionalSection('Job Events (new since last turn)', input.jobEvents),
    optionalSection('Actions Taken', input.actionsTaken),
    optionalSection('Why you woke this cycle', input.wakeReason),
    [
      `## Turn ${input.turnNumber} (triggered by: ${input.trigger})`,
      `**Current time (authoritative — use this for any time-of-day reasoning, not the session-start time above):** ${input.currentTime}`,
      timingLine,
    ].join('\n'),
  ].filter((section): section is string => Boolean(section));

  return sections.join('\n\n');
}

export { TRIGGER_INSTRUCTION_FILES };
