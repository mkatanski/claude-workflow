/**
 * Type definitions for SPARC Story Generator workflow
 * Reference: .cw/docs/architecture/sparc-story-generator-workflow.md
 */

// ============================================================================
// SECTION 1: Input & Requirements (from Section 4.3)
// ============================================================================

/**
 * Business or technical requirement extracted from architectural document.
 * Reference: Section 4.3 State Schema
 */
export interface Requirement {
	/** Unique identifier for the requirement (e.g., "BR-1", "TR-3") */
	id: string;

	/** Brief title or summary of the requirement */
	title: string;

	/** Detailed description of the requirement */
	description: string;

	/** Type classification */
	type: "business" | "technical" | "functional" | "non-functional";

	/** Priority level */
	priority: "high" | "medium" | "low";

	/** Reference to source document section (e.g., "Section 3.2") */
	sourceReference?: string;
}

/**
 * System component identified during analysis.
 * Reference: Section 4.3 State Schema
 */
export interface Component {
	/** Unique identifier for the component */
	id: string;

	/** Component name */
	name: string;

	/** Description of component's responsibilities */
	responsibilities: string[];

	/** IDs of other components this component depends on */
	dependencies: string[];

	/** Technical layer (e.g., "infrastructure", "service", "ui") */
	layer?: string;

	/** Related requirement IDs */
	relatedRequirements: string[];
}

// ============================================================================
// SECTION 2: Story Structure (from Section 5.2)
// ============================================================================

/**
 * Phase grouping for stories in pass-based generation.
 * Reference: Section 5.1 Pass-Based Generation
 */
export type StoryPhase = "foundation" | "core" | "features" | "integration";

/**
 * Estimated effort for story implementation.
 * Reference: Section 5.2 Story Schema
 */
export type StoryEffort = "small" | "medium" | "large" | "xl";

/**
 * Story priority level.
 * Reference: Section 5.2 Story Schema
 */
export type StoryPriority = "high" | "medium" | "low";

/**
 * Individual implementation story following YAML schema.
 * Reference: Section 5.2 Story Schema
 */
export interface Story {
	/** Unique story identifier (e.g., "SBX-001") */
	id: string;

	/** Implementation phase */
	phase: StoryPhase;

	/** Concise story title */
	title: string;

	/** Detailed description of what needs to be implemented */
	description: string;

	/** Priority level for implementation order */
	priority: StoryPriority;

	/** Estimated implementation effort */
	estimatedEffort: StoryEffort;

	/** List of testable acceptance criteria (minimum 3 recommended) */
	acceptanceCriteria: string[];

	/** IDs of stories that must be completed before this one */
	dependencies: string[];

	/** Optional technical notes or implementation hints */
	technicalNotes?: string;

	/** Tags for categorization and filtering */
	tags: string[];

	/** Reference to source document section (e.g., "Section 5.1 Tool Server") */
	sourceRef?: string;
}

/**
 * Story with attached review feedback for rejection handling.
 * Reference: Section 4.3 State Schema
 */
export interface StoryWithFeedback extends Story {
	/** Detailed feedback from reviewer explaining issues */
	reviewFeedback: string;

	/** Primary reason for rejection */
	rejectionReason: string;
}

// ============================================================================
// SECTION 3: Dependency Graph (from Section 4.3)
// ============================================================================

/**
 * Graph structure representing dependencies between stories.
 * Reference: Section 4.3 State Schema
 */
export interface DependencyGraph {
	/** Map of story ID to array of story IDs it depends on */
	dependencies: Record<string, string[]>;

	/** Map of story ID to array of story IDs that depend on it */
	dependents: Record<string, string[]>;

	/** Stories with no dependencies (can be implemented first) */
	roots: string[];

	/** Stories with no dependents (final implementation steps) */
	leaves: string[];
}

// ============================================================================
// SECTION 4: Analysis Review (from Section 8.2)
// ============================================================================

/**
 * Type of gap identified during analysis review.
 * Reference: Section 8.2.2 Review Output
 */
export type AnalysisGapType =
	| "missing_requirement"
	| "misinterpretation"
	| "missing_component";

/**
 * Gap or issue identified in architectural analysis.
 * Reference: Section 8.2.2 Review Output
 */
export interface AnalysisGap {
	/** Type of gap identified */
	type: AnalysisGapType;

	/** Detailed description of the gap */
	description: string;

	/** Optional reference to source document section */
	sourceReference?: string;
}

/**
 * Result of AI agent review on architectural analysis.
 * Reference: Section 8.2.2 Review Output
 */
export interface AnalysisReviewResult {
	/** Whether the analysis is approved to proceed to story generation */
	approved: boolean;

	/** Confidence score from 0.0 to 1.0 */
	confidence: number;

	/** Overall feedback on the analysis quality */
	feedback: string;

	/** List of identified gaps or issues */
	gaps: AnalysisGap[];

	/** Suggestions for improvement */
	suggestions: string[];
}

// ============================================================================
// SECTION 5: Story Review (from Section 8.3)
// ============================================================================

/**
 * Type of issue identified during story review.
 * Reference: Section 8.3.2 Review Output
 */
export type StoryIssueType =
	| "clarity"
	| "scope"
	| "criteria"
	| "dependency"
	| "traceability";

/**
 * Severity level for story issues.
 * Reference: Section 8.3.2 Review Output
 */
export type StoryIssueSeverity = "blocking" | "warning";

/**
 * Individual issue identified in a story during review.
 * Reference: Section 8.3.2 Review Output
 */
export interface StoryIssue {
	/** Type of issue */
	type: StoryIssueType;

	/** Severity level (blocking prevents approval) */
	severity: StoryIssueSeverity;

	/** Detailed description of the issue */
	description: string;

	/** Optional suggestion for how to fix */
	suggestion?: string;
}

/**
 * Result of AI agent review on a single story.
 * Reference: Section 8.3.2 Review Output
 */
export interface StoryReviewResult {
	/** ID of the story being reviewed */
	storyId: string;

	/** Whether the story is approved */
	approved: boolean;

	/** Quality score from 0-100 */
	score: number;

	/** List of issues identified (empty if approved with no warnings) */
	issues: StoryIssue[];
}

/**
 * Result of batch story review.
 * Reference: Section 8.3.2 Review Output
 */
export interface BatchReviewResult {
	/** Total number of stories in the batch */
	totalStories: number;

	/** Number of stories approved */
	approved: number;

	/** Number of stories rejected */
	rejected: number;

	/** Individual review results for each story */
	results: StoryReviewResult[];
}

// ============================================================================
// SECTION 6: Execution Summary (from Section 9.2)
// ============================================================================

/**
 * Summary of workflow execution for reporting.
 * Reference: Section 9.2 Manifest Schema
 */
export interface ExecutionSummary {
	/** ISO 8601 timestamp of when execution completed */
	generatedAt: string;

	/** Path to input architectural document */
	inputDocument: string;

	/** Hash of input document for change detection */
	inputHash: string;

	/** Summary of each phase's output */
	phases: {
		/** Phase name (e.g., "foundation", "core") */
		name: string;

		/** Number of stories generated in this phase */
		storyCount: number;

		/** Path to output YAML file */
		outputFile: string;
	}[];

	/** Total number of stories generated across all phases */
	totalStories: number;

	/** Coverage score from 0-100 indicating requirement coverage */
	coverageScore: number;

	/** Total execution time in seconds */
	executionTime: number;

	/** AI model usage statistics */
	modelUsage: {
		/** Total input tokens consumed */
		inputTokens: number;

		/** Total output tokens generated */
		outputTokens: number;

		/** Estimated cost in USD */
		estimatedCostUsd: number;
	};
}

// ============================================================================
// SECTION 7: Main State Interface (from Section 4.3)
// ============================================================================

/**
 * Complete state schema for SPARC Story Generator workflow.
 * Reference: Section 4.3 State Schema
 */
export interface SPARCStoryGeneratorState {
	// ========== Input ==========

	/** Path to input architectural document */
	inputPath: string;

	/** Content of the architectural document */
	documentContent: string;

	// ========== Specification Phase Output ==========

	/** Structured analysis from Specification phase */
	analysis: {
		/** List of business requirements extracted */
		businessRequirements: Requirement[];

		/** List of technical requirements extracted */
		technicalRequirements: Requirement[];

		/** List of system components identified */
		components: Component[];

		/** List of constraints from the document */
		constraints: string[];

		/** List of assumptions made during analysis */
		assumptions: string[];
	};

	// ========== Architecture Phase Output ==========

	/** Story generation plan from Architecture phase */
	storyPlan: {
		/** List of story phases (foundation, core, features, integration) */
		phases: StoryPhase[];

		/** Estimated total number of stories to generate */
		totalEstimatedStories: number;

		/** Dependency graph structure */
		dependencies: DependencyGraph;
	};

	// ========== Analysis Review (AI Agent) ==========

	/** Result of analysis review by secondary AI agent */
	analysisReview: {
		/** Whether analysis was approved */
		approved: boolean;

		/** Feedback from reviewer */
		feedback: string;

		/** List of identified gaps */
		gaps: string[];

		/** List of improvement suggestions */
		suggestions: string[];

		/** Model used for review (e.g., "sonnet", "opus") */
		reviewerModel: string;

		/** Number of review attempts made */
		attempts: number;

		/** Confidence score from 0.0 to 1.0 */
		confidence: number;
	};

	// ========== Refinement Phase ==========

	/** Current pass number in refinement loop */
	currentPass: number;

	/** Total number of passes planned */
	totalPasses: number;

	/** All stories generated so far */
	generatedStories: Story[];

	// ========== Story Review (AI Agent) ==========

	/** State tracking for story review process */
	storyReview: {
		/** Stories in current batch being reviewed */
		currentBatch: Story[];

		/** Stories that passed review */
		approvedStories: Story[];

		/** Stories that failed review with feedback */
		rejectedStories: StoryWithFeedback[];

		/** Number of regeneration attempts for rejected stories */
		regenerationAttempts: number;
	};

	// ========== Completion ==========

	/** Path where output files will be written */
	outputPath: string;

	/** Whether workflow has completed successfully */
	completed: boolean;

	/** Execution summary and statistics */
	summary: ExecutionSummary;
}

// ============================================================================
// SECTION 8: Configuration (from Section 11.1)
// ============================================================================

/**
 * Configuration options for the SPARC Story Generator workflow.
 * Reference: Section 11.1 Workflow Configuration
 */
export interface StoryGeneratorConfig {
	/** Input document configuration */
	input: {
		/** Maximum tokens allowed in input document */
		maxDocumentTokens: number;

		/** Supported file formats (e.g., [".md", ".txt"]) */
		supportedFormats: string[];
	};

	/** Story generation parameters */
	generation: {
		/** Number of stories to generate per batch */
		batchSize: number;

		/** Maximum number of passes allowed */
		maxPasses: number;

		/** Minimum stories required per phase */
		minStoriesPerPhase: number;
	};

	/** Model selection for each phase */
	models: {
		// Generation models
		/** Model for Specification phase (e.g., "opus") */
		specification: string;

		/** Model for Pseudocode phase (e.g., "sonnet") */
		pseudocode: string;

		/** Model for Architecture phase (e.g., "opus") */
		architecture: string;

		/** Model for Refinement phase (e.g., "sonnet") */
		refinement: string;

		/** Model for Completion phase (e.g., "sonnet") */
		completion: string;

		// Review models (secondary AI agents)
		/** Model for analysis review (e.g., "sonnet") */
		analysisReviewer: string;

		/** Model for story review (e.g., "sonnet") */
		storyReviewer: string;
	};

	/** Output configuration */
	output: {
		/** Directory for output files */
		directory: string;

		/** Output format (currently only "yaml") */
		format: "yaml";
	};

	/** Review system configuration */
	review: {
		/** Analysis review settings */
		analysisReview: {
			/** Whether analysis review is enabled */
			enabled: boolean;

			/** Maximum refinement attempts before escalation */
			maxAttempts: number;

			/** Minimum confidence score (0.0-1.0) to approve */
			confidenceThreshold: number;
		};

		/** Story review settings */
		storyReview: {
			/** Whether story review is enabled */
			enabled: boolean;

			/** Maximum regeneration attempts per rejected story */
			maxRegenerationAttempts: number;

			/** Minimum score (0-100) required for approval */
			minScoreToApprove: number;

			/** Whether to continue if some stories fail */
			allowPartialBatch: boolean;
		};
	};
}

// ============================================================================
// SECTION 9: Phase-Specific Output Types
// ============================================================================

/**
 * Output from Specification phase (S in SPARC).
 * Reference: Section 6.1 Specification Phase Prompt
 */
export interface SpecificationOutput {
	businessRequirements: Requirement[];
	technicalRequirements: Requirement[];
	components: Component[];
	constraints: string[];
	assumptions: string[];
}

/**
 * Output from Pseudocode phase (P in SPARC).
 * Reference: Section 6.2 Pseudocode Phase Prompt
 */
export interface PseudocodeOutput {
	/** Proposed pass structure */
	passStructure: {
		/** Pass name/phase */
		phase: StoryPhase;

		/** Focus area for this pass */
		focus: string;

		/** Estimated story count */
		estimatedStories: number;
	}[];

	/** Guidelines for story granularity */
	granularityGuidelines: string[];

	/** Natural groupings identified */
	storyGroupings: string[];
}

/**
 * Output from Architecture phase (A in SPARC).
 * Reference: Section 6.3 Architecture Phase Prompt
 */
export interface ArchitectureOutput {
	/** Story phases with clear boundaries */
	phases: StoryPhase[];

	/** Requirements mapped to phases */
	requirementMapping: Record<string, StoryPhase[]>;

	/** Cross-cutting concerns identified */
	crossCuttingConcerns: string[];

	/** Dependency graph outline */
	dependencyGraph: DependencyGraph;

	/** Confidence assessment (0.0-1.0) */
	confidence: number;
}

/**
 * Output from Completion phase (C in SPARC).
 * Reference: Section 6.5 Completion Phase Prompt
 */
export interface CompletionOutput {
	/** Requirements covered by generated stories */
	coverageReport: {
		/** Requirement ID */
		requirementId: string;

		/** Whether requirement is covered */
		covered: boolean;

		/** Story IDs that cover this requirement */
		coveredByStories: string[];
	}[];

	/** Orphaned dependencies (if any) */
	orphanedDependencies: string[];

	/** Identified gaps in coverage */
	gaps: string[];

	/** Suggested missing stories */
	missingSuggestions: Story[];

	/** Overall completion confidence score (0-100) */
	completionConfidence: number;
}
