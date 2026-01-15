---
name: fix-drift
description: Fix architectural drift issues identified by check-drift. Removes unnecessary features, refactors to match architecture, and documents valid improvements. Use when architectural drift has been detected and needs correction.
---

# Fix Drift

Fix architectural drift issues by removing unnecessary code, refactoring violations, and documenting improvements.

## When to Use

- After `check-drift` identifies issues
- When architectural alignment needs correction
- When cleaning up implementation before commit
- When removing scope creep from implementation

## IMPORTANT: Always Use /plan First

Before making any code changes, you MUST use the `/plan` tool to plan the fixes and get approval.

## Instructions

### Step 1: Analyze Issues (Read-Only)

For each drift issue, understand:

1. **What is the deviation?**
2. **Where is it located?**
3. **What type is it?** (remove, fix, or keep)
4. **What action is recommended?**

### Step 2: Create Plan with /plan

Use `/plan` to create your fix plan. The plan should include:

1. **Issues to address** (ordered by type: remove first, then fix, then keep)
2. **For each "remove" issue**:
   - Files to delete
   - Imports to remove from other files
   - Tests to delete
3. **For each "fix" issue**:
   - Current state vs desired state
   - Specific refactoring steps
   - Files affected
4. **For "keep" issues**:
   - What to document
   - No code changes needed
5. **Verification steps**

### Step 3: Execute Fixes (After Plan Approval)

#### Type: "remove" - Delete Unnecessary Code

1. **Identify all related code**:
   - The main file/component
   - Imports in other files
   - Tests for the removed code
   - Configuration entries

2. **Remove systematically**:
   - Delete the primary files
   - Remove imports from other files
   - Delete related tests
   - Clean up configuration

3. **Verify removal**:
   - No dangling imports
   - No broken references
   - Build still works

#### Type: "fix" - Refactor to Match Architecture

1. **Execute refactor**:
   - Move files if needed
   - Rename classes/functions if needed
   - Update interfaces to match spec
   - Update integration points

2. **Update references**:
   - Fix all imports
   - Update tests
   - Update configuration

3. **Verify refactor**:
   - Matches architecture
   - All tests pass
   - No functionality lost

#### Type: "keep" - Document Valid Improvements

1. **No code changes needed**
2. **Document in summary**:
   - Note what was added and why
   - Flag as valid improvement

### Step 4: Verify All Fixes

After all fixes:

1. **Run lint** - Fix any issues
2. **Run tests** - Ensure all pass
3. **Check for broken references**
4. **Document what was changed**

## Output Format

After fixing drift issues, provide a summary:

```markdown
## Drift Fix Summary

### Issues Processed

#### Removed (type: "remove")
| File | What was removed | Reason |
|------|------------------|--------|
| path/to/file.ts | [Component name] | Not in requirements |

#### Refactored (type: "fix")
| File | What was changed | Now matches |
|------|------------------|-------------|
| path/to/file.ts | [Description] | [Architecture spec] |

#### Documented (type: "keep")
| File | Improvement | Notes |
|------|-------------|-------|
| path/to/file.ts | [What was kept] | [Why it's valuable] |

### Files Modified
- `path/to/file.ts`: [Changes made]

### Files Deleted
- `path/to/removed.ts`: [Reason]

### Verification
- [x] Lint passes
- [x] Tests pass
- [x] No broken references
- [x] Build succeeds

### Notes
- [Any concerns or follow-ups]
```

## Example

**Drift Issues Input**:
```json
{
  "aligned": false,
  "issues": [
    {
      "type": "remove",
      "description": "Added analytics tracking not in scope",
      "file": "src/utils/analytics.ts",
      "action": "Remove analytics utility and all usages"
    },
    {
      "type": "fix",
      "description": "User model in wrong directory",
      "file": "src/data/User.ts",
      "action": "Move to src/models/User.ts per architecture"
    },
    {
      "type": "keep",
      "description": "Added input validation for email format",
      "file": "src/services/AuthService.ts",
      "action": "Document - improves security"
    }
  ]
}
```

**Fix Process**:

### 1. Remove Analytics (type: "remove")

```bash
# Files to remove
rm src/utils/analytics.ts
rm tests/unit/utils/analytics.test.ts

# Update imports in other files
# Remove: import { trackEvent } from '../utils/analytics';
# Remove: trackEvent('login', { success: true });
```

### 2. Move User Model (type: "fix")

```bash
# Move the file
mv src/data/User.ts src/models/User.ts

# Update all imports
# From: import { User } from '../data/User';
# To:   import { User } from '../models/User';
```

### 3. Document Validation (type: "keep")

No code changes - note in summary that email validation is a valid security improvement.

**Summary Output**:
```markdown
## Drift Fix Summary

### Issues Processed

#### Removed (type: "remove")
| File | What was removed | Reason |
|------|------------------|--------|
| src/utils/analytics.ts | Analytics tracking utility | Not in requirements |
| tests/unit/utils/analytics.test.ts | Analytics tests | Removing unused code |

#### Refactored (type: "fix")
| File | What was changed | Now matches |
|------|------------------|-------------|
| src/data/User.ts | Moved to src/models/ | Architecture: models in src/models/ |

#### Documented (type: "keep")
| File | Improvement | Notes |
|------|-------------|-------|
| src/services/AuthService.ts | Email format validation | Security improvement - validates email before processing |

### Files Modified
- `src/controllers/AuthController.ts`: Removed analytics imports and calls
- `src/services/AuthService.ts`: Updated User import path

### Files Deleted
- `src/utils/analytics.ts`: Removed (not in scope)
- `tests/unit/utils/analytics.test.ts`: Removed (testing deleted code)

### Files Moved
- `src/data/User.ts` → `src/models/User.ts`

### Verification
- [x] Lint passes
- [x] Tests pass
- [x] No broken references
- [x] Build succeeds

### Notes
- Consider adding analytics as a separate story if needed in future
- Email validation in AuthService is a good pattern to follow in other services
```

## Best Practices

1. **Fix in order**: Remove first, then fix, then document keeps
2. **Be thorough**: Check all references when removing/moving code
3. **Test after each fix**: Don't batch all fixes before testing
4. **Don't break functionality**: Refactors should preserve behavior
5. **Document keeps**: They may inform future architecture updates
6. **Run full test suite**: Ensure no regressions
