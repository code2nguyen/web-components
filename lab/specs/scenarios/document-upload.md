---
id: document-upload
title: Uploading identity documents to open an account
size: scenario
focus: [c2-document-checklist, c2-upload, c2-image-uploader, c2-status-panel]
directions: [default]
---

## Purpose

The "verify your identity" step of a bank or fintech onboarding, as at Wise, Revolut or a mortgage portal. The
applicant uploads the documents asked of them, sees each one's progress and status, fixes what is refused, and submits
when everything is in. It exercises file choice, drop, type and size limits, progress, server refusal and retry.

## Screens

One page.

- **Header:** "Verify your identity" and "3 of 4 documents needed" style progress.
- **Checklist:** one row per required document: its name, what is accepted, its status (Needed, Uploading 45%,
  Checking, Accepted, Refused with the reason) and its own place to drop or choose a file; a refused or wrong file can
  be replaced, an uploaded one removed while not yet accepted.
- **Submit:** "Submit for review", disabled until every required document is accepted; then a confirmation.

## Data

| Document                | Required | Accepts       | Max size | Notes                              |
| ----------------------- | -------- | ------------- | -------- | ---------------------------------- |
| Passport (photo page)   | yes      | JPG, PNG      | 10 MB    |                                    |
| Proof of address        | yes      | PDF, JPG, PNG | 5 MB     | Dated within the last 3 months     |
| Selfie holding passport | yes      | JPG, PNG      | 10 MB    |                                    |
| Tax residency form      | no       | PDF           | 5 MB     | Only if you pay tax outside France |

**The server** is simulated: an upload reports progress from 0 to 100% over 1.5 seconds, then "Checking" for 1 second,
then a verdict. A file whose name contains `blurry` is refused with "The photo is blurry. Take it again in good light";
a file whose name contains `old` is refused with "This document is older than 3 months". Every other file is accepted.
A file whose name contains `flaky` fails at 60% the first time with "Upload interrupted" and succeeds when retried.

The lab test files (any small JPG or PDF renamed): `passport.jpg`, `passport-blurry.jpg`, `bill.pdf`, `bill-old.pdf`,
`selfie-flaky.jpg`, `notes.txt`, `scan-12mb.pdf` (larger than 5 MB).

## Requirements

- R1 [input.file-upload] Each document takes a file by choosing it or by dropping it on its row.
- R2 [form.validation] A file of the wrong type or over the size limit is refused at once, before uploading, with
  the reason ("PDF, JPG or PNG only", "Larger than 5 MB").
- R3 [list.loading] An upload shows its progress, then a checking state.
- R4 [form.async-submit] A server refusal shows its reason on the document's row and offers to replace the file; an
  interrupted upload offers Retry, which resumes without choosing the file again.
- R5 [feedback.live-announce] Progress milestones and verdicts are announced ("Passport accepted").
- R6 [form.validation] The optional document can be left out; the page says so.
- R7 [a11y.keyboard, a11y.screen-reader] Everything works without a mouse: each row's file choice is a button named
  after its document.
- R8 [layout.responsive] On a phone, rows stack their status under their name and the drop area becomes a button.

## Tasks

### T1 · Upload what is needed (R1, R3, R5)

- When I choose passport.jpg for Passport, bill.pdf for Proof of address and a selfie for Selfie holding passport
- Then each shows progress, then Checking, then Accepted, and "Submit for review" becomes available

### T2 · Wrong file, at once (R2)

- When I choose notes.txt for Proof of address
- Then the row says "PDF, JPG or PNG only" and nothing uploads
- When I choose scan-12mb.pdf
- Then it says "Larger than 5 MB"

### T3 · Refused by the server, replace it (R4)

- When I upload passport-blurry.jpg for Passport
- Then the row reads Refused, "The photo is blurry. Take it again in good light"
- When I replace it with passport.jpg
- Then the row reads Accepted

### T4 · Interrupted, retry (R4)

- When I upload selfie-flaky.jpg and it stops at 60% with "Upload interrupted"
- Then Retry finishes it and the row reads Accepted

### T5 · Submit (R6)

- Given the three required documents are accepted and Tax residency form is empty
- When I choose "Submit for review"
- Then the confirmation shows

## Builder rules

The rules in [`../README.md`](../README.md#builder-rules).
