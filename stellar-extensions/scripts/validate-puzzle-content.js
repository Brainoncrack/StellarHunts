#!/usr/bin/env node
'use strict';

/**
 * StellarHunts puzzle content validator (issue #1008).
 *
 * Validates every puzzle JSON file in a directory against
 * schemas/puzzle-template.schema.json (or an extended schema supplied with
 * --schema), then applies content checks that JSON Schema alone cannot
 * express: duplicate puzzle ids across files, missing test cases, and the
 * shape of each test case entry.
 *
 * The validator has no external dependencies. It implements the subset of
 * JSON Schema draft-07 used by the StellarHunts puzzle templates, so CI does
 * not need an npm install step to run it.
 *
 * Usage:
 *   node stellar-extensions/scripts/validate-puzzle-content.js \
 *     --dir stellar-extensions/frontend/puzzles/advanced-soroban
 *
 * Exit codes:
 *   0  all puzzle files are valid
 *   1  at least one validation issue was found
 *   2  invalid CLI usage or unreadable schema/directory
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_SCHEMA_PATH = path.join(REPO_ROOT, 'schemas', 'puzzle-template.schema.json');
const DEFAULT_PUZZLE_DIR = path.join(REPO_ROOT, 'stellar-extensions', 'frontend', 'puzzles');

const VALID_DIFFICULTIES = ['easy', 'medium', 'hard', 'master'];
const VALID_TYPES = ['text', 'number', 'math', 'multiple_choice', 'logic', 'code', 'image'];
const VALID_TEST_VALIDATION_MODES = ['exact_match', 'numeric_tolerance', 'regex', 'custom'];
const MIN_TEST_CASES = 3;
const MAX_TEST_CASES = 5;

// The shared puzzle template does not model test cases. Puzzle sets that ship
// them declare the field in their own schema; when the shared schema is used,
// `testCases` is still accepted here so authors can validate against the
// canonical template and opt into the documented extension.
const TEMPLATE_EXTENSION_KEYS = new Set(['testCases']);

const USAGE = `Usage: validate-puzzle-content.js [options]

Validates puzzle content files against the StellarHunts puzzle template.

Options:
  -d, --dir <path>       Directory containing puzzle JSON files (recursive).
                         Default: stellar-extensions/frontend/puzzles
  -s, --schema <path>    JSON Schema to validate against.
                         Default: schemas/puzzle-template.schema.json
  -h, --help             Show this help text.

Checks:
  - every value declared by the schema (required fields, enums, patterns,
    lengths, item counts, conditional multiple-choice options)
  - duplicate puzzle ids across all files in the directory
  - missing or malformed test cases (3-5 entries with title, input, and
    expectedOutput)
  - invalid difficulty values

Every issue is reported as <file>:<line>: <field>: <message>.
Exits with status 1 when any issue is found.`;

/* -------------------------------------------------------------------------- */
/* JSON Schema (draft-07 subset) validator                                    */
/* -------------------------------------------------------------------------- */

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return typeof value;
}

function typeMatches(value, expected) {
  const actual = typeOf(value);
  if (expected === 'number') return actual === 'number' || actual === 'integer';
  return actual === expected;
}

function formatPath(base, key) {
  return base ? `${base}.${key}` : key;
}

/**
 * Validates `value` against `schema`, returning `{ path, message }` entries.
 * `allowExtensionKeys` keeps `testCases` valid when the active schema does not
 * declare it.
 */
function validateSchema(value, schema, basePath = '', errors = []) {
  if (!schema || typeof schema !== 'object') return errors;

  if (schema.type !== undefined) {
    const expectedTypes = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!expectedTypes.some((expected) => typeMatches(value, expected))) {
      errors.push({
        path: basePath,
        message: `Expected ${expectedTypes.join(' or ')} but found ${typeOf(value)}`,
      });
      return errors;
    }
  }

  if (schema.const !== undefined && value !== schema.const) {
    errors.push({
      path: basePath,
      message: `Expected the constant value ${JSON.stringify(schema.const)}`,
    });
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push({
      path: basePath,
      message: `Invalid value ${JSON.stringify(value)}. Allowed: ${schema.enum.join(', ')}`,
    });
  }

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push({
        path: basePath,
        message: `Must be at least ${schema.minLength} character(s) long`,
      });
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push({
        path: basePath,
        message: `Must be at most ${schema.maxLength} character(s) long`,
      });
    }
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) {
      errors.push({
        path: basePath,
        message: `Must match pattern ${schema.pattern}`,
      });
    }
  }

  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push({ path: basePath, message: `Must be >= ${schema.minimum}` });
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push({ path: basePath, message: `Must be <= ${schema.maximum}` });
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push({
        path: basePath,
        message: `Must contain at least ${schema.minItems} item(s)`,
      });
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push({
        path: basePath,
        message: `Must contain at most ${schema.maxItems} item(s)`,
      });
    }
    if (schema.items && typeof schema.items === 'object') {
      value.forEach((item, index) => {
        validateSchema(item, schema.items, `${basePath}[${index}]`, errors);
      });
    }
  }

  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const requiredKey of schema.required || []) {
      if (value[requiredKey] === undefined) {
        errors.push({
          path: formatPath(basePath, requiredKey),
          message: `Missing required property "${requiredKey}"`,
        });
      }
    }

    const properties = schema.properties || {};
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (value[key] !== undefined) {
        validateSchema(value[key], propertySchema, formatPath(basePath, key), errors);
      }
    }

    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (properties[key] !== undefined) continue;
        if (!properties.testCases && TEMPLATE_EXTENSION_KEYS.has(key)) continue;
        errors.push({
          path: formatPath(basePath, key),
          message: `Unexpected property "${key}" is not allowed by the schema`,
        });
      }
    }
  }

  for (const subSchema of schema.allOf || []) {
    validateSchema(value, subSchema, basePath, errors);
  }

  if (schema.if !== undefined) {
    const conditionErrors = validateSchema(value, schema.if, basePath, []);
    if (conditionErrors.length === 0 && schema.then !== undefined) {
      validateSchema(value, schema.then, basePath, errors);
    } else if (conditionErrors.length > 0 && schema.else !== undefined) {
      validateSchema(value, schema.else, basePath, errors);
    }
  }

  return errors;
}

/* -------------------------------------------------------------------------- */
/* Content checks                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Supplementary checks for `testCases`. They run in addition to schema
 * validation and are skipped when the schema already reported the same path,
 * so an extended schema does not produce duplicate messages.
 */
function validateTestCases(puzzle, addError) {
  const testCases = puzzle.testCases;

  if (testCases === undefined || testCases === null) {
    addError('testCases', 'Missing required field "testCases" (3-5 test cases are required)');
    return;
  }

  if (!Array.isArray(testCases)) {
    addError('testCases', 'Must be an array of test case objects');
    return;
  }

  if (testCases.length < MIN_TEST_CASES || testCases.length > MAX_TEST_CASES) {
    addError(
      'testCases',
      `Must contain ${MIN_TEST_CASES}-${MAX_TEST_CASES} test cases (found ${testCases.length})`,
    );
  }

  testCases.forEach((testCase, index) => {
    const base = `testCases[${index}]`;
    if (testCase === null || typeof testCase !== 'object' || Array.isArray(testCase)) {
      addError(base, 'Each test case must be an object');
      return;
    }

    if (typeof testCase.title !== 'string' || testCase.title.trim() === '') {
      addError(`${base}.title`, 'Test case "title" is required and must be a non-empty string');
    }
    if (
      testCase.input === null ||
      typeof testCase.input !== 'object' ||
      Array.isArray(testCase.input)
    ) {
      addError(`${base}.input`, 'Test case "input" is required and must be an object');
    }
    if (
      testCase.expectedOutput === null ||
      typeof testCase.expectedOutput !== 'object' ||
      Array.isArray(testCase.expectedOutput)
    ) {
      addError(
        `${base}.expectedOutput`,
        'Test case "expectedOutput" is required and must be an object',
      );
    }
    if (
      testCase.validationMode !== undefined &&
      !VALID_TEST_VALIDATION_MODES.includes(testCase.validationMode)
    ) {
      addError(
        `${base}.validationMode`,
        `Invalid validationMode ${JSON.stringify(testCase.validationMode)}. Allowed: ${VALID_TEST_VALIDATION_MODES.join(', ')}`,
      );
    }
  });
}

/* -------------------------------------------------------------------------- */
/* Line number mapping                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Records the source line of every key, array element, and container while
 * scanning JSON that has already been parsed successfully. The resulting map
 * is keyed by paths such as `id`, `content.prompt`, and
 * `testCases[2].title`. Nested object braces cannot shift later array indexes
 * because the scanner follows the actual structure rather than counting
 * characters.
 */
function buildLocationMap(source) {
  const locations = new Map([['', 1]]);
  let index = 0;
  let line = 1;
  const length = source.length;

  const advance = () => {
    if (source[index] === '\n') line += 1;
    index += 1;
  };

  const skipWhitespace = () => {
    while (index < length && /\s/.test(source[index])) advance();
  };

  const parseString = () => {
    advance(); // opening quote
    while (index < length) {
      const char = source[index];
      if (char === '\\') {
        advance();
        advance();
        continue;
      }
      if (char === '"') {
        advance();
        return;
      }
      advance();
    }
  };

  const parseKey = () => {
    const start = index;
    parseString();
    return JSON.parse(source.slice(start, index));
  };

  const parseValue = (path) => {
    skipWhitespace();
    const char = source[index];

    if (char === '{') {
      advance();
      skipWhitespace();
      if (source[index] === '}') {
        advance();
        return;
      }
      while (index < length) {
        skipWhitespace();
        const keyLine = line;
        const key = parseKey();
        const keyPath = path ? `${path}.${key}` : key;
        locations.set(keyPath, keyLine);
        skipWhitespace();
        if (source[index] === ':') advance();
        parseValue(keyPath);
        skipWhitespace();
        if (source[index] === ',') {
          advance();
          continue;
        }
        if (source[index] === '}') advance();
        return;
      }
      return;
    }

    if (char === '[') {
      advance();
      skipWhitespace();
      if (source[index] === ']') {
        advance();
        return;
      }
      let itemIndex = 0;
      while (index < length) {
        skipWhitespace();
        const itemPath = `${path}[${itemIndex}]`;
        locations.set(itemPath, line);
        parseValue(itemPath);
        itemIndex += 1;
        skipWhitespace();
        if (source[index] === ',') {
          advance();
          continue;
        }
        if (source[index] === ']') advance();
        return;
      }
      return;
    }

    if (char === '"') {
      parseString();
      return;
    }

    while (index < length && !/[,\]}\s]/.test(source[index])) advance();
  };

  parseValue('');
  return locations;
}

/**
 * Locates the source line for a schema error path, falling back to the nearest
 * recorded ancestor (for example `content` when `content.prompt` is missing).
 */
function findLineNumber(source, errorPath) {
  const normalised = String(errorPath ?? '').replace(/^\(root\)$/, '');
  if (normalised === '') return 1;

  const locations = buildLocationMap(source);
  let candidate = normalised;

  while (candidate !== '') {
    if (locations.has(candidate)) return locations.get(candidate);
    if (candidate.includes('.')) {
      candidate = candidate.slice(0, candidate.lastIndexOf('.'));
    } else {
      candidate = candidate.replace(/\[\d+\]$/, '');
    }
  }

  return 1;
}

function offsetToLine(source, offset) {
  if (typeof offset !== 'number' || offset < 0) return 1;
  return source.slice(0, offset).split(/\r?\n/).length;
}

function jsonParseErrorLine(source, error) {
  const positionMatch = /position (\d+)/.exec(error.message);
  if (positionMatch) return offsetToLine(source, Number(positionMatch[1]));
  const lineMatch = /line (\d+)/.exec(error.message);
  if (lineMatch) return Number(lineMatch[1]);
  return 1;
}

/* -------------------------------------------------------------------------- */
/* File discovery & validation                                                */
/* -------------------------------------------------------------------------- */

function collectPuzzleFiles(directory) {
  const files = [];

  const walk = (current) => {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        // Skip schema definition files (e.g. puzzle-template.schema.json);
        // a puzzle whose content is about schemas still gets validated.
        if (/\.schema\.json$/i.test(entry.name)) continue;
        files.push(fullPath);
      }
    }
  };

  walk(directory);
  return files.sort();
}

function validatePuzzleFile(filePath, schema, seenIds, options = {}) {
  const relativePath = options.relativePath || filePath;
  const source = fs.readFileSync(filePath, 'utf8');

  let puzzle;
  try {
    puzzle = JSON.parse(source);
  } catch (error) {
    return [
      {
        file: relativePath,
        line: jsonParseErrorLine(source, error),
        path: '(root)',
        message: `Invalid JSON: ${error.message}`,
      },
    ];
  }

  if (puzzle === null || typeof puzzle !== 'object' || Array.isArray(puzzle)) {
    return [
      {
        file: relativePath,
        line: 1,
        path: '(root)',
        message: 'Puzzle file must contain a JSON object',
      },
    ];
  }

  const errors = validateSchema(puzzle, schema).map((error) => ({
    ...error,
    line: findLineNumber(source, error.path),
  }));

  const addError = (errorPath, message) => {
    if (errors.some((error) => error.path === errorPath)) return;
    errors.push({
      path: errorPath,
      message,
      line: findLineNumber(source, errorPath),
    });
  };

  if (puzzle.difficulty !== undefined && !VALID_DIFFICULTIES.includes(puzzle.difficulty)) {
    addError(
      'difficulty',
      `Invalid difficulty ${JSON.stringify(puzzle.difficulty)}. Allowed: ${VALID_DIFFICULTIES.join(', ')}`,
    );
  }

  if (puzzle.type !== undefined && !VALID_TYPES.includes(puzzle.type)) {
    addError(
      'type',
      `Invalid type ${JSON.stringify(puzzle.type)}. Allowed: ${VALID_TYPES.join(', ')}`,
    );
  }

  validateTestCases(puzzle, addError);

  if (typeof puzzle.id === 'string' && puzzle.id.length > 0) {
    const firstSeen = seenIds.get(puzzle.id);
    if (firstSeen) {
      addError(
        'id',
        `Duplicate puzzle id ${JSON.stringify(puzzle.id)} (already defined in ${firstSeen.relativePath}:${firstSeen.line})`,
      );
    } else {
      seenIds.set(puzzle.id, {
        relativePath,
        line: findLineNumber(source, 'id'),
      });
    }
  }

  return errors.map((error) => ({
    file: relativePath,
    line: error.line,
    path: error.path || '(root)',
    message: error.message,
  }));
}

/* -------------------------------------------------------------------------- */
/* CLI                                                                        */
/* -------------------------------------------------------------------------- */

function parseArgs(argv) {
  const options = {
    dir: DEFAULT_PUZZLE_DIR,
    schema: DEFAULT_SCHEMA_PATH,
    help: false,
  };

  const takeValue = (flag, inlineValue, index) => {
    if (inlineValue !== undefined) return { value: inlineValue, nextIndex: index };
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('-')) {
      throw new Error(`Option ${flag} requires a value`);
    }
    return { value: next, nextIndex: index + 1 };
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--dir' || arg === '-d' || arg.startsWith('--dir=')) {
      const inline = arg.startsWith('--dir=') ? arg.slice('--dir='.length) : undefined;
      const { value, nextIndex } = takeValue('--dir', inline, i);
      options.dir = value;
      i = nextIndex;
    } else if (arg === '--schema' || arg === '-s' || arg.startsWith('--schema=')) {
      const inline = arg.startsWith('--schema=') ? arg.slice('--schema='.length) : undefined;
      const { value, nextIndex } = takeValue('--schema', inline, i);
      options.schema = value;
      i = nextIndex;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function run(argv = process.argv.slice(2), io = { log: console.log, error: console.error }) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    io.error(`Error: ${error.message}\n`);
    io.error(USAGE);
    return 2;
  }

  if (options.help) {
    io.log(USAGE);
    return 0;
  }

  const puzzleDir = path.resolve(process.cwd(), options.dir);
  const schemaPath = path.resolve(process.cwd(), options.schema);

  if (!fs.existsSync(schemaPath)) {
    io.error(`Error: schema not found at ${schemaPath}`);
    return 2;
  }
  if (!fs.existsSync(puzzleDir) || !fs.statSync(puzzleDir).isDirectory()) {
    io.error(`Error: puzzle directory not found at ${puzzleDir}`);
    return 2;
  }

  let schema;
  try {
    schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  } catch (error) {
    io.error(`Error: could not parse schema ${schemaPath}: ${error.message}`);
    return 2;
  }

  const files = collectPuzzleFiles(puzzleDir);
  if (files.length === 0) {
    io.error(`Error: no puzzle JSON files found in ${puzzleDir}`);
    return 1;
  }

  io.log('Puzzle content validation');
  io.log(`  schema:    ${path.relative(process.cwd(), schemaPath) || schemaPath}`);
  io.log(`  directory: ${path.relative(process.cwd(), puzzleDir) || puzzleDir}`);
  io.log('');

  const seenIds = new Map();
  const allErrors = [];

  for (const file of files) {
    const relativePath = path.relative(process.cwd(), file);
    const errors = validatePuzzleFile(file, schema, seenIds, { relativePath });
    if (errors.length === 0) {
      io.log(`✓ ${relativePath}`);
    } else {
      io.log(`✗ ${relativePath}`);
      allErrors.push(...errors);
    }
  }

  if (allErrors.length > 0) {
    io.log('');
    for (const error of allErrors) {
      io.error(`${error.file}:${error.line}: ${error.path}: ${error.message}`);
    }
    io.error('');
    io.error(`${files.length} puzzle file(s) checked, ${allErrors.length} issue(s) found.`);
    return 1;
  }

  io.log('');
  io.log(`All ${files.length} puzzle file(s) passed content validation.`);
  return 0;
}

if (require.main === module) {
  process.exitCode = run();
}

module.exports = {
  validateSchema,
  validateTestCases,
  validatePuzzleFile,
  findLineNumber,
  collectPuzzleFiles,
  parseArgs,
  run,
};
