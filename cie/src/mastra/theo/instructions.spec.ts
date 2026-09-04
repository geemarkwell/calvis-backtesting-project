import { THEO_INSTRUCTIONS } from './instructions';

describe('Theo agent instructions', () => {
  it('encode prompt-only, evidence-backed, single-edit boundaries', () => {
    expect(THEO_INSTRUCTIONS).toContain(
      'Only prompt files under core/ and instructions/ are mutable.',
    );
    expect(THEO_INSTRUCTIONS).toContain(
      'Support every observed-behavior claim with one or more exact trace refs.',
    );
    expect(THEO_INSTRUCTIONS).toContain('Analyze every supplied window.');
    expect(THEO_INSTRUCTIONS).toContain(
      'simTarget identifies the saved simulation',
    );
    expect(THEO_INSTRUCTIONS).toContain(
      'reply source was historical or simulated',
    );
    expect(THEO_INSTRUCTIONS).toContain('complete suggested replacement chunk');
    expect(THEO_INSTRUCTIONS).toContain('every relevant_turns.turn_ref value');
    expect(THEO_INSTRUCTIONS).toContain(
      'Target exactly one file under core/ or instructions/.',
    );
    expect(THEO_INSTRUCTIONS).toContain(
      'never return a fixed, passed, or final quality verdict',
    );
  });
});
