import { MAYA_INSTRUCTIONS } from './instructions';

describe('Maya agent instructions', () => {
  it('encode narrow, evidence-backed judging boundaries', () => {
    expect(MAYA_INSTRUCTIONS).toContain(
      'Judge the original callout, not general response quality.',
    );
    expect(MAYA_INSTRUCTIONS).toContain(
      'Do not invent measurements or evidence.',
    );
    expect(MAYA_INSTRUCTIONS).toContain(
      'Never assume a simulated guard reply proves how a real guard would react.',
    );
    expect(MAYA_INSTRUCTIONS).toContain(
      'copy the exact numeric, boolean, or null values',
    );
    expect(MAYA_INSTRUCTIONS).toContain(
      'Do not include prompt-edit recommendations',
    );
    expect(MAYA_INSTRUCTIONS).toContain(
      'fixed and verdict must agree: true with yes, false with no.',
    );
    expect(MAYA_INSTRUCTIONS).toContain(
      'confidence as an integer percentage from 0 to 100',
    );
    expect(MAYA_INSTRUCTIONS).toContain(
      'Confidence never changes fixed, verdict, or criterion results.',
    );
  });
});
