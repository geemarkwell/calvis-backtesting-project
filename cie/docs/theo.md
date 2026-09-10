# How Theo Works

Theo turns a reported Copilot problem into one validated, versioned prompt change. It does not decide whether the change fixed the problem; Maya does that after replay.

```mermaid
flowchart TD
    request[/Problem, expected behavior, and bad turns/]
    validateRequest{Request valid?}
    loadEvidence[Load shift and selected trace]
    loadPrompts[Load mutable prompt files]
    buildInput[Build bounded diagnostic input]
    saveInput[Save input and normalized trace]
    diagnose[Theo finds one cause and proposes one edit]
    validateDiagnosis{Diagnosis valid?}
    createVersion[Copy prompts and apply edit]
    verifyPrompt{Candidate prompt valid?}
    saveResult[Save diagnosis, diff, and version manifest]
    returnVersion[/Return candidate prompt version/]
    reject[/Return error/]

    request --> validateRequest
    validateRequest -->|Yes| loadEvidence
    validateRequest -->|No| reject
    loadEvidence --> loadPrompts
    loadPrompts --> buildInput
    buildInput --> saveInput
    saveInput --> diagnose
    diagnose --> validateDiagnosis
    validateDiagnosis -->|Yes| createVersion
    validateDiagnosis -->|No| reject
    createVersion --> verifyPrompt
    verifyPrompt -->|Yes| saveResult
    verifyPrompt -->|No| reject
    saveResult --> returnVersion
```

## Important Boundaries

- Theo receives selected trace evidence, shift context, and mutable prompt files.
- Theo proposes exactly one edit in `prompts/core/` or `prompts/instructions/`.
- Validation checks evidence references, target file, exact old text, and resulting prompt structure.
- Original prompts remain unchanged. Theo creates a separate candidate version.
- Saved artifacts show the input, diagnosis, proposed edit, prompt diff, and candidate version.
- The candidate version goes to Copilot replay, then Maya judges the result.
