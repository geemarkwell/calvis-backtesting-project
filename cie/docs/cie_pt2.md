# CIE Part 2: Agent Evaluation and Improvement

We are building an **agent evaluation and improvement platform**, not just a prompt-testing tool.

We want to test specific agent capabilities—such as image interpretation and tool use—and understand where and why performance falls short. By examining outcomes and execution traces, we can identify whether improvements belong in the prompts, tools, reasoning workflow, or underlying code.

## Evaluation areas

- **Image interpretation:** Evaluate how accurately the agent understands images and identify what it misses or misinterprets.
- **Tool use:** Examine which tools the agent calls for specific tasks, whether those calls are necessary, and where execution becomes inefficient.
- **Task success:** Determine whether the agent actually solves the problem, rather than just producing a convincing answer.
- **Context and retrieval:** Check whether it finds and uses the right information from our data and codebase.
- **Reasoning and planning:** Assess whether it takes an effective path or gets stuck in loops and unnecessary steps, using observable actions and execution traces.
- **Tool-call correctness:** Check whether it chooses the right tools, supplies valid arguments, and interprets results correctly—not just how many calls it makes.
- **Recovery:** Evaluate how it handles failed tools, missing information, and ambiguous requests.
- **Safety and permissions:** Verify that it respects boundaries and asks for approval when needed.
- **Cost and latency:** Measure the time and money required to complete a task successfully.
- **Consistency:** Test whether it performs reliably across repeated runs and different scenarios.

For example, excessive tool calls might reveal a missing purpose-built tool rather than a prompt problem. Creating that tool could reduce unnecessary reasoning and repeated calls.

With access to full production data and the codebase, the platform should help us diagnose what needs improving and decide where to make changes—not just measure whether an agent succeeds or fails.

## FOCUS

Start with two evaluation priorities:

### 1. Task success

**Does the agent actually complete the task correctly?**

Test against representative real-world tasks with clear success criteria. This reveals the failures that matter most and gives us a baseline to verify whether changes actually help.

### 2. Tool use and correctness

**Does the agent use the right tools, correctly and efficiently?**

Inspect tool selection, arguments, repeated calls, errors, and unnecessary steps. This helps identify missing tools, confusing tool interfaces, and workflow problems.

**Task success tells us whether the agent works. Tool evaluation helps explain why it fails or takes too long—and what to improve.**

Unless image understanding is central to our production workload, prioritize these before image interpretation.

## Improvement workflow

Across all evaluation areas, the platform should support:

- **Comparing versions:** Evaluate changes to prompts, tools, workflows, and code against the same tasks.
- **Inspecting failures:** Review outcomes and execution traces to identify likely causes and decide what to improve.
- **Catching regressions:** Verify that changes improve the targeted behavior without breaking previously successful behavior.

The key question is: **“What failed, why did it fail, what should we change—and did that change actually help?”**

**In short: a platform for diagnosing agent behavior and turning those findings into targeted improvements.**
