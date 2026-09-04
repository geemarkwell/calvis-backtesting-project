import { resolve } from 'node:path';
import {
  findBundleRoot,
  loadShiftBundle,
  normalizeJobId,
} from './shift-loader';

describe('shift loader', () => {
  it('loads a real shift from the bundle root', async () => {
    const bundleRoot = await findBundleRoot(process.cwd());
    const result = await loadShiftBundle(bundleRoot, 56370);

    expect(bundleRoot).toBe(resolve(process.cwd(), '..'));
    expect(result.jobId).toBe('56370');
    expect(result.bundle.shift.id).toBe('56370');
  });

  it.each(['../56370', '56370.json', '', 'abc'])(
    'rejects unsafe job id %p',
    (jobId) => {
      expect(() => normalizeJobId(jobId)).toThrow('digits only');
    },
  );

  it('returns not found for an unknown numeric job', async () => {
    await expect(
      loadShiftBundle(resolve(process.cwd(), '..'), '999999'),
    ).rejects.toThrow('was not found');
  });
});
