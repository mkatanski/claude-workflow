---
name: create-architecture
description: Analyze a codebase and create an architectural document for implementing a new feature. Use when you need to understand existing patterns, identify where new code should go, define interfaces, and plan the implementation structure for an epic or feature.
---

# Create Architecture

Analyze an existing codebase and create an architectural document for implementing a new feature or epic.

## When to Use

- When starting implementation of a new epic/feature
- When you need to understand existing codebase patterns
- When planning where new code should be placed
- When defining interfaces and data models for a feature

## Instructions

### Step 1: Analyze the Codebase

First, explore the existing codebase to understand:

1. **Project Structure**:
   - What's the directory organization?
   - Where does similar functionality live?
   - What are the key modules/packages?

2. **Technology Stack**:
   - Language and framework
   - Key dependencies
   - Build and test tools

3. **Existing Patterns**:
   - Design patterns used (MVC, Repository, etc.)
   - Naming conventions
   - Code organization style

4. **Test Structure**:
   - Where are tests located?
   - What testing frameworks are used?
   - What's the test naming convention?

### Step 2: Identify Integration Points

Determine how the new feature connects to existing code:

- Which existing modules need modification?
- What APIs or services will be consumed?
- What data flows need to be extended?
- Which components will be reused?

### Step 3: Design the Implementation

Plan the implementation structure:

**New Files to Create**:
- What new files/modules are needed?
- Where should they be placed (following conventions)?
- What existing files can serve as templates?

**Files to Modify**:
- Which existing files need changes?
- What kind of changes (imports, new methods, etc.)?

**Interfaces and Types**:
- What new interfaces/types are needed?
- How do they integrate with existing types?

### Step 4: Define Implementation Order

Create a dependency graph:
1. What must be built first (no dependencies)?
2. What depends on step 1?
3. Continue until all components are ordered

### Step 5: Plan Testing Strategy

- What unit tests are needed?
- What integration tests?
- What existing test patterns should be followed?

## Output Format

Create a markdown document with this structure:

```markdown
# Architecture Document: [Epic/Feature Title]

## 1. Current Architecture Summary

### Project Type & Stack
- **Language**: [e.g., TypeScript]
- **Framework**: [e.g., Express.js]
- **Key Dependencies**: [list major deps]

### Directory Structure
```
project/
├── src/
│   ├── controllers/    # Request handlers
│   ├── services/       # Business logic
│   ├── models/         # Data models
│   └── utils/          # Utilities
├── tests/
│   ├── unit/
│   └── integration/
└── ...
```

### Existing Patterns
- [Pattern 1]: [Description and example file]
- [Pattern 2]: [Description and example file]

## 2. Proposed Implementation

### New Files to Create
| File Path | Purpose | Template/Reference |
|-----------|---------|-------------------|
| src/path/to/file.ts | [Description] | Similar to src/existing/file.ts |

### Files to Modify
| File Path | Changes Required |
|-----------|------------------|
| src/path/to/existing.ts | [Description of changes] |

### New Interfaces/Types
```typescript
// Define new interfaces here
interface NewFeatureConfig {
  // ...
}
```

## 3. Data Models

[Describe any new data structures, database schemas, or state shapes]

## 4. Integration Points

- **[Integration 1]**: [How new code connects to existing]
- **[Integration 2]**: [API endpoints, events, etc.]

## 5. Testing Strategy

### Unit Tests
- [ ] [Test file]: [What it tests]
- [ ] [Test file]: [What it tests]

### Integration Tests
- [ ] [Test scenario]: [What it validates]

## 6. Implementation Order

1. **[Component 1]** - No dependencies
   - Files: [list]
   - Why first: [reason]

2. **[Component 2]** - Depends on #1
   - Files: [list]
   - Dependencies: [what it needs from #1]

3. **[Component 3]** - Depends on #1, #2
   - Files: [list]

## 7. Technical Constraints

- [Constraint 1]: [Why and how to handle]
- [Constraint 2]: [Why and how to handle]
```

## Example

For a "User Authentication" feature in a Node.js/Express app:

```markdown
# Architecture Document: User Authentication

## 1. Current Architecture Summary

### Project Type & Stack
- **Language**: TypeScript
- **Framework**: Express.js 4.x
- **Key Dependencies**: mongoose, jsonwebtoken, bcrypt

### Directory Structure
```
src/
├── controllers/    # Route handlers
├── services/       # Business logic
├── models/         # Mongoose schemas
├── middleware/     # Express middleware
├── routes/         # Route definitions
└── types/          # TypeScript interfaces
```

### Existing Patterns
- **Controller Pattern**: Controllers in src/controllers/ handle HTTP, call services
- **Service Pattern**: Services in src/services/ contain business logic
- **Middleware Pattern**: Auth, validation in src/middleware/

## 2. Proposed Implementation

### New Files to Create
| File Path | Purpose | Template/Reference |
|-----------|---------|-------------------|
| src/models/User.ts | User mongoose schema | Similar to src/models/Product.ts |
| src/services/AuthService.ts | Auth business logic | Similar to src/services/ProductService.ts |
| src/controllers/AuthController.ts | Auth endpoints | Similar to src/controllers/ProductController.ts |
| src/middleware/authMiddleware.ts | JWT verification | New pattern |
| src/routes/auth.ts | Auth routes | Similar to src/routes/products.ts |

### Files to Modify
| File Path | Changes Required |
|-----------|------------------|
| src/routes/index.ts | Add auth routes import |
| src/types/index.ts | Export new auth types |

### New Interfaces/Types
```typescript
interface User {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
}

interface AuthTokenPayload {
  userId: string;
  email: string;
}

interface LoginRequest {
  email: string;
  password: string;
}
```

## 3. Data Models

### User Schema (MongoDB)
```typescript
{
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
}
```

## 4. Integration Points

- **Routes**: Mount at /api/auth in main router
- **Middleware**: authMiddleware used on protected routes
- **Environment**: JWT_SECRET required in .env

## 5. Testing Strategy

### Unit Tests
- [ ] tests/unit/services/AuthService.test.ts: Password hashing, token generation
- [ ] tests/unit/middleware/authMiddleware.test.ts: Token validation

### Integration Tests
- [ ] tests/integration/auth.test.ts: Full login/register flow

## 6. Implementation Order

1. **User Model** - No dependencies
   - Files: src/models/User.ts, src/types/index.ts
   - Why first: Foundation for all auth logic

2. **Auth Service** - Depends on #1
   - Files: src/services/AuthService.ts
   - Dependencies: User model

3. **Auth Middleware** - Depends on #2
   - Files: src/middleware/authMiddleware.ts
   - Dependencies: AuthService for token verification

4. **Auth Controller & Routes** - Depends on #2, #3
   - Files: src/controllers/AuthController.ts, src/routes/auth.ts
   - Dependencies: AuthService, routes integration

## 7. Technical Constraints

- **Password Storage**: Must use bcrypt with cost factor >= 10
- **Token Expiry**: JWT tokens expire in 24 hours
- **Rate Limiting**: Login endpoint needs rate limiting (TODO: separate story)
```

## Best Practices

1. **Follow existing patterns**: Don't introduce new patterns unless necessary
2. **Reference existing files**: Point to similar implementations as templates
3. **Be specific about locations**: Exact file paths, not vague descriptions
4. **Consider testability**: Design for easy unit testing
5. **Document constraints**: Be explicit about security, performance requirements
