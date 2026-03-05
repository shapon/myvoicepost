# Web Test Cases: Saved Items

## TC-W-SAV-001: View saved items list
- **Type**: Positive
- **Precondition**: User logged in, has previously saved items
- **Steps**:
  1. Navigate to /saved
- **Expected**: List of saved items displayed with original and polished text

## TC-W-SAV-002: View saved items when empty
- **Type**: Positive
- **Precondition**: User logged in, no saved items
- **Steps**:
  1. Navigate to /saved
- **Expected**: Empty state message displayed (e.g., "No saved items")

## TC-W-SAV-003: Filter saved items by type (Polish)
- **Type**: Positive
- **Precondition**: User has both polish and translate saved items
- **Steps**:
  1. Navigate to /saved
  2. Select filter: "Polish"
- **Expected**: Only polish-type items displayed

## TC-W-SAV-004: Filter saved items by type (Translate)
- **Type**: Positive
- **Precondition**: User has both polish and translate saved items
- **Steps**:
  1. Navigate to /saved
  2. Select filter: "Translate"
- **Expected**: Only translate-type items displayed

## TC-W-SAV-005: Search saved items
- **Type**: Positive
- **Precondition**: User has saved items
- **Steps**:
  1. Navigate to /saved
  2. Enter a search term that matches one of the saved texts
- **Expected**: Filtered results showing only matching items

## TC-W-SAV-006: Search with no results
- **Type**: Negative
- **Steps**:
  1. Navigate to /saved
  2. Enter "xyznonexistent123"
- **Expected**: Empty results with appropriate message

## TC-W-SAV-007: Edit a saved item
- **Type**: Positive
- **Precondition**: User has saved items
- **Steps**:
  1. Navigate to /saved
  2. Click "Edit" on a saved item
  3. Modify the original and/or polished text in the dialog
  4. Click "Save"
- **Expected**: Item updated, dialog closes, list refreshes with updated content

## TC-W-SAV-008: Delete a saved item
- **Type**: Positive
- **Precondition**: User has saved items
- **Steps**:
  1. Navigate to /saved
  2. Click "Delete" on a saved item
  3. Confirm deletion in the alert dialog
- **Expected**: Item removed from list, success toast shown

## TC-W-SAV-009: Cancel delete confirmation
- **Type**: Positive
- **Steps**:
  1. Navigate to /saved
  2. Click "Delete" on a saved item
  3. Click "Cancel" in the confirmation dialog
- **Expected**: Item NOT deleted, dialog closes

## TC-W-SAV-010: Copy saved item text
- **Type**: Positive
- **Steps**:
  1. Navigate to /saved
  2. Click "Copy" on a saved item
- **Expected**: Polished text copied to clipboard, confirmation shown

## TC-W-SAV-011: Pagination
- **Type**: Positive
- **Precondition**: User has more than 10 saved items
- **Steps**:
  1. Navigate to /saved
  2. Verify first page shows 10 items
  3. Click "Next" page
- **Expected**: Next set of items displayed, page indicator updates

## TC-W-SAV-012: Access saved items without login
- **Type**: Negative
- **Steps**:
  1. Log out
  2. Navigate directly to /saved
- **Expected**: Redirected to login page or "login required" message
