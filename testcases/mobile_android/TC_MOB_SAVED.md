# Mobile Android Test Cases: Saved Items & Offline Queue

## TC-M-SAV-001: View saved items list
- **Type**: Positive
- **Precondition**: User has saved items
- **Steps**:
  1. Navigate to Saved tab
- **Expected**: List of saved items with original and polished/translated text

## TC-M-SAV-002: View saved items when empty
- **Type**: Positive
- **Precondition**: No saved items
- **Steps**:
  1. Navigate to Saved tab
- **Expected**: Empty state message shown

## TC-M-SAV-003: Edit saved item
- **Type**: Positive
- **Steps**:
  1. Navigate to Saved tab
  2. Tap "Edit" on a saved item
- **Expected**: Opens in Polish/Translate tab for re-processing

## TC-M-SAV-004: Delete saved item
- **Type**: Positive
- **Steps**:
  1. Navigate to Saved tab
  2. Tap "Delete" on a saved item
  3. Confirm deletion
- **Expected**: Item removed from list

## TC-M-SAV-005: View pending items tab
- **Type**: Positive
- **Precondition**: Offline recordings exist in queue
- **Steps**:
  1. Navigate to Saved tab
  2. Switch to "Pending" tab
- **Expected**: Pending items listed with status

## TC-M-SAV-006: Manually process pending item
- **Type**: Positive
- **Precondition**: Pending item exists, device online
- **Steps**:
  1. Navigate to Pending tab
  2. Tap "Process" on a pending item
- **Expected**: Item processed, moved to saved items

## TC-M-SAV-007: Pending items auto-process on connectivity
- **Type**: Positive
- **Precondition**: Pending items exist
- **Steps**:
  1. Reconnect to internet
  2. Wait for auto-processing
- **Expected**: Pending items automatically processed and saved

## TC-M-SAV-008: Delete pending item
- **Type**: Positive
- **Steps**:
  1. Navigate to Pending tab
  2. Delete a pending item
- **Expected**: Item removed from queue

## TC-M-SAV-009: View saved items without login
- **Type**: Negative
- **Steps**:
  1. Log out
  2. Navigate to Saved tab
- **Expected**: Login prompt or empty state
