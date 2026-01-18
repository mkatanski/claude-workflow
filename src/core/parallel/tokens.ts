/**
 * Token counting and cost estimation utilities for Claude models.
 *
 * This module provides pricing constants and cost estimation functions
 * for tracking and budgeting Claude API usage across parallel sessions.
 */

import type { TokenUsage } from "./claudeTypes.ts";

// =============================================================================
// Model Pricing
// =============================================================================

/**
 * Pricing structure for a Claude model (per 1K tokens).
 */
export interface ModelPricing {
	/** Cost per 1,000 input tokens in USD */
	readonly input: number;
	/** Cost per 1,000 output tokens in USD */
	readonly output: number;
}

/**
 * Pricing for Claude models per 1,000 tokens.
 *
 * Prices are in USD. Updated to latest model versions.
 *
 * @see https://www.anthropic.com/pricing
 */
export const MODEL_PRICING: Readonly<Record<string, ModelPricing>> = {
	// Claude 4 models (latest)
	"claude-sonnet-4-20250514": { input: 0.003, output: 0.015 },
	"claude-opus-4-20250514": { input: 0.015, output: 0.075 },
	"claude-haiku-4-20250514": { input: 0.00025, output: 0.00125 },

	// Legacy aliases (map to Claude 4 pricing)
	sonnet: { input: 0.003, output: 0.015 },
	opus: { input: 0.015, output: 0.075 },
	haiku: { input: 0.00025, output: 0.00125 },
};

/**
 * Default model to use for cost estimation when model is unknown.
 */
export const DEFAULT_PRICING_MODEL = "claude-sonnet-4-20250514";

// =============================================================================
// Cost Estimation
// =============================================================================

/**
 * Estimate the cost in USD for given token usage and model.
 *
 * If the model is not found in MODEL_PRICING, falls back to
 * claude-sonnet-4-20250514 pricing as a sensible default.
 *
 * @param tokens - Token usage with input, output, and total counts
 * @param model - Model identifier (full ID or alias)
 * @returns Estimated cost in USD
 *
 * @example
 * ```typescript
 * const tokens: TokenUsage = { input: 1000, output: 500, total: 1500 };
 * const cost = estimateCost(tokens, "claude-sonnet-4-20250514");
 * // cost = (1000/1000) * 0.003 + (500/1000) * 0.015 = 0.003 + 0.0075 = 0.0105
 * ```
 */
export function estimateCost(tokens: TokenUsage, model: string): number {
	const pricing = MODEL_PRICING[model] ?? MODEL_PRICING[DEFAULT_PRICING_MODEL];

	const inputCost = (tokens.input / 1000) * pricing.input;
	const outputCost = (tokens.output / 1000) * pricing.output;

	return inputCost + outputCost;
}

/**
 * Get the pricing for a specific model.
 *
 * Returns the default pricing if the model is not found.
 *
 * @param model - Model identifier (full ID or alias)
 * @returns Pricing structure with input and output costs per 1K tokens
 */
export function getModelPricing(model: string): ModelPricing {
	return MODEL_PRICING[model] ?? MODEL_PRICING[DEFAULT_PRICING_MODEL];
}

/**
 * Check if a model has known pricing.
 *
 * @param model - Model identifier to check
 * @returns True if the model has pricing defined
 */
export function hasKnownPricing(model: string): boolean {
	return model in MODEL_PRICING;
}

/**
 * Estimate cost for multiple token usages with potentially different models.
 *
 * Useful for calculating total cost across parallel sessions using
 * different model configurations.
 *
 * @param sessions - Array of token usage and model pairs
 * @returns Total estimated cost in USD
 *
 * @example
 * ```typescript
 * const sessions = [
 *   { tokens: { input: 1000, output: 500, total: 1500 }, model: "sonnet" },
 *   { tokens: { input: 2000, output: 1000, total: 3000 }, model: "haiku" },
 * ];
 * const totalCost = estimateTotalCost(sessions);
 * ```
 */
export function estimateTotalCost(
	sessions: ReadonlyArray<{ tokens: TokenUsage; model: string }>,
): number {
	return sessions.reduce((total, session) => {
		return total + estimateCost(session.tokens, session.model);
	}, 0);
}
