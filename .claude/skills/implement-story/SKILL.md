---
name: implement-story
description: Implement a single story following architectural guidelines. Includes planning, coding, and test writing phases. Use when working on a specific story from a stories list, implementing a focused piece of functionality.
---

# Implement Story

Implement a single story following the architecture document and project conventions.

## When to Use

- When implementing a specific story from the stories list
- When you have story details and architectural context
- When focused implementation work is needed

## IMPORTANT: Always Use /plan First

Before making any code changes, you MUST use the `/plan` tool to create an implementation plan and get it approved.

## Instructions

### Step 1: Analysis (Read-Only)

Before planning, gather context:

1. **Read the story details**:
   - What are the acceptance criteria?
   - What files need to be created/modified?
   - What are the dependencies?

2. **Read existing code**:
   - Read files mentioned in `files_to_modify`
   - Look at similar implementations for patterns
   - Understand the testing approach

3. **Understand the context**:
   - Review the architecture document
   - Check how this story fits with others
   - Note any constraints or requirements

### Step 2: Create Plan with /plan

Use `/plan` to create your implementation plan. The plan should include:

1. **Files to create** (in order):
   - Types/interfaces first
   - Core implementation next
   - Integration/exports last

2. **Files to modify**:
   - What specific changes in each file
   - Why each change is needed

3. **Test cases to write**:
   - Happy path tests
   - Error cases
   - Edge cases

4. **Potential risks**:
   - What could go wrong
   - How to mitigate

### Step 3: Execute Plan (After Approval)

Once the plan is approved, implement:

1. **Create new files**:
   - Follow existing naming conventions
   - Use similar files as templates
   - Include proper imports and exports

2. **Modify existing files**:
   - Make minimal, focused changes
   - Don't refactor unrelated code
   - Maintain existing style

3. **Follow patterns**:
   - Use the same patterns as existing code
   - Don't introduce new patterns without reason
   - Match indentation, naming, structure

4. **Handle errors**:
   - Add appropriate error handling
   - Don't swallow errors silently
   - Use typed errors when available

### Step 4: Write Tests

Write tests for the implementation:

1. **Unit tests**:
   - Test each function/method
   - Mock dependencies
   - Cover edge cases

2. **Follow test patterns**:
   - Use project's test framework
   - Match existing test structure
   - Use descriptive test names

### Step 5: Verification

Before completing:

1. **Check acceptance criteria**:
   - Does implementation satisfy each criterion?
   - Are there any gaps?

2. **Run linter**:
   - Fix any linting issues
   - Don't disable rules

3. **Run tests**:
   - Ensure new tests pass
   - Ensure existing tests still pass

## Language-Specific Patterns

### TypeScript

**File structure:**
```
src/
  services/
    AuthService.ts      # Implementation
  types/
    auth.ts             # Type definitions
tests/
  unit/
    services/
      AuthService.test.ts
```

**Implementation example:**
```typescript
// src/services/AuthService.ts
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import type { User, AuthTokenPayload } from '../types/auth';

const SALT_ROUNDS = 10;
const JWT_SECRET = process.env.JWT_SECRET ?? 'development-secret';

export class AuthService {
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  generateToken(user: User): string {
    const payload: AuthTokenPayload = {
      userId: user.id,
      email: user.email,
    };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
  }
}
```

**Test example:**
```typescript
// tests/unit/services/AuthService.test.ts
import { describe, it, expect } from 'vitest';
import { AuthService } from '../../../src/services/AuthService';

describe('AuthService', () => {
  const service = new AuthService();

  describe('hashPassword', () => {
    it('should return a bcrypt hash', async () => {
      const hash = await service.hashPassword('password123');
      expect(hash).toMatch(/^\$2[ab]\$/);
    });
  });

  describe('verifyPassword', () => {
    it('should return true for correct password', async () => {
      const hash = await service.hashPassword('password123');
      const result = await service.verifyPassword('password123', hash);
      expect(result).toBe(true);
    });
  });
});
```

### Python

**File structure:**
```
src/
  services/
    auth_service.py     # Implementation
  types/
    auth.py             # Type definitions
tests/
  unit/
    services/
      test_auth_service.py
```

**Implementation example:**
```python
# src/services/auth_service.py
import bcrypt
import jwt
import os
from typing import TypedDict

class AuthTokenPayload(TypedDict):
    user_id: str
    email: str

SALT_ROUNDS = 10
JWT_SECRET = os.environ.get('JWT_SECRET', 'development-secret')

class AuthService:
    def hash_password(self, password: str) -> str:
        return bcrypt.hashpw(password.encode(), bcrypt.gensalt(SALT_ROUNDS)).decode()

    def verify_password(self, password: str, hash: str) -> bool:
        return bcrypt.checkpw(password.encode(), hash.encode())

    def generate_token(self, user_id: str, email: str) -> str:
        payload: AuthTokenPayload = {'user_id': user_id, 'email': email}
        return jwt.encode(payload, JWT_SECRET, algorithm='HS256')
```

**Test example:**
```python
# tests/unit/services/test_auth_service.py
import pytest
from src.services.auth_service import AuthService

class TestAuthService:
    @pytest.fixture
    def service(self):
        return AuthService()

    def test_hash_password_returns_bcrypt_hash(self, service):
        hash = service.hash_password('password123')
        assert hash.startswith('$2')

    def test_verify_password_returns_true_for_correct_password(self, service):
        hash = service.hash_password('password123')
        result = service.verify_password('password123', hash)
        assert result is True
```

### Rust

**File structure:**
```
src/
  services/
    mod.rs
    auth.rs             # Implementation
  types/
    mod.rs
    auth.rs             # Type definitions
tests/
  auth_test.rs
```

**Implementation example:**
```rust
// src/services/auth.rs
use bcrypt::{hash, verify, DEFAULT_COST};
use jsonwebtoken::{encode, Header, EncodingKey};
use serde::{Deserialize, Serialize};
use std::env;

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthTokenPayload {
    pub user_id: String,
    pub email: String,
    pub exp: usize,
}

pub struct AuthService;

impl AuthService {
    pub fn hash_password(password: &str) -> Result<String, bcrypt::BcryptError> {
        hash(password, DEFAULT_COST)
    }

    pub fn verify_password(password: &str, hash: &str) -> bool {
        verify(password, hash).unwrap_or(false)
    }

    pub fn generate_token(user_id: &str, email: &str) -> Result<String, jsonwebtoken::errors::Error> {
        let secret = env::var("JWT_SECRET").unwrap_or_else(|_| "development-secret".to_string());
        let payload = AuthTokenPayload {
            user_id: user_id.to_string(),
            email: email.to_string(),
            exp: 10000000000, // Far future
        };
        encode(&Header::default(), &payload, &EncodingKey::from_secret(secret.as_bytes()))
    }
}
```

**Test example:**
```rust
// tests/auth_test.rs
use myproject::services::auth::AuthService;

#[test]
fn test_hash_password_returns_bcrypt_hash() {
    let hash = AuthService::hash_password("password123").unwrap();
    assert!(hash.starts_with("$2"));
}

#[test]
fn test_verify_password_returns_true_for_correct_password() {
    let hash = AuthService::hash_password("password123").unwrap();
    let result = AuthService::verify_password("password123", &hash);
    assert!(result);
}
```

### Go

**File structure:**
```
services/
  auth.go               # Implementation
  auth_test.go          # Tests
types/
  auth.go               # Type definitions
```

**Implementation example:**
```go
// services/auth.go
package services

import (
    "os"
    "time"

    "github.com/golang-jwt/jwt/v5"
    "golang.org/x/crypto/bcrypt"
)

type AuthTokenPayload struct {
    UserID string `json:"user_id"`
    Email  string `json:"email"`
    jwt.RegisteredClaims
}

type AuthService struct{}

func (s *AuthService) HashPassword(password string) (string, error) {
    bytes, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
    return string(bytes), err
}

func (s *AuthService) VerifyPassword(password, hash string) bool {
    err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
    return err == nil
}

func (s *AuthService) GenerateToken(userID, email string) (string, error) {
    secret := os.Getenv("JWT_SECRET")
    if secret == "" {
        secret = "development-secret"
    }

    claims := AuthTokenPayload{
        UserID: userID,
        Email:  email,
        RegisteredClaims: jwt.RegisteredClaims{
            ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
        },
    }

    token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
    return token.SignedString([]byte(secret))
}
```

**Test example:**
```go
// services/auth_test.go
package services

import (
    "strings"
    "testing"
)

func TestHashPassword(t *testing.T) {
    service := &AuthService{}
    hash, err := service.HashPassword("password123")
    if err != nil {
        t.Fatalf("HashPassword failed: %v", err)
    }
    if !strings.HasPrefix(hash, "$2") {
        t.Errorf("Expected bcrypt hash, got: %s", hash)
    }
}

func TestVerifyPassword(t *testing.T) {
    service := &AuthService{}
    hash, _ := service.HashPassword("password123")
    result := service.VerifyPassword("password123", hash)
    if !result {
        t.Error("Expected VerifyPassword to return true for correct password")
    }
}
```

## Output Summary

After implementation, provide a summary:

```markdown
## Implementation Summary

### Files Created
- `path/to/new-file.ts`: [Description]

### Files Modified
- `path/to/existing.ts`: [Description of changes]

### Tests Added
- `path/to/test.ts`: [What it tests]

### Acceptance Criteria Status
- [x] Criterion 1: [How it's satisfied]
- [x] Criterion 2: [How it's satisfied]

### Notes
- [Any concerns, TODOs, or follow-ups]
```

## Best Practices

1. **Read before write**: Always understand existing code first
2. **Follow patterns**: Don't introduce new patterns unnecessarily
3. **Test as you go**: Write tests alongside implementation
4. **Keep it focused**: Only implement what the story requires
5. **Document decisions**: Note any deviations or concerns
