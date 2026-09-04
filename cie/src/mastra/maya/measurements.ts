import type {
  MayaEvidencePacket,
  MayaEvidenceTrajectory,
  MayaEvidenceTurn,
  MayaTrajectoryName,
} from './evidence-packet';

export type MayaMeasurementValue =
  | string
  | number
  | boolean
  | null
  | MayaMeasurementValue[]
  | { [key: string]: MayaMeasurementValue };

export type MayaMeasurementKind =
  | 'message_count'
  | 'message_timing'
  | 'scheduled_wake_silence'
  | 'action_counts'
  | 'flags'
  | 'escalations'
  | 'trigger_to_action_latency'
  | 'simulated_guard_replies';

export interface MayaMeasurement {
  key: string;
  value: MayaMeasurementValue;
  evidenceRefs: string[];
}

export interface MayaMeasurements {
  selectedKinds: MayaMeasurementKind[];
  trajectories: Record<MayaTrajectoryName, MayaMeasurement[]>;
}

export function computeMayaMeasurements(
  packet: MayaEvidencePacket,
): MayaMeasurements {
  const selectedKinds = selectMeasurementKinds(packet.callout);
  return {
    selectedKinds,
    trajectories: {
      historical: measureTrajectory(
        packet.trajectories.historical,
        selectedKinds,
      ),
      old: measureTrajectory(packet.trajectories.old, selectedKinds),
      candidate: measureTrajectory(
        packet.trajectories.candidate,
        selectedKinds,
      ),
    },
  };
}

export function selectMeasurementKinds(callout: string): MayaMeasurementKind[] {
  const selected = new Set<MayaMeasurementKind>();
  const text = callout.toLowerCase();

  if (
    /\b(message|messages|contact|text(?:ed|ing|s)?|reply|replies|push(?:ed|ing)? back|challenge(?:d|s|ing)?|repeat(?:ed|s|ing)?)\b/.test(
      text,
    )
  ) {
    selected.add('message_count');
    selected.add('message_timing');
  }
  if (/\b(silent|silence|scheduled|wake|check[ -]?in)\b/.test(text)) {
    selected.add('scheduled_wake_silence');
  }
  if (
    /\b(tool|action|request(?:ed|s|ing)?|report|note|task|patrol)\b/.test(text)
  ) {
    selected.add('action_counts');
  }
  if (/\bflag(?:ged|ging|s)?\b/.test(text)) {
    selected.add('flags');
  }
  if (/\bescalat(?:e|ed|es|ing|ion|ions)\b/.test(text)) {
    selected.add('escalations');
  }
  if (
    /\b(timing|latency|delay(?:ed|s)?|within|after|before|seconds?|minutes?|hours?|quick(?:ly)?|late)\b/.test(
      text,
    )
  ) {
    selected.add('trigger_to_action_latency');
  }

  if (selected.size === 0) {
    selected.add('message_count');
    selected.add('action_counts');
  }

  // Always disclose how much of each path depends on synthetic guard behavior.
  selected.add('simulated_guard_replies');
  return [...selected];
}

function measureTrajectory(
  trajectory: MayaEvidenceTrajectory,
  selectedKinds: MayaMeasurementKind[],
): MayaMeasurement[] {
  const measurements: MayaMeasurement[] = [];

  for (const kind of selectedKinds) {
    switch (kind) {
      case 'message_count':
        measurements.push(countMessages(trajectory));
        break;
      case 'message_timing':
        measurements.push(...messageTiming(trajectory));
        break;
      case 'scheduled_wake_silence':
        measurements.push(...scheduledWakeSilence(trajectory));
        break;
      case 'action_counts':
        measurements.push(...actionCounts(trajectory));
        break;
      case 'flags':
        measurements.push(actionCategoryCount(trajectory, 'flag'));
        break;
      case 'escalations':
        measurements.push(actionCategoryCount(trajectory, 'escalation'));
        break;
      case 'trigger_to_action_latency':
        measurements.push(...triggerToActionLatency(trajectory));
        break;
      case 'simulated_guard_replies':
        measurements.push(...simulatedGuardReplyCounts(trajectory));
        break;
    }
  }

  return measurements;
}

function countMessages(trajectory: MayaEvidenceTrajectory): MayaMeasurement {
  const messages = trajectory.turns.flatMap((turn) => turn.copilotMessages);
  return {
    key: 'copilot_message_count',
    value: messages.length,
    evidenceRefs: messages.map((message) => message.ref),
  };
}

function messageTiming(trajectory: MayaEvidenceTrajectory): MayaMeasurement[] {
  const messages = trajectory.turns.flatMap((turn) => turn.copilotMessages);
  const firstTimestamp = messages[0]?.timestamp;
  const lastTimestamp = messages.at(-1)?.timestamp;
  const measurements: MayaMeasurement[] = [
    {
      key: 'first_copilot_message_timestamp',
      value: messages[0]?.timestamp ?? null,
      evidenceRefs: messages[0] ? [messages[0].ref] : [],
    },
    {
      key: 'last_copilot_message_timestamp',
      value: messages.at(-1)?.timestamp ?? null,
      evidenceRefs: messages.at(-1) ? [messages.at(-1)!.ref] : [],
    },
    {
      key: 'copilot_message_span_ms',
      value:
        firstTimestamp && lastTimestamp
          ? new Date(lastTimestamp).getTime() -
            new Date(firstTimestamp).getTime()
          : null,
      evidenceRefs:
        messages.length > 1 ? [messages[0].ref, messages.at(-1)!.ref] : [],
    },
  ];

  for (const turn of trajectory.turns) {
    measurements.push({
      key: `copilot_message_count.turn.${turn.turn}`,
      value: turn.copilotMessages.length,
      evidenceRefs:
        turn.copilotMessages.length > 0
          ? turn.copilotMessages.map((message) => message.ref)
          : [turn.ref],
    });
  }
  return measurements;
}

function scheduledWakeSilence(
  trajectory: MayaEvidenceTrajectory,
): MayaMeasurement[] {
  const scheduledTurns = trajectory.turns.filter(isScheduledWake);
  const silentTurns = scheduledTurns.filter(
    (turn) => turn.silent && !turn.skipped,
  );
  const skippedTurns = scheduledTurns.filter((turn) => turn.skipped);
  return [
    {
      key: 'scheduled_wake_count',
      value: scheduledTurns.length,
      evidenceRefs: scheduledTurns.map((turn) => turn.ref),
    },
    {
      key: 'scheduled_wake_silent_count',
      value: silentTurns.length,
      evidenceRefs: silentTurns.map((turn) => turn.ref),
    },
    {
      key: 'scheduled_wake_skipped_count',
      value: skippedTurns.length,
      evidenceRefs: skippedTurns.map((turn) => turn.ref),
    },
    ...scheduledTurns.map((turn) => ({
      key: `scheduled_wake_silent.turn.${turn.turn}`,
      value: turn.silent,
      evidenceRefs: [turn.ref],
    })),
    ...scheduledTurns.map((turn) => ({
      key: `scheduled_wake_skipped.turn.${turn.turn}`,
      value: turn.skipped,
      evidenceRefs: [turn.ref],
    })),
  ];
}

function actionCounts(trajectory: MayaEvidenceTrajectory): MayaMeasurement[] {
  const actions = trajectory.turns.flatMap((turn) => turn.actions);
  const byTool = new Map<string, typeof actions>();
  for (const action of actions) {
    const existing = byTool.get(action.tool) ?? [];
    existing.push(action);
    byTool.set(action.tool, existing);
  }
  return [
    {
      key: 'action_count',
      value: actions.length,
      evidenceRefs: actions.map((action) => action.ref),
    },
    ...[...byTool.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([tool, toolActions]) => ({
        key: `action_count.${tool}`,
        value: toolActions.length,
        evidenceRefs: toolActions.map((action) => action.ref),
      })),
  ];
}

function actionCategoryCount(
  trajectory: MayaEvidenceTrajectory,
  category: 'flag' | 'escalation',
): MayaMeasurement {
  const actions = trajectory.turns
    .flatMap((turn) => turn.actions)
    .filter((action) =>
      category === 'flag'
        ? action.tool.startsWith('flag_')
        : action.tool.startsWith('escalate_'),
    );
  return {
    key: category === 'flag' ? 'flag_count' : 'escalation_count',
    value: actions.length,
    evidenceRefs: actions.map((action) => action.ref),
  };
}

function triggerToActionLatency(
  trajectory: MayaEvidenceTrajectory,
): MayaMeasurement[] {
  return trajectory.turns.map((turn) => {
    const firstAction = turn.actions[0];
    return {
      key: `trigger_to_first_action_latency_ms.turn.${turn.turn}`,
      // Simulation results associate actions with a turn but do not retain an
      // action timestamp. Null is objective; treating turn time as action time
      // would manufacture zero latency.
      value: null,
      evidenceRefs: firstAction ? [turn.ref, firstAction.ref] : [turn.ref],
    };
  });
}

function simulatedGuardReplyCounts(
  trajectory: MayaEvidenceTrajectory,
): MayaMeasurement[] {
  const simulated = trajectory.turns.flatMap((turn) =>
    turn.guardReplies.filter((reply) => reply.source === 'simulated'),
  );
  const nullReplies = simulated.filter((reply) => reply.message === null);
  return [
    {
      key: 'simulated_guard_reply_count',
      value: simulated.length,
      evidenceRefs: simulated.map((reply) => reply.ref),
    },
    {
      key: 'null_simulated_guard_reply_count',
      value: nullReplies.length,
      evidenceRefs: nullReplies.map((reply) => reply.ref),
    },
  ];
}

function isScheduledWake(turn: MayaEvidenceTurn): boolean {
  return /scheduled|wake|check[_ -]?in/i.test(turn.trigger);
}
