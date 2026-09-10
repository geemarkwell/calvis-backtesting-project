# How Maya Works

Maya checks whether a candidate Copilot replay fixed the problem described in the original callout. It compares the old and candidate behavior for the same job and turns.

```mermaid
flowchart TD
    request["Callout, old replay, and candidate replay"]
    compare["Validate that replays are comparable"]
    evidence["Gather history, replay behavior, and warnings"]
    measure["Compute measurements relevant to the callout"]
    saveInput["Save evidence and measurements"]
    judge["Maya compares behavior and returns a verdict"]
    validate{"Verdict passes validation?"}
    repair["Ask Maya to correct the verdict once"]
    revalidate{"Corrected verdict valid?"}
    saveResult["Save verdict and judgment record"]
    result["Return yes or no, criteria, evidence, and caveats"]
    failure["Return error"]

    request --> compare
    compare --> evidence
    compare -->|Invalid input| failure
    evidence --> measure
    measure --> saveInput
    saveInput --> judge
    judge --> validate
    validate -->|Yes| saveResult
    validate -->|No| repair
    repair --> revalidate
    revalidate -->|Yes| saveResult
    revalidate -->|No| failure
    saveResult --> result
```

- **Input:** An existing pair of replays, submitted through `POST /maya/judge` or `yarn maya:judge <prepared-replays.json>`. Maya does not run the replays itself.
- **Evidence:** Historical behavior, old replay, and candidate replay, with references to messages, guard replies, events, and actions. Prompt edits and Theo's diagnosis are excluded.
- **Judgment:** Application code computes measurements such as message counts, silence, flags, and escalations. Maya uses those measurements and the evidence to assess the callout, with one model step per attempt and no tools.
- **Validation:** Checks the verdict structure, evidence references from both replays, supplied measurement values, and agreement between the criteria and final verdict. Every criterion must pass for `fixed: true` and `verdict: "yes"`.
- **Output:** Evidence, measurements, verdict, and judgment history are saved under `runs/maya-<jobId>-<number>/` by default. Maya evaluates the fix; it does not edit prompts or approve deployment.

Source: [runner](../src/mastra/maya/runner.ts), [evidence builder](../src/mastra/maya/evidence-packet.ts), [measurements](../src/mastra/maya/measurements.ts), and [verdict validator](../src/mastra/maya/verdict-validator.ts).
