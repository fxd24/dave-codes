# Dave Framework

A multi-agent development workflow that combines deep planning, parallel research, strict TDD, multi-model review with intelligent aggregation, tool-agnostic verification, and a learning loop that improves with every feature. Built for Claude Code, portable across projects.

## Table of Contents

- [Core Principles](#core-principles)
- [Directory Structure](#directory-structure)
- [Knowledge System](#knowledge-system)
- [Workflow Overview](#workflow-overview)
- [Phase 1: Discussion](#phase-1-discussion)
- [Phase 2: Research Orchestration](#phase-2-research-orchestration)
- [Phase 3: Plan](#phase-3-plan)
- [Phase 4: TDD Implementation](#phase-4-tdd-implementation)
- [Phase 5: Multi-Agent Review + Aggregation](#phase-5-multi-agent-review--aggregation)
- [Phase 6: Verification](#phase-6-verification)
- [Phase 7: Push & CI](#phase-7-push--ci)
- [Phase 8: Reflect & State Save](#phase-8-reflect--state-save)
- [Configuration](#configuration)
- [Design Principles](#design-principles)
- [Best Practices (2025-2026 Research)](#best-practices-2025-2026-research)

---

## Core Principles

1. **Multi-agent parallelism** -- Launch specialized agents concurrently wherever independent work exists.
2. **Autonomous within guardrails** -- Agents operate independently after the discussion phase establishes boundaries.
3. **Verification is first-class** -- Every plan explicitly defines HOW to verify, using whatever tools are available.
4. **Knowledge has provenance** -- Human-provided rules outrank agent-discovered ones. Always.
5. **Learning accumulates** -- Each phase feeds the milestone, each milestone feeds the project. Not everything bubbles up.
6. **Tool-agnostic verification** -- Any tool that can prove correctness is welcome. The framework adapts to what is available.
7. **Portable** -- `.agent/` works across projects. `.state/` is project-specific.

---

## Directory Structure

Two top-level directories with distinct responsibilities. `.agent/` is the **workflow system** -- portable across projects. `.state/` is **project-specific** -- accumulated knowledge, codebase analysis, and milestone work state.

### `.agent/` -- The System (portable)

Everything here defines HOW work is done. Agent definitions, skills, orchestration rules, and reference docs are project-agnostic. They know how to discuss, research, plan, implement, review, and verify -- but know nothing about any specific project's architecture, patterns, or tech stack.

```
.agent/
├── README.md              # THIS FILE - framework specification
├── agents/                # Agent definitions (generic, project-agnostic)
├── skills/                # Skill definitions (generic, project-agnostic)
├── rules/                 # Auto-loaded workflow rules
└── references/            # Technical reference docs (plan format, TDD protocol, etc.)
```

### `.state/` -- The Project (project-specific)

Everything here is specific to THIS project. It splits into four layers:

```
.state/
├── project/                           # Project context (accumulates over project lifetime)
│   ├── PROJECT.md                     # What this project is, constraints, value proposition
│   ├── PATTERNS.md                    # Architecture patterns, conventions, design decisions
│   ├── KNOWLEDGE.md                   # Pitfalls & rules with provenance tiers (see Knowledge System)
│   ├── STACK.md                       # Tech stack, libraries, versions, rationale
│   ├── CONCERNS.md                    # Known issues, tech debt, things to watch for
│   └── config.yaml                    # External tools, models, verification capabilities
│
├── codebase/                          # Codebase analysis (updated incrementally by learning agent)
│   ├── STRUCTURE.md                   # Where code lives, directory layout, naming patterns
│   ├── ARCHITECTURE.md                # Layers, data flow, entry points, key abstractions
│   └── CONVENTIONS.md                 # Code style, imports, type hints, testing patterns
│
├── milestones/                        # Per-milestone lifecycle state
│   └── {milestone-slug}/
│       ├── ROADMAP.md                 # Phase breakdown for this milestone
│       ├── RESEARCH.md                # Milestone-level research synthesis
│       ├── KNOWLEDGE.md               # Milestone-level decisions & mistakes (distilled at end)
│       └── phases/
│           └── {N}/
│               ├── DISCUSSION.md      # Context, guardrails, decisions from discussion
│               ├── RESEARCH.md        # Phase-level deep research
│               ├── PLAN.md            # Execution plan with verification matrix
│               ├── KNOWLEDGE.md       # Phase-level decisions & mistakes
│               ├── REVIEWS.md         # Aggregated, triaged review findings
│               ├── OPEN_QUESTIONS.md  # Ambiguous items for human review
│               ├── VERIFICATION.md    # Multi-layer verification results
│               └── SUMMARY.md         # Post-completion summary
│
├── STATE.md                           # Current position, velocity, session continuity
│
└── debug/                             # Debug sessions (persistent across context resets)
    ├── {slug}.md
    └── resolved/
```

### Why Four Layers?

| Layer | Changes when | Who writes it | Who reads it |
|-------|-------------|---------------|-------------|
| **`.agent/`** (system) | Framework is redesigned | Developer, manually | All agents |
| **`.state/project/`** (project context) | Project evolves, learnings accumulate | Reflect, learning agent, developer | Planner, executor, reviewer, verifier |
| **`.state/milestones/`** (milestone state) | Each milestone lifecycle | Agents during execution | Orchestrator, continuation agents |
| **`.state/codebase/`** (codebase understanding) | After each feature, incrementally | Learning agent, codebase-mapper | Planner, executor |

This separation means `.agent/` could be shared across projects (or versioned as a package). `.state/project/` carries the accumulated wisdom specific to one project. `.state/milestones/` is lifecycle work tracking. `.state/codebase/` is a living understanding of the code.

---

## Knowledge System

Knowledge in Dave flows through three scopes with explicit provenance. Not everything that is relevant at the phase level is relevant at the project level. Each scope filters and generalizes upward.

### Knowledge Scopes

```
Phase Knowledge                    Milestone Knowledge              Project Knowledge
(specific, contextual)             (aggregated, scoped)             (generalized, durable)

"PaddleOCR v3 doesn't            "OCR providers need explicit     "External API providers
 support batch > 4 on             batch size testing on            need batch size testing
 RTX 3070 with this               target hardware before           on target hardware --
 model config"                    committing to a provider"        never trust published
                                                                    benchmarks"
         │                                │                                │
         └── lives in ──────────►         └── lives in ──────────►         └── lives in
         .state/milestones/               .state/milestones/               .state/project/
         {slug}/phases/{N}/               {slug}/                          KNOWLEDGE.md
         KNOWLEDGE.md                     KNOWLEDGE.md
```

**Phase → Milestone:** At the end of each phase, decisions and mistakes are recorded in phase KNOWLEDGE.md. At the end of the milestone, reflect aggregates across phases into milestone KNOWLEDGE.md, keeping what is relevant to the milestone scope and discarding implementation details.

**Milestone → Project:** At the end of a milestone, reflect examines milestone KNOWLEDGE.md and proposes generalizations for project KNOWLEDGE.md. Only lessons that would be useful in unrelated future work get promoted. Human approves these promotions.

### Knowledge Provenance

All knowledge entries are tagged with their source. Human-provided knowledge has absolute authority.

#### Tier 1 -- Human-Provided (absolute authority)

Rules explicitly stated by the project owner. Content from CLAUDE.md. Corrections given during discussion or review. Decisions made on open questions.

Agents MUST follow Tier 1 knowledge. It cannot be overridden, questioned, or demoted by agents. Only the human can modify or remove Tier 1 entries.

```markdown
## Tier 1 (Human-Provided)

- [H001] Never use `get_session()` in tests -- connects to production
  Source: Human | Added: 2025-01-15 | Severity: Critical

- [H002] All external calls must go through gateways (HttpGateway, LLMGateway, etc.)
  Source: Human (CLAUDE.md) | Added: 2025-01-01 | Severity: Critical

- [H003] Store WHAT ran (model name), not WHERE it ran (hosting platform)
  Source: Human (review correction) | Added: 2025-02-01 | Severity: High
```

#### Tier 2 -- Agent-Discovered (standard authority)

Patterns and pitfalls found during development. Identified by reflect from review findings, verification failures, or implementation issues. Tagged with confidence and verification count.

Agents should follow Tier 2 knowledge but can flag conflicts. Tier 2 entries can be promoted to Tier 1 when the human confirms them. They can be demoted or removed if later found to be wrong.

```markdown
## Tier 2 (Agent-Discovered)

- [A001] PaddleOCR batch size > 8 causes OOM on RTX 3070
  Source: Agent (reflect) | Added: 2025-02-01 | Confidence: HIGH
  Verified: 3 times | Promoted: No

- [A002] SQLModel `session.exec()` returns ScalarResult -- never use `.scalars()`
  Source: Agent (code-review finding) | Added: 2025-02-10 | Confidence: HIGH
  Verified: 5 times | Promoted: No
  Promotion candidate: Yes (consistent across multiple features)
```

### How Agents Use Knowledge

Each agent type reads a specific subset of the knowledge system at execution start:

| Agent | Reads | Purpose |
|-------|-------|---------|
| Planner | `project/KNOWLEDGE.md`, `project/PATTERNS.md`, `project/CONCERNS.md`, `codebase/ARCHITECTURE.md` | Knows what patterns to follow and pitfalls to avoid |
| TDD Developer | `project/KNOWLEDGE.md`, `project/PATTERNS.md`, `codebase/CONVENTIONS.md` | Writes code following project patterns, avoids known mistakes |
| Code Reviewer | `project/KNOWLEDGE.md`, `project/PATTERNS.md`, `codebase/ARCHITECTURE.md` | Reviews against project-specific conventions and known issues |
| Review Aggregator | `project/KNOWLEDGE.md`, phase `PLAN.md` | Filters false positives against established conventions |
| Verifier | `project/KNOWLEDGE.md`, phase `PLAN.md`, `codebase/ARCHITECTURE.md` | Verifies goal achievement against project context |
| Reflect | Everything in `.state/` | Updates and maintains the entire knowledge system |

---

## Workflow Overview

```
Phase 1         Phase 2              Phase 3         Phase 4
Discussion      Research             Plan            TDD
(guardrails)    Orchestration        (goal-backward) Implementation
                (parallel agents)                    (wave-parallel)
    │               │                    │               │
    ▼               ▼                    ▼               ▼
DISCUSSION.md   RESEARCH.md          PLAN.md         Code + Tests
                (phase + milestone)  (+ verif matrix)     │
                                                    ┌─────┘
                                                    │
Phase 5              Phase 6           Phase 7      Phase 8
Multi-Agent          Verification      Push         Reflect &
Review + Aggregation (multi-layer)     & CI         State Save
    │                    │                │             │
    ▼                    ▼                ▼             ▼
REVIEWS.md           VERIFICATION.md   PR + CI      KNOWLEDGE.md
OPEN_QUESTIONS.md                                   (phase/milestone/project)
    │
    ▼
Fix Loop ──► back to Phase 4 (scoped) ──► scoped re-review ──► converge
```

Each phase has explicit entry criteria, outputs, and gates. Work does not proceed to the next phase until the current phase's gate passes.

### Feedback Loops

Two distinct feedback loops exist within the workflow:

**Review Fix Loop** (Phase 5 ↔ Phase 4): Review finds issues → aggregator triages → "fix now" items loop back to TDD → scoped re-review (fixes only, not full codebase) → converge. Each iteration is lighter than the previous. The loop MUST converge.

**Verification Gap Closure** (Phase 6 → Phase 4 → Phase 6): Verification fails → identify specific gap → focused fix plan → TDD for fix → re-verify only the gap. Different from the review loop -- this checks goal achievement, not code quality.

---

## Phase 1: Discussion

**Entry:** Start of a new phase within a milestone.
**Output:** `.state/milestones/{slug}/phases/{N}/DISCUSSION.md`

The discussion phase removes ambiguity and establishes guardrails. It sets the boundaries within which all subsequent agents operate autonomously.

### Purpose

After discussion, the AI should have enough context to:
- Identify what topics need deep research (Phase 2)
- Make architectural decisions without asking
- Know what is in scope and what is explicitly out
- Understand the user's priorities and constraints

### Process

1. **Read existing context.** Project state (`KNOWLEDGE.md`, `PATTERNS.md`, `CONCERNS.md`), relevant codebase context, the milestone roadmap, and any prior phase outputs.

2. **Ask structured questions across key categories.** 2-4 questions at a time, following up on answers with deeper probes. Do not accept surface-level answers.

| Category | Focus Areas |
|----------|-------------|
| Scope & Boundaries | What is in, what is explicitly out, what is deferred |
| Architectural Constraints | Must-use patterns, forbidden approaches, integration points |
| Data & State | What data exists, ownership, source of truth, schema implications |
| Risk Areas | What could go wrong, what is uncertain, what needs research |
| Success Criteria | How do we know it is done, what does "good" look like |

3. **Validate understanding.** Summarize key decisions, confirm the user is satisfied with the guardrails.

4. **Write DISCUSSION.md.** Captures:
   - Scope (in/out/deferred)
   - Architectural decisions made
   - Constraints and guardrails
   - Success criteria
   - Identified research topics (consumed by Phase 2)
   - Open questions that need human input later

### Key Difference from a Spec

Discussion is lighter than a full spec. It establishes guardrails and context, not exhaustive requirements. The plan (Phase 3) is where the detailed specification lives. Discussion answers "what are the boundaries?" -- planning answers "what exactly do we build?"

### Gate

DISCUSSION.md exists. The user has confirmed the scope and guardrails. Research topics are identified.

---

## Phase 2: Research Orchestration

**Entry:** After discussion phase produces DISCUSSION.md with identified research topics.
**Output:** `.state/milestones/{slug}/phases/{N}/RESEARCH.md` (phase-level), contributes to `.state/milestones/{slug}/RESEARCH.md` (milestone-level)

Research is the phase where the AI thinks like a domain expert about each specific topic that needs understanding before planning. Research is broad in scope -- it covers not just the existing codebase but also external services, libraries, official documentation, architectural options, strengths and weaknesses of each approach, and design patterns. The goal is expert-level preparation.

### Architecture

```
┌────────────────────────────────────────────────────────────────┐
│  Research Orchestrator (main session)                            │
│                                                                 │
│  Reads: DISCUSSION.md, project KNOWLEDGE.md, PATTERNS.md,      │
│         codebase ARCHITECTURE.md, milestone RESEARCH.md         │
│                                                                 │
│  1. Analyzes the phase scope from the discussion output         │
│  2. Identifies high-level architecture direction                │
│  3. Identifies specific research needs with targeted questions  │
│  4. Launches specialized research agents in parallel            │
│     (including architecture/design research agent)              │
│  5. Collects results, launches synthesis agent                  │
│  6. If research reveals new questions → can request a           │
│     follow-up discussion round before proceeding to planning    │
└───────────┬──────────┬──────────────────────────────────┬──────┘
            │          │ launches in parallel              │
            ▼          ▼                                   ▼
┌─────────────────┐ ┌──────────────────┐ ┌────────────────────┐
│ Arch/Design      │ │ Topic Research    │ │ Topic Research      │
│ Research Agent   │ │ Agent 1           │ │ Agent N             │
│                  │ │                   │ │                     │
│ Explores the     │ │ Topic: OCR        │ │ Topic: Rate limit   │
│ existing codebase│ │ provider choice   │ │ patterns for Y API  │
│ Proposes arch    │ │                   │ │                     │
│ options (2-3)    │ │ Expert lens:      │ │ Expert lens:        │
│ Evaluates each   │ │ "What would an    │ │ "What would an API  │
│ against project  │ │  OCR engineer     │ │  integration expert │
│ PATTERNS.md      │ │  research?"       │ │  research?"         │
│ and KNOWLEDGE.md │ │                   │ │                     │
│ Recommends one   │ │ Research scope:   │ │ Research scope:     │
│ with rationale   │ │ - Official docs   │ │ - Provider docs     │
│                  │ │ - GitHub issues   │ │ - Best practices    │
│ Sources:         │ │ - Known pitfalls  │ │ - Error handling    │
│ - Codebase       │ │ - Benchmarks      │ │ - Strengths/weak    │
│ - PATTERNS.md    │ │ - Strengths/weak  │ │ - Rate limit guides │
│ - Design docs    │ │ - Alternatives    │ │ - Real-world usage  │
│ - Best practices │ └─────────┬────────┘ └─────────┬──────────┘
└────────┬────────┘           │                      │
         │                    │                      │
         ▼                    ▼                      ▼
┌────────────────────────────────────────────────────────────────┐
│  Research Synthesizer Agent (dedicated, clean context)           │
│                                                                 │
│  Receives: ALL agent outputs + project context (inline)         │
│                                                                 │
│  - Validates confidence levels against source hierarchy         │
│  - Resolves contradictions between agents                       │
│  - Identifies cross-cutting concerns spanning topics            │
│  - Compiles remaining unknowns with risk assessments            │
│  - Identifies new questions for discussion (if any)             │
│  - Writes RESEARCH.md (unified, coherent, not concatenated)     │
│  - Updates milestone RESEARCH.md with cross-phase findings      │
└────────────────────────────────────────────────────────────────┘
```

### Why a Dedicated Synthesis Agent?

The research orchestrator's context is heavy from launching and collecting parallel agents. A dedicated synthesizer gets a clean context window focused purely on combining findings. Its unique contributions:
- **Cross-topic pattern detection** — individual agents work in isolation and cannot see connections
- **Confidence validation** — agents may over-claim confidence; the synthesizer enforces the source hierarchy
- **Contradiction resolution** — only visible when comparing outputs side-by-side
- **Coherent narrative** — produces a document that reads as unified analysis, not concatenated reports

### Architecture/Design Research Agent

A dedicated research agent focuses on codebase architecture and design decisions. It:

1. **Explores the existing codebase** -- reads relevant source files, understands current patterns, identifies integration points
2. **Proposes 2-3 architectural options** -- each with concrete file paths, classes, and method signatures
3. **Evaluates against project conventions** -- checks each option against PATTERNS.md and KNOWLEDGE.md (Tier 1 rules)
4. **Analyzes tradeoffs** -- strengths, weaknesses, risks, complexity, and alignment with existing patterns
5. **Recommends one approach** with detailed rationale and verified compatibility with the codebase
6. **Flags concerns** -- anything that might conflict with existing code or require discussion

This agent prevents the planner from making architectural decisions in a vacuum. The planner receives vetted options, not guesses.

### Research-to-Discussion Loop

If research reveals significant new questions or concerns that were not anticipated during discussion:

1. The design-thinking agent flags the new questions in RESEARCH.md under a `## New Questions for Discussion` section
2. The workflow pauses and surfaces these questions to the user
3. The user can choose to: (a) answer the questions inline, (b) run a focused follow-up discussion round, or (c) proceed with the planner's best judgment
4. Answers are appended to DISCUSSION.md and marked as `[post-research]`

This loop prevents the common failure mode of researching, finding surprises, and planning based on assumptions that should have been confirmed with the user.

### How Research Topics Are Identified

The design-thinking agent does not just list topics -- it thinks about what a domain expert would research for each one. Research is not limited to the codebase. For every service, library, or tool the phase will use, the agent researches as an expert would -- reading official docs, checking GitHub issues, understanding real-world limitations.

For each identified topic:

1. **What is the decision?** (e.g., "which OCR provider to use")
2. **What would an expert investigate?** (e.g., "batch processing support, memory requirements, accuracy on our document types, error handling semantics, licensing")
3. **What are the strengths and weaknesses?** (e.g., "PaddleOCR: fast on GPU, weak on handwriting. Tesseract: CPU-only, better language support. Mistral OCR: API-based, 60 RPM limit")
4. **What are the specific questions?** (e.g., "Does PaddleOCR v3 support async batch processing? What is the memory footprint per page at batch size 8?")
5. **What sources matter?** (e.g., "Official PaddleOCR docs for API, GitHub issues for real-world problems, benchmark repos for accuracy comparison")
6. **What does the existing codebase already do?** (e.g., "VLLMGateway already handles adaptive concurrency -- research how to extend it, not replace it")

### Source Hierarchy

Research sources are prioritized by reliability:

| Priority | Source | Trust Level |
|----------|--------|-------------|
| 1 | Official documentation | Highest -- state as fact |
| 2 | Codebase patterns | High -- this is how the project actually works |
| 3 | Web search (verified) | Medium -- cross-reference with official sources |
| 4 | Web search (single source) | Low -- flag for validation |

### Confidence Levels

| Level | Criteria | Usage |
|-------|----------|-------|
| HIGH | Official docs, verified library APIs, multiple credible sources agree | State as fact, plan can depend on this |
| MEDIUM | Web search verified against one official source, credible but not independently confirmed | State with attribution, plan should have fallback |
| LOW | Single web source, unverified, training data only | Flag for validation, do not plan around this |

### Time-Boxing

Research is capped at 15-20% of estimated implementation time. The goal is to gather enough information to plan well, not to achieve encyclopedic coverage.

### RESEARCH.md Structure

```markdown
# Phase Research: {phase name}

## Architecture Direction
High-level approach, key architectural decisions with rationale.

## Research Findings

### Topic 1: {topic name}
**Decision:** What was decided and why.
**Recommendation:** Primary recommendation with rationale.
**Alternatives considered:** What else was evaluated and why it was rejected.
**Findings:**
- [HIGH] Finding backed by official docs (source: URL)
- [MEDIUM] Finding from credible sources (source: URL)
- [LOW] Finding needing validation (source: URL)
**Pitfalls:**
- Common mistake 1 and how to avoid it
- Common mistake 2 and how to avoid it
**Open questions:** Anything that could not be resolved.

### Topic 2: {topic name}
...

## Cross-Cutting Concerns
Things that affect multiple topics (e.g., "all providers have rate limits").

## Remaining Unknowns
Questions that research could not answer. These become explicit risks in the plan.
```

### Gate

RESEARCH.md exists. All HIGH-confidence recommendations are supported by official sources. Open questions are documented and will be addressed in planning.

---

## Phase 3: Plan

**Entry:** After DISCUSSION.md and RESEARCH.md exist.
**Output:** `.state/milestones/{slug}/phases/{N}/PLAN.md`

The plan combines goal-backward must-haves, prescriptive tasks with dependency waves, and a verification matrix that specifies exactly how to verify the work.

### What the Planner Reads

| File | What It Provides |
|------|-----------------|
| `project/KNOWLEDGE.md` | Pitfalls to avoid (Tier 1 > Tier 2) |
| `project/PATTERNS.md` | Conventions to follow |
| `project/CONCERNS.md` | Known issues to watch for |
| `project/config.yaml` | Available tools, models, verification capabilities |
| `codebase/ARCHITECTURE.md` | Where to put code, how layers connect |
| Phase `DISCUSSION.md` | Scope, guardrails, success criteria |
| Phase `RESEARCH.md` | Technical findings, recommendations, pitfalls |

### Must-Haves (Goal-Backward)

Before defining tasks, define what must be TRUE when the work is complete. This prevents the common failure mode where all tasks are completed but the goal is not achieved.

**Truths:** Observable behaviors that must be true from the user's perspective.
```
- "OCR results persist in the database with full provenance metadata"
- "Re-running the pipeline on the same document does not create duplicates"
- "Invalid PDFs produce a clear error in the processing log, not a crash"
```

**Artifacts:** Files that must exist and be substantive (not stubs or placeholders).
```
- path: "src/services/pdf_extraction/ocr_service.py"
  provides: "OCR orchestration with provider selection"
  min_lines: 80
```

**Key Links:** Critical wiring between components where breakage causes cascading failure.
```
- from: "src/pipelines/org_pdf_extract.py"
  to: "src/services/pdf_extraction/pdf_processing_service.py"
  via: "service instantiation in asset function"
```

### Task Breakdown

Each task has four required elements:

| Element | Purpose | Example |
|---------|---------|---------|
| **Files** | Exact paths created or modified | `src/services/ocr_service.py` |
| **Action** | Specific implementation instructions | "Create OCRService with `process_pages` method that takes page images, selects provider from config, calls provider gateway, returns structured results" |
| **Verify** | How to prove the task is complete | `make test` passes for OCR tests, DB records created |
| **Done** | Acceptance criteria | "Pages are OCR'd, results stored with provider metadata, errors logged not raised" |

### Dependency Waves

Tasks are organized into waves based on dependencies. Independent tasks run in parallel within a wave.

```
Wave 1: [Task A, Task B]     # Independent, run in parallel (separate TDD executor agents)
Wave 2: [Task C, Task D]     # C depends on A, D depends on B
Wave 3: [Task E]             # Depends on C and D
```

### Verification Matrix

The plan explicitly defines HOW to verify each aspect of the work. This is designed during planning, not ad-hoc after implementation.

```xml
<verification-matrix>

  <layer name="plan-conformance">
    <!-- Goal-backward verifier checks must-haves -->
    <check>Each truth verified against codebase</check>
    <check>Each artifact exists, is substantive, and is wired</check>
    <check>Each key link connected</check>
    <check>No TODO/FIXME/HACK in modified files</check>
  </layer>

  <layer name="code-review">
    <agents>code-reviewer, security-reviewer</agents>
    <focus>
      - Gateway pattern compliance (all external calls through gateways)
      - 3-phase DB pattern (no connections held during network I/O)
      - Error handling at service boundaries
    </focus>
    <external>codex, kimi</external>
    <skip_external_if>changes are less than 50 lines</skip_external_if>
  </layer>

  <layer name="automated-functional">
    <!-- Tools selected based on config.yaml availability -->
    <step type="run">
      Run OCR on tmp/test-invoice.pdf using the new provider.
      Compare extracted text against known ground truth.
      Verify accuracy above 90% on text fields.
    </step>
    <step type="database">
      Query report_extractions table, verify new records exist.
      Verify provenance metadata (provider name, model version) populated.
      Run pipeline again, verify no duplicate records.
    </step>
    <step type="browser">
      Navigate to Dagster UI, verify asset materialized successfully.
      Check asset metadata shows correct record counts.
    </step>
  </layer>

  <layer name="human-oversight">
    <!-- Things the human MUST review -->
    <checkpoint>
      <what>Review OCR output for 3 sample PDFs (invoice, report, scan)</what>
      <why>Visual quality of OCR cannot be verified programmatically</why>
      <evidence>Side-by-side comparison: original PDF vs extracted text</evidence>
      <criteria>Text is readable, layout preserved, no garbled output</criteria>
    </checkpoint>
  </layer>

</verification-matrix>
```

The planner consults `config.yaml` to know what verification tools are available and plans accordingly. If a tool is not available, the planner either skips that verification type or notes it as a gap.

### Deviation Rules

Clear rules for what the executor can handle autonomously vs what requires user approval:

| Rule | Trigger | Permission |
|------|---------|------------|
| Rule 1: Bug | Code does not work as intended | Auto-fix |
| Rule 2: Missing Critical | Missing error handling, validation | Auto-fix |
| Rule 3: Blocking | Missing dependency, broken import | Auto-fix |
| Rule 4: Architectural | New DB table, schema change, service restructure | STOP, ask user |

### Scope Constraints

Each plan targets completion within approximately 50% of the AI's context window:

| Constraint | Target | Warning | Split Required |
|------------|--------|---------|----------------|
| Tasks per plan | 2-3 | 4 | 5+ |
| Files per plan | 5-8 | 10 | 15+ |
| Context budget | ~50% | ~70% | 80%+ |

### Test Specification in the Plan

The plan must specify test types for each task. The TDD developer implements tests from this spec -- it does not decide what to test. This separation keeps planning and execution focused.

For each task, the plan includes a `Tests` section alongside Files/Action/Verify/Done:

| Test Category | What It Covers | Example |
|---------------|---------------|---------|
| **Unit** | Individual functions/methods in isolation | "Test OCRService.process_pages returns structured results for valid images" |
| **Integration** | Component interactions with real dependencies | "Test OCR results persist to database with correct provenance metadata" |
| **Edge case** | Boundary conditions, error paths, malformed input | "Test empty PDF produces clear error, not crash. Test batch size > GPU memory gracefully degrades." |
| **Regression** | Known bugs that must not recur | "Test pipeline re-run does not create duplicate records (relates to H008)" |
| **Contract** | API/interface compatibility between layers | "Test service output matches expected Pydantic schema for downstream consumers" |

The planner selects test categories based on the task's nature. Not every task needs all categories. The planner references KNOWLEDGE.md to identify edge cases worth testing (e.g., H007 about Dagster partial success → regression test for metadata checking).

### Plan Checker

After the plan is created, a plan checker validates it. **Quality over token efficiency** -- the plan checker can run up to 5 revision iterations (not capped at 3). Each iteration deepens quality rather than patching surface issues.

1. **Requirement coverage** -- Every requirement from DISCUSSION.md has corresponding tasks.
2. **Task completeness** -- Every task has Files, Action, Tests, Verify, and Done.
3. **Test specification quality** -- Tests are specific and falsifiable (not "test it works"). Edge cases reference relevant KNOWLEDGE.md entries. Integration tests use real dependencies, not mocks, where feasible.
4. **Dependency correctness** -- No cycles, waves are consistent.
5. **Key links planned** -- Artifacts are not just created in isolation; wiring is explicitly planned.
6. **Must-haves derivation** -- Truths are user-observable (not implementation details like "library installed").
7. **Verification matrix completeness** -- All four layers present. Every must-have truth has at least one automated verification step.
8. **Knowledge compliance** -- Plan does not violate any Tier 1 knowledge entries.
9. **Scope sanity** -- No plan exceeds the context budget.

### Gate

PLAN.md exists. Plan checker reports zero blockers. User has approved the plan.

---

## Phase 4: TDD Execution

**Agents:** `tdd-executor` (parallel per task within wave), `practical-verifier` (after each task)

Implementation follows the Red-Green-Refactor cycle with mandatory handoff to practical verification after each task. The TDD executor is **plan-driven** -- it implements the plan's specification mechanically, following detailed blueprints rather than making design choices. The plan tells it WHAT to build, WHAT tests to write (with specific scenarios and expected outputs), and HOW to verify. The executor's scope is deliberately small and focused.

**Key distinction from a TDD developer:** A TDD developer exercises judgment about test design, implementation approach, and code organization. A TDD executor follows the plan's prescriptive spec. This works because the plan (Phase 3) is detailed enough -- it specifies test scenarios with inputs/outputs, not just "test that OCR works."

### Wave Execution (Maximum Parallelism)

Tasks within each wave are independent and run in parallel. Each task gets its own TDD executor agent. Waves execute in sequence (Wave 2 waits for Wave 1 to complete).

```
Wave 1 (all tasks in parallel — each gets its own TDD executor):
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ tdd-exec: Task A  │  │ tdd-exec: Task B  │  │ tdd-exec: Task C  │
│ Tests: from plan  │  │ Tests: from plan  │  │ Tests: from plan  │
│ RED → GREEN → REF │  │ RED → GREEN → REF │  │ RED → GREEN → REF │
└────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘
         ▼                      ▼                      ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ practical-verifier│  │ practical-verifier│  │ practical-verifier│
│ Run real code     │  │ Run real code     │  │ Run real code     │
│ Commit if pass    │  │ Commit if pass    │  │ Commit if pass    │
└────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘
         └──────────────────────┴──────────────────────┘
                                ▼
Wave 2 (depends on Wave 1 — parallel within wave):
┌──────────────────┐  ┌──────────────────┐
│ tdd-exec: Task D  │  │ tdd-exec: Task E  │
│ Tests: from plan  │  │ Tests: from plan  │
│ RED → GREEN → REF │  │ RED → GREEN → REF │
└────────┬─────────┘  └────────┬─────────┘
         ▼                      ▼
┌──────────────────┐  ┌──────────────────┐
│ practical-verifier│  │ practical-verifier│
│ Commit if pass    │  │ Commit if pass    │
└──────────────────┘  └──────────────────┘
```

### TDD Executor Responsibility

The TDD executor is an **executor**, not a planner or designer. It receives from the plan:
- **Files** to create/modify (exact paths)
- **Action** describing the implementation (precise instructions to follow)
- **Tests** specifying exact test scenarios with inputs and expected outputs
- **Verify** and **Done** criteria

The TDD executor's job:
1. Implement the EXACT test scenarios specified in the plan (not invent its own)
2. Write implementation code that follows the Action instructions precisely
3. Keep code minimal -- no extras, no gold-plating, no additional abstractions
4. Hand off to practical-verifier

What the TDD executor does NOT do:
- Design test cases (the plan already specified them)
- Choose implementation approaches (the plan already chose)
- Add features beyond what the plan specifies
- Make architectural decisions (Deviation Rule 4 -- stop and ask)

### TDD Cycle

For each task in the plan:

1. **RED** -- Write failing tests from the plan's test specification. Implement the exact scenarios the plan specified (inputs, expected outputs, edge cases). Tests must fail before any implementation code is written.
2. **GREEN** -- Write the minimum code necessary to make the tests pass. Follow the Action instructions precisely. No gold-plating, no premature optimization.
3. **REFACTOR** -- Clean up while keeping tests green. Keep changes minimal -- improve naming and reduce obvious duplication, but do not redesign.
4. **HAND OFF** -- Mandatory handoff to `practical-verifier`. The verifier runs the actual code path (not just tests), checks side effects (database records, files, API calls), and only commits if verification passes.

### Why Practical Verification After Each Task

Tests can pass while the feature is broken:
- Tests use mocks that do not match real behavior
- Tests pass but the database is empty (persistence not actually tested)
- Tests pass but files are not created (mocks hiding reality)
- All tests pass immediately (tests are testing nothing)

The `practical-verifier` catches these by running the code the way a human would.

### What TDD Executor Reads at Start

| File | Purpose |
|------|---------|
| `project/KNOWLEDGE.md` | Pitfalls to avoid (Tier 1 always, Tier 2 if relevant) |
| `project/PATTERNS.md` | Conventions to follow |
| `codebase/CONVENTIONS.md` | Code style, imports, type hints |
| Phase `PLAN.md` | Its specific task (Files, Action, Tests, Verify, Done -- follow precisely) |

### Deviation Handling

The deviation rules from Phase 3 govern behavior during execution:
- Rules 1-3 (Bug, Missing, Blocking): Auto-fix, continue.
- Rule 4 (Architectural): STOP, save state, present to user.

All deviations are tracked in phase KNOWLEDGE.md regardless of whether they required user approval.

### Commit Protocol

Each task is committed individually after verification passes. Never use `git add .` or `git add -A`. Stage specific files by name.

```
feat({phase}-{task}): {concise description}

- {key change 1}
- {key change 2}
```

### Gate

All tasks complete. All tests pass (`make test`). All lint checks pass (`make lint`). Each task committed individually. Practical verification passed for each task.

---

## Phase 5: Multi-Agent Review + Aggregation

**Driven by:** `<verification-matrix><layer name="code-review">` from PLAN.md + `config.yaml`

This phase runs parallel reviews and then intelligently aggregates findings, filtering false positives and surfacing ambiguous items for human decision.

### Review Execution

```
┌──────────────┐ ┌────────────────┐ ┌──────────────────┐ ┌──────────────┐
│ code-reviewer │ │ security-      │ │ pipeline-reviewer │ │ external     │
│ (always)      │ │ reviewer       │ │ (if pipeline code)│ │ models       │
│               │ │ (if needed)    │ │                   │ │ (from config)│
└──────┬───────┘ └───────┬────────┘ └────────┬──────────┘ └──────┬───────┘
       │ parallel         │                   │                   │
       ▼                  ▼                   ▼                   ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  Review Aggregator                                                       │
│                                                                          │
│  Reads: PLAN.md (understands what was built and why)                     │
│         project/KNOWLEDGE.md (knows Tier 1 conventions)                  │
│         project/PATTERNS.md (knows intentional project decisions)        │
│                                                                          │
│  For each finding:                                                       │
│                                                                          │
│  ┌─ Confident it is real ────────────────────────────────────────────┐   │
│  │  → Classify as "fix now" (bugs, security, correctness)            │   │
│  │    or "defer" (valid but not blocking)                            │   │
│  │  → Write to REVIEWS.md with reasoning                            │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─ Confident it is false ───────────────────────────────────────────┐   │
│  │  → Dismiss with reasoning (e.g., "contradicts Tier 1 rule H002", │   │
│  │    "reviewer lacked context about intentional pattern")           │   │
│  │  → Log dismissal in REVIEWS.md for transparency                  │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─ Not sure ────────────────────────────────────────────────────────┐   │
│  │  → Write to OPEN_QUESTIONS.md with:                               │   │
│  │    - The finding                                                  │   │
│  │    - What makes it ambiguous                                      │   │
│  │    - The aggregator's best guess                                  │   │
│  │    - What information would resolve it                            │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  Consensus boost: 3+ agents flag same issue → high confidence real       │
│  Convention filter: contradicts Tier 1 KNOWLEDGE → auto-dismiss          │
│                                                                          │
│  Outputs:                                                                │
│    REVIEWS.md        — Actionable, triaged findings                      │
│    OPEN_QUESTIONS.md — Ambiguous items for human review                  │
└──────────────────────────────────────────────────────────────────────────┘
```

### What Each Internal Reviewer Reads

All internal reviewers read `project/KNOWLEDGE.md` and `project/PATTERNS.md` for project-specific context. The `<focus>` field from the plan directs them to specific concerns.

| Agent | When Invoked | Specialized Focus |
|-------|-------------|-------------------|
| `code-reviewer` | Always | Architecture, design patterns, conventions, cognitive load |
| `security-reviewer` | Plan includes auth, external input, or API endpoints | OWASP Top 10, secrets, injection, auth/authz |
| `data-pipeline-reviewer` | Plan touches Dagster assets or pipeline code | Asset dependencies, idempotency, failure semantics |
| `database-expert` | Plan includes schema changes or new queries | Schema design, migration safety, query performance |

### External Reviews (Self-Contained Prompts)

External models (codex, opencode, etc.) are read from `config.yaml` and invoked via configured commands. They run in **read-only mode** -- analyze and suggest but never modify code.

**Critical design detail:** External models do NOT have subagents. They cannot read files, search the codebase, or ask follow-up questions. Therefore, the review orchestrator constructs a **self-contained prompt** for each external model that includes everything needed for a quality review:

- **What was built** -- feature summary from PLAN.md must-haves
- **Why it was built this way** -- architectural decisions from DISCUSSION.md and RESEARCH.md
- **The diff** -- complete git diff of all changes
- **Project rules** -- full Tier 1 KNOWLEDGE.md entries (not just IDs)
- **Intentional patterns** -- patterns from PATTERNS.md that should NOT be flagged
- **Review focus areas** -- specific concerns from the verification matrix
- **What NOT to review** -- explicit exclusions to prevent false positives
- **Expected output format** -- structured format for findings

This prompt construction is the review orchestrator's most important job for external reviews. A bad prompt produces useless findings.

### Review Fix Loop (Parallel, Autonomous)

If "fix now" items exist after triage:

1. **Analyze fix dependencies** -- determine which fixes are independent (different files, different concerns) vs dependent (same file, cascading changes).
2. **Launch independent fixes in parallel** -- each fix gets its own TDD executor agent via Task tool. Independent fixes run concurrently.
3. **Run scoped re-review** covering only the fixes, not the entire codebase.
4. **Repeat** until no "fix now" items remain.

Each iteration is lighter. The loop MUST converge. Fixes within each iteration are parallelized.

### OPEN_QUESTIONS.md Flow (Non-Blocking)

**Open questions do NOT block the fix loop.** The review aggregator's best guess is recorded, and autonomous fixes proceed immediately. The human reviews open questions only AFTER all autonomous fixes are complete. This prevents human review latency from blocking machine work.

When the human reviews open questions:
1. Decisions are recorded in phase KNOWLEDGE.md (phase-scoped).
2. If a decision requires a code change, a focused fix round runs.
3. At milestone end, reflect examines all phase decisions for generalizable patterns.
4. Patterns that would be useful in future work are proposed for promotion to project KNOWLEDGE.md (Tier 1, since human confirmed).

### Gate

All reviews complete. Findings triaged. No "fix now" items remain. "Defer" items have GitHub issues. OPEN_QUESTIONS.md reviewed by human (after fix loop completes).

---

## Phase 6: Verification

**Driven by:** Must-haves from PLAN.md + `<verification-matrix>` from PLAN.md
**Output:** `.state/milestones/{slug}/phases/{N}/VERIFICATION.md`

Three complementary verification layers run, each catching different classes of problems.

### Layer 1: Plan Conformance (Goal-Backward)

Checks must-haves from PLAN.md to determine whether the goal was actually achieved.

**Truth verification:** For each truth, determine whether the codebase enables it.

| Status | Meaning |
|--------|---------|
| VERIFIED | All supporting artifacts pass all checks |
| FAILED | One or more artifacts missing, stub, or unwired |
| UNCERTAIN | Cannot verify programmatically (needs human) |

**Artifact verification (three levels):**

| Level | Check | What It Catches |
|-------|-------|-----------------|
| 1. Exists | Does the file exist? | Missing files |
| 2. Substantive | Is it more than a stub? (min lines, required patterns) | Placeholder implementations |
| 3. Wired | Is it imported and used by other code? | Orphaned components |

**Anti-pattern scan:** Search modified files for indicators of incomplete work:
- `TODO`, `FIXME`, `HACK`, `PLACEHOLDER` comments
- Empty implementations (`return None`, `return {}`, `pass`)
- Log-only error handlers (catch exception, log, do not handle)

### Layer 2: Automated Functional Verification (Tool-Agnostic)

Executes the `<verification-matrix><layer name="automated-functional">` steps from PLAN.md using whatever tools are available.

**Tool-agnostic design:** The framework does not hardcode verification tools. The planner selects tools from `config.yaml` based on what the phase needs. New tools are added to config.yaml as they become available.

| Step Type | Execution Method | Example |
|-----------|-----------------|---------|
| `browser` | Chrome MCP, Playwright MCP, or future browser tools | Navigate, click, verify visual state |
| `run` | Script execution | Run actual code with real inputs, compare to ground truth |
| `api` | HTTP requests | Exercise endpoints with known inputs and expected outputs |
| `pipeline` | Asset materialization | Run pipeline, check output tables, verify idempotency |
| `database` | SQL queries via script | Verify state changes, FK relationships, no orphans |

Each step produces a pass/fail result with evidence (command output, screenshots, query results).

**Why this is in the plan, not ad-hoc:** The planner understands what was built and can anticipate what needs proving. A UI feature needs browser verification. An OCR model needs document processing. A pipeline needs idempotency checks.

### Layer 3: Qualitative Evaluation (When Applicable)

For features where output quality is subjective or tradeoff-rich:

The `qualitative-evaluator` runs the code on sample inputs, establishes ground truth independently, compares actual output, and reports accuracy with specific examples of failures. Used for ML outputs, extraction quality, data transformation accuracy.

Not every feature needs this. The planner determines whether qualitative evaluation is warranted.

### Layer 4: Human Oversight

The `<verification-matrix><layer name="human-oversight">` checkpoints from PLAN.md are presented to the human. Each checkpoint specifies:

- **What** to review
- **Why** it cannot be automated
- **Evidence** presented (screenshots, side-by-side comparisons, data samples)
- **Criteria** for what "good" looks like

Human verification happens after all automated layers complete.

### Gap Closure

If any verification layer finds gaps:

1. Identify the specific truth that failed, which artifacts have issues, and what is missing.
2. Create focused fix plan addressing only the gaps.
3. Execute fixes (loop back to Phase 4 for targeted TDD).
4. Re-verify only the gaps.
5. Repeat until all must-haves pass or gaps are explicitly deferred with user approval.

### VERIFICATION.md Structure

```yaml
---
status: passed | gaps_found | human_needed
score: N/M must-haves verified

plan_conformance:                  # Layer 1
  truths_verified: N/M
  artifacts_verified: N/M
  key_links_verified: N/M
  anti_patterns_found: []

automated_functional:              # Layer 2
  steps_passed: N/M
  steps_failed:
    - type: "database"
      step: "Verify no duplicate records after re-run"
      result: "Found 2 duplicates in report_extractions"
  tools_used: [chrome-mcp, bash, database]

qualitative:                       # Layer 3 (if applicable)
  evaluated: true | false
  accuracy: "92% on text fields"
  issues: []

human_oversight:                   # Layer 4
  checkpoints:
    - what: "Review OCR output for 3 sample PDFs"
      status: pending | passed | failed
      notes: ""

gaps:
  - truth: "Re-running the pipeline does not create duplicates"
    layer: "automated_functional"
    status: failed
    reason: "Unique constraint missing on (report_id, provider, page_number)"
    fix: "Add composite unique constraint in migration"
---
```

### Gate

All automated layers pass. Human checkpoints completed. VERIFICATION.md written. Gaps resolved or deferred with user approval.

---

## Phase 7: Push & CI

### Process

1. Run `make lint && make test` locally.
2. Create a descriptive commit message (conventional commit format).
3. Push to the feature branch (never directly to main).
4. Create PR with `gh pr create`.
5. Monitor CI with `gh pr checks --watch`.

### Gate

All local checks pass. PR created. CI pipeline passes.

---

## Phase 8: Reflect & State Save

**Output:** Updates to KNOWLEDGE.md (phase, milestone, and/or project level), PATTERNS.md, CONCERNS.md. Proposes diffs for CLAUDE.md and agent configs.

Reflect is the learning loop. It examines what happened during the phase and extracts knowledge at the appropriate scope.

### What Reflect Does

#### Auto-Apply (low-risk changes)

| Target | Action |
|--------|--------|
| Phase KNOWLEDGE.md | Record specific decisions, mistakes, and learnings from this phase |
| Milestone KNOWLEDGE.md | Update with cross-phase patterns (only at milestone end) |
| project/PATTERNS.md | Add newly confirmed patterns |
| project/CONCERNS.md | Add newly discovered concerns or tech debt |
| codebase/ files | Incremental updates to STRUCTURE, ARCHITECTURE, CONVENTIONS |

#### Propose as Diff (high-risk changes, human approves)

| Target | What is Proposed |
|--------|-----------------|
| project/KNOWLEDGE.md (Tier 1 promotions) | Agent-discovered rules that have been verified N times and merit human confirmation |
| project/KNOWLEDGE.md (new Tier 1 from phase decisions) | Generalizations from phase-specific decisions that would apply broadly |
| CLAUDE.md | Rule changes, new conventions, deprecated patterns |
| Agent prompts/configs | Improvements based on observed agent failures or inefficiencies |

### Knowledge Aggregation Flow

```
During phase:
  Phase KNOWLEDGE.md ← specific decisions, mistakes, open question resolutions

At milestone end:
  Milestone KNOWLEDGE.md ← aggregated from all phase KNOWLEDGE.md files
                           Keeps: patterns relevant to the milestone scope
                           Discards: implementation-specific details

  Project KNOWLEDGE.md ← proposed generalizations from milestone KNOWLEDGE.md
                         Only: lessons useful in UNRELATED future work
                         Requires: human approval for Tier 1 entries
```

**Example of the flow:**

| Phase level | Milestone level | Project level |
|-------------|-----------------|---------------|
| "The Mistral OCR API returns 429 after 60 RPM on our Azure deployment" | "OCR providers have deployment-specific rate limits -- test against actual deployment, not published limits" | "External API rate limits vary by deployment -- always test against actual environment before planning batch sizes" |

### Learning Sources

| Source | What Reflect Looks For |
|--------|----------------------|
| Implementation deviations | Did the plan change? Why? Was the original plan wrong or did requirements shift? |
| Review findings | What did reviews catch? Were there patterns in the findings? |
| Verification failures | What did verification catch that reviews missed? What types of bugs slip through? |
| Human corrections | What did the human change or override? These are the highest-signal learning events. |
| Open question resolutions | How did the human resolve ambiguous items? Do these reveal unstated conventions? |

### Gate

Phase KNOWLEDGE.md updated. Project state files updated where appropriate. High-risk change diffs proposed and queued for human review. SUMMARY.md written for the phase.

---

## Configuration

### config.yaml

Unified configuration for all external tools, models, and verification capabilities. Lives at `.state/project/config.yaml`.

**Self-updating:** Claude Code can verify what tools are available and update config.yaml accordingly. When a new tool could improve the workflow, Claude Code can suggest installation and update the config after the user confirms.

```yaml
# Models
models:
  primary: claude-opus-4-6
  profiles:
    quality:   { planner: opus, executor: opus, verifier: sonnet }
    balanced:  { planner: opus, executor: sonnet, verifier: sonnet }
    budget:    { planner: sonnet, executor: sonnet, verifier: haiku }

# External review models
review_models:
  - name: codex
    command: "codex exec -m gpt-5.3-codex -c 'model_reasoning_effort=\"high\"'"
    strengths: "code-focused reasoning, catches logic bugs"
    available: true
  - name: kimi
    command: "opencode run -m opencode/kimi-k2.5-free --variant high"
    strengths: "different reasoning approach, catches design issues"
    available: true

# Build tools
tools:
  test: "make test"
  lint: "make lint"
  run_script: "uv run --env-file .env python"

# Verification tools (tool-agnostic -- add new tools as they become available)
verification:
  chrome_mcp:
    available: true
    type: browser
    capabilities: [navigate, click, screenshot, read_page, form_input]
    notes: "Requires Chrome with extension running"
  playwright:
    available: false
    type: browser
    capabilities: [navigate, click, screenshot, headless]
    install: "npm install -g @anthropic/mcp-playwright"
  bash:
    available: true
    type: script
    capabilities: [run_command, check_exit_code, file_operations]
  database:
    available: true
    type: query
    capabilities: [select, count, verify_schema]
    test_connection: "make db-test"
    query_tool: "uv run --env-file .env python -c"
  docker:
    available: true
    type: container
    capabilities: [build, run, compose]

# Knowledge settings
knowledge:
  tier2_promotion_threshold: 3        # Times verified before eligible for promotion
```

---

## Autonomous Mode (Future: `/dave:auto`)

> **Status:** Planned, not yet implemented. The gates and manual commands above are the current workflow.

### Vision

After the discussion phase (Phase 1), the entire workflow runs autonomously until the code is PR-ready. One command chains all phases:

```
/dave:auto
  → research → plan → execute → review → verify → push
```

The human participates in:
1. **Discussion** (Phase 1) -- always interactive, establishes guardrails
2. **Post-research discussion** (if research reveals new questions) -- optional
3. **Open questions** (after review fix loop) -- presented after autonomous fixes complete
4. **PR review** -- final human check before merge

Everything else is autonomous.

### Implementation via Ralph Loop

Auto-mode will be implemented using the Ralph Loop pattern -- a hook-based session continuation system:

1. **Ralph Loop launches** the first phase after discussion
2. Each phase runs to its gate
3. When a gate is reached, the current session writes state and exits
4. A **hook detects the exit** and starts a new Claude Code session
5. The new session reads state (`.state/STATE.md`, phase artifacts) and continues from where the previous session stopped
6. This repeats until all phases complete or a gate requires human input

### Gate Handling in Auto-Mode

| Gate | Auto-Mode Behavior |
|------|--------------------|
| Research → Discussion loop | **Pause** -- present new questions to human, wait for response, resume |
| Plan approval | **Auto-approve** if plan checker passes with zero blockers. **Pause** if blockers exist |
| Deviation Rule 4 | **Pause** -- architectural changes always need human approval |
| Open questions from review | **Defer** -- collect all, present after fix loop, then resume |
| Verification human checkpoints | **Pause** -- present evidence, wait for human judgment |
| CI failure | **Auto-retry** once with targeted fix. **Pause** if still failing |

### Why This Works

- **State survives sessions** -- `.state/STATE.md` and phase artifacts give each new session full context
- **Gates remain** -- auto-mode does not remove gates, it just navigates them automatically
- **Human override** -- the human can stop the loop at any time
- **Manual mode coexists** -- `/dave:discuss`, `/dave:research`, etc. still work independently for when you want manual control

### What Needs to Be Built

1. `/dave:auto` skill that orchestrates the full pipeline
2. Ralph Loop integration (hook-based session continuation)
3. Gate detection and routing logic (pause vs auto-proceed)
4. State checkpointing at each gate for clean session handoff
5. Human notification system (when auto-mode pauses for input)

---

## Design Principles

### 1. Spec-First, Always
No code without a spec. The discussion phase and plan are the contract that drives everything downstream.

### 2. Autonomous Within Guardrails
The discussion phase establishes boundaries. Within those boundaries, agents operate without asking. This is faster than asking at every decision point and safer than having no boundaries at all.

### 3. Goal-Backward, Not Task-Forward
Plan from outcomes (what must be true) not activities (what to do). Verify outcomes, not task completion. A completed task list with an unachieved goal is a failure.

### 4. Knowledge Has Provenance
Human-provided rules (Tier 1) have absolute authority. Agent-discovered patterns (Tier 2) are valuable but can be questioned. Never let an agent override a human decision.

### 5. Knowledge Flows Up Through Generalization
Phase knowledge is specific. Milestone knowledge is aggregated. Project knowledge is generalized. Not everything bubbles up -- only lessons that would be useful in unrelated future work.

### 6. TDD is Non-Negotiable
Tests drive implementation. Practical verification confirms tests are not lying. Both are mandatory.

### 7. Multiple Perspectives Catch More Bugs
Different AI models think differently. Multi-model review with intelligent aggregation catches issues no single model would find. Consensus findings are high-signal.

### 8. Verification is Designed, Not Ad-Hoc
Every plan includes a verification matrix. The planner decides HOW to verify based on WHAT was built and WHAT tools are available. This is more effective than generic verification.

### 9. Tool-Agnostic by Design
The framework does not hardcode tools. config.yaml declares what is available. The planner selects tools. New tools plug in without changing agents or workflow.

### 10. Deviation Rules Prevent Paralysis
Clear rules for what can be auto-fixed (Rules 1-3) vs what needs approval (Rule 4) prevent both paralysis (stopping for everything) and runaway (making unauthorized changes).

### 11. State Survives Sessions
Every meaningful decision, deviation, and outcome is persisted. Fresh sessions pick up where the last one left off.

### 12. Review Loops Converge
First review is comprehensive. Fix reviews are scoped. The loop must converge. If the loop is not converging, the problem is in triage, not in the code.

### 13. Agents are Generic, Knowledge is Project-Specific
Agent definitions know HOW to plan, implement, review, and verify. All project knowledge lives in `.state/project/`. Agents read these at runtime. This makes agents portable and knowledge cumulative.

### 14. The System Improves Itself
Reflect updates knowledge, proposes improvements to CLAUDE.md and agent configs. The workflow gets smarter with every feature. Human approves high-risk changes.

---

## Best Practices (2025-2026 Research)

### Specification Quality

- **Every hour on planning saves approximately 10 hours downstream** (Thoughtworks research). The discussion phase is not overhead; it is the most productive phase per minute invested.
- **Include anti-requirements.** Explicitly state what the feature does NOT do.
- **Use domain-oriented language.** Given/When/Then scenarios force specificity.

### TDD as Safety Net

- **The tautological test trap.** When the AI writes both tests and implementation, it can produce tests that verify its own assumptions. Best practice: humans define test intent, AI implements.
- **Defect density reduction.** Teams using strict TDD report 40-90% reduction in defects (IBM, Microsoft, Thoughtworks).
- **TDD as design tool.** Writing tests first forces thinking about the interface before the internals.

### Multi-Model Review

- **Consensus is high-signal.** Three or more independent models flagging the same issue is almost certainly real.
- **Different architectures, different insights.** Reasoning-focused vs code-focused vs general-purpose models notice different classes of issues.
- **LLMs alone are unreliable for fully automated review.** Research on 492 code blocks found LLMs miss significant bug classes when used as sole reviewer.
- **Triage prevents review fatigue.** Without triage, developers ignore review findings because there are too many to act on.

### Goal-Backward Verification

- **Task completion does not equal goal achievement** (DORA 2025). AI inflates task completion counts. "Did we achieve the goal?" is different from "Did we complete the tasks?"
- **Demo the feature to yourself.** Exercise it the way a user would. If you cannot demonstrate it working, it is not done.
- **Three-level artifact verification.** Exists (Level 1) ≠ substantive (Level 2) ≠ wired (Level 3). All three must pass.

### Agent Architecture

- **Performance saturates beyond 4 agents without structured coordination** (Google DeepMind). Adding agents without coordination leads to redundant work.
- **Start with one agent, add specialization for specific failure modes.** Do not pre-emptively create specialized agents.
- **Context isolation is the primary benefit of agents.** Subagents have their own context window; the orchestrator receives only the summary.

### Research Time-Boxing

- **Cap at 15-20% of estimated implementation time.** Diminishing returns set in quickly.
- **Focus on constraints, not exhaustive comparison.** Know the rate limits, known issues, and concurrency model.
- **Document findings so decisions survive sessions.** Research that is not written down is research that will be repeated.

### Persistent State

- **Use progress files and git history as durable state.** The AI's context window is temporary. Files on disk and commits are permanent.
- **Never let more than 30 minutes of work go uncommitted.** Uncommitted work is work that does not exist.
- **State files are the debugging brain.** They tell the next session exactly where things stand.
