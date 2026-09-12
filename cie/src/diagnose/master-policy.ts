import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export interface MasterPolicySection {
  number: number;
  title: string;
  heading: string;
  content: string;
}

export async function loadMasterPolicy(bundleRoot: string): Promise<string> {
  const path = resolve(bundleRoot, 'prompts', 'core', 'MASTER_POLICY.md');
  let contents: string;
  try {
    contents = await readFile(path, 'utf8');
  } catch (error) {
    throw new Error(
      `MASTER_POLICY.md is required for Diagnose lenses but was not found at ${path}.`,
    );
  }
  if (!contents.trim()) {
    throw new Error(`MASTER_POLICY.md is required for Diagnose lenses but is empty at ${path}.`);
  }
  return contents;
}

export function extractMasterPolicySection(
  masterPolicy: string,
  sectionNumber: number,
): MasterPolicySection {
  const sections = parseMasterPolicySections(masterPolicy);
  const section = sections.find((item) => item.number === sectionNumber);
  if (!section) {
    throw new Error(
      `MASTER_POLICY.md is missing required section ${sectionNumber}.`,
    );
  }
  return section;
}

export function parseMasterPolicySections(masterPolicy: string): MasterPolicySection[] {
  const matches = [...masterPolicy.matchAll(/^##\s+(\d+)\.\s+(.+)$/gm)];
  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? masterPolicy.length;
    const content = masterPolicy.slice(start, end).trim();
    return {
      number: Number(match[1]),
      title: match[2].trim(),
      heading: `## ${match[1]}. ${match[2].trim()}`,
      content,
    };
  });
}
