# Dave Framework

A multi-agent development workflow for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) that combines structured discussion, parallel research, strict TDD, multi-model code review, tool-agnostic verification, and a learning loop that improves with every feature.

This is the result of months of experimenting with various approaches to coding with Claude Code. The goal: define what needs to be done, walk away, and come back to reviewed, verified, working code.

## Philosophy

### Let the model check its own work

The central idea behind Dave is layered self-checking. A single pass of code generation is not enough. The framework stacks multiple verification layers on top of each other:

1. **TDD** -- tests are written before implementation, so the code proves itself from the start
2. **Practical verification** -- after tests pass, run the actual code path to catch mocks hiding reality
3. **Multi-agent code review** -- internal specialized reviewers (security, architecture, database) run in parallel
4. **External model review** -- different AI models (Codex, Kimi, etc.) review the same code, because different architectures catch different classes of bugs
5. **Goal-backward verification** -- check that the *goal* was achieved, not just that tasks were completed
6. **PR review** -- the final human gate

Verification is where I believe the most future work lies. As coding harnesses like Claude Code mature, we will see increasingly sophisticated methods for AI to check its own work. Dave's verification matrix is a step in that direction, but there is much more to explore.

### Parallelize everything

Claude Code's Task tool (subagents) is the most powerful feature of the platform. Dave leans into it hard:

- **Research phase**: multiple topic researchers + an architecture agent all run in parallel, each in their own clean context window
- **Execution phase**: independent tasks within a wave each get their own TDD agent, running simultaneously
- **Review phase**: internal reviewers + external models all run in parallel, then an aggregator synthesizes findings
- **Verification**: multiple verification layers can run concurrently

The guiding principle: if two pieces of work don't depend on each other, they should run at the same time.

### Fight context rot with progressive disclosure

Context rot -- the degradation of model performance as the context window fills up -- is real and insidious. Dave fights it by following [Anthropic's best practices](https://docs.anthropic.com/en/docs/claude-code/best-practices) on progressive disclosure:

- **Subagents get only what they need.** A TDD developer receives its specific task, not the entire plan. A code reviewer gets the diff and focus areas, not the research history.
- **Output-heavy operations are delegated.** Large diffs, test output, and database results are processed by subagents that return summaries to the orchestrator.
- **State lives on disk, not in context.** Every decision, finding, and outcome is persisted to markdown files. Fresh sessions pick up from files, not from conversation history.
- **Templates define structure.** Agents write to templates so downstream consumers know exactly where to find information.

### Be a manager, not a micromanager

Earlier approaches (including my own experiments) made the mistake of over-specifying implementation details. The plan would describe exactly which lines to write, which variables to name, which patterns to use -- and then Opus would dutifully follow instructions instead of using its full capabilities.

Dave takes a different approach: **clear task definitions with room for the model to do what it's good at.** The plan specifies *what* to build, *what tests* to write, and *how to verify* -- but leaves the implementation to the model's judgment. Think of it as giving a senior developer a well-written ticket, not a step-by-step tutorial.

## The Workflow

```
Phase 1         Phase 2              Phase 3         Phase 4
Discussion      Research             Plan            TDD
(questions)     (parallel agents)    (goal-backward) (wave-parallel)
    |               |                    |               |
    v               v                    v               v
DISCUSSION.md   RESEARCH.md          PLAN.md         Code + Tests
                                     (+ verif matrix)     |
                                                          v
Phase 5              Phase 6           Phase 7      Phase 8
Multi-Agent          Verification      Push          Reflect &
Review               (multi-layer)     & CI          Learn
    |                    |                |             |
    v                    v                v             v
REVIEWS.md           VERIFICATION.md   PR + CI      KNOWLEDGE.md
```

**Phase 1: Discussion** -- Ask structured questions early. Identify gray areas, establish guardrails, define what's in scope and what's out. This is where the AI gains enough context to work autonomously through all subsequent phases.

**Phase 2: Research** -- Launch parallel research agents, each investigating a specific topic with an expert lens. An architecture agent explores the codebase and proposes design options. A synthesis agent combines all findings into a coherent document.

**Phase 3: Plan** -- Goal-backward planning. Define what must be TRUE when done, then work backwards to tasks. Each task specifies files, action, tests, and verification. A plan checker validates quality before execution begins.

**Phase 4: Execute** -- Strict TDD with wave-based parallelism. Independent tasks run as parallel subagents. Each task follows RED-GREEN-REFACTOR, then hands off to a practical verifier that runs the actual code.

**Phase 5: Review** -- Parallel code review from multiple internal agents + external AI models. An intelligent aggregator triages findings against project knowledge, separating real issues from false positives.

**Phase 6: Verify** -- Multi-layer verification: plan conformance (were goals achieved?), automated functional testing (does it actually work?), and human oversight checkpoints.

**Phase 7: Push** -- Create PR with structured description derived from phase artifacts.

**Phase 8: Reflect** -- Extract learnings. Update project knowledge. The system gets smarter with every feature.

## Quick Mode

Not everything needs the full workflow. For small, well-understood tasks:

```
/dave:quick "add validation to email field"
```

Quick mode compresses the front half (skip discuss/research/plan) while preserving quality: inline plan, TDD, review, verification, commit.

## Session Continuity

Claude Code's Task tool enables longer execution chains. Combined with the [Ralph Loop](https://github.com/human-rated/ralph-loop) pattern (hook-based session continuation), the framework can execute entire workflows across multiple sessions. State persists in `.state/` files, so each new session picks up exactly where the last one left off.

## Acknowledgments

Credit to [Get Shit Done (GSD)](https://github.com/ai-toolchain/gsd) for the inspiration. GSD had a particularly good approach to asking questions early in the workflow, and its state management -- persisting decisions and progress to files so sessions can resume -- is solid. I took both ideas and built on them. Where I found GSD fell short:

- **Parallelism**: GSD doesn't leverage subagents for parallel work nearly enough. Dave runs research, execution, and review agents in parallel wherever possible.
- **Context management**: Despite claiming to fight context rot, GSD fills the context window quickly. Dave implements Anthropic's progressive disclosure best practices and delegates output-heavy operations to subagents.
- **Code review**: GSD's review capabilities are limited. Dave runs multiple internal reviewers + external AI models in parallel, with an intelligent aggregator that filters false positives.
- **Verification**: This is where the gap is widest. GSD lacks structured verification. Dave implements a four-layer verification matrix designed during planning, not bolted on after the fact.
- **Micromanagement**: Both GSD and some of my earlier methods defined implementation details too precisely, preventing the model from using its full capabilities. Dave gives clear task definitions but trusts the model to execute.

## What's in this repo

```
.claude/
  agents/           15 agent definitions
    dave-*.md         9 Dave framework agents (architect, researcher, synthesizer, etc.)
    *.md              6 generic agents (tdd-developer, code-reviewer, security-reviewer, etc.)
  commands/dave/    14 slash commands (/dave:init through /dave:verify, plus /dave:sync)
  dave/             Framework core
    workflows/        Phase orchestration logic
    process/          Detailed agent instructions
    templates/        Output templates and config
    references/       Verification matrix, confidence calibration, etc.
    rules/            Codebase investigation patterns
  skills/           4 skills (review, verify, reflect, second-opinion)
  rules/            Shared rules (context management)

src/dave_codes/
  cli.py           Typer CLI (install, uninstall, status, sync, push)
  sync.py          File copy, backup, install registry logic
  manifest.py      Manifest I/O and SHA256 hashing
  framework_files.py  Framework pattern parsing and glob expansion
```

To use Dave in your own project, copy the `.claude/` directory and run `/dave:init` to initialize project state. See the [full framework specification](.agent/README.md) for detailed documentation of every phase, agent, and design decision.

## License

MIT
