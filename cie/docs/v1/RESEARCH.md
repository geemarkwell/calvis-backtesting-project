# What leading systems agree on

## 1. A test is more than a prompt

Anthropic defines an agent evaluation using:

- **Task:** Input and clear success criteria
- **Trial:** One attempt at the task
- **Trace:** Messages, tool calls, results and actions
- **Outcome:** What actually changed or got completed
- **Graders:** Logic that evaluates specific dimensions
- **Suite:** Related tasks testing one capability

This is important because an agent might claim success without actually completing the task.

## 2. Evaluate the outcome and the path separately

Google divides agent evaluation into:

- Final task success
- Tool-use and execution trajectory
- Trust, safety and recovery

A correct answer reached through broken or inefficient tool usage can still reveal a “silent failure.” Google’s agent evaluation framework

This perfectly supports your focus:

> Task success tells us whether it worked. Tool evaluation explains how it worked and why it failed.

## 3. Combine grader types

Leading systems do not use one giant judge.

- **Code graders:** Tool arguments, state changes, schemas, errors, latency and cost
- **Model graders:** Behavior, instruction-following and open-ended task quality
- **Human graders:** Define ground truth and periodically verify model judges

Anthropic recommends deterministic graders where possible and model graders where necessary. It also warns against requiring one exact tool sequence because agents may find different valid approaches.

## 4. Traces are a primary platform object

OpenAI recommends starting with trace grading when debugging agent behavior. A trace contains model calls, tool calls and workflow actions, allowing graders to identify whether changes improved end-to-end behavior. OpenAI agent evaluation guidance

Your platform should therefore store:

- Task definition
- Agent/model configuration
- Messages
- Tool calls and results
- Errors
- Observable state changes
- Final response
- Cost and latency
- Grader results

## 5. Use reusable components

The UK AI Security Institute’s Inspect framework uses four reusable building blocks:

- Dataset
- Agent/solver
- Tools/environment
- Scorers

It supports coding, agentic, behavioral and multimodal evaluations without building a separate platform for each capability.

That suggests CIE should use:

```text
Test specification
    + Agent adapter
    + Test environment
    + Reusable evaluators
    = Evaluation run
```

Image interpretation then becomes another test type and scorer—not a separate architecture.

# Recommended three sections

## Section 1: Define and Run Tests

Build the foundation for testing different agents and capabilities.

- Standard task specification
- Client success criteria
- Agent/model adapters
- Tool and environment setup
- Multimodal inputs
- Repeated isolated trials
- Standard trace format

## Section 2: Evaluate and Diagnose

Determine what succeeded, what failed and why.

- Task-outcome evaluation
- Tool-selection and argument evaluation
- Efficiency measurements
- Model-based behavioral grading
- Deterministic checks
- Human calibration
- Root-cause classification:
  - Prompt
  - Tool
  - Context
  - Workflow
  - Model
  - Code
  - Test/harness problem

## Section 3: Improve and Verify

Turn failures into safe, measurable improvements.

- Targeted change recommendation
- Versioned prompt, tool, workflow or code candidate
- Baseline-versus-candidate comparison
- Multiple trials for consistency
- Capability tests
- Regression suite
- Cost and latency comparison
- Human approval and release decision

# Biggest design takeaway

Do not make Maya responsible for everything.

Maya should be part of an evaluator registry alongside deterministic evaluators:

- task-success
- tool-correctness
- tool-efficiency
- behavior
- multimodal-accuracy
- recovery
- safety
- cost
- latency
- consistency

Each test chooses only the evaluators it needs. That is how CIE supports different customers and capabilities without rewriting the platform every time.
