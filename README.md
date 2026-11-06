# ThirstyClaude

A small always-on-top desktop widget that fills with the estimated water behind
your Claude Code (and Codex) token use. Each response drips in live.

<p>
  <img src="docs/today.png" alt="Graduated cylinder at 6.6 L, filled in coloured layers by project (demo data)" width="150">
  <img src="docs/all-time.png" alt="Bathtub at 417 L, about 2.8 bathtubs (demo data)" width="150">
  <img src="docs/legend.png" alt="Hover legend with range, energy, tokens, projects and drop colours (demo data)" width="150">
</p>

*Screenshots use demo data.*

## Install

Needs [Node.js](https://nodejs.org) 18 or later, plus Claude Code and/or Codex.

```bash
npm install -g github:BDigness/ThirstyClaude
thirstyclaude
```

Or from a clone:

```bash
git clone https://github.com/BDigness/ThirstyClaude.git
cd ThirstyClaude
npm install
npm run dev
```

Developed on Windows. macOS and Linux should work but haven't been tested.

## What you're looking at

- **The vessel grows with the amount.** Each vessel roughly matches its real
  capacity:

  | Vessel | Shown for |
  |---|---|
  | Test tube | under 100 mL |
  | Drinking glass | up to 1 L |
  | Graduated cylinder | up to 10 L |
  | Bucket | up to 50 L |
  | Rain barrel | up to 300 L |
  | Bathtub | up to 2,000 L |
  | Hot tub | up to 20,000 L |
  | Swimming pool | anything larger |

  You can also pin one vessel in the menu. A caption puts the amount in
  everyday terms (≈ glasses, buckets, bathtubs, backyard pools).
- **Layers are projects.** Your five biggest projects get a colour each, and the
  rest go into "Other". A project keeps its colour over time. Hover over a layer
  to see its project, litres and share.
- **Drops are responses.** Each response drips in within about 0.1 seconds of
  being written to the log. Drops are coloured by model, and smaller drops come
  from subagents.

  | Opus | Sonnet | Haiku | Fable | Codex |
  |---|---|---|---|---|
  | violet | red | green | magenta | amber |

- **Drag it around and the water sloshes.** It leans against the motion, surges
  when you stop, and settles. Glassware rocks quickly; the bathtub and pool sway
  slowly.
- **The faint band is the likely range.** Every estimate here is uncertain, so the
  band shows how low or high it could plausibly be.
- **▲ L/h is the flow rate:** your usage over the last 10 minutes, scaled to an
  hour.
- **Hover over the numbers** for the full breakdown: range, energy, responses,
  tokens, projects, and the drop colours.

## Menu

Right-click the widget, or the tray icon. Click the tray icon to show or hide the
widget. Drag the widget anywhere by its glass, edges or empty space (the water
itself is for hovering). It remembers its position.

| Option | What it does |
|---|---|
| Empty / Drain | Named for what's showing: "Empty test tube", "Empty cylinder", "Drain bathtub" or "Drain pool". Pours the water out, so you can measure one task ("since 3:42 PM"). Your real totals keep counting. `thirstyclaude --empty` does the same from a terminal. |
| Period | Today, last 7 days, last 30 days, all time, or since emptied. |
| Vessel | Automatic (grows with the amount), or always one vessel: test tube, glass, cylinder, bucket, rain barrel, bathtub, hot tub or pool. |
| Estimate | ThirstyClaude or EcoLogits (see below). |
| Water counted | Including power plants, or data-center cooling only. |
| Include Codex | Count Codex sessions as well as Claude Code. |
| Size | Tiny, Small, Medium, Large, Extra large or Huge (60%–200%). |
| Always on top | Keeps the widget above other windows. |
| Start with Windows / Open at login | Starts the widget when you log in (Windows and macOS). |

## Privacy

- **Local only.** ThirstyClaude reads session logs on your computer: Claude Code's
  `~/.claude/projects` (or `$CLAUDE_CONFIG_DIR`) and Codex's `~/.codex/sessions`
  (or `$CODEX_HOME`). From each response it uses only the token counts,
  timestamp, model name, and the name of the project folder. It never reads your
  prompts or code.
- **No network.** The app blocks every request that isn't a local file and turns
  off Chromium's background networking. There is no telemetry and there are no
  updates. The only downloads happen at install time, when npm fetches Electron
  and `fzstd`, a small decompressor for Codex's compressed logs.
- **Your totals stay on your machine**, in the app's data folder:
  - Windows: `%APPDATA%\ThirstyClaude`
  - macOS: `~/Library/Application Support/ThirstyClaude`
  - Linux: `~/.config/ThirstyClaude`

  The app keeps a running total there, so the all-time figure doesn't drop when
  old logs are deleted.

## How the estimate works

Neither Anthropic nor OpenAI publishes energy or water figures per request. So
ThirstyClaude offers two independent estimates. They usually land within a
factor of two of each other.

### ThirstyClaude estimate (default)

Every token type counts, weighted by how much computing it takes. The table shows
Wh per million tokens for Opus-class models.

| Token type | Wh per 1M |
|---|---|
| Output | 800 |
| Cache writes | 200 |
| Input | 160 |
| Cache reads | 8 |

Other model families are scaled from these values:

| Family | Scale |
|---|---|
| Sonnet | ×0.5 |
| Haiku | ×0.1 |
| Fable | ×2 |
| GPT large / standard / small | ×1.4 / ×0.7 / ×0.3 |

A typical long-context Claude Code request works out to roughly 3–4 Wh. The likely
range takes energy from half to double these values, combined with the
water-factor range.

### EcoLogits estimate

This option follows [EcoLogits](https://ecologits.ai/latest/methodology/llm_inference/),
the open methodology from GenAI Impact:

- **Tokens:** only output tokens count.
- **Energy:** scales with each model's estimated active parameters and the number
  of GPUs needed to hold it, plus server overhead and data-center PUE.
- **Water:** IT energy × (on-site WUE + PUE × the off-site water intensity of US
  electricity).
- **Inputs and range:** model sizes, PUE and WUE are EcoLogits' own published
  estimates, and the range comes from their minimum and maximum values.

### Water counted

- **Including power plants** (default) adds the water evaporated to generate the
  electricity. That's about 3 L per kWh in the ThirstyClaude estimate.
- **Data-center cooling only** counts just the cooling water. That's about 0.5 L
  per kWh.

To use your own assumptions, edit the constants in [`model.js`](model.js).

Background reading:

- [EcoLogits: LLM inference methodology](https://ecologits.ai/latest/methodology/llm_inference/)
- [Google's 0.26 mL per Gemini prompt (cooling only), and its critics](https://www.pcgamer.com/software/ai/theyre-just-hiding-the-critical-information-google-says-its-gemini-ai-sips-a-mere-five-drops-of-water-per-text-prompt-but-experts-disagree-with-its-findings)
- [AI water usage, including power-plant water](https://greencalculus.com/data/ai-water-usage/)
- [What AI water numbers actually measure](https://inzonex.co.uk/ai/reports/ai-data-center-water-evidence-2026)

## Command-line options

| Option | What it does |
|---|---|
| `--empty` | Empties the vessel, even while the widget is already running. |
| `--demo` | Shows made-up data, for trying it out or taking screenshots. |
| `--period=today` | Starts on a period: `today`, `week`, `month` or `all`. |
| `--vessel=tub` | Starts with a vessel: `auto`, `tube`, `glass`, `cylinder`, `bucket`, `barrel`, `tub`, `hottub` or `pool`. |
| `--size=large` | Starts at a size: `tiny`, `small`, `medium`, `large`, `xl` or `huge`. |

## Uninstall

1. Choose Quit from the tray menu.
2. Run `npm uninstall -g thirstyclaude`.
3. Delete the app data folder listed above.

## License

MIT
