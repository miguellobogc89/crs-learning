> Paused: the current upload now stops at the isolated document extractor. This describes the downstream structure module retained for later validation.

# Business structure discovery

A closed, read-only module downstream of intake classification v2. The upload modal runs classification and then structure discovery automatically, displaying one final JSON. It has a single processing action, with no rerun, catalogue-exclusion, recovery, download or phase-switch controls. Knowledge-only batches finish with classification. Internal checkpoints remain separate.

## Inputs

- The saved classification of the entire authorized batch, never independent per-file discovery.
- Only Engine and hybrid units. Pure Knowledge units never reach the model. A separate hybrid-boundary pass selects exact structured source line ranges; procedures are excluded before discovery. Missing structured content is reported explicitly.
- The full global `engine_catalog_types` catalogue with the latest published version, active fields, descriptions and active compatible catalogue relations. No catalogue truncation, workspace-local definitions, existing business records or cross-workspace data reads.

## Output

One JSON with global table definitions and relationships, source-backed fields, reuse/create/extend proposals, source coverage and warnings. Type and relation key references must match supplied catalogue definitions. Existing field types cannot be silently changed. Existing published definitions are never mutated. New fields require a later reviewed version/extension, outside this module.

Each table/field/relation requires exact source evidence. Documentary tables do not automatically map one-to-one to entities. The prompt considers stable identity, roles, event/detail structures, associative entities, historical attributes and recursive composition without a fixed business-sector schema. Uncertainty remains explicit. The validator guarantees shape, references, evidence and source-level coverage; semantic completeness still requires document tests.

No records are extracted, and no table, field, catalogue version, relation or business record is created. Future record scope is `workspace`; definition scope is `global`.

## Execution

`GET/POST /api/knowledge/intake/:id/structures`, owner and active-workspace write permission required. POST returns 202, processes with Next `after` and uses an atomic JSON checkpoint claim. A six-minute lease permits recovery after an interrupted request. The independent `structureDiscovery` checkpoint stores the source/cataloque snapshot and result in staging. Errors retain classification and successful preparation; retry does not rerun intake, hybrid selection or catalogue retrieval. Completed results are reused rather than generating another model call. Reopen the batch to retrieve status/result after closing the modal. Oversized input fails explicitly rather than truncating source or catalogue.

## Architecture boundary

The repository still contains legacy workspace-local Engine definitions and records with composite workspace/type foreign keys. This module deliberately does not call that persistence path or attempt a database migration. It uses the shared catalogue as its only schema authority. Wiring global definitions to future record insertion is a later module, not implemented here.

## Checks

`node --test tests/knowledge/intake-structures.test.mjs tests/knowledge/intake-contract.test.mjs tests/knowledge/intake-process.test.mjs`

TypeScript and targeted ESLint. Live discovery requires configured database, Blob and OpenAI credentials; automated tests mock model/catalogue responses and do not establish real-document semantic quality.

## Revision 2: controlled catalogue exclusion and unresolved decisions

The test panel accepts catalogue keys to hide (for example `invoice_line`) and reruns discovery on the saved batch. POST options are `{ "excludeCatalogKeys": ["invoice_line"], "rerun": true }`. The view hides both the type and all incident catalogue relationships, so the model cannot infer a hidden standard from those relationships. The stored/global catalogue is never changed. The result declares its exclusions under `test` and still cannot execute schema writes. Clear exclusions to rerun normally. Completed results from revision 1 are marked pending, preserving sources and catalogue snapshot for the new analysis.

The generic prompt now requires proposing source-backed missing attributes rather than omitting them because the catalogue lacks a field. It separates uncertain values from uncertain meaning/ownership. The latter belongs in a validated, evidence-backed `pending` array with concept, candidateTables, reason and evidence, rather than an arbitrarily placed extension accompanied by a warning. This is semantic guidance plus validation of pending shape/evidence; a real model/document run is needed to assess reasoning quality.

## Revision 3: source-line evidence

Discovery receives numbered lines rather than an unnumbered text blob. The model emits only evidence references `{documentId,startLine,endLine}`. The server verifies integer/inclusive bounds and exact source IDs, then slices the original text to construct quotes for the existing strict validator. It preserves line breaks, hyphenation and CRLF; no fuzzy match, spelling repair or paraphrase is accepted. The final output includes references and literal quotes. This prevents a model-transcribed quote from causing a literal-substring failure, while semantic support still requires review. Completed older checkpoints are invalidated for discovery only; saved extraction, identification and catalogue preparation remain reusable. Retrying also preserves any catalogue exclusions used in the failed test.

## Current upload UX

The controlled test is a fresh upload, including one ordinary PDF. `advanceIntake` advances saved preparation/classification then starts structure discovery without an extra user action. The modal displays progress, the final JSON, or the actual error. It never automatically retries failures. The earlier catalogue-exclusion/rerun options remain internal API capabilities, not part of this user flow. Workflow tests explicitly start with a fresh batch instead of assuming that a modal survives a pull/reload.
