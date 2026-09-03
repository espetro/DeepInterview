# e2e text

The readable scenario source of truth. Executed by `playwright.spec.ts`
(run from tests/e2e: `bun x playwright test`, with di running in test mode).

## create a session and see it in server state

* test mode ping returns {"testMode": true}

* POST /v1/sessions returns 201 with a session id

* GET /v1/test/state includes the session id in sessions[].id

## turns posted via api appear in session turns

* POST /v1/sessions/:id/turns with a valid turn returns 201

* GET /v1/sessions/:id/turns lists the posted turn with matching speaker and text

## report round-trips through the api

* PUT /v1/sessions/:id/report with a valid report returns 200

* GET /v1/sessions/:id/report returns the stored report with matching overall_score

## tool state round-trips through the api

* PUT /v1/sessions/:id/tools with editor and whiteboard text returns 200

* GET /v1/sessions/:id/tools returns the pushed editor and whiteboard content
