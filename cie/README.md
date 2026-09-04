<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Theo prompt diagnostician

Theo diagnoses prompt-rooted behavior across one or more user-selected response
windows and returns one evidence-backed, minimal prompt edit suggestion. It
applies validated edits only to a versioned candidate prompt copy; it does not
change original prompts, replay the Copilot, or decide whether the suggestion
fixed the issue.

Set `OPENAI_API_KEY` in `.env`, then create `theo-request.json`:

```json
{
  "whatWentWrong": "The Copilot pushed back repeatedly after a completed patrol and flagged the guard.",
  "badResponses": [
    {
      "jobId": "56370",
      "startTurn": 9,
      "endTurn": 16
    }
  ],
  "expectedBehavior": "Acknowledge a credible completion report unless stronger evidence contradicts it."
}
```

Run:

```bash
yarn theo:diagnose theo-request.json
```

Or start the API with `yarn start:dev` and send the same JSON body from
Postman:

```text
POST http://localhost:3000/theo/diagnose
Content-Type: application/json
```

The response includes the validated `diagnosis`, a convenient
`suggestedPromptChange` copy of its proposed prompt edit, and the run artifact
location. It also returns `candidatePromptJobId`, `candidatePromptVersion`, and
`candidatePromptRoot` for the versioned prompt copy. The endpoint runs the same
loading, validation, and artifact-writing workflow as the CLI.

Each `badResponses` item may instead select a saved simulation from
`database/simulate-<number>.json`:

```json
{
  "whatWentWrong": "The simulated Copilot requested another unnecessary confirmation.",
  "badResponses": [{ "simTarget": 3 }],
  "expectedBehavior": "Acknowledge the completed patrol without repeating the request."
}
```

Use exactly one of `jobId` or `simTarget` per item. A `jobId` requires
`startTurn` and `endTurn`. A `simTarget` derives the job and defaults to that
simulation's saved turn bounds; optional turn bounds can narrow the window.

Every bad-response item explicitly identifies its recorded job or saved
simulation. Multiple windows may mix both source types. Theo loads only those
conversation windows and qualifies simulation trace citations with both job
and simulation numbers.

Each successful run writes these inspectable artifacts under `runs/<run-id>/`:

- `diagnostic-input.json`
- `normalized-trace.json`
- `episode.json`
- `diagnosis.json`
- `proposed-edit.json`
- `candidate-version.json`
- `prompt.diff`

Theo validates requested bounds, trace references, and exact prompt passages.
`proposed-edit.json` contains the prompt filename, exact current `old_text`
chunk, complete suggested `new_text` replacement, and intended effect. After
validation, deterministic code copies only `core/` and `instructions/` into
`prompt-versions/job-<jobId>-0.<number>/` and applies the exact replacement
there. Original `prompts/` files remain unchanged. Versions start at `0.1` for
each job, increment without overwriting existing versions, and include job ID
plus the exact old and new prompt passages and source/candidate hashes in
`version.json` metadata. Each version also contains `prompt.diff` and a
`decision.json` lifecycle record. One Theo run may use multiple response
windows, but all windows must resolve to the same job before a candidate
version is created.

## Niko guard simulator

Niko keeps a candidate Copilot replay coherent after its output diverges from
the historical baseline. The replay continues to use recorded guard messages
until the first different Copilot message, silence decision, flag, note, or
escalation. Later guard replies are adapted by Niko using the recorded reply as
a hint; all non-chat shift events remain unchanged.

Niko is registered as a one-step, tool-free Mastra agent and is called through
the `simulateGuard()` function.

Candidate replay output labels every guard reply as `historical` or
`simulated`, preserves the historical reply used as the hint, and records the
normalized historical and candidate Copilot outputs used for divergence.

## Maya callout judge

Maya decides whether a candidate replay fixed behavior from one original
callout. She receives bounded historical, old-replay, and candidate-replay
evidence plus deterministic measurements; she does not receive Theo's
diagnosis or proposed prompt edit.

Set `OPENAI_API_KEY` in `.env`. `MAYA_MODEL` optionally selects a separate
judge model and defaults to `openai/gpt-5.6-sol`. Prepare one JSON file with
`callout`, `oldReplay`, and `candidateReplay`, then run:

```bash
yarn maya:judge prepared-replays.json
```

The old replay must use `replayMode: "original"`; the candidate replay must use
`replayMode: "candidate"`. Job ID, turn bounds, turn numbers, and triggers must
match. Each run writes `evidence-packet.json`, `measurements.json`, and
`verdict.json` under `runs/<run-id>/`. It also writes `judgment.json`, which
ties the verdict to its job ID, callout, timestamp, and old/candidate simulation
numbers. Maya returns `yes` only when every callout-specific criterion passes;
replay-parity and simulated-guard caveats remain visible in evidence warnings
and verdict limitations. Every verdict also includes `confidence`, an integer
percentage from 0 to 100 showing how strongly the supplied evidence supports
Maya's decision.

Automatic Maya run folders use a per-job sequence:

```text
runs/maya-56370-1/
runs/maya-56370-2/
runs/maya-50837-1/
```

Each job has its own counter. Existing timestamp-based Maya folders remain
unchanged and continue to appear in judgment history.

View a job's Maya history, ordered oldest to newest:

```bash
curl "http://localhost:3000/maya/judgments?jobId=56370"
```

Older Maya artifacts remain visible when they contain valid evidence and a
verdict. Their simulation references and confidence are `null` when those
fields were not recorded at the time.

## Copilot replay API

Start the API with `yarn start:dev`, then send a request to
`POST http://localhost:3000/copilot/simulate`:

```json
{
  "jobId": "56370",
  "startTurn": 14,
  "endTurn": 16,
  "replayMode": "candidate",
  "promptVersion": "0.1",
  "callNiko": true,
  "debug": true
}
```

`promptVersion` selects the exact Theo candidate at
`cie/prompt-versions/job-<jobId>-<promptVersion>/`. It is optional for an
initial candidate run using original prompts, but may be used only with
`replayMode: "candidate"`. Missing versions, malformed manifests, and job ID
mismatches return a validation error before the Copilot runs.

Candidate responses using a Theo version include:

```json
{
  "updatedPrompt": {
    "jobId": "56370",
    "version": "0.1",
    "file": "core/obligations.md",
    "oldText": "original exact passage",
    "newText": "Theo replacement passage",
    "intendedEffect": "Stop repeated unsupported pushback"
  }
}
```

`POST /copilot/backtest` runs the complete improvement flow in one request. It
uses the baseline replay as Theo's bad-response evidence, creates a new
versioned candidate, runs the candidate replay against that exact version, and
then asks Maya to judge the original and candidate results. Do not send
`promptVersion` to this endpoint; Theo creates it during the same backtest.
`expectedBehavior` is required separately from Maya's existing `callout`.

```json
{
  "jobId": "56370",
  "startTurn": 9,
  "endTurn": 16,
  "replayMode": "candidate",
  "callNiko": true,
  "debug": false,
  "callout": "Copilot pushed back after a credible completed patrol report.",
  "expectedBehavior": "Acknowledge a credible completed patrol report without repeatedly challenging the guard.",
  "baselineSource": "shift"
}
```

The combined response includes `theo`, `oldReplay`, `candidateReplay`,
`updatedPrompt`, `candidateDecision`, and Maya's result. A successful Maya run
leaves the candidate in `pending` state for explicit user review. Rejecting it
changes only its decision record:

```bash
curl -X POST http://localhost:3000/theo/candidates/reject \
  -H 'Content-Type: application/json' \
  -d '{"jobId":"56370","version":"0.1"}'
```

Accepting it revalidates the version, hashes, exact single replacement, and
assembled prompt before atomically applying that one change to the shared real
prompt under `prompts/`:

```bash
curl -X POST http://localhost:3000/theo/candidates/accept \
  -H 'Content-Type: application/json' \
  -d '{"jobId":"56370","version":"0.1"}'
```

Acceptance requires a recorded Maya evaluation. Accept and reject are
idempotent, but a rejected candidate cannot later be accepted and an accepted
candidate cannot later be rejected. Because the real Copilot prompts are
shared, accepting a job-tagged candidate affects later runs for every job; the
job ID records where the candidate evidence came from.

For recorded baseline output without running any model or simulator, request:

```bash
curl "http://localhost:3000/copilot/original?jobId=56370&startTurn=8&endTurn=11"
```

This endpoint reads `shifts/<jobId>.json` and returns recorded guard messages,
Copilot messages, actions, and silence decisions for the selected turns. It
does not load prompts, call Niko, execute tools, or write a simulation log.

List compatible baseline sources with:

```bash
curl "http://localhost:3000/copilot/original-sources?jobId=56370&startTurn=8&endTurn=11"
```

The response includes the recorded shift and saved agent runs from
`cie/database/` that cover the requested job and turn range. Load one saved
agent version by adding `source=simulation` and its `simulationNumber`:

```bash
curl "http://localhost:3000/copilot/original?jobId=56370&startTurn=8&endTurn=11&source=simulation&simulationNumber=3"
```

`replayMode` defaults to `candidate`. Candidate replay returns recorded tool
results for exact matches, simulates new side effects without executing them,
and answers new read-only calls only from recorded shift evidence. Missing
evidence returns `unavailable_in_replay`.

Use `replayMode: "original"` for strict parity checks. Every tool call must
match the recorded turn, tool name, and full input or the replay fails.

`callNiko` defaults to `true`. Set it to `false` to disable guard simulation:
every turn then uses its recorded guard message from the shift JSON, even after
the candidate Copilot diverges from historical behavior.

`debug` defaults to `false`. When enabled, each turn includes the final system
prompt, turn message, conversation history, supplied events, tool match trace,
model configuration, and Copilot output. Debug responses can be large.

Historical model context is compacted before replay: only the latest assigned
guard location summary and relevant job-log snapshot are retained, chat is
limited to 20 messages, repeated chat-tool and context-file reads are removed,
and only the latest workspace file contents seed the virtual workspace. Exact
recorded tool results for the active replay turn remain unchanged.

Every completed simulation is also saved under `cie/database/` as
`simulate-<number>.json`. Numbering starts at 1 and never overwrites an existing
simulation. The API response includes `simulationNumber` and `logFile` so a
Postman response can be matched to its file.

Each file records the unchanged original shift context, requested start and end
turns, replay settings, model configuration, and each turn's trigger, guard
messages, original events, original Copilot response and tool calls, new Copilot
response and tool calls, and stop reason. Versioned candidate logs also record
the complete `updatedPrompt` metadata. Only completed simulations are saved; a
failed replay does not create a simulation file.

## Project setup

```bash
$ yarn install
```

## Compile and run the project

```bash
# development
$ yarn run start

# watch mode
$ yarn run start:dev

# production mode
$ yarn run start:prod
```

## Run tests

```bash
# unit tests
$ yarn run test

# e2e tests
$ yarn run test:e2e

# test coverage
$ yarn run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ yarn install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
