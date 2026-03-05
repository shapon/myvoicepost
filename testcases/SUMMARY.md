# MyVoicePost - Test Cases Summary

## Overview

| Platform | Files | Total Test Cases | Positive | Negative |
|----------|-------|-----------------|----------|----------|
| **Web** | 7 files | 81 | 52 | 29 |
| **Mobile Android** | 6 files | 83 | 54 | 29 |
| **Grand Total** | 13 files | **164** | **106** | **58** |

---

## Web Test Cases (`testcases/web/`)

### TC_WEB_AUTH.md — Authentication & Session Management (15 cases)
| ID | Name | Type |
|----|------|------|
| TC-W-AUTH-001 | Login with valid email and password | Positive |
| TC-W-AUTH-002 | Login with invalid password | Negative |
| TC-W-AUTH-003 | Login with non-existent email | Negative |
| TC-W-AUTH-004 | Login with empty fields | Negative |
| TC-W-AUTH-005 | Google SSO login (existing user) | Positive |
| TC-W-AUTH-006 | Google SSO login (new user - auto registration) | Positive |
| TC-W-AUTH-007 | Signup with valid data and OTP | Positive |
| TC-W-AUTH-008 | Signup with mismatched passwords | Negative |
| TC-W-AUTH-009 | Signup with already registered email | Negative |
| TC-W-AUTH-010 | Signup with invalid OTP | Negative |
| TC-W-AUTH-011 | Signup with short password | Negative |
| TC-W-AUTH-012 | Logout | Positive |
| TC-W-AUTH-013 | Session replaced (single device enforcement) | Positive |
| TC-W-AUTH-014 | Access protected page without login | Negative |
| TC-W-AUTH-015 | Token expiry handling | Negative |

**Coverage**: Email login, Google SSO, signup with OTP, form validation, logout, session management, single-device enforcement

---

### TC_WEB_POLISH.md — Polish Feature (15 cases)
| ID | Name | Type |
|----|------|------|
| TC-W-POL-001 | Polish text as guest user | Positive |
| TC-W-POL-002 | Polish text as authenticated user | Positive |
| TC-W-POL-003 | Polish with empty text | Negative |
| TC-W-POL-004 | Polish with voice recording (guest) | Positive |
| TC-W-POL-005 | Voice recording time limit (guest - 55s) | Negative |
| TC-W-POL-006 | Voice recording time limit (auth - 300s) | Positive |
| TC-W-POL-007 | Copy polished text | Positive |
| TC-W-POL-008 | Edit polished text inline | Positive |
| TC-W-POL-009 | Save polished text (authenticated) | Positive |
| TC-W-POL-010 | Save polished text (guest - not allowed) | Negative |
| TC-W-POL-011 | Polish with different languages | Positive |
| TC-W-POL-012 | Polish with all output types | Positive |
| TC-W-POL-013 | Play polished text (TTS) | Positive |
| TC-W-POL-014 | Share polished text | Positive |
| TC-W-POL-015 | Microphone permission denied | Negative |

**Coverage**: Text input, voice recording, guest vs auth, all tones/types/languages, copy/edit/save/play/share actions, time limits, permissions

---

### TC_WEB_TRANSLATE.md — Translate Feature (10 cases)
| ID | Name | Type |
|----|------|------|
| TC-W-TRN-001 | Translate text as guest | Positive |
| TC-W-TRN-002 | Translate text as authenticated user | Positive |
| TC-W-TRN-003 | Translate with empty text | Negative |
| TC-W-TRN-004 | Swap source and target languages | Positive |
| TC-W-TRN-005 | Translate with same source and target | Negative |
| TC-W-TRN-006 | Translate via voice recording | Positive |
| TC-W-TRN-007 | Save translated text | Positive |
| TC-W-TRN-008 | Copy translated text | Positive |
| TC-W-TRN-009 | Play translated text in target language | Positive |
| TC-W-TRN-010 | Translate between non-English languages | Positive |

**Coverage**: Guest vs auth translation, language swapping, voice input, result actions, multi-language support

---

### TC_WEB_PROCESS.md — Process/Transcribe Feature (11 cases)
| ID | Name | Type |
|----|------|------|
| TC-W-PRC-001 | Process YouTube URL as guest | Positive |
| TC-W-PRC-002 | Process YouTube URL as authenticated user | Positive |
| TC-W-PRC-003 | Process invalid URL | Negative |
| TC-W-PRC-004 | Process with empty URL | Negative |
| TC-W-PRC-005 | Upload audio file (authenticated) | Positive |
| TC-W-PRC-006 | Upload oversized file | Negative |
| TC-W-PRC-007 | Upload non-audio file | Negative |
| TC-W-PRC-008 | Apply tone transformation | Positive |
| TC-W-PRC-009 | Save processed text | Positive |
| TC-W-PRC-010 | Edit transcribed text before tone transformation | Positive |
| TC-W-PRC-011 | Process webpage URL | Positive |

**Coverage**: URL processing (YouTube/webpage), file upload with size/type validation, tone transformation, save

---

### TC_WEB_SAVED.md — Saved Items (12 cases)
| ID | Name | Type |
|----|------|------|
| TC-W-SAV-001 | View saved items list | Positive |
| TC-W-SAV-002 | View saved items when empty | Positive |
| TC-W-SAV-003 | Filter by type (Polish) | Positive |
| TC-W-SAV-004 | Filter by type (Translate) | Positive |
| TC-W-SAV-005 | Search saved items | Positive |
| TC-W-SAV-006 | Search with no results | Negative |
| TC-W-SAV-007 | Edit a saved item | Positive |
| TC-W-SAV-008 | Delete a saved item | Positive |
| TC-W-SAV-009 | Cancel delete confirmation | Positive |
| TC-W-SAV-010 | Copy saved item text | Positive |
| TC-W-SAV-011 | Pagination | Positive |
| TC-W-SAV-012 | Access without login | Negative |

**Coverage**: CRUD operations, search, filter, pagination, auth-guard

---

### TC_WEB_DASHBOARD.md — Admin Dashboard (15 cases)
| ID | Name | Type |
|----|------|------|
| TC-W-DSH-001 | Access dashboard as admin | Positive |
| TC-W-DSH-002 | Access dashboard as regular user | Negative |
| TC-W-DSH-003 | Access dashboard without login | Negative |
| TC-W-DSH-004 | View stats overview | Positive |
| TC-W-DSH-005 | Users tab - view all users | Positive |
| TC-W-DSH-006 | Users tab - pagination | Positive |
| TC-W-DSH-007 | Users tab - refresh | Positive |
| TC-W-DSH-008 | Subscriptions tab | Positive |
| TC-W-DSH-009 | Payments tab | Positive |
| TC-W-DSH-010 | Payments tab - receipt link | Positive |
| TC-W-DSH-011 | Support tab - view requests | Positive |
| TC-W-DSH-012 | Support tab - filter by status | Positive |
| TC-W-DSH-013 | Support tab - update ticket status | Positive |
| TC-W-DSH-014 | Errors tab | Positive |
| TC-W-DSH-015 | Errors tab - pagination | Positive |

**Coverage**: Role-based access control, all 5 admin tabs, pagination, filtering, CRUD on support tickets

---

### TC_WEB_LANDING.md — Landing Page & Navigation (14 cases)
| ID | Name | Type |
|----|------|------|
| TC-W-LND-001 | Landing page loads | Positive |
| TC-W-LND-002 | Landing page demo - Polish recording | Positive |
| TC-W-LND-003 | Landing page demo - Translate recording | Positive |
| TC-W-LND-004 | Landing page demo - Type and polish | Positive |
| TC-W-LND-005 | Navigation to Polish page | Positive |
| TC-W-LND-006 | Navigation to Translate page | Positive |
| TC-W-LND-007 | Navigation to Process page | Positive |
| TC-W-LND-008 | Navigation to Pricing page | Positive |
| TC-W-LND-009 | Pricing page - plan display | Positive |
| TC-W-LND-010 | Pricing page - toggle monthly/yearly | Positive |
| TC-W-LND-011 | Privacy policy page | Positive |
| TC-W-LND-012 | Terms of service page | Positive |
| TC-W-LND-013 | Affiliate page | Positive |
| TC-W-LND-014 | 404 page for invalid route | Negative |

**Coverage**: Landing page content, demo functionality, all page navigation, pricing display, legal pages, 404 handling

---

### TC_WEB_API.md — API Integration & Error Handling (14 cases)
| ID | Name | Type |
|----|------|------|
| TC-W-API-001 | Health check endpoint | Positive |
| TC-W-API-002 | Public endpoint without auth | Positive |
| TC-W-API-003 | Authenticated endpoint without token | Negative |
| TC-W-API-004 | Authenticated endpoint with invalid token | Negative |
| TC-W-API-005 | Backward compatibility /api/v1/m/ redirect | Positive |
| TC-W-API-006 | Polish with invalid request body | Negative |
| TC-W-API-007 | Translate with missing target language | Negative |
| TC-W-API-008 | Save text with invalid type | Negative |
| TC-W-API-009 | Delete non-existent saved text | Negative |
| TC-W-API-010 | Delete another user's saved text | Negative |
| TC-W-API-011 | Stripe config endpoint | Positive |
| TC-W-API-012 | Plans endpoint | Positive |
| TC-W-API-013 | Tone categories endpoint | Positive |
| TC-W-API-014 | Rate limiting / large payload | Negative |

**Coverage**: Health check, auth enforcement, backward compatibility, input validation, authorization checks, Stripe/plans/tones

---

## Mobile Android Test Cases (`testcases/mobile_android/`)

### TC_MOB_AUTH.md — Authentication & Session Management (19 cases)
| Coverage Area | Cases |
|---|---|
| Email login (valid/invalid/empty) | 4 |
| Registration with OTP (valid/invalid/duplicate) | 6 |
| Google SSO | 1 |
| Forgot/Reset password | 4 |
| Logout | 1 |
| Session replaced (single device) | 1 |
| Auto-login (valid/expired token) | 2 |

**Coverage**: Full auth lifecycle including forgot/reset password flow (mobile-only), deep link SSO, token persistence

---

### TC_MOB_POLISH.md — Polish Feature (17 cases)
| Coverage Area | Cases |
|---|---|
| Voice recording & polishing | 4 |
| Tones and output types | 2 |
| Re-polish and append mode | 2 |
| Chunked recording (long audio) | 1 |
| Result actions (save/copy/share/play/image) | 5 |
| Offline handling | 2 |
| Permission and access denied | 1 |

**Coverage**: Full recording flow, all tones/types, chunked processing, offline queue, AI image generation, result card actions

---

### TC_MOB_TRANSLATE.md — Translate Feature (12 cases)
| Coverage Area | Cases |
|---|---|
| Basic translation | 2 |
| Same language validation | 1 |
| Re-translate | 1 |
| Result actions (save/copy/share/play) | 4 |
| Offline and access control | 2 |
| Long recording | 1 |
| Clear results | 1 |

**Coverage**: Multi-language translation, result card actions, offline fallback, chunked processing

---

### TC_MOB_PROCESS.md — Process/Transcribe Feature (12 cases)
| Coverage Area | Cases |
|---|---|
| URL processing (YouTube/webpage) | 3 |
| URL validation | 2 |
| File upload (valid/oversized/invalid type) | 3 |
| Tone transformation | 2 |
| Save and target language | 2 |

**Coverage**: URL extraction, file upload validation, tone system, target language translation

---

### TC_MOB_SAVED.md — Saved Items & Offline Queue (9 cases)
| Coverage Area | Cases |
|---|---|
| Saved items list and empty state | 2 |
| Edit and delete saved items | 2 |
| Pending items (offline queue) | 4 |
| Auth guard | 1 |

**Coverage**: CRUD on saved items, offline queue management, auto-processing on reconnect

---

### TC_MOB_SUBSCRIPTION.md — Subscription & Payments (10 cases)
| Coverage Area | Cases |
|---|---|
| View plans and trial status | 2 |
| Trial expiry | 1 |
| Subscribe via Stripe | 1 |
| Active subscription details | 1 |
| Cancel subscription | 1 |
| Access checks (active/exhausted) | 2 |
| Top-up and payment failure | 2 |

**Coverage**: Full subscription lifecycle, trial management, Stripe payment flow, access control by minutes

---

### TC_MOB_SETTINGS.md — Settings, Profile & Help (13 cases)
| Coverage Area | Cases |
|---|---|
| Profile and usage stats | 2 |
| Account updates (username/email/password) | 5 |
| App settings and sync | 3 |
| Help tab (diagnostics/support/FAQ) | 3 |

**Coverage**: Account management, cross-device settings sync, diagnostic tools, support request submission

---

### TC_MOB_SYSTEM.md — System, Background & Edge Cases (16 cases)
| Coverage Area | Cases |
|---|---|
| Background recording | 1 |
| Crash recovery | 3 |
| Battery warning | 1 |
| Network changes during recording | 1 |
| Crash/error reporting | 2 |
| Reliability status bar | 1 |
| Offline startup | 1 |
| Deep link handling | 1 |
| SSL pinning | 2 |
| Token handling on 401 | 1 |
| Stress tests (rapid recording, large text) | 2 |

**Coverage**: Background processing, crash recovery, network resilience, SSL security, error reporting, stress testing

---

## Functional Area Coverage Matrix

| Feature Area | Web Cases | Mobile Cases |
|---|---|---|
| Authentication (login/signup/SSO/logout) | 15 | 19 |
| Polish (text + voice → polished text) | 15 | 17 |
| Translate (text + voice → translation) | 10 | 12 |
| Process/Transcribe (URL/file → text) | 11 | 12 |
| Saved Items (CRUD, search, filter) | 12 | 9 |
| Subscription & Payments | — | 10 |
| Admin Dashboard | 15 | — |
| Settings & Profile | — | 13 |
| Landing Page & Navigation | 14 | — |
| API Integration & Error Handling | 14 | — |
| System/Background/Edge Cases | — | 16 |
| **Total** | **81** | **83** |

> **Note**: Subscription management and Settings/Profile are mobile-focused features. Admin Dashboard, Landing Page, and direct API tests are web-focused. Core features (Auth, Polish, Translate, Process, Saved) are covered on both platforms.
