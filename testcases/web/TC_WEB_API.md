# Web Test Cases: API Integration & Error Handling

## TC-W-API-001: Health check endpoint
- **Type**: Positive
- **Steps**:
  1. GET /api/health
- **Expected**: Returns `{ status: "ok" }`

## TC-W-API-002: Public endpoint without auth
- **Type**: Positive
- **Steps**:
  1. POST /api/v1/p/polish with valid body (no auth header)
- **Expected**: Returns polished text successfully

## TC-W-API-003: Authenticated endpoint without token
- **Type**: Negative
- **Steps**:
  1. GET /api/v1/a/saved-texts without Authorization header
- **Expected**: 401 error "Authentication required"

## TC-W-API-004: Authenticated endpoint with invalid token
- **Type**: Negative
- **Steps**:
  1. GET /api/v1/a/auth/me with Authorization: Bearer invalid_token_here
- **Expected**: 401 error "Invalid token"

## TC-W-API-005: Backward compatibility /api/v1/m/ redirect
- **Type**: Positive
- **Steps**:
  1. GET /api/v1/m/auth/me with valid auth token
- **Expected**: Request redirected internally to /api/v1/a/auth/me, returns user data

## TC-W-API-006: Polish with invalid request body
- **Type**: Negative
- **Steps**:
  1. POST /api/v1/p/polish with empty body `{}`
- **Expected**: 400 error with validation details

## TC-W-API-007: Translate with missing target language
- **Type**: Negative
- **Steps**:
  1. POST /api/v1/p/translate with `{ text: "hello" }` (no targetLanguage)
- **Expected**: 400 error about missing target language

## TC-W-API-008: Save text with invalid type
- **Type**: Negative
- **Precondition**: Valid auth token
- **Steps**:
  1. POST /api/v1/a/saved-texts with `{ type: "invalid", originalText: "test", polishedText: "test", sourceLanguage: "en", outputFormat: "paragraph" }`
- **Expected**: 400 error - type must be "polish" or "translate"

## TC-W-API-009: Delete non-existent saved text
- **Type**: Negative
- **Precondition**: Valid auth token
- **Steps**:
  1. DELETE /api/v1/a/saved-texts/nonexistent-id
- **Expected**: 404 error "Saved text not found"

## TC-W-API-010: Delete another user's saved text
- **Type**: Negative
- **Precondition**: Valid auth token for User A, saved text belongs to User B
- **Steps**:
  1. DELETE /api/v1/a/saved-texts/{user-b-item-id}
- **Expected**: 404 error (not found for this user)

## TC-W-API-011: Stripe config endpoint
- **Type**: Positive
- **Steps**:
  1. GET /api/v1/p/stripe-config
- **Expected**: Returns Stripe publishable key

## TC-W-API-012: Plans endpoint
- **Type**: Positive
- **Steps**:
  1. GET /api/v1/p/plans
- **Expected**: Returns array of subscription plans with prices and features

## TC-W-API-013: Tone categories endpoint
- **Type**: Positive
- **Steps**:
  1. GET /api/v1/p/tone-categories
- **Expected**: Returns categories with tone options

## TC-W-API-014: Rate limiting / large payload
- **Type**: Negative
- **Steps**:
  1. POST /api/v1/p/transcribe with audio base64 > 50MB
- **Expected**: 413 error or appropriate size limit error
