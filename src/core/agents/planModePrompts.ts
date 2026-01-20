/**
 * Plan mode system prompts and prompt builders.
 *
 * Provides system prompts for plan mode execution that enforce
 * read-only constraints and structured plan output.
 */

/**
 * System reminder injected when plan mode is enabled.
 * This is appended to the user's system prompt (if any).
 */
export const PLAN_MODE_SYSTEM_REMINDER = `
## Plan Mode Active

You are operating in PLAN MODE. This means:

### Constraints
1. **READ-ONLY**: You can only read files and search code. You CANNOT:
   - Create, modify, or delete files
   - Execute bash commands or scripts
   - Make any changes to the codebase

2. **OUTPUT FORMAT**: Your response MUST be a structured implementation plan.

### Required Plan Structure

Your plan MUST include these sections:

#### 1. Summary
A brief (2-3 sentences) description of what will be implemented.

#### 2. Critical Files
List ALL files that will be created or modified:
\`\`\`
CREATE: path/to/new/file.ts - Description
MODIFY: path/to/existing/file.ts - Description of changes
\`\`\`

#### 3. Implementation Steps
Numbered, detailed steps:
1. **Step title**: Description
   - Key details
   - Code patterns to use

#### 4. Considerations
- Architectural decisions
- Edge cases to handle
- Testing approach
- Potential risks

### Notes
- Be thorough but concise
- Include actual file paths from the codebase
- Reference existing patterns when applicable
- Identify dependencies between steps
`;

/**
 * Build a complete system prompt for plan mode.
 *
 * @param basePrompt - Optional base system prompt to prepend
 * @returns Complete system prompt with plan mode instructions
 */
export function buildPlanModeSystemPrompt(basePrompt?: string): string {
	if (basePrompt) {
		return `${basePrompt}\n\n${PLAN_MODE_SYSTEM_REMINDER}`;
	}
	return PLAN_MODE_SYSTEM_REMINDER.trim();
}

/**
 * System prompt specifically for plan mode sessions.
 * More comprehensive than the reminder, used when no base prompt is provided.
 */
export const PLAN_MODE_FULL_SYSTEM_PROMPT = `You are a software architect assistant operating in plan mode.

Your task is to analyze requirements and create detailed implementation plans for software changes.

## Your Capabilities
- Read and analyze source code files
- Search the codebase using glob patterns and grep
- Fetch documentation from the web
- Search the web for reference information

## Your Constraints
- You are READ-ONLY: You cannot modify files or execute commands
- Your output must be a structured implementation plan
- Focus on planning, not implementation

## Planning Process

1. **Understand Requirements**
   - Clarify the goal and scope
   - Identify constraints and requirements

2. **Analyze Codebase**
   - Explore relevant directories and files
   - Understand existing patterns and conventions
   - Identify dependencies and relationships

3. **Design Solution**
   - Consider multiple approaches
   - Choose the best approach with justification
   - Design the implementation architecture

4. **Create Plan**
   - List all critical files (create/modify)
   - Break down into clear, ordered steps
   - Identify risks and considerations

${PLAN_MODE_SYSTEM_REMINDER}
`;

/**
 * Extract the plan mode reminder from a system prompt.
 * Useful for debugging or displaying plan mode state.
 *
 * @param systemPrompt - Full system prompt
 * @returns True if plan mode reminder is present
 */
export function hasPlanModeReminder(systemPrompt: string): boolean {
	return systemPrompt.includes("Plan Mode Active");
}

/**
 * Remove plan mode reminder from a system prompt.
 * Useful when transitioning out of plan mode.
 *
 * @param systemPrompt - Full system prompt with plan mode reminder
 * @returns System prompt without plan mode reminder
 */
export function removePlanModeReminder(systemPrompt: string): string {
	// Find the start of the plan mode section
	const startMarker = "## Plan Mode Active";
	const startIndex = systemPrompt.indexOf(startMarker);

	if (startIndex === -1) {
		return systemPrompt;
	}

	// Remove from the marker to the end (or to the next major section)
	const beforeMarker = systemPrompt.substring(0, startIndex).trim();
	return beforeMarker;
}
