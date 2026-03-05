# Web Test Cases: Admin Dashboard

## TC-W-DSH-001: Access dashboard as admin
- **Type**: Positive
- **Precondition**: User logged in with ADMIN role
- **Steps**:
  1. Navigate to /dashboard
- **Expected**: Dashboard loads with stats cards, tab navigation for Users/Subscriptions/Payments/Support/Errors

## TC-W-DSH-002: Access dashboard as regular user
- **Type**: Negative
- **Precondition**: User logged in with USER role
- **Steps**:
  1. Navigate to /dashboard
- **Expected**: Redirected to home page, dashboard not shown

## TC-W-DSH-003: Access dashboard without login
- **Type**: Negative
- **Steps**:
  1. Navigate to /dashboard without auth
- **Expected**: Redirected to home or login page

## TC-W-DSH-004: View stats overview
- **Type**: Positive
- **Precondition**: Admin logged in
- **Steps**:
  1. Navigate to /dashboard
  2. Observe stats cards
- **Expected**: Cards show Total Users, Active Subscriptions, Open Support Requests, Error Logs counts

## TC-W-DSH-005: Users tab - view all users
- **Type**: Positive
- **Steps**:
  1. Click "Users" tab
- **Expected**: Table shows username, email, role, trial status, Stripe ID, join date

## TC-W-DSH-006: Users tab - pagination
- **Type**: Positive
- **Precondition**: More than 15 users exist
- **Steps**:
  1. Click "Users" tab
  2. Click next page
- **Expected**: Next page of users loaded

## TC-W-DSH-007: Users tab - refresh
- **Type**: Positive
- **Steps**:
  1. Click "Refresh" button on Users tab
- **Expected**: Data reloaded from server

## TC-W-DSH-008: Subscriptions tab
- **Type**: Positive
- **Steps**:
  1. Click "Subscriptions" tab
- **Expected**: Table shows user, plan name, status, valid until, minutes used/remaining

## TC-W-DSH-009: Payments tab
- **Type**: Positive
- **Steps**:
  1. Click "Payments" tab
- **Expected**: Table shows customer, amount, status, description, date, receipt link

## TC-W-DSH-010: Payments tab - receipt link
- **Type**: Positive
- **Precondition**: Payment with receipt URL exists
- **Steps**:
  1. Click receipt link icon on a payment row
- **Expected**: Opens Stripe receipt in new tab

## TC-W-DSH-011: Support tab - view requests
- **Type**: Positive
- **Steps**:
  1. Click "Support" tab
- **Expected**: Table shows email, subject, message, platform, status, date

## TC-W-DSH-012: Support tab - filter by status
- **Type**: Positive
- **Steps**:
  1. Click "Support" tab
  2. Select "Open" from the status filter dropdown
- **Expected**: Only open support requests shown

## TC-W-DSH-013: Support tab - update ticket status
- **Type**: Positive
- **Steps**:
  1. Click "Support" tab
  2. Change a ticket's status from "Open" to "Resolved"
- **Expected**: Status updated, reflected in the table

## TC-W-DSH-014: Errors tab
- **Type**: Positive
- **Steps**:
  1. Click "Errors" tab
- **Expected**: Table shows error message, code, platform, endpoint, user, date

## TC-W-DSH-015: Errors tab - pagination
- **Type**: Positive
- **Precondition**: More than 15 error logs
- **Steps**:
  1. Click next page on errors tab
- **Expected**: Next page of errors loaded
