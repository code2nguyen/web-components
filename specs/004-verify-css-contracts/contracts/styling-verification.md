# Styling Verification Interfaces

These are the planned developer-facing interfaces for the feature. Commands and report fields become available during implementation; they are not present in the repository yet. Existing component CSS custom properties remain the consumer API, except for explicitly documented name corrections.

## 1. Audit command

| Command                                                                   | Behavior                                                                                                                                                                                                          |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check:style-contracts`                                           | Run the source, manifest, consumption, defaults, inspector-mapping, and verification-case coverage audit; print concise sorted diagnostics. This is a static readiness result, not final observable verification. |
| `npm run verify:style-contracts`                                          | Run the static audit, full Chromium matrix, representative Firefox/WebKit matrix, and representative panel suite; reconcile their evidence into the final per-property ledger.                                    |
| `npm run verify:style-contracts -- --format=json --output=<path>`         | Run the complete gate and write the deterministic final report to `<path>`.                                                                                                                                       |
| `npm run test:style-contracts -- --project=chromium`                      | Execute the full observable property matrix.                                                                                                                                                                      |
| `npm run test:style-contracts -- --project=firefox` or `--project=webkit` | Execute the representative cross-browser matrix.                                                                                                                                                                  |

- Static-command exit `0`: source, manifest, consumption, mapping, and case coverage are complete; observable verification is still pending.
- Full-command exit `0`: every discovered property is verified or has a valid approved exception, and no stale contract or mapping failure exists.
- Exit `1`: at least one contract, coverage, or observable verification failure.
- Exit `2`: the audit could not run because an input, fixture, manifest, or tool dependency is missing or invalid.
- Human diagnostics identify `tag`, exact property, category, source location, expected target/state, observed result, and remediation. A name mismatch includes a nearest-name suggestion when a credible one exists.
- The JSON report is UTF-8, sorted deterministically, and contains no timestamps that make unchanged runs differ; execution duration can be printed separately for humans.

## 2. Audit report shape

The exact JSON schema will be versioned with the implementation. The final report, produced by `verify:style-contracts`, has these required logical fields:

```json
{
  "schemaVersion": 1,
  "summary": {
    "packages": 0,
    "tags": 0,
    "properties": 0,
    "verified": 0,
    "failed": 0,
    "approvedExceptions": 0
  },
  "properties": [
    {
      "tag": "c2-example",
      "name": "--c2-example__container--border-left",
      "ownerPackage": "@c2n/example",
      "type": "border",
      "default": "1px solid #000000",
      "state": "base",
      "target": "container border-left",
      "consumptionMode": "compiled-css",
      "controlFamily": "border",
      "status": "verified",
      "evidence": ["example-border-left-base"]
    }
  ],
  "failures": [],
  "browserCoverage": {
    "chromium": "complete",
    "firefox": "representative",
    "webkit": "representative"
  }
}
```

The example values are illustrative, not a new component API. Each `properties` entry is unique by `(tag, name)` and has exactly one of `verified`, `failed`, or `approved-exception`. Failure entries must carry the category and evidence fields described in [data-model.md](../data-model.md). A report with a missing property status is invalid and fails the gate.

## 3. Verification-case registry

The registry is a reviewed test input. Ordinary compiled-CSS cases may be derived automatically; explicit entries cover cases that cannot be inferred safely. A case declares:

| Field               | Required meaning                                                                                                                                            |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`, `tag`, `name` | Stable case identity and exact public property.                                                                                                             |
| `context`           | Fixture/content/data/dimensions and any related element needed to render the target.                                                                        |
| `state`             | Base or a named activated state such as hover, focus, selected, disabled, open, loading, or error.                                                          |
| `value`             | Valid contrasting property value; validated against the declared type and baseline.                                                                         |
| `controlValue`      | Optional reviewed second value when safe type-based inference cannot provide one; it must be distinct and valid for the observed syntax and published type. |
| `target`            | Rendered region, pseudo-element, slotted element, delegated child, geometry, or programmatic output.                                                        |
| `assertion`         | Target CSS declaration or output invariant that must change as documented.                                                                                  |
| `browsers`          | Chromium for exhaustive cases; Firefox/WebKit where selected for representative coverage.                                                                   |
| `sharedStylingPath` | Optional generated-family key; valid only after per-tag contract checks prove identical styling.                                                            |

A case cannot pass by asserting only that `getComputedStyle(host).getPropertyValue(name)` equals the assigned value. Each `(tag, property, applicable state)` must resolve to a valid case, shared-family evidence, or approved exception. Registry entries for nonexistent or renamed properties fail validation rather than being ignored.

## 4. Inspector mapping contract

The descriptor builder takes normalized manifest entries for one host tag and returns rows with `controlFamily`, ordered `names`, `writeTargets`, and display group. It must be a pure mapping so the audit can check every property without rendering the UI.

- Every publishable tag must resolve from the documentation site's manifest registry so its public properties are available to the panel.
- Each public property appears in exactly one row and writes its exact public name.
- A composed child's variable keeps its owning tag and identifies the actual host that receives the write; `allCssProperties` alone does not transfer ownership.
- Side/corner composite rows contain either one shorthand name or exactly four distinct longhand names in documented order. Mixed shorthand plus longhands become separate unambiguous rows or are rejected.
- Unknown types use an explicit valid text control; they do not silently disappear.
- Representative browser tests exercise each distinct descriptor/control family and the common change, reset, save, copy, and export flows.

## 5. Exception and migration records

An approved exception record contains `tag`, `name`, `surfaceKind` (`browser-owned` or `third-party`), `limitation`, `userImpact`, `supportedAlternative`, `technicalReason`, `reviewedBy`, `reviewedOn`, and `reassessOn`. Ordinary component-owned DOM/CSS surfaces are rejected. Exception review does not waive source/manifest consistency.

A misspelled-name correction record contains `tag`, `oldName`, `newName`, `release`, and `migrationInstructions`. The old name is removed from the published contract and implementation. Migration guidance must be available beside the affected component's documentation or release notes and referenced by the audit remediation output.

## 6. CI contract

The pull-request workflow builds packages and checks generated manifests, then runs `verify:style-contracts` to execute the complete static audit, full Chromium matrix, representative Firefox/WebKit matrix, and representative panel suite. Any nonzero audit or test exit blocks the workflow. A new publishable package, generated tag, public property, or verification case enters discovery automatically; the workflow must not rely solely on changed-package selection for this gate.
