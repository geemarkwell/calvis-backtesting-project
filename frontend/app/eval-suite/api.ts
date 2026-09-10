export type Importance = "critical" | "major" | "minor";

export interface TestCriterion {
  id: string;
  importance: Importance;
  description: string;
  passRule: string;
  evidenceNeeded?: string[];
}

export interface DraftTestSpec {
  id: string;
  version: "draft";
  name: string;
  description?: string;
  userQuestion: string;
  agentSurface: string;
  criteria: TestCriterion[];
  requiredEvidence: string[];
  passCondition: string;
  assumptions: string[];
  limitations: string[];
}

export interface DraftTestCriteriaResponse {
  runId: string;
  artifactDirectory: string;
  testSpec: DraftTestSpec;
}

export async function draftTestCriteria(
  userQuestion: string,
  signal?: AbortSignal,
): Promise<DraftTestCriteriaResponse> {
  const response = await fetch("/api/test-criteria/draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userQuestion }),
    signal,
  });

  if (!response.ok) {
    throw new Error(await errorMessage(response, "Test criteria draft failed"));
  }

  const payload: unknown = await response.json();
  if (!isDraftTestCriteriaResponse(payload)) {
    throw new Error("Test criteria API returned an invalid response.");
  }
  return payload;
}

async function errorMessage(
  response: Response,
  prefix: string,
): Promise<string> {
  let detail = `${response.status} ${response.statusText}`.trim();
  try {
    const payload: unknown = await response.json();
    if (isRecord(payload)) {
      const message = payload.message;
      if (typeof message === "string") {
        detail = message;
      } else if (Array.isArray(message)) {
        detail = message.filter((item) => typeof item === "string").join(" ");
      }
    }
  } catch {
    // Keep HTTP status when response has no JSON body.
  }
  return `${prefix}: ${detail}`;
}

function isDraftTestCriteriaResponse(
  value: unknown,
): value is DraftTestCriteriaResponse {
  return (
    isRecord(value) &&
    typeof value.runId === "string" &&
    typeof value.artifactDirectory === "string" &&
    isDraftTestSpec(value.testSpec)
  );
}

function isDraftTestSpec(value: unknown): value is DraftTestSpec {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.version === "draft" &&
    typeof value.name === "string" &&
    (value.description === undefined || typeof value.description === "string") &&
    typeof value.userQuestion === "string" &&
    typeof value.agentSurface === "string" &&
    Array.isArray(value.criteria) &&
    value.criteria.every(isTestCriterion) &&
    Array.isArray(value.requiredEvidence) &&
    value.requiredEvidence.every((item) => typeof item === "string") &&
    typeof value.passCondition === "string" &&
    Array.isArray(value.assumptions) &&
    value.assumptions.every((item) => typeof item === "string") &&
    Array.isArray(value.limitations) &&
    value.limitations.every((item) => typeof item === "string")
  );
}

function isTestCriterion(value: unknown): value is TestCriterion {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    (value.importance === "critical" ||
      value.importance === "major" ||
      value.importance === "minor") &&
    typeof value.description === "string" &&
    typeof value.passRule === "string" &&
    (value.evidenceNeeded === undefined ||
      (Array.isArray(value.evidenceNeeded) &&
        value.evidenceNeeded.every((item) => typeof item === "string")))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
