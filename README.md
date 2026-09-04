**Calvis guard copilot**

Every shift runs with our AI copilot supervising it. It watches all of the data around the guard/shift as it happens (location stream, guard actions, chat messages, photos, etc) and decides whether to message the guard, what to say, how to say it, and when to escalate to a human (Calvis Overwatch). All of this behavior is currently determined by the prompt engineering we've done on top of the out-of-the-box LLMs.

**Problem**

We test in prod. When we change the copilot's prompts, we don't know how that affects the agent's behavior until it's live on a real shift with a real guard. We hope it works, then monitor closely.

We are not short on signal about what's going wrong. A separate analysis system already reviews copilot/guard interaction data every day and writes up what it finds, in plain language, against specific shifts. For example: "On job 56370 the copilot got aggressive with the guard after he reported his patrol." What we don't have is anything between that callout and a shipped prompt change except a person reading prompts and guessing.

**The loop we want to build**

1. The analysis system reviews the day's shifts and produces a callout in natural language, pointing at the shifts it came from. This exists today.
2. That callout is piped into a new system, the copilot improvement engine.
3. The engine hypothesizes which part of the prompt system is causing, or failing to cause, the called-out behavior.
4. It edits the prompts based on that hypothesis.
5. That produces a new version of the prompt system.
6. It runs the new version against the old one on the shift the callout came from.
7. A judge decides whether the change actually addressed the callout.

    Steps 3 through 7 repeat until the change measurably does what was asked.

8. Ship the prompt change. Back to 1.

Step 1 exists. Step 8 is ours. **Build 2 through 7.**

**Ask**

A working, one-way pass through steps 2 to 7. We type a problem in plain language, your system runs, and it comes back with a yes or no on whether the prompt change it wrote fixed the problem, and the evidence behind that answer.

By the end we want to see it run. A callout in, a real edit to the prompt system, both versions run against the same shift, and a verdict we can inspect.

To be clear about the bar: the engine does not have to produce a prompt change that works. A run that ends in "no, this edit did not fix the callout, and here is how I measured that" is a successful run. We are looking at whether you can build the machine, not whether the machine is right on the first try.

**Requirements**

- The input is a callout in plain language naming a shift. Nothing more structured than that. The format is yours and it genuinely doesn't matter, so don't spend time on it. Write your own or start from one of these, both of which are real and sitting in the bundle:
    - On job 56370 the guard said he'd walked the full site and checked both buildings. The copilot pushed back on him three times in four minutes and flagged him. Too hard for what it actually had.
    - On job 50837 the copilot went quiet after the first hour. It woke on schedule five times between 3am and 7am and sent nothing at all — no patrol report asked for, no check on the guard, all the way to the end of the shift.
- The engine locates a hypothesis in the prompt system itself. `prompts/core/` and `prompts/instructions/` are the whole mutable surface; read `prompts/PROMPTS.md` first.
- The edit produces a real, addressable version of the prompt system. We should be able to see what changed between versions.
- It runs new against old on the same shift, and the run is cheap and fast enough that a person will actually use it.
- The judge answers the original callout, not a generic quality score.
- Show the work. What it hypothesized, what it changed, what it ran, what it measured.

Two things you can assume, so you don't burn the day on them:

- Assume the callout is rooted in the prompts. In real life it might be a broken tool call or a bug; not your problem here.
- Build the one-way pass, not the loop. One trip through 2 to 7 is enough.

One thing you can't skip:

- Once the prompt changes, the copilot says something different, and the guard's real historical reply stops making sense as an answer to it. Step 6 doesn't produce a comparison until you deal with this. You need something that works, not a plan for something that works. The cheap version is fine and is what we'd expect: replay the events, simulate the guard's side of the conversation with a small model, use the real shift as the guard's character and the real reply as a hint. Don't over-build it.

**Follow up questions**

These are unsolved. We don't expect you to solve them in this exercise, but try to have a plan for how to bring it home.

- A prompt change that fixes the callout can quietly break something else. We think step 7 eventually checks the new version against a master policy of everything we care about, not just the one complaint. What does that policy look like, and where does it come from?
- How does the loop know when to stop? What tells you a change is good enough to ship versus worth another pass?

**How our copilot agent is architected today**

This is just context for you to better understand how our system works. Your project does not need to be built this way.

- Single agent i.e. there is no coordinator + sub-agent structure
- The agent lives inside of a session that is created a few hours before the guard shift starts.
- Baseline context is injected into the session on start: shift information (start/end time, job instructions, address), notes about the site (open action items, recent incidents), notes about the guard (how they respond, quirks).
- The agents wakes up every 30 minutes on schedule, scans all of shift data, and decides whether or not to take any action (send a message to the guard, escalate to ops)
- Certain actions will wake up the agent outside of its scheduled wake. Most obvious is the guard sending the copilot a message. When this happens, the agent will try to respond instantly. If it feels it needs more context to respond (answer to a complex question, for example) then it will gather that context through tool calls before responding

**What's in the bundle**

Ten real shifts, one JSON file each, under `shifts/`. These shifts cover a variety of situations: guards who hold a good back and forth conversation with the copilot, guards who go quiet or stop streaming data, guards who take a long time to answer, guards who answer with something other than what was asked, and guards who get short or dismissive.

Each shift file has three parts:

- `shift` is the context the agent starts with: times, site, job instructions, the guard, notes on the account and the site.
- `events` is everything that happened around the guard while the shift ran, in time order. Location pings, device telemetry, job events like check-in and geofence crossings, and every message the guard sent.
- `baseline` is what our copilot actually did about all of it. Every time it woke and why, every message it sent, and every tool call it made.

Photos the guard sent have been removed. Where one was sent, both the message event and the copilot's `fetch_chat_image` call carry `[photo]` in place of the file, so you can still see that a photo arrived and what the copilot chose to do about it.

Our current prompt system is under `prompts/`. Read `prompts/PROMPTS.md` first; it explains how the pieces assemble at runtime. The prompt text you edit lives in `prompts/core/` and `prompts/instructions/`; `prompts/ASSEMBLED_SYSTEM_PROMPT.md` and `prompts/turn_message/` are generated from those and are there to be read, not changed. `prompts/turn_message/` holds a rendered example of the message the agent receives on each kind of wake, one per trigger — seven rendered from real turns of shift 56370 in this bundle, three from synthetic inputs for triggers that shift never fired.

There is far more here than you need. Some shifts run to well over a thousand location pings and telemetry rows, and the busiest one woke the copilot 133 times while the quietest woke it 11. We left all of it in on purpose. If something in the data or the prompts doesn't add up, please ask us!

**A note on the data**

These are real shifts, but every guard name, account name, address, phone number, and site coordinate has been replaced with a stand-in. The replacements are consistent: the same guard is the same guard across shifts, the same site is the same site, and the geofence math still works because a site and its pings were moved together. Anything that looks like a real person, company, or place is not one.

**What to send back**

- The code, however you'd normally share it.
- The output of at least one end-to-end run: the callout you wrote, the prompt version the engine produced, and the judge's verdict with the measurements behind it.
- A short writeup: what you built, how to run it, where you landed on the open questions, and what you'd do next with more time.
