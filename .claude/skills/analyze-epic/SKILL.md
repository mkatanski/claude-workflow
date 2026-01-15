---
name: analyze-epic
description: Analyze a feature request or epic prompt and create a well-structured epic description with requirements, acceptance criteria, risks, and technical considerations. Use when given a feature prompt, product requirement, or epic that needs to be broken down into a formal specification.
---

# Analyze Epic

Transform a feature request or epic prompt into a well-structured epic description document.

## When to Use

- When given a feature prompt or product requirement
- When breaking down a high-level idea into formal specification
- When starting a new epic/feature development cycle
- When you need structured requirements from informal input

## Instructions

### Step 1: Understand the Request

Read the provided prompt/requirement carefully and identify:
1. The core objective - what is the user trying to achieve?
2. The value proposition - why is this important?
3. Implicit requirements - what's not stated but necessary?
4. Target users - who will use this feature?

### Step 2: Extract Requirements

Break down into two categories:

**Functional Requirements (FR)**:
- What the system must DO
- User-facing features and behaviors
- Prioritize as: must-have, should-have, nice-to-have

**Non-Functional Requirements (NFR)**:
- How the system must PERFORM
- Categories: performance, security, scalability, accessibility, maintainability

### Step 3: Define Acceptance Criteria

Write acceptance criteria in Given/When/Then format:
```
Given [initial context/state]
When [action is performed]
Then [expected outcome]
```

Each criterion should be:
- Testable (can verify pass/fail)
- Specific (no ambiguity)
- Independent (doesn't depend on other criteria)

### Step 4: Identify Risks and Dependencies

**Risks**: What could go wrong?
- Technical risks (complexity, unknowns)
- Resource risks (time, skills)
- External risks (dependencies, integrations)

**Dependencies**: What do we need?
- External systems/APIs
- Other features or components
- Data or resources

### Step 5: Estimate Complexity

Assess overall complexity:
- **small**: 1-3 stories, straightforward implementation
- **medium**: 4-7 stories, some complexity or unknowns
- **large**: 8-12 stories, significant complexity
- **extra-large**: 12+ stories, consider breaking into multiple epics

## Output Format

Create a markdown document with this structure:

```markdown
# Epic: [Short Title - max 50 chars]

## Summary
[2-3 sentence business value description]

## User Story
As a [user type], I want [goal], so that [benefit].

## Goals
- [Goal 1]
- [Goal 2]
- [Goal 3]

## Requirements

### Functional Requirements
- [FR-1] [Requirement] (Priority: must-have)
- [FR-2] [Requirement] (Priority: should-have)
- [FR-3] [Requirement] (Priority: nice-to-have)

### Non-Functional Requirements
- [NFR-1] Performance: [Requirement]
- [NFR-2] Security: [Requirement]
- [NFR-3] Scalability: [Requirement]

## Acceptance Criteria
- [ ] Given [context], when [action], then [result]
- [ ] Given [context], when [action], then [result]
- [ ] Given [context], when [action], then [result]

## Technical Considerations
[Notes on architecture, patterns, integration points, existing code to leverage]

## Dependencies
- [External dependency 1]
- [Internal dependency 1]

## Risks
| Risk | Impact | Mitigation |
|------|--------|------------|
| [Risk description] | High/Medium/Low | [Mitigation strategy] |

## Estimated Complexity
[small/medium/large/extra-large] - [Brief justification]
```

## Example

**Input**: "Add dark mode to the application"

**Output**:
```markdown
# Epic: Dark Mode Theme Support

## Summary
Enable users to switch between light and dark color themes for improved accessibility and user preference. This reduces eye strain in low-light conditions and provides visual customization.

## User Story
As a user, I want to toggle between light and dark themes, so that I can use the app comfortably in different lighting conditions.

## Goals
- Provide a dark color scheme that matches brand guidelines
- Allow users to toggle theme preference
- Persist theme selection across sessions
- Support system-level theme preference detection

## Requirements

### Functional Requirements
- [FR-1] Toggle switch in settings to change theme (Priority: must-have)
- [FR-2] Theme preference persisted in user settings (Priority: must-have)
- [FR-3] Detect and apply system theme preference on first visit (Priority: should-have)
- [FR-4] Smooth transition animation between themes (Priority: nice-to-have)

### Non-Functional Requirements
- [NFR-1] Performance: Theme switch must complete in <100ms
- [NFR-2] Accessibility: Both themes must meet WCAG AA contrast requirements
- [NFR-3] Maintainability: Theme colors defined in single configuration file

## Acceptance Criteria
- [ ] Given I am on any page, when I toggle the theme switch, then the UI updates to the selected theme
- [ ] Given I have selected dark mode, when I close and reopen the app, then dark mode is still active
- [ ] Given my system is set to dark mode, when I visit for the first time, then the app uses dark mode

## Technical Considerations
- Use CSS custom properties for theme colors
- Store preference in localStorage and user profile (if authenticated)
- Consider prefers-color-scheme media query for system detection

## Dependencies
- Design team: Dark mode color palette
- Existing CSS architecture must support theming

## Risks
| Risk | Impact | Mitigation |
|------|--------|------------|
| Inconsistent contrast in dark mode | Medium | Design review of all components |
| Third-party components don't support theming | Low | Create wrapper components with overrides |

## Estimated Complexity
medium - Requires touching multiple components but pattern is well-established
```

## Best Practices

1. **Be specific**: Avoid vague requirements like "should be fast"
2. **Prioritize ruthlessly**: Not everything is must-have
3. **Think about edge cases**: What happens when things go wrong?
4. **Consider the user**: Write from user's perspective, not technical perspective
5. **Keep it scannable**: Use lists and tables, not walls of text
