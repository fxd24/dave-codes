# Design: `dave-codes` CLI — Local Framework Sync

## Problem

The Dave framework is a multi-agent development workflow for Claude Code — 88 files across `.claude/` directories. It needs to be shared across multiple local projects (brainsquad, langres, future repos) with:

1. **Install** the framework into any project with a single command
2. **Update** projects when the framework improves upstream
3. **Push improvements back** when you improve the framework while working in a project
4. **Cleanly remove** the framework from a project
5. **Keep project-specific files separate** — each project has its own agents, settings, skills

Today, this is done by manually copying files between repos. There's no tracking of what's framework vs project-specific, no way to detect drift, and no way to push changes back.

## Inspiration: GSD

[GSD](https://github.com/gsd-build/get-shit-done) solves a similar problem: npm package, manifest-based tracking (SHA256 hashes), non-destructive install, local patch backup, clean uninstall.

**What we take:** Manifest tracking, non-destructive install, clean uninstall.

**Where we diverge:** Python + typer, local repo sync instead of npm distribution, bidirectional sync gated by PRs, Claude-assisted workflow via slash command.

## Solution: Local Repo Sync

The dave-codes repo is the source of truth. A Python CLI syncs framework files between it and project repos. **All changes go through pull requests** — no direct mutations.

```
~/repos/dave-codes/              ← source of truth
  .claude/                       ← framework files (source of truth)
  src/dave_codes/                ← CLI source
  .dave-framework-files          ← which files are framework (checked in)
  .dave-installs.json            ← where it's installed (gitignored)

~/repos/brainsquad/              ← project with framework installed
  .claude/                       ← framework + project-specific files
  .claude/dave-manifest.json     ← tracks installed framework files

~/repos/langres/                 ← another project
  .claude/                       ← framework + project-specific files
  .claude/dave-manifest.json     ← tracks installed framework files
```

### Two Flows, Both Gated by PRs

**dave-codes → projects (sync):** After a dave-codes PR is merged, run `sync` to update all registered projects. Commit the changes in each project.

**project → dave-codes (push):** When framework files are improved in a project, `push` copies them to the dave-codes working tree. Claude creates a branch + PR on dave-codes.

No bidirectional merge logic. No conflict resolution. Just one-way copy in whichever direction, gated by PRs.

### Two-Layer Architecture

**Layer 1: `dave-codes` CLI** — handles file mechanics (copy, hash, diff, manifest). Predictable, safe, no side effects beyond file operations.

**Layer 2: `/dave:sync` slash command** — Claude handles judgment and workflow (which direction to sync, creating branches, making PRs, committing). Delegates file operations to the CLI.

## CLI Commands

Five commands. Flat, no nesting.

```bash
dave-codes install <project-path>     # First-time setup + register
dave-codes uninstall <project-path>   # Clean removal + deregister
dave-codes status [project-path]      # Show drift for one or all projects
dave-codes sync [project-path]        # dave-codes → project(s)
dave-codes push <project-path>        # project → dave-codes working tree
```

### `dave-codes install <project-path>`

First-time setup for a project.

1. Read `.dave-framework-files` to get the list of framework file patterns
2. Resolve patterns against the dave-codes repo (glob expansion)
3. Copy each framework file to `<project-path>/`, preserving directory structure
4. Create parent directories as needed
5. Skip files that already exist and are not in the manifest (project-specific files)
6. Write `<project-path>/.claude/dave-manifest.json` with SHA256 hashes of every installed file
7. Register project in `.dave-installs.json`

### `dave-codes uninstall <project-path>`

Clean removal of all framework files.

1. Read project's `dave-manifest.json`
2. For each file in the manifest:
   - Check if it still exists
   - Check if locally modified (compare SHA256)
   - Delete the file (warn if locally modified)
3. Clean up empty directories left behind
4. Remove the manifest itself
5. Deregister from `.dave-installs.json`

**Key principle:** Only removes files tracked in the manifest. Project-specific agents, settings, skills, rules are never touched.

**Flags:**
- `--keep-modified` — skip files that have been locally modified instead of deleting them

### `dave-codes status [project-path]`

Show drift between dave-codes and project(s).

If no project-path, show status for ALL registered projects.

**Output per project:**
- Files only in source (new framework files not yet installed)
- Files only in project manifest (removed from framework)
- Files that differ (with direction indicator: source newer, project newer, or both changed since last sync)
- Files in sync
- Last sync timestamp

Uses manifest hashes to detect changes. Compares: source hash vs manifest hash (source changed?), project file hash vs manifest hash (project changed?).

### `dave-codes sync [project-path]`

Copy framework files from dave-codes → project(s). Run this after a dave-codes PR merges.

If no project-path, sync ALL registered projects.

1. Read `.dave-framework-files`, resolve patterns
2. For each framework file:
   - If file changed in project since last sync (project hash ≠ manifest hash): back up to `<project>/.claude/dave-local-patches/<timestamp>/`
   - Copy from dave-codes to project
3. Update manifest with new hashes and sync timestamp
4. Update `.dave-installs.json` with new last_sync
5. Report: files updated, files backed up, new files added

### `dave-codes push <project-path>`

Copy framework changes from project → dave-codes working tree. Run this when you've improved framework files while working in a project.

1. Read project's `dave-manifest.json`
2. For each file in manifest:
   - Compare project file hash to dave-codes source hash
   - If different: copy project file → dave-codes, overwriting
3. Report what changed (file list with sizes)
4. Do NOT commit, branch, or push — Claude handles that via `/dave:sync`

**Design note:** The CLI only does file operations. Branch creation, commits, and PRs are Claude's job. This keeps the CLI safe, predictable, and testable.

## Framework File List

`.dave-framework-files` at the dave-codes repo root. Checked into git.

```
.claude/agents/code-reviewer.md
.claude/agents/data-pipeline-reviewer.md
.claude/agents/database-expert.md
.claude/agents/dave-*.md
.claude/agents/practical-verifier.md
.claude/agents/security-reviewer.md
.claude/agents/tdd-developer.md
.claude/commands/dave/**
.claude/dave/**
.claude/skills/reflect/**
.claude/skills/review/**
.claude/skills/second-opinion/**
.claude/skills/verify/**
.claude/rules/context-management.md
.claude/package.json
```

This is the single source of truth for "what is framework." Glob patterns are resolved against the dave-codes repo. When you add a new framework agent or skill, add its pattern here.

## Installs Config

`.dave-installs.json` at the dave-codes repo root. **Gitignored.** Machine-local.

```json
{
  "installs": {
    "/home/dave/repos/brainsquad": {
      "installed_at": "2026-02-18T12:00:00Z",
      "last_sync": "2026-02-18T15:30:00Z"
    },
    "/home/dave/repos/langres": {
      "installed_at": "2026-02-15T10:00:00Z",
      "last_sync": "2026-02-18T15:30:00Z"
    }
  }
}
```

## Project Manifest

`<project>/.claude/dave-manifest.json`. **Checked into the project's git** (so collaborators know which files are framework-managed).

```json
{
  "version": "1.0.0",
  "source_repo": "git@github.com:fxd24/dave-codes.git",
  "installed_at": "2026-02-18T12:00:00Z",
  "last_sync": "2026-02-18T15:30:00Z",
  "files": {
    ".claude/agents/dave-architect.md": {
      "sha256": "abc123...",
      "size": 4521
    },
    ".claude/agents/code-reviewer.md": {
      "sha256": "def456...",
      "size": 2103
    }
  }
}
```

The manifest is the definitive separator. If a file is in the manifest, it's framework. If not, it's project-specific.

## Framework vs Project-Specific Files

### Framework files (managed by dave-codes)

| Path | Contents |
|------|----------|
| `.claude/agents/dave-*.md` | 9 Dave framework agents |
| `.claude/agents/code-reviewer.md` | Code reviewer agent |
| `.claude/agents/data-pipeline-reviewer.md` | Pipeline reviewer agent |
| `.claude/agents/database-expert.md` | Database expert agent |
| `.claude/agents/practical-verifier.md` | Practical verifier agent |
| `.claude/agents/security-reviewer.md` | Security reviewer agent |
| `.claude/agents/tdd-developer.md` | TDD developer agent |
| `.claude/commands/dave/` | 13+ slash commands |
| `.claude/dave/` | Framework core (workflows, process, templates, references, rules, bin) |
| `.claude/skills/reflect/` | Reflect skill |
| `.claude/skills/review/` | Review skill |
| `.claude/skills/second-opinion/` | Second opinion skill |
| `.claude/skills/verify/` | Verify skill |
| `.claude/rules/context-management.md` | Context management rules |
| `.claude/package.json` | CommonJS config |

### Project-specific files (never touched by dave-codes)

| Path | Example |
|------|---------|
| `.claude/settings.json` | Project permissions and sandbox config |
| `.claude/settings.local.json` | Local overrides |
| `.claude/agents/<non-framework>.md` | e.g., `nonprofit-profile-builder.md` in brainsquad |
| `.claude/skills/<non-framework>/` | e.g., `dagster/`, `migrations/` in brainsquad |
| `.claude/rules/<non-framework>.md` | e.g., `database.md`, `worktrees.md` in brainsquad |
| `.claude/plans/` | Project plans |
| `.claude/dave-manifest.json` | The manifest itself |
| `.state/` | Project state (milestones, knowledge, config) |
| `CLAUDE.md` | Project-specific instructions |

## The `/dave:sync` Slash Command

A Claude Code command at `.claude/commands/dave/sync.md`:

```
Run `dave-codes status` to check drift across all registered projects.

Based on the output:

1. If a project has framework files that differ from dave-codes:
   - Show which files changed and in which project
   - Ask the user: "Push these changes to dave-codes?"
   - If yes: run `dave-codes push <project-path>`,
     create a branch on dave-codes, commit the changes,
     open a PR using `gh pr create`

2. If dave-codes has changes not yet synced to projects
   (e.g., after merging a PR):
   - Show what changed
   - Run `dave-codes sync` to update all projects
   - Commit in each project repo

3. If everything is in sync:
   - Report "All projects up to date with dave-codes"
```

## Package Structure

```
dave-codes/                         ← repo root
  .claude/                          ← framework files (source of truth)
    agents/                         ← 15 agent definitions
    commands/dave/                  ← slash commands (including sync.md)
    dave/                           ← workflows, process, templates, etc.
    skills/                         ← 4 skills
    rules/                          ← shared rules
    package.json
  src/dave_codes/
    __init__.py                     ← version
    cli.py                          ← typer app, 5 commands
    manifest.py                     ← manifest read/write, SHA256 hashing
    sync.py                         ← file copy, diff, backup logic
    framework_files.py              ← parse .dave-framework-files, glob resolution
  tests/
    test_manifest.py
    test_sync.py
    test_framework_files.py
    test_cli.py
  .dave-framework-files             ← which files are framework (checked in)
  .dave-installs.json               ← where it's installed (gitignored)
  pyproject.toml
  LICENSE
  README.md
  docs/
    DESIGN-dave-codes-cli.md        ← this document
```

**Key:** Framework files stay at the repo root in `.claude/`. No restructuring needed. The CLI source lives alongside them in `src/`. The repo serves double duty: it IS the framework source of truth, AND it contains the sync tool.

## Dependencies

```toml
[project]
dependencies = [
    "typer>=0.15",
]
```

Just typer (which brings rich for formatting). The CLI only works with JSON (manifests) and plain files (no YAML needed).

## Installation

```bash
# From within the dave-codes repo:
uv tool install -e .

# Now available globally:
dave-codes install /home/dave/repos/brainsquad
dave-codes status
```

Editable install means the CLI always uses the latest source from the repo. No publishing step needed for local use. PyPI publishing is a future option if the framework is shared more broadly.

## Workflows

### First-time setup

```bash
cd ~/repos/dave-codes
uv tool install -e .
dave-codes install ~/repos/brainsquad
dave-codes install ~/repos/langres
```

### Daily usage — let Claude handle it

In any project repo:
```
/dave:sync
```
Claude checks status, pushes/syncs as needed, creates PRs.

### After merging a dave-codes PR

```bash
dave-codes sync
# Updates all registered projects
# Then commit in each project
```

### Pushing improvements from a project

```bash
dave-codes push ~/repos/brainsquad
# Copies changed framework files to dave-codes working tree
# Claude (or you) creates branch + PR
```

### Clean removal

```bash
dave-codes uninstall ~/repos/brainsquad
# Removes framework files, deregisters
```

## Migration Plan

### For dave-codes repo
1. Add Python package structure (`pyproject.toml`, `src/dave_codes/`)
2. Create `.dave-framework-files` listing framework file patterns
3. Add `.dave-installs.json` to `.gitignore`
4. Implement CLI commands
5. Add `sync.md` slash command to `.claude/commands/dave/`
6. `uv tool install -e .` for local use

### For existing projects (brainsquad, langres)
1. Run `dave-codes install <project-path>`
2. Review the manifest, verify framework vs project-specific separation is correct
3. Commit the manifest

## What We Dropped (vs Original Design)

| Original | Why dropped |
|----------|-------------|
| PyPI publishing | Not needed — we have 2-3 local repos, not public distribution |
| Git subtree | Biggest complexity source (`--squash` gotchas, history scanning, `.dave/` duplication) |
| `.dave/` directory in projects | Was only needed for subtree; framework files live directly in `.claude/` |
| `framework/` directory in dave-codes | No restructuring needed; `.claude/` IS the framework |
| `--dev` / `--global` flags | One mode: local repo sync. No consumer vs contributor distinction |
| `pyyaml` dependency | Only JSON manifests, no YAML parsing needed in the CLI |
| `tools` subcommand group | Separate concern from sync; `dave-tools.js` replacement can be a future addition |

## Future Additions

- **`dave-codes tools` subcommands** — Replace `dave-tools.js` with Python equivalents for state/knowledge/config management. Independent of the sync feature.
- **PyPI publishing** — If the framework is shared beyond local repos, bundle framework files as package data and publish. The manifest-based approach works the same way.
- **Conflict detection in push** — Currently `push` overwrites. Could warn when both source and project have changed since last sync.
