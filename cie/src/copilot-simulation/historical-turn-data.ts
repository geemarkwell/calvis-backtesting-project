import type { ShiftEvent } from './copilot-simulation.types';

export function eventsInInterval(
  events: ShiftEvent[],
  after: string | undefined,
  through: string,
): ShiftEvent[] {
  return events
    .filter((event) => (!after || event.ts > after) && event.ts <= through)
    .sort((left, right) => left.ts.localeCompare(right.ts));
}

export function extractGuardMessage(event: ShiftEvent): string | undefined {
  if (event.text?.trim()) {
    return event.text;
  }
  if (event.audio_transcription?.trim()) {
    return event.audio_transcription;
  }
  if (typeof event.image === 'string' && event.image.trim()) {
    return event.image;
  }
  return undefined;
}
