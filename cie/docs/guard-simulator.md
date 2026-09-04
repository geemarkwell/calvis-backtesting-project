# Niko: Guard Simulator Plan

## Goal

Keep the candidate backtest conversation coherent after a prompt change makes the Copilot say something different.

Use the guard's real historical messages while they still make sense. After the conversation changes, use a small model to produce the guard's next reply.

## What Niko Is

Niko is one small-model function, not a full agent system.

```ts
simulateGuard({
  guardProfile,
  shiftContext,
  recentConversation,
  candidateCopilotMessage,
  historicalGuardReply,
}): Promise<{ reply: string | null }>
```

## When Niko Runs

1. Replay the real shift events in their original order.
2. Run the candidate Copilot using the edited prompts.
3. Use the real guard messages until the candidate Copilot first behaves differently from the historical Copilot.
4. After that point, ask Niko to adapt each historical guard reply so it makes sense as a response to the candidate Copilot.
5. Keep all non-chat events—location, telemetry, check-ins, and job events—unchanged.

For the prototype, a different Copilot message or action is enough to mark the conversation as diverged. Do not build a separate divergence classifier.

## Inputs

Niko receives only:

- The guard information and relevant site details from `shift`.
- The recent candidate conversation.
- The candidate Copilot's latest message.
- The real historical guard reply as a hint.

## Niko Prompt

```text
You are simulating the guard from a recorded security shift.

Reply to the candidate Copilot as that guard would reply.

Rules:
- Use the shift and guard information as your character.
- Use the historical guard reply as a hint, not a required answer.
- Preserve facts from the real shift.
- Match the guard's normal tone, length, and style.
- If the historical reply still makes sense, reuse it.
- If it no longer makes sense, adapt it minimally.
- If the guard would not reasonably reply, return null.
- Do not invent incidents, actions, locations, or facts.
- Return JSON only.

Output:
{"reply":"guard response"}

Or:
{"reply":null}
```

## Replay Logic

```ts
let diverged = false;

for (const turn of episode) {
  const candidateOutput = await runCandidateCopilot(turn);

  if (candidateOutput !== turn.historicalCopilotOutput) {
    diverged = true;
  }

  if (!diverged) {
    useGuardReply(turn.historicalGuardReply);
  } else {
    const simulated = await simulateGuard({
      guardProfile: shift.guard,
      shiftContext: shift,
      recentConversation,
      candidateCopilotMessage: candidateOutput,
      historicalGuardReply: turn.historicalGuardReply,
    });

    useGuardReply(simulated.reply);
  }
}
```

The real implementation should compare normalized Copilot outputs, including whether it sent a message, stayed silent, or took an action. Exact wording does not need to match.

## Trace Output

Every candidate replay should record:

- The trigger and relevant shift events.
- The candidate Copilot output.
- The guard reply.
- Whether the guard reply was historical or simulated.
- The historical reply used as Niko's hint.

This gives the judge an inspectable conversation and makes simulated content obvious.

## Non-Goals

- No tools, planning, memory system, or multi-agent framework for Niko.
- No simulation of location, telemetry, or job events.
- No attempt to generate an entirely new shift.
- No attempt to perfectly predict a real human.
- No separate UI or dashboard.

## Definition of Done

- Real guard messages are used before the replay diverges.
- A small model supplies a coherent reply—or `null`—after divergence.
- Real non-chat shift events remain unchanged.
- Simulated replies are labeled in the candidate trace.
- One end-to-end backtest works on a callout shift such as job `56370`.

This is enough for the exercise: it solves the broken-conversation problem without over-building the simulator.