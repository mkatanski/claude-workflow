/**
 * Condition evaluation for conditional step execution.
 */

import type { ExecutionContext } from "../context/execution.ts";
import type { ConditionResult } from "../../types/index.ts";

/**
 * Error thrown when condition evaluation fails.
 */
export class ConditionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ConditionError";
	}
}

/**
 * Operators in order of matching (longer operators first to avoid partial matches).
 */
const OPERATORS = [
	"is not empty",
	"is empty",
	"not contains",
	"contains",
	"starts with",
	"ends with",
	">=",
	"<=",
	"!=",
	"==",
	">",
	"<",
];

/**
 * Build operator pattern from operators list.
 */
const OPERATOR_PATTERN = OPERATORS.map((op) =>
	op.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
).join("|");

/**
 * Pattern to extract variable reference like {var_name} or {var.field.nested}
 */
const VAR_PATTERN = /^\{([\w_][\w\d_]*(?:\.[\w\d_]+)*)\}$/;

/**
 * Pattern for simple conditions: {var} operator value
 */
const SIMPLE_PATTERN = new RegExp(
	`^\\s*(.+?)\\s+(${OPERATOR_PATTERN})\\s*(.*?)\\s*$`,
	"i",
);

/**
 * Pattern for compound conditions (and/or)
 */
const COMPOUND_PATTERN = /\s+(and|or)\s+/i;

/**
 * Evaluates condition expressions safely using regex-based parsing.
 */
export class ConditionEvaluator {
	private context: ExecutionContext;

	constructor(context: ExecutionContext) {
		this.context = context;
	}

	/**
	 * Evaluate a condition expression.
	 */
	evaluate(condition: string): ConditionResult {
		if (!condition || !condition.trim()) {
			return { satisfied: true, reason: "No condition specified" };
		}

		// Check for compound conditions (and/or)
		if (COMPOUND_PATTERN.test(condition)) {
			return this.evaluateCompound(condition);
		}

		return this.evaluateSimple(condition);
	}

	/**
	 * Evaluate a simple condition (no and/or).
	 */
	private evaluateSimple(condition: string): ConditionResult {
		const match = SIMPLE_PATTERN.exec(condition);
		if (!match) {
			throw new ConditionError(
				`Invalid condition syntax: '${condition}'. ` +
					"Expected format: '{var} operator value' or '{var} is empty'",
			);
		}

		const [, leftRaw, operatorStr, rightRaw] = match;
		const operator = operatorStr.toLowerCase().trim();

		// Resolve left side - check if it's a variable reference
		const leftValue = this.resolveValue(leftRaw.trim());

		// Resolve right side (may also contain variables)
		const rightValue = this.resolveValue((rightRaw ?? "").trim());

		return this.compare(leftValue, operator, rightValue);
	}

	/**
	 * Resolve a value, interpolating any variable references.
	 */
	private resolveValue(value: string): string {
		// Strip quotes first
		let stripped = this.stripQuotes(value);

		// Check if this is a variable reference like {var_name} or {var.field.nested}
		const varMatch = VAR_PATTERN.exec(stripped);
		if (varMatch) {
			// Use interpolate which handles both simple vars and dot notation
			const result = this.context.interpolate(stripped);
			// If interpolation returned the original placeholder, treat as empty
			if (result === stripped) {
				return "";
			}
			return result;
		}

		// Otherwise interpolate any embedded variables
		return this.context.interpolate(stripped);
	}

	/**
	 * Remove surrounding quotes from a value.
	 */
	private stripQuotes(value: string): string {
		if (value.length >= 2) {
			if (
				(value.startsWith("'") && value.endsWith("'")) ||
				(value.startsWith('"') && value.endsWith('"'))
			) {
				return value.slice(1, -1);
			}
		}
		return value;
	}

	/**
	 * Perform the actual comparison.
	 */
	private compare(
		left: string,
		operator: string,
		right: string,
	): ConditionResult {
		// Unary operators (is empty, is not empty)
		if (operator === "is empty") {
			const result = !left || left.trim() === "";
			return {
				satisfied: result,
				reason: `value is ${result ? "empty" : "not empty"}`,
			};
		}

		if (operator === "is not empty") {
			const result = Boolean(left && left.trim());
			return {
				satisfied: result,
				reason: `value is ${result ? "not empty" : "empty"}`,
			};
		}

		// String operators
		if (operator === "contains") {
			const result = left.toLowerCase().includes(right.toLowerCase());
			return {
				satisfied: result,
				reason: `${result ? "contains" : "does not contain"} '${right}'`,
			};
		}

		if (operator === "not contains") {
			const result = !left.toLowerCase().includes(right.toLowerCase());
			return {
				satisfied: result,
				reason: `${result ? "does not contain" : "contains"} '${right}'`,
			};
		}

		if (operator === "starts with") {
			const result = left.toLowerCase().startsWith(right.toLowerCase());
			return {
				satisfied: result,
				reason: `${result ? "starts with" : "does not start with"} '${right}'`,
			};
		}

		if (operator === "ends with") {
			const result = left.toLowerCase().endsWith(right.toLowerCase());
			return {
				satisfied: result,
				reason: `${result ? "ends with" : "does not end with"} '${right}'`,
			};
		}

		// Try numeric comparison first
		const leftNum = this.tryNumeric(left);
		const rightNum = this.tryNumeric(right);

		if (leftNum !== null && rightNum !== null) {
			return this.numericCompare(leftNum, operator, rightNum);
		}

		// Fall back to string comparison
		return this.stringCompare(left, operator, right);
	}

	/**
	 * Try to convert string to number.
	 */
	private tryNumeric(value: string): number | null {
		if (value === "") {
			return null;
		}
		const num = Number(value);
		return Number.isNaN(num) ? null : num;
	}

	/**
	 * Compare numeric values.
	 */
	private numericCompare(
		left: number,
		operator: string,
		right: number,
	): ConditionResult {
		const ops: Record<string, boolean> = {
			"==": left === right,
			"!=": left !== right,
			">": left > right,
			">=": left >= right,
			"<": left < right,
			"<=": left <= right,
		};

		if (!(operator in ops)) {
			throw new ConditionError(
				`Unsupported operator for numeric comparison: ${operator}`,
			);
		}

		const result = ops[operator];
		return {
			satisfied: result,
			reason: `${left} ${operator} ${right}`,
		};
	}

	/**
	 * Compare string values.
	 */
	private stringCompare(
		left: string,
		operator: string,
		right: string,
	): ConditionResult {
		let result: boolean;
		if (operator === "==") {
			result = left === right;
		} else if (operator === "!=") {
			result = left !== right;
		} else {
			throw new ConditionError(
				`Operator '${operator}' not supported for string comparison. ` +
					"Use '==' or '!=' for strings, or numeric operators for numbers.",
			);
		}

		return {
			satisfied: result,
			reason: `'${left}' ${operator} '${right}'`,
		};
	}

	/**
	 * Evaluate compound conditions with and/or.
	 */
	private evaluateCompound(condition: string): ConditionResult {
		// Split by 'and' and 'or' while preserving the operator
		const parts = condition.split(COMPOUND_PATTERN);

		if (parts.length < 3) {
			throw new ConditionError(`Invalid compound condition: ${condition}`);
		}

		// Evaluate first condition
		let currentResult = this.evaluateSimple(parts[0]);
		const reasons = [currentResult.reason];

		let i = 1;
		while (i < parts.length) {
			const logicalOp = parts[i].toLowerCase();
			const nextCondition = parts[i + 1];
			const nextResult = this.evaluateSimple(nextCondition);
			reasons.push(nextResult.reason);

			if (logicalOp === "and") {
				currentResult = {
					satisfied: currentResult.satisfied && nextResult.satisfied,
					reason: reasons.join(" AND "),
				};
			} else if (logicalOp === "or") {
				currentResult = {
					satisfied: currentResult.satisfied || nextResult.satisfied,
					reason: reasons.join(" OR "),
				};
			}

			i += 2;
		}

		return currentResult;
	}
}
