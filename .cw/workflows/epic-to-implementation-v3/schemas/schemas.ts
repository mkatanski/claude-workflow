/**
 * Schemas for Claude SDK Structured Outputs
 *
 * JSON Schema definitions for extracting structured data from Claude responses.
 * Used with tools.claudeSdk() for type-safe structured outputs.
 */

/**
 * Schema for scope analysis result.
 */
export const scopeAnalysisSchema = {
	type: "object",
	properties: {
		needsMilestones: {
			type: "boolean",
			description: "Whether the epic needs to be split into milestones",
		},
		estimatedStoryCount: {
			type: "number",
			description: "Estimated number of implementation stories",
		},
		complexityScore: {
			type: "number",
			description: "Complexity score from 1-10",
		},
		reasoning: {
			type: "string",
			description: "Explanation for the scope assessment",
		},
	},
	required: ["needsMilestones", "estimatedStoryCount", "complexityScore"],
} as const;

/**
 * Schema for epic title extraction.
 */
export const epicTitleSchema = {
	type: "object",
	properties: {
		title: {
			type: "string",
			description: "A concise title for the epic (max 50 chars)",
		},
		description: {
			type: "string",
			description: "A brief one-line description of the epic",
		},
	},
	required: ["title"],
} as const;

/**
 * Schema for drift check result.
 */
export const driftCheckSchema = {
	type: "object",
	properties: {
		aligned: {
			type: "boolean",
			description: "Whether implementation aligns with architecture",
		},
		issues: {
			type: "array",
			items: {
				type: "object",
				properties: {
					category: {
						type: "string",
						enum: ["keep", "fix", "defer", "remove"],
						description:
							"Category of the drift issue: keep=improvement to preserve, fix=violation to correct, defer=future work, remove=unnecessary code",
					},
					description: {
						type: "string",
						description: "Description of the drift issue",
					},
					file: {
						type: "string",
						description: "File path if applicable",
					},
					recommendation: {
						type: "string",
						description: "Recommended action to take",
					},
				},
				required: ["category", "description", "recommendation"],
			},
			description: "List of drift issues found",
		},
	},
	required: ["aligned", "issues"],
} as const;

/**
 * Schema for test result evaluation.
 */
export const testResultSchema = {
	type: "object",
	properties: {
		passed: {
			type: "boolean",
			description: "Whether all tests passed",
		},
		failureCount: {
			type: "number",
			description: "Number of failing tests",
		},
		errorSummary: {
			type: "string",
			description: "Brief summary of failures if any",
		},
	},
	required: ["passed"],
} as const;

/**
 * Schema for commit message generation.
 */
export const commitMessageSchema = {
	type: "object",
	properties: {
		subject: {
			type: "string",
			description:
				"Commit subject line (max 72 chars), using conventional commit format",
		},
		body: {
			type: "string",
			description: "Optional commit body with more details",
		},
	},
	required: ["subject"],
} as const;

/**
 * Schema for milestone summary generation.
 */
export const milestoneSummarySchema = {
	type: "object",
	properties: {
		summary: {
			type: "string",
			description: "Summary of what was implemented in this milestone",
		},
		keyChanges: {
			type: "array",
			items: { type: "string" },
			description: "List of key changes made",
		},
		lessonsLearned: {
			type: "array",
			items: { type: "string" },
			description: "Lessons learned during implementation",
		},
	},
	required: ["summary", "keyChanges"],
} as const;

/**
 * Schema for story JSON parsing.
 */
export const storiesJsonSchema = {
	type: "object",
	properties: {
		stories: {
			type: "array",
			items: {
				type: "object",
				properties: {
					id: { type: "string" },
					title: { type: "string" },
					description: { type: "string" },
					priority: { type: "number" },
					dependencies: {
						type: "array",
						items: { type: "string" },
					},
					acceptanceCriteria: {
						type: "array",
						items: { type: "string" },
					},
					implementationHints: {
						type: "array",
						items: { type: "string" },
					},
					estimatedEffort: {
						type: "string",
						enum: ["small", "medium", "large"],
					},
				},
				required: [
					"id",
					"title",
					"description",
					"priority",
					"dependencies",
					"acceptanceCriteria",
				],
			},
		},
	},
	required: ["stories"],
} as const;

/**
 * Schema for milestones JSON parsing.
 */
export const milestonesJsonSchema = {
	type: "object",
	properties: {
		milestones: {
			type: "array",
			items: {
				type: "object",
				properties: {
					id: { type: "string" },
					title: { type: "string" },
					description: { type: "string" },
					goals: {
						type: "array",
						items: { type: "string" },
					},
					phase: {
						type: "string",
						enum: ["foundation", "core", "features", "integration"],
					},
					storyCount: { type: "number" },
				},
				required: ["id", "title", "description", "goals", "phase", "storyCount"],
			},
		},
	},
	required: ["milestones"],
} as const;

/**
 * Schema for new dependencies detection.
 */
export const newDependenciesSchema = {
	type: "object",
	properties: {
		hasNewDependencies: {
			type: "boolean",
			description: "Whether new dependencies were added",
		},
		newDependencies: {
			type: "array",
			items: {
				type: "object",
				properties: {
					name: { type: "string" },
					version: { type: "string" },
					type: {
						type: "string",
						enum: ["production", "development"],
					},
				},
				required: ["name"],
			},
			description: "List of newly added dependencies",
		},
	},
	required: ["hasNewDependencies"],
} as const;
