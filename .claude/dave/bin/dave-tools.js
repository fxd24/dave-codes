#!/usr/bin/env node

/**
 * Dave Tools — CLI utility for the Dave Framework
 *
 * Centralizes: state management, knowledge operations, config detection,
 * scaffolding, and model resolution for the multi-agent development workflow.
 *
 * Usage: node dave-tools.js <command> [args] [--raw]
 *
 * State Operations:
 *   state load                         Load project config + state from .state/
 *   state get [section]                Get STATE.md content or section
 *   state update <field> <value>       Update a STATE.md field
 *   state patch --field val ...        Batch update STATE.md fields
 *
 * Knowledge Operations:
 *   knowledge list [--tier 1|2]        List knowledge entries
 *   knowledge add --tier <1|2>         Add knowledge entry
 *     --id <ID> --text <text>
 *     --source <source>
 *     --severity <level>
 *   knowledge promote <id>             Mark Tier 2 entry as promotion candidate
 *   knowledge search <pattern>         Search knowledge entries
 *
 * Config Operations:
 *   config detect-tools                Detect available tools, output JSON
 *   config get [key]                   Read from config.yaml
 *   config set <key> <value>           Write to config.yaml
 *
 * Scaffolding:
 *   scaffold milestone <slug>          Create milestone directory structure
 *   scaffold phase <milestone> <N>     Create phase directory with templates
 *     <name>
 *   scaffold init                      Create full .state/ directory structure
 *
 * Init:
 *   init                               Return JSON with project state detection
 *
 * Utility:
 *   current-timestamp [format]         Get timestamp (full|date|filename)
 *   generate-slug <text>               Convert text to URL-safe slug
 *   resolve-model <agent-type>         Get model for agent based on config profile
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ─── Model Profile Table ─────────────────────────────────────────────────────

const MODEL_PROFILES = {
  'planner':             { quality: 'opus', balanced: 'opus',   budget: 'sonnet' },
  'executor':            { quality: 'opus', balanced: 'sonnet', budget: 'sonnet' },
  'tdd-developer':       { quality: 'opus', balanced: 'sonnet', budget: 'sonnet' },
  'code-reviewer':       { quality: 'opus', balanced: 'sonnet', budget: 'haiku' },
  'security-reviewer':   { quality: 'opus', balanced: 'sonnet', budget: 'haiku' },
  'review-aggregator':   { quality: 'opus', balanced: 'sonnet', budget: 'sonnet' },
  'verifier':            { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
  'architect':           { quality: 'opus', balanced: 'opus',   budget: 'sonnet' },
  'change-summarizer':   { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
  'researcher':          { quality: 'opus', balanced: 'sonnet', budget: 'haiku' },
  'reflect':             { quality: 'opus', balanced: 'sonnet', budget: 'sonnet' },
  'codebase-mapper':     { quality: 'sonnet', balanced: 'haiku', budget: 'haiku' },
  'practical-verifier':  { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
};

// ─── Simple YAML Parser ──────────────────────────────────────────────────────

/**
 * Minimal YAML parser — handles the subset used by config.yaml:
 * - key: value (scalars)
 * - key: [a, b, c] (inline arrays)
 * - nested objects (indentation-based)
 * - array items with "- value"
 * - quoted strings
 * - booleans (true/false)
 * - numbers
 * - comments (#)
 *
 * Does NOT handle: multi-line strings, anchors/aliases, complex types.
 */
function parseYaml(text) {
  const lines = text.split('\n');
  const root = {};
  // Stack: [{obj, indent}]
  const stack = [{ obj: root, indent: -1, key: null }];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];

    // Strip comments (but not inside quoted strings)
    let line = rawLine;
    const commentIdx = findCommentIndex(line);
    if (commentIdx !== -1) {
      line = line.substring(0, commentIdx);
    }

    // Skip blank lines
    if (line.trim() === '') continue;

    const indentMatch = line.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1].length : 0;
    const trimmed = line.trim();

    // Pop stack back to appropriate nesting level
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    const current = stack[stack.length - 1];

    // Array item: "- value" or "- key: value"
    if (trimmed.startsWith('- ')) {
      const itemContent = trimmed.slice(2).trim();

      // Ensure parent is an array
      if (current.key && !Array.isArray(current.obj[current.key])) {
        // Convert empty object to array if needed
        if (typeof current.obj[current.key] === 'object' && current.obj[current.key] !== null && Object.keys(current.obj[current.key]).length === 0) {
          current.obj[current.key] = [];
        }
      }

      const targetArray = current.key ? current.obj[current.key] : null;

      if (Array.isArray(targetArray)) {
        // Check if this is "- key: value" (object in array)
        const kvMatch = itemContent.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):\s+(.*)/);
        if (kvMatch) {
          const itemObj = {};
          itemObj[kvMatch[1]] = parseYamlValue(kvMatch[2].trim());
          targetArray.push(itemObj);
          stack.push({ obj: itemObj, indent, key: null });
        } else {
          targetArray.push(parseYamlValue(itemContent));
        }
      }
      continue;
    }

    // Key: value pair
    const kvMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)/);
    if (kvMatch) {
      const key = kvMatch[1];
      const rawValue = kvMatch[2].trim();

      if (rawValue === '' || rawValue === '|' || rawValue === '>') {
        // Nested object or block scalar — create empty object placeholder
        current.obj[key] = {};
        stack.push({ obj: current.obj, indent, key });
      } else if (rawValue.startsWith('{') && rawValue.endsWith('}')) {
        // Inline object: { key1: val1, key2: val2 }
        current.obj[key] = parseInlineObject(rawValue);
      } else if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
        // Inline array: [a, b, c]
        current.obj[key] = parseInlineArray(rawValue);
      } else {
        current.obj[key] = parseYamlValue(rawValue);
      }

      // Track current key for potential child array items
      if (typeof current.obj[key] === 'object' && current.obj[key] !== null && !Array.isArray(current.obj[key])) {
        stack.push({ obj: current.obj[key], indent, key: null });
      } else if (rawValue === '' || rawValue === '|' || rawValue === '>') {
        // Already pushed above
      } else {
        // Update current context key for arrays
        const parent = stack[stack.length - 1];
        parent.key = key;
      }
      continue;
    }

    // Continuation of array item with nested keys (inside an array object)
    const nestedKvMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)/);
    if (nestedKvMatch && typeof current.obj === 'object' && !Array.isArray(current.obj)) {
      current.obj[nestedKvMatch[1]] = parseYamlValue(nestedKvMatch[2].trim());
    }
  }

  return root;
}

function findCommentIndex(line) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === '#' && !inSingle && !inDouble) {
      // Must be preceded by whitespace or be at start
      if (i === 0 || /\s/.test(line[i - 1])) return i;
    }
  }
  return -1;
}

function parseYamlValue(val) {
  if (val === '' || val === '~' || val === 'null') return null;
  if (val === 'true') return true;
  if (val === 'false') return false;

  // Quoted strings
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    return val.slice(1, -1);
  }

  // Numbers
  if (/^-?\d+$/.test(val)) return parseInt(val, 10);
  if (/^-?\d+\.\d+$/.test(val)) return parseFloat(val);

  return val;
}

function parseInlineArray(val) {
  // [a, b, c] or ["a", "b"]
  const inner = val.slice(1, -1).trim();
  if (inner === '') return [];
  return inner.split(',').map(s => parseYamlValue(s.trim())).filter(v => v !== null && v !== '');
}

function parseInlineObject(val) {
  // { key1: val1, key2: val2 }
  const inner = val.slice(1, -1).trim();
  if (inner === '') return {};
  const obj = {};
  // Simple split on ", " — handles basic cases
  const pairs = inner.split(',');
  for (const pair of pairs) {
    const colonIdx = pair.indexOf(':');
    if (colonIdx !== -1) {
      const k = pair.substring(0, colonIdx).trim();
      const v = pair.substring(colonIdx + 1).trim();
      obj[k] = parseYamlValue(v);
    }
  }
  return obj;
}

/**
 * Serialize a JS object back to simple YAML.
 */
function serializeYaml(obj, indentLevel) {
  indentLevel = indentLevel || 0;
  const prefix = '  '.repeat(indentLevel);
  const lines = [];

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      lines.push(`${prefix}${key}: null`);
    } else if (typeof value === 'boolean') {
      lines.push(`${prefix}${key}: ${value}`);
    } else if (typeof value === 'number') {
      lines.push(`${prefix}${key}: ${value}`);
    } else if (typeof value === 'string') {
      if (value.includes(':') || value.includes('#') || value.includes('"') || value.startsWith('[') || value.startsWith('{')) {
        lines.push(`${prefix}${key}: "${value.replace(/"/g, '\\"')}"`);
      } else {
        lines.push(`${prefix}${key}: ${value}`);
      }
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${prefix}${key}: []`);
      } else if (value.every(v => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') && value.join(', ').length < 60) {
        // Inline array for simple short values
        const items = value.map(v => typeof v === 'string' && (v.includes(',') || v.includes(':')) ? `"${v}"` : String(v));
        lines.push(`${prefix}${key}: [${items.join(', ')}]`);
      } else {
        lines.push(`${prefix}${key}:`);
        for (const item of value) {
          if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
            // Object in array
            const entries = Object.entries(item);
            if (entries.length > 0) {
              const [firstKey, firstVal] = entries[0];
              lines.push(`${prefix}  - ${firstKey}: ${formatYamlScalar(firstVal)}`);
              for (let j = 1; j < entries.length; j++) {
                lines.push(`${prefix}    ${entries[j][0]}: ${formatYamlScalar(entries[j][1])}`);
              }
            }
          } else {
            lines.push(`${prefix}  - ${formatYamlScalar(item)}`);
          }
        }
      }
    } else if (typeof value === 'object') {
      // Inline object for small objects
      const entries = Object.entries(value);
      if (entries.length <= 3 && entries.every(([, v]) => typeof v !== 'object' || v === null) && JSON.stringify(value).length < 60) {
        const pairs = entries.map(([k, v]) => `${k}: ${formatYamlScalar(v)}`);
        lines.push(`${prefix}${key}: { ${pairs.join(', ')} }`);
      } else {
        lines.push(`${prefix}${key}:`);
        lines.push(serializeYaml(value, indentLevel + 1));
      }
    }
  }

  return lines.join('\n');
}

function formatYamlScalar(val) {
  if (val === null || val === undefined) return 'null';
  if (typeof val === 'boolean') return String(val);
  if (typeof val === 'number') return String(val);
  if (typeof val === 'string') {
    if (val.includes(':') || val.includes('#') || val.includes('"') || val.startsWith('[') || val.startsWith('{')) {
      return `"${val.replace(/"/g, '\\"')}"`;
    }
    return val;
  }
  return String(val);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeReadFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function getStateDir(cwd) {
  return path.join(cwd, '.state');
}

function getProjectDir(cwd) {
  return path.join(cwd, '.state', 'project');
}

function getCodebaseDir(cwd) {
  return path.join(cwd, '.state', 'codebase');
}

function getMilestonesDir(cwd) {
  return path.join(cwd, '.state', 'milestones');
}

function getConfigPath(cwd) {
  return path.join(cwd, '.state', 'project', 'config.yaml');
}

function loadConfig(cwd) {
  const configPath = getConfigPath(cwd);
  const defaults = {
    models: {
      primary: 'claude-opus-4-6',
      profiles: {
        quality: { planner: 'opus', executor: 'opus', verifier: 'sonnet' },
        balanced: { planner: 'opus', executor: 'sonnet', verifier: 'sonnet' },
        budget: { planner: 'sonnet', executor: 'sonnet', verifier: 'haiku' },
      },
    },
    tools: {
      test: 'make test',
      lint: 'make lint',
    },
    verification: {},
    knowledge: {
      tier2_promotion_threshold: 3,
    },
  };

  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    return parseYaml(raw);
  } catch {
    return defaults;
  }
}

function getActiveProfile(config) {
  // Determine the active model profile name
  if (config.models && config.models.active_profile) {
    return config.models.active_profile;
  }
  return 'balanced';
}

function generateSlugInternal(text) {
  if (!text) return null;
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function output(result, raw, rawValue) {
  if (raw && rawValue !== undefined) {
    process.stdout.write(String(rawValue));
  } else {
    process.stdout.write(JSON.stringify(result, null, 2));
  }
  process.exit(0);
}

function error(message) {
  process.stderr.write('Error: ' + message + '\n');
  process.exit(1);
}

function stateExtractField(content, fieldName) {
  const pattern = new RegExp(`\\*\\*${fieldName}:\\*\\*\\s*(.+)`, 'i');
  const match = content.match(pattern);
  return match ? match[1].trim() : null;
}

function stateReplaceField(content, fieldName, newValue) {
  const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(\\*\\*${escaped}:\\*\\*\\s*)(.*)`, 'i');
  if (pattern.test(content)) {
    return content.replace(pattern, `$1${newValue}`);
  }
  return null;
}

// ─── Knowledge System Helpers ────────────────────────────────────────────────

/**
 * Parse KNOWLEDGE.md into structured entries.
 *
 * Format expected:
 *
 * ## Tier 1 (Human-Provided)
 *
 * - [H001] Description text
 *   Source: Human | Added: 2025-01-15 | Severity: Critical
 *
 * ## Tier 2 (Agent-Discovered)
 *
 * - [A001] Description text
 *   Source: Agent (reflect) | Added: 2025-02-01 | Confidence: HIGH
 *   Verified: 3 times | Promoted: No
 *   Promotion candidate: Yes (reason)
 */
function parseKnowledge(content) {
  if (!content) return { tier1: [], tier2: [] };

  const entries = { tier1: [], tier2: [] };
  let currentTier = null;

  const lines = content.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Detect tier sections
    if (/^##\s+Tier\s+1/i.test(line)) {
      currentTier = 'tier1';
      i++;
      continue;
    }
    if (/^##\s+Tier\s+2/i.test(line)) {
      currentTier = 'tier2';
      i++;
      continue;
    }
    // Stop at other ## sections
    if (/^##\s+/.test(line) && currentTier !== null) {
      currentTier = null;
      i++;
      continue;
    }

    if (currentTier === null) {
      i++;
      continue;
    }

    // Parse entry: "- [ID] text"
    const entryMatch = line.match(/^-\s+\[([A-Z]\d+)\]\s+(.+)/);
    if (entryMatch) {
      const entry = {
        id: entryMatch[1],
        text: entryMatch[2].trim(),
        tier: currentTier === 'tier1' ? 1 : 2,
        metadata: {},
      };

      // Read metadata lines (indented continuation lines)
      i++;
      while (i < lines.length) {
        const metaLine = lines[i];
        if (/^\s{2,}/.test(metaLine) && metaLine.trim() !== '') {
          // Parse "Key: Value | Key: Value" pairs
          const parts = metaLine.trim().split('|').map(s => s.trim());
          for (const part of parts) {
            const kvMatch = part.match(/^([^:]+):\s*(.+)/);
            if (kvMatch) {
              const k = kvMatch[1].trim().toLowerCase().replace(/\s+/g, '_');
              entry.metadata[k] = kvMatch[2].trim();
            }
          }
          i++;
        } else {
          break;
        }
      }

      entries[currentTier].push(entry);
      continue;
    }

    i++;
  }

  return entries;
}

/**
 * Serialize knowledge entries back to KNOWLEDGE.md format.
 */
function serializeKnowledge(entries) {
  const lines = ['# Knowledge'];
  lines.push('');

  // Tier 1
  lines.push('## Tier 1 (Human-Provided)');
  lines.push('');
  if (entries.tier1.length === 0) {
    lines.push('_No entries yet._');
  } else {
    for (const entry of entries.tier1) {
      lines.push(`- [${entry.id}] ${entry.text}`);
      const metaParts = [];
      if (entry.metadata.source) metaParts.push(`Source: ${entry.metadata.source}`);
      if (entry.metadata.added) metaParts.push(`Added: ${entry.metadata.added}`);
      if (entry.metadata.severity) metaParts.push(`Severity: ${entry.metadata.severity}`);
      if (metaParts.length > 0) {
        lines.push(`  ${metaParts.join(' | ')}`);
      }
      lines.push('');
    }
  }

  lines.push('');

  // Tier 2
  lines.push('## Tier 2 (Agent-Discovered)');
  lines.push('');
  if (entries.tier2.length === 0) {
    lines.push('_No entries yet._');
  } else {
    for (const entry of entries.tier2) {
      lines.push(`- [${entry.id}] ${entry.text}`);
      const metaParts1 = [];
      if (entry.metadata.source) metaParts1.push(`Source: ${entry.metadata.source}`);
      if (entry.metadata.added) metaParts1.push(`Added: ${entry.metadata.added}`);
      if (entry.metadata.confidence) metaParts1.push(`Confidence: ${entry.metadata.confidence}`);
      if (metaParts1.length > 0) {
        lines.push(`  ${metaParts1.join(' | ')}`);
      }
      const metaParts2 = [];
      if (entry.metadata.verified) metaParts2.push(`Verified: ${entry.metadata.verified}`);
      if (entry.metadata.promoted) metaParts2.push(`Promoted: ${entry.metadata.promoted}`);
      if (metaParts2.length > 0) {
        lines.push(`  ${metaParts2.join(' | ')}`);
      }
      if (entry.metadata.promotion_candidate) {
        lines.push(`  Promotion candidate: ${entry.metadata.promotion_candidate}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n') + '\n';
}

// ─── State Commands ──────────────────────────────────────────────────────────

function cmdStateLoad(cwd, raw) {
  const config = loadConfig(cwd);
  const stateDir = getStateDir(cwd);
  const statePath = path.join(stateDir, 'STATE.md');

  let stateRaw = '';
  try {
    stateRaw = fs.readFileSync(statePath, 'utf-8');
  } catch {}

  const stateExists = stateRaw.length > 0;
  const configExists = fs.existsSync(getConfigPath(cwd));
  const projectDirExists = fs.existsSync(getProjectDir(cwd));
  const codebaseDirExists = fs.existsSync(getCodebaseDir(cwd));
  const milestonesDirExists = fs.existsSync(getMilestonesDir(cwd));

  // Detect knowledge files
  const knowledgePath = path.join(getProjectDir(cwd), 'KNOWLEDGE.md');
  const knowledgeExists = fs.existsSync(knowledgePath);

  const result = {
    config,
    state_raw: stateRaw,
    state_exists: stateExists,
    config_exists: configExists,
    project_dir_exists: projectDirExists,
    codebase_dir_exists: codebaseDirExists,
    milestones_dir_exists: milestonesDirExists,
    knowledge_exists: knowledgeExists,
  };

  if (raw) {
    const lines = [
      `state_exists=${stateExists}`,
      `config_exists=${configExists}`,
      `project_dir_exists=${projectDirExists}`,
      `codebase_dir_exists=${codebaseDirExists}`,
      `milestones_dir_exists=${milestonesDirExists}`,
      `knowledge_exists=${knowledgeExists}`,
    ];
    process.stdout.write(lines.join('\n'));
    process.exit(0);
  }

  output(result);
}

function cmdStateGet(cwd, section, raw) {
  const statePath = path.join(getStateDir(cwd), 'STATE.md');
  try {
    const content = fs.readFileSync(statePath, 'utf-8');

    if (!section) {
      output({ content }, raw, content);
      return;
    }

    // Try **field:** value pattern
    const fieldEscaped = section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const fieldPattern = new RegExp(`\\*\\*${fieldEscaped}:\\*\\*\\s*(.*)`, 'i');
    const fieldMatch = content.match(fieldPattern);
    if (fieldMatch) {
      output({ [section]: fieldMatch[1].trim() }, raw, fieldMatch[1].trim());
      return;
    }

    // Try ## Section
    const sectionPattern = new RegExp(`##\\s*${fieldEscaped}\\s*\n([\\s\\S]*?)(?=\\n##|$)`, 'i');
    const sectionMatch = content.match(sectionPattern);
    if (sectionMatch) {
      output({ [section]: sectionMatch[1].trim() }, raw, sectionMatch[1].trim());
      return;
    }

    output({ error: `Section or field "${section}" not found` }, raw, '');
  } catch {
    error('STATE.md not found');
  }
}

function cmdStateUpdate(cwd, field, value) {
  if (!field || value === undefined) {
    error('field and value required for state update');
  }

  const statePath = path.join(getStateDir(cwd), 'STATE.md');
  try {
    let content = fs.readFileSync(statePath, 'utf-8');
    const fieldEscaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(\\*\\*${fieldEscaped}:\\*\\*\\s*)(.*)`, 'i');
    if (pattern.test(content)) {
      content = content.replace(pattern, `$1${value}`);
      fs.writeFileSync(statePath, content, 'utf-8');
      output({ updated: true });
    } else {
      output({ updated: false, reason: `Field "${field}" not found in STATE.md` });
    }
  } catch {
    output({ updated: false, reason: 'STATE.md not found' });
  }
}

function cmdStatePatch(cwd, patches, raw) {
  const statePath = path.join(getStateDir(cwd), 'STATE.md');
  try {
    let content = fs.readFileSync(statePath, 'utf-8');
    const results = { updated: [], failed: [] };

    for (const [field, value] of Object.entries(patches)) {
      const fieldEscaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`(\\*\\*${fieldEscaped}:\\*\\*\\s*)(.*)`, 'i');

      if (pattern.test(content)) {
        content = content.replace(pattern, `$1${value}`);
        results.updated.push(field);
      } else {
        results.failed.push(field);
      }
    }

    if (results.updated.length > 0) {
      fs.writeFileSync(statePath, content, 'utf-8');
    }

    output(results, raw, results.updated.length > 0 ? 'true' : 'false');
  } catch {
    error('STATE.md not found');
  }
}

// ─── Knowledge Commands ──────────────────────────────────────────────────────

function cmdKnowledgeList(cwd, tier, raw) {
  const knowledgePath = path.join(getProjectDir(cwd), 'KNOWLEDGE.md');
  const content = safeReadFile(knowledgePath);

  if (!content) {
    output({ tier1: [], tier2: [], total: 0 }, raw, '0');
    return;
  }

  const entries = parseKnowledge(content);

  let filtered;
  if (tier === '1') {
    filtered = { tier1: entries.tier1, tier2: [], total: entries.tier1.length };
  } else if (tier === '2') {
    filtered = { tier1: [], tier2: entries.tier2, total: entries.tier2.length };
  } else {
    filtered = {
      tier1: entries.tier1,
      tier2: entries.tier2,
      total: entries.tier1.length + entries.tier2.length,
    };
  }

  output(filtered, raw, String(filtered.total));
}

function cmdKnowledgeAdd(cwd, options, raw) {
  const { tier, id, text, source, severity, confidence } = options;

  if (!tier || !id || !text || !source) {
    error('tier, id, text, and source are required for knowledge add');
  }

  if (tier !== '1' && tier !== '2') {
    error('tier must be 1 or 2');
  }

  const knowledgePath = path.join(getProjectDir(cwd), 'KNOWLEDGE.md');
  const content = safeReadFile(knowledgePath);

  let entries;
  if (content) {
    entries = parseKnowledge(content);
  } else {
    entries = { tier1: [], tier2: [] };
  }

  // Check for duplicate ID
  const allEntries = [...entries.tier1, ...entries.tier2];
  if (allEntries.some(e => e.id === id)) {
    error(`Knowledge entry with ID ${id} already exists`);
  }

  const today = new Date().toISOString().split('T')[0];

  const newEntry = {
    id,
    text,
    tier: parseInt(tier, 10),
    metadata: {
      source,
      added: today,
    },
  };

  if (tier === '1') {
    newEntry.metadata.severity = severity || 'High';
    entries.tier1.push(newEntry);
  } else {
    newEntry.metadata.confidence = confidence || 'MEDIUM';
    newEntry.metadata.verified = '1 times';
    newEntry.metadata.promoted = 'No';
    entries.tier2.push(newEntry);
  }

  // Ensure project directory exists
  ensureDir(getProjectDir(cwd));

  fs.writeFileSync(knowledgePath, serializeKnowledge(entries), 'utf-8');
  output({ added: true, id, tier: parseInt(tier, 10) }, raw, id);
}

function cmdKnowledgePromote(cwd, entryId, raw) {
  if (!entryId) {
    error('entry ID required for knowledge promote');
  }

  const knowledgePath = path.join(getProjectDir(cwd), 'KNOWLEDGE.md');
  const content = safeReadFile(knowledgePath);

  if (!content) {
    error('KNOWLEDGE.md not found');
  }

  const entries = parseKnowledge(content);

  // Find entry in Tier 2
  const entryIdx = entries.tier2.findIndex(e => e.id === entryId);
  if (entryIdx === -1) {
    // Check if it is already Tier 1
    if (entries.tier1.some(e => e.id === entryId)) {
      output({ promoted: false, reason: 'Entry is already Tier 1' }, raw, 'false');
      return;
    }
    error(`Entry ${entryId} not found in Tier 2`);
  }

  // Mark as promotion candidate
  entries.tier2[entryIdx].metadata.promotion_candidate = 'Yes (marked for human review)';

  fs.writeFileSync(knowledgePath, serializeKnowledge(entries), 'utf-8');
  output({ promoted: true, id: entryId, status: 'promotion_candidate' }, raw, 'true');
}

function cmdKnowledgeSearch(cwd, pattern, raw) {
  if (!pattern) {
    error('search pattern required');
  }

  const knowledgePath = path.join(getProjectDir(cwd), 'KNOWLEDGE.md');
  const content = safeReadFile(knowledgePath);

  if (!content) {
    output({ results: [], count: 0 }, raw, '0');
    return;
  }

  const entries = parseKnowledge(content);
  const regex = new RegExp(pattern, 'i');

  const results = [];

  for (const entry of entries.tier1) {
    if (regex.test(entry.id) || regex.test(entry.text) || Object.values(entry.metadata).some(v => regex.test(String(v)))) {
      results.push(entry);
    }
  }
  for (const entry of entries.tier2) {
    if (regex.test(entry.id) || regex.test(entry.text) || Object.values(entry.metadata).some(v => regex.test(String(v)))) {
      results.push(entry);
    }
  }

  output({ results, count: results.length }, raw, String(results.length));
}

// ─── Config Commands ─────────────────────────────────────────────────────────

function cmdConfigDetectTools(cwd, raw) {
  const tools = {};

  // Check Chrome MCP
  try {
    // Chrome MCP is available if the user has claude-in-chrome extension
    // We cannot detect this programmatically, but we can check for the config
    tools.chrome_mcp = { available: false, type: 'browser', capabilities: [] };
  } catch {
    tools.chrome_mcp = { available: false, type: 'browser', capabilities: [] };
  }

  // Check Docker
  try {
    execSync('docker --version', { stdio: 'pipe' });
    tools.docker = { available: true, type: 'container', capabilities: ['build', 'run', 'compose'] };
  } catch {
    tools.docker = { available: false, type: 'container', capabilities: [] };
  }

  // Check database connectivity (make db-test)
  try {
    if (fs.existsSync(path.join(cwd, 'Makefile'))) {
      const makefile = fs.readFileSync(path.join(cwd, 'Makefile'), 'utf-8');
      if (makefile.includes('db-test')) {
        tools.database = { available: true, type: 'query', capabilities: ['select', 'count', 'verify_schema'], test_command: 'make db-test' };
      } else {
        tools.database = { available: false, type: 'query', capabilities: [] };
      }
    } else {
      tools.database = { available: false, type: 'query', capabilities: [] };
    }
  } catch {
    tools.database = { available: false, type: 'query', capabilities: [] };
  }

  // Check bash (always available)
  tools.bash = { available: true, type: 'script', capabilities: ['run_command', 'check_exit_code', 'file_operations'] };

  // Check for test runner
  try {
    if (fs.existsSync(path.join(cwd, 'Makefile'))) {
      const makefile = fs.readFileSync(path.join(cwd, 'Makefile'), 'utf-8');
      tools.test_runner = {
        available: makefile.includes('test:') || makefile.includes('test '),
        command: 'make test',
      };
      tools.linter = {
        available: makefile.includes('lint:') || makefile.includes('lint '),
        command: 'make lint',
      };
    }
  } catch {}

  // Check for git
  try {
    execSync('git --version', { stdio: 'pipe' });
    tools.git = { available: true, type: 'vcs' };
  } catch {
    tools.git = { available: false, type: 'vcs' };
  }

  // Check for gh CLI
  try {
    execSync('gh --version', { stdio: 'pipe' });
    tools.github_cli = { available: true, type: 'github' };
  } catch {
    tools.github_cli = { available: false, type: 'github' };
  }

  // Check for uv (Python runner)
  try {
    execSync('uv --version', { stdio: 'pipe' });
    tools.uv = { available: true, type: 'python_runner' };
  } catch {
    tools.uv = { available: false, type: 'python_runner' };
  }

  output(tools, raw);
}

function cmdConfigGet(cwd, key, raw) {
  const config = loadConfig(cwd);

  if (!key) {
    output(config, raw);
    return;
  }

  // Navigate dot-separated key path
  const keys = key.split('.');
  let current = config;
  for (const k of keys) {
    if (current === undefined || current === null || typeof current !== 'object') {
      output({ error: `Key "${key}" not found` }, raw, '');
      return;
    }
    current = current[k];
  }

  if (current === undefined) {
    output({ error: `Key "${key}" not found` }, raw, '');
  } else {
    output({ key, value: current }, raw, typeof current === 'object' ? JSON.stringify(current) : String(current));
  }
}

function cmdConfigSet(cwd, key, value, raw) {
  if (!key) {
    error('Usage: config set <key.path> <value>');
  }

  const configPath = getConfigPath(cwd);

  // Parse value (handle booleans and numbers)
  let parsedValue = value;
  if (value === 'true') parsedValue = true;
  else if (value === 'false') parsedValue = false;
  else if (value === 'null') parsedValue = null;
  else if (!isNaN(value) && value !== '') parsedValue = Number(value);

  // Load existing config or start fresh
  let config = {};
  try {
    if (fs.existsSync(configPath)) {
      const rawContent = fs.readFileSync(configPath, 'utf-8');
      config = parseYaml(rawContent);
    }
  } catch {
    config = {};
  }

  // Set nested value using dot notation
  const keys = key.split('.');
  let current = config;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (current[k] === undefined || typeof current[k] !== 'object') {
      current[k] = {};
    }
    current = current[k];
  }
  current[keys[keys.length - 1]] = parsedValue;

  // Write back
  ensureDir(path.dirname(configPath));
  fs.writeFileSync(configPath, serializeYaml(config) + '\n', 'utf-8');

  const result = { updated: true, key, value: parsedValue };
  output(result, raw, `${key}=${parsedValue}`);
}

// ─── Scaffolding Commands ────────────────────────────────────────────────────

function cmdScaffoldInit(cwd, raw) {
  const stateDir = getStateDir(cwd);
  const created = [];

  // .state/ root
  ensureDir(stateDir);

  // .state/project/
  const projectDir = getProjectDir(cwd);
  ensureDir(projectDir);

  // Create template files in project/
  const projectFiles = {
    'PROJECT.md': `# Project\n\n## What\n\n_Describe what this project is._\n\n## Constraints\n\n_Key constraints and non-negotiables._\n\n## Value Proposition\n\n_Why this project matters._\n`,
    'PATTERNS.md': `# Patterns\n\n_Architecture patterns, conventions, and design decisions._\n`,
    'KNOWLEDGE.md': serializeKnowledge({ tier1: [], tier2: [] }),
    'STACK.md': `# Tech Stack\n\n_Technologies, libraries, versions, and rationale._\n`,
    'CONCERNS.md': `# Concerns\n\n_Known issues, tech debt, things to watch for._\n`,
  };

  for (const [filename, content] of Object.entries(projectFiles)) {
    const filePath = path.join(projectDir, filename);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, content, 'utf-8');
      created.push(path.relative(cwd, filePath));
    }
  }

  // Create default config.yaml
  const configPath = getConfigPath(cwd);
  if (!fs.existsSync(configPath)) {
    const defaultConfig = {
      models: {
        primary: 'claude-opus-4-6',
        active_profile: 'balanced',
        profiles: {
          quality: { planner: 'opus', executor: 'opus', verifier: 'sonnet' },
          balanced: { planner: 'opus', executor: 'sonnet', verifier: 'sonnet' },
          budget: { planner: 'sonnet', executor: 'sonnet', verifier: 'haiku' },
        },
      },
      tools: {
        test: 'make test',
        lint: 'make lint',
      },
      verification: {},
      knowledge: {
        tier2_promotion_threshold: 3,
      },
    };
    fs.writeFileSync(configPath, serializeYaml(defaultConfig) + '\n', 'utf-8');
    created.push(path.relative(cwd, configPath));
  }

  // .state/codebase/
  const codebaseDir = getCodebaseDir(cwd);
  ensureDir(codebaseDir);

  const codebaseFiles = {
    'STRUCTURE.md': `# Codebase Structure\n\n_Where code lives, directory layout, naming patterns._\n`,
    'ARCHITECTURE.md': `# Architecture\n\n_Layers, data flow, entry points, key abstractions._\n`,
    'CONVENTIONS.md': `# Conventions\n\n_Code style, imports, type hints, testing patterns._\n`,
  };

  for (const [filename, content] of Object.entries(codebaseFiles)) {
    const filePath = path.join(codebaseDir, filename);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, content, 'utf-8');
      created.push(path.relative(cwd, filePath));
    }
  }

  // .state/milestones/
  ensureDir(getMilestonesDir(cwd));

  // .state/debug/
  const debugDir = path.join(stateDir, 'debug');
  ensureDir(debugDir);
  ensureDir(path.join(debugDir, 'resolved'));

  // .state/STATE.md
  const stateFilePath = path.join(stateDir, 'STATE.md');
  if (!fs.existsSync(stateFilePath)) {
    const today = new Date().toISOString().split('T')[0];
    const stateContent = `# Project State

**Status:** Not started
**Current Milestone:** None
**Current Phase:** None
**Last Activity:** ${today}

## Session Continuity

**Last session:** ${new Date().toISOString()}
**Stopped At:** Fresh project — no work done yet
**Resume File:** None

## Blockers

None

## Decisions

_No decisions yet._

## Performance Metrics

| Execution | Duration | Tasks | Files |
|-----------|----------|-------|-------|
`;
    fs.writeFileSync(stateFilePath, stateContent, 'utf-8');
    created.push(path.relative(cwd, stateFilePath));
  }

  output({ created: true, files: created, total: created.length }, raw, created.join('\n'));
}

function cmdScaffoldMilestone(cwd, slug, raw) {
  if (!slug) {
    error('milestone slug required');
  }

  const milestoneDir = path.join(getMilestonesDir(cwd), slug);

  if (fs.existsSync(milestoneDir)) {
    output({ created: false, reason: 'already_exists', path: path.relative(cwd, milestoneDir) }, raw, 'exists');
    return;
  }

  ensureDir(milestoneDir);
  ensureDir(path.join(milestoneDir, 'phases'));

  const created = [];

  // Create template files
  const milestoneFiles = {
    'ROADMAP.md': `# Milestone: ${slug}\n\n## Phases\n\n_Phases will be added as work is planned._\n`,
    'RESEARCH.md': `# Milestone Research: ${slug}\n\n_Cross-phase research findings will be aggregated here._\n`,
    'KNOWLEDGE.md': `# Milestone Knowledge: ${slug}\n\n_Decisions and learnings distilled at milestone end._\n`,
  };

  for (const [filename, content] of Object.entries(milestoneFiles)) {
    const filePath = path.join(milestoneDir, filename);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, content, 'utf-8');
      created.push(path.relative(cwd, filePath));
    }
  }

  output({
    created: true,
    directory: path.relative(cwd, milestoneDir),
    files: created,
  }, raw, path.relative(cwd, milestoneDir));
}

function cmdScaffoldPhase(cwd, milestone, phaseNumber, name, raw) {
  if (!milestone || !phaseNumber || !name) {
    error('milestone, phase number, and name are required');
  }

  const milestoneDir = path.join(getMilestonesDir(cwd), milestone);
  if (!fs.existsSync(milestoneDir)) {
    error(`Milestone "${milestone}" not found. Run "scaffold milestone ${milestone}" first.`);
  }

  const padded = String(phaseNumber).padStart(2, '0');
  const phaseDir = path.join(milestoneDir, 'phases', padded);

  if (fs.existsSync(phaseDir)) {
    output({ created: false, reason: 'already_exists', path: path.relative(cwd, phaseDir) }, raw, 'exists');
    return;
  }

  ensureDir(phaseDir);
  const created = [];

  // Create phase template files
  const phaseFiles = {
    'DISCUSSION.md': `# Phase ${phaseNumber}: ${name} -- Discussion\n\n## Scope\n\n### In Scope\n\n_What this phase covers._\n\n### Out of Scope\n\n_What is explicitly excluded._\n\n### Deferred\n\n_What is postponed to later phases._\n\n## Architectural Decisions\n\n_Key decisions made during discussion._\n\n## Success Criteria\n\n_How we know this phase is done._\n\n## Research Topics\n\n_Topics that need deep research in Phase 2._\n\n## Open Questions\n\n_Items requiring human input._\n`,
    'KNOWLEDGE.md': `# Phase ${phaseNumber}: ${name} -- Knowledge\n\n_Decisions, mistakes, and learnings from this phase._\n`,
  };

  for (const [filename, content] of Object.entries(phaseFiles)) {
    const filePath = path.join(phaseDir, filename);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, content, 'utf-8');
      created.push(path.relative(cwd, filePath));
    }
  }

  output({
    created: true,
    directory: path.relative(cwd, phaseDir),
    milestone,
    phase_number: phaseNumber,
    phase_name: name,
    files: created,
  }, raw, path.relative(cwd, phaseDir));
}

// ─── Init Command ────────────────────────────────────────────────────────────

function cmdInit(cwd, raw) {
  const stateDir = getStateDir(cwd);

  const hasState = fs.existsSync(path.join(stateDir, 'STATE.md'));
  const hasConfig = fs.existsSync(getConfigPath(cwd));
  const hasKnowledge = fs.existsSync(path.join(getProjectDir(cwd), 'KNOWLEDGE.md'));
  const hasProjectDir = fs.existsSync(getProjectDir(cwd));
  const hasCodebaseDir = fs.existsSync(getCodebaseDir(cwd));
  const hasMilestonesDir = fs.existsSync(getMilestonesDir(cwd));

  // List milestones
  let milestones = [];
  if (hasMilestonesDir) {
    try {
      milestones = fs.readdirSync(getMilestonesDir(cwd), { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name);
    } catch {}
  }

  // Read state fields if state exists
  let stateFields = {};
  if (hasState) {
    try {
      const content = fs.readFileSync(path.join(stateDir, 'STATE.md'), 'utf-8');
      stateFields = {
        status: stateExtractField(content, 'Status'),
        current_milestone: stateExtractField(content, 'Current Milestone'),
        current_phase: stateExtractField(content, 'Current Phase'),
        last_activity: stateExtractField(content, 'Last Activity'),
      };
    } catch {}
  }

  // Detect available tools (lightweight check)
  const availableTools = [];
  try { execSync('docker --version', { stdio: 'pipe' }); availableTools.push('docker'); } catch {}
  try { execSync('git --version', { stdio: 'pipe' }); availableTools.push('git'); } catch {}
  try { execSync('gh --version', { stdio: 'pipe' }); availableTools.push('github_cli'); } catch {}
  try { execSync('uv --version', { stdio: 'pipe' }); availableTools.push('uv'); } catch {}

  // Check .agent/ directory
  const hasAgentDir = fs.existsSync(path.join(cwd, '.agent'));

  const result = {
    has_state: hasState,
    has_config: hasConfig,
    has_knowledge: hasKnowledge,
    has_project_dir: hasProjectDir,
    has_codebase_dir: hasCodebaseDir,
    has_milestones_dir: hasMilestonesDir,
    has_agent_dir: hasAgentDir,
    milestones,
    state: stateFields,
    available_tools: availableTools,
    initialized: hasState && hasConfig && hasProjectDir,
  };

  output(result, raw);
}

// ─── Utility Commands ────────────────────────────────────────────────────────

function cmdGenerateSlug(text, raw) {
  if (!text) {
    error('text required for slug generation');
  }

  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  output({ slug }, raw, slug);
}

function cmdCurrentTimestamp(format, raw) {
  const now = new Date();
  let result;

  switch (format) {
    case 'date':
      result = now.toISOString().split('T')[0];
      break;
    case 'filename':
      result = now.toISOString().replace(/:/g, '-').replace(/\..+/, '');
      break;
    case 'full':
    default:
      result = now.toISOString();
      break;
  }

  output({ timestamp: result }, raw, result);
}

function cmdResolveModel(cwd, agentType, raw) {
  if (!agentType) {
    error('agent-type required');
  }

  const config = loadConfig(cwd);
  const profileName = getActiveProfile(config);

  // First check if the config has explicit profile mappings
  let model = null;
  if (config.models && config.models.profiles && config.models.profiles[profileName]) {
    const profile = config.models.profiles[profileName];
    // Map agent type to profile role
    const roleMap = {
      'planner': 'planner',
      'architect': 'planner',
      'executor': 'executor',
      'tdd-developer': 'executor',
      'researcher': 'executor',
      'code-reviewer': 'verifier',
      'security-reviewer': 'verifier',
      'review-aggregator': 'verifier',
      'verifier': 'verifier',
      'practical-verifier': 'verifier',
      'reflect': 'executor',
      'codebase-mapper': 'verifier',
      'change-summarizer': 'verifier',
    };
    const role = roleMap[agentType] || 'executor';
    model = profile[role] || null;
  }

  // Fallback to built-in profiles
  if (!model) {
    const agentModels = MODEL_PROFILES[agentType];
    if (agentModels) {
      model = agentModels[profileName] || agentModels['balanced'] || 'sonnet';
    } else {
      model = 'sonnet';
    }
  }

  output({ model, profile: profileName, agent_type: agentType }, raw, model);
}

// ─── CLI Router ───────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const rawIndex = args.indexOf('--raw');
  const raw = rawIndex !== -1;
  if (rawIndex !== -1) args.splice(rawIndex, 1);

  const command = args[0];
  const cwd = process.cwd();

  if (!command) {
    error(
      'Usage: dave-tools <command> [args] [--raw]\n' +
      'Commands: state, knowledge, config, scaffold, init, current-timestamp, generate-slug, resolve-model'
    );
  }

  switch (command) {
    // ── State ────────────────────────────────────────────────────
    case 'state': {
      const subcommand = args[1];
      if (subcommand === 'load') {
        cmdStateLoad(cwd, raw);
      } else if (subcommand === 'get') {
        cmdStateGet(cwd, args[2], raw);
      } else if (subcommand === 'update') {
        cmdStateUpdate(cwd, args[2], args.slice(3).join(' '));
      } else if (subcommand === 'patch') {
        const patches = {};
        for (let i = 2; i < args.length; i += 2) {
          const key = args[i].replace(/^--/, '');
          const value = args[i + 1];
          if (key && value !== undefined) {
            patches[key] = value;
          }
        }
        cmdStatePatch(cwd, patches, raw);
      } else {
        // Default to load if no subcommand
        cmdStateLoad(cwd, raw);
      }
      break;
    }

    // ── Knowledge ────────────────────────────────────────────────
    case 'knowledge': {
      const subcommand = args[1];
      if (subcommand === 'list') {
        const tierIdx = args.indexOf('--tier');
        const tier = tierIdx !== -1 ? args[tierIdx + 1] : null;
        cmdKnowledgeList(cwd, tier, raw);
      } else if (subcommand === 'add') {
        const tierIdx = args.indexOf('--tier');
        const idIdx = args.indexOf('--id');
        const textIdx = args.indexOf('--text');
        const sourceIdx = args.indexOf('--source');
        const severityIdx = args.indexOf('--severity');
        const confidenceIdx = args.indexOf('--confidence');
        cmdKnowledgeAdd(cwd, {
          tier: tierIdx !== -1 ? args[tierIdx + 1] : null,
          id: idIdx !== -1 ? args[idIdx + 1] : null,
          text: textIdx !== -1 ? args[textIdx + 1] : null,
          source: sourceIdx !== -1 ? args[sourceIdx + 1] : null,
          severity: severityIdx !== -1 ? args[severityIdx + 1] : null,
          confidence: confidenceIdx !== -1 ? args[confidenceIdx + 1] : null,
        }, raw);
      } else if (subcommand === 'promote') {
        cmdKnowledgePromote(cwd, args[2], raw);
      } else if (subcommand === 'search') {
        cmdKnowledgeSearch(cwd, args.slice(2).join(' '), raw);
      } else {
        error('Unknown knowledge subcommand. Available: list, add, promote, search');
      }
      break;
    }

    // ── Config ───────────────────────────────────────────────────
    case 'config': {
      const subcommand = args[1];
      if (subcommand === 'detect-tools') {
        cmdConfigDetectTools(cwd, raw);
      } else if (subcommand === 'get') {
        cmdConfigGet(cwd, args[2], raw);
      } else if (subcommand === 'set') {
        cmdConfigSet(cwd, args[2], args.slice(3).join(' '), raw);
      } else {
        error('Unknown config subcommand. Available: detect-tools, get, set');
      }
      break;
    }

    // ── Scaffold ─────────────────────────────────────────────────
    case 'scaffold': {
      const subcommand = args[1];
      if (subcommand === 'init') {
        cmdScaffoldInit(cwd, raw);
      } else if (subcommand === 'milestone') {
        cmdScaffoldMilestone(cwd, args[2], raw);
      } else if (subcommand === 'phase') {
        cmdScaffoldPhase(cwd, args[2], args[3], args.slice(4).join(' '), raw);
      } else {
        error('Unknown scaffold subcommand. Available: init, milestone, phase');
      }
      break;
    }

    // ── Init ─────────────────────────────────────────────────────
    case 'init': {
      cmdInit(cwd, raw);
      break;
    }

    // ── Utility ──────────────────────────────────────────────────
    case 'current-timestamp': {
      cmdCurrentTimestamp(args[1] || 'full', raw);
      break;
    }

    case 'generate-slug': {
      cmdGenerateSlug(args.slice(1).join(' '), raw);
      break;
    }

    case 'resolve-model': {
      cmdResolveModel(cwd, args[1], raw);
      break;
    }

    default:
      error(`Unknown command: ${command}\nAvailable: state, knowledge, config, scaffold, init, current-timestamp, generate-slug, resolve-model`);
  }
}

main();
