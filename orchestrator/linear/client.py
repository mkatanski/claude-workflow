"""Linear API client wrapper."""

import os
from typing import Any, Dict, List, Optional

import httpx

from .queries import (
    COMMENT_CREATE_MUTATION,
    ISSUE_CREATE_MUTATION,
    ISSUE_DETAILS_QUERY,
    ISSUE_UPDATE_MUTATION,
    ISSUES_WITH_BLOCKERS_QUERY,
    TEAMS_QUERY,
    USERS_QUERY,
    WORKFLOW_STATES_QUERY,
)
from .types import IssueData, IssueFilters, LinearResponse


class LinearClientWrapper:
    """Wrapper around Linear GraphQL API.

    Provides methods for querying and mutating Linear issues
    with support for filtering, blocking detection, and CRUD operations.
    """

    API_URL = "https://api.linear.app/graphql"

    def __init__(self, api_key: Optional[str] = None) -> None:
        """Initialize Linear client.

        Args:
            api_key: Linear API key. Falls back to LINEAR_API_KEY env var.

        Raises:
            ValueError: If no API key is provided or found in environment.
        """
        self._api_key = api_key or os.environ.get("LINEAR_API_KEY")
        if not self._api_key:
            raise ValueError(
                "Linear API key required. Set LINEAR_API_KEY environment variable "
                "or pass api_key parameter."
            )

        # Cache for teams and users to avoid repeated lookups
        self._teams_cache: Optional[List[Dict[str, str]]] = None
        self._users_cache: Optional[List[Dict[str, str]]] = None
        self._states_cache: Dict[str, List[Dict[str, str]]] = {}

    def get_next_issue(
        self, filters: IssueFilters, skip_blocked: bool = True
    ) -> Optional[str]:
        """Get the next available issue identifier matching filters.

        Args:
            filters: Issue filter criteria
            skip_blocked: If True, skip issues blocked by unresolved blockers

        Returns:
            Issue identifier (e.g., "ENG-123") or None if no issues match
        """
        # Get team ID from name/key
        team_id = self._resolve_team_id(filters.team)
        if not team_id:
            return None

        # Build GraphQL filter
        gql_filter = self._build_issue_filter(filters, team_id)

        # Execute query with blocking relations
        result = self._execute_graphql(
            ISSUES_WITH_BLOCKERS_QUERY, {"filter": gql_filter, "first": 50}
        )

        if not result or "issues" not in result:
            return None

        issues = result.get("issues", {}).get("nodes", [])

        for issue in issues:
            if skip_blocked and self._is_blocked(issue):
                continue
            return issue.get("identifier")

        return None

    def get_issue(self, issue_id: str) -> LinearResponse:
        """Fetch full issue details by ID or identifier.

        Args:
            issue_id: Issue UUID or identifier (e.g., "ENG-123")

        Returns:
            LinearResponse with full issue data
        """
        try:
            result = self._execute_graphql(ISSUE_DETAILS_QUERY, {"id": issue_id})

            if result and "issue" in result and result["issue"]:
                return LinearResponse(success=True, data=result["issue"])

            return LinearResponse(success=False, error=f"Issue not found: {issue_id}")
        except Exception as e:
            return LinearResponse(success=False, error=str(e))

    def assign_issue(self, issue_id: str, assignee: str) -> LinearResponse:
        """Assign an issue to a user.

        Args:
            issue_id: Issue identifier
            assignee: User ID, email, or name

        Returns:
            LinearResponse with updated issue data
        """
        try:
            user_id = self._resolve_user_id(assignee)
            if not user_id:
                return LinearResponse(success=False, error=f"User not found: {assignee}")

            result = self._execute_graphql(
                ISSUE_UPDATE_MUTATION,
                {"id": issue_id, "input": {"assigneeId": user_id}},
            )

            if result and result.get("issueUpdate", {}).get("success"):
                return LinearResponse(
                    success=True, data=result["issueUpdate"]["issue"]
                )

            return LinearResponse(success=False, error="Failed to assign issue")
        except Exception as e:
            return LinearResponse(success=False, error=str(e))

    def create_issue(self, data: IssueData) -> LinearResponse:
        """Create a new issue.

        Args:
            data: Issue creation data

        Returns:
            LinearResponse with created issue data
        """
        try:
            if not data.title or not data.team:
                return LinearResponse(
                    success=False,
                    error="title and team are required for issue creation",
                )

            team_id = self._resolve_team_id(data.team)
            if not team_id:
                return LinearResponse(
                    success=False, error=f"Team not found: {data.team}"
                )

            input_data: Dict[str, Any] = {
                "title": data.title,
                "teamId": team_id,
            }

            if data.description:
                input_data["description"] = data.description

            if data.priority is not None:
                input_data["priority"] = data.priority

            if data.assignee:
                user_id = self._resolve_user_id(data.assignee)
                if user_id:
                    input_data["assigneeId"] = user_id

            if data.status:
                state_id = self._resolve_state_id(team_id, data.status)
                if state_id:
                    input_data["stateId"] = state_id

            if data.project:
                # Project resolution would need additional query
                # For now, skip project assignment
                pass

            if data.parent_id:
                input_data["parentId"] = data.parent_id

            result = self._execute_graphql(
                ISSUE_CREATE_MUTATION, {"input": input_data}
            )

            if result and result.get("issueCreate", {}).get("success"):
                return LinearResponse(
                    success=True, data=result["issueCreate"]["issue"]
                )

            return LinearResponse(success=False, error="Failed to create issue")
        except Exception as e:
            return LinearResponse(success=False, error=str(e))

    def update_issue(self, issue_id: str, data: IssueData) -> LinearResponse:
        """Update an existing issue.

        Args:
            issue_id: Issue identifier
            data: Fields to update

        Returns:
            LinearResponse with updated issue data
        """
        try:
            input_data: Dict[str, Any] = {}

            if data.title:
                input_data["title"] = data.title

            if data.description:
                input_data["description"] = data.description

            if data.priority is not None:
                input_data["priority"] = data.priority

            if data.assignee:
                user_id = self._resolve_user_id(data.assignee)
                if user_id:
                    input_data["assigneeId"] = user_id

            if data.status:
                # Need to get team ID from issue first
                issue_response = self.get_issue(issue_id)
                if issue_response.success and issue_response.data:
                    team_id = issue_response.data.get("team", {}).get("id")
                    if team_id:
                        state_id = self._resolve_state_id(team_id, data.status)
                        if state_id:
                            input_data["stateId"] = state_id

            if not input_data:
                return LinearResponse(success=False, error="No fields to update")

            result = self._execute_graphql(
                ISSUE_UPDATE_MUTATION, {"id": issue_id, "input": input_data}
            )

            if result and result.get("issueUpdate", {}).get("success"):
                return LinearResponse(
                    success=True, data=result["issueUpdate"]["issue"]
                )

            return LinearResponse(success=False, error="Failed to update issue")
        except Exception as e:
            return LinearResponse(success=False, error=str(e))

    def add_comment(self, issue_id: str, body: str) -> LinearResponse:
        """Add a comment to an issue.

        Args:
            issue_id: Issue identifier
            body: Comment body text

        Returns:
            LinearResponse with comment data
        """
        try:
            result = self._execute_graphql(
                COMMENT_CREATE_MUTATION, {"issueId": issue_id, "body": body}
            )

            if result and result.get("commentCreate", {}).get("success"):
                return LinearResponse(
                    success=True, data=result["commentCreate"]["comment"]
                )

            return LinearResponse(success=False, error="Failed to create comment")
        except Exception as e:
            return LinearResponse(success=False, error=str(e))

    # --- Private helper methods ---

    def _resolve_team_id(self, team: str) -> Optional[str]:
        """Resolve team name or key to ID."""
        if self._teams_cache is None:
            result = self._execute_graphql(TEAMS_QUERY, {})
            if result and "teams" in result:
                self._teams_cache = result["teams"].get("nodes", [])
            else:
                self._teams_cache = []

        team_lower = team.lower()
        for t in self._teams_cache:
            if (
                t.get("name", "").lower() == team_lower
                or t.get("key", "").lower() == team_lower
                or t.get("id") == team
            ):
                return t.get("id")

        return None

    def _resolve_user_id(self, user: str) -> Optional[str]:
        """Resolve user email or name to ID."""
        if self._users_cache is None:
            result = self._execute_graphql(USERS_QUERY, {})
            if result and "users" in result:
                self._users_cache = result["users"].get("nodes", [])
            else:
                self._users_cache = []

        user_lower = user.lower()
        for u in self._users_cache:
            if (
                u.get("email", "").lower() == user_lower
                or u.get("name", "").lower() == user_lower
                or u.get("id") == user
            ):
                return u.get("id")

        return None

    def _resolve_state_id(self, team_id: str, state_name: str) -> Optional[str]:
        """Resolve workflow state name to ID for a team."""
        if team_id not in self._states_cache:
            result = self._execute_graphql(WORKFLOW_STATES_QUERY, {"teamId": team_id})
            if result and "team" in result:
                self._states_cache[team_id] = (
                    result["team"].get("states", {}).get("nodes", [])
                )
            else:
                self._states_cache[team_id] = []

        state_lower = state_name.lower()
        for s in self._states_cache[team_id]:
            if s.get("name", "").lower() == state_lower or s.get("id") == state_name:
                return s.get("id")

        return None

    def _build_issue_filter(
        self, filters: IssueFilters, team_id: str
    ) -> Dict[str, Any]:
        """Build GraphQL filter from IssueFilters."""
        gql_filter: Dict[str, Any] = {"team": {"id": {"eq": team_id}}}

        if filters.priority is not None:
            gql_filter["priority"] = {"eq": filters.priority}

        if filters.status:
            state_id = self._resolve_state_id(team_id, filters.status)
            if state_id:
                gql_filter["state"] = {"id": {"eq": state_id}}

        if filters.project:
            gql_filter["project"] = {"name": {"eq": filters.project}}

        if filters.labels:
            # Match any of the provided labels
            gql_filter["labels"] = {"name": {"in": filters.labels}}

        if filters.assignee:
            user_id = self._resolve_user_id(filters.assignee)
            if user_id:
                gql_filter["assignee"] = {"id": {"eq": user_id}}

        if filters.custom_filter:
            gql_filter.update(filters.custom_filter)

        return gql_filter

    def _is_blocked(self, issue: Dict[str, Any]) -> bool:
        """Check if issue has unresolved blocking issues.

        An issue is considered blocked if it has a relation of type "blocks"
        where the related issue is not in a completed or canceled state.
        """
        relations = issue.get("relations", {}).get("nodes", [])

        for relation in relations:
            # "blocks" means THIS issue blocks another, we want "blocked_by"
            # In Linear's schema, if issue A blocks issue B,
            # A has relation type "blocks" to B
            # B has relation type "blocked" or similar to A
            # We check if this issue is blocked by looking for blocking relations
            if relation.get("type") in ("blocked", "is_blocked_by"):
                related = relation.get("relatedIssue", {})
                state_type = related.get("state", {}).get("type")
                # State types: backlog, unstarted, started, completed, canceled
                if state_type not in ("completed", "canceled"):
                    return True

        return False

    def _execute_graphql(
        self, query: str, variables: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Execute raw GraphQL query."""
        try:
            response = httpx.post(
                self.API_URL,
                headers={
                    "Authorization": self._api_key,
                    "Content-Type": "application/json",
                },
                json={"query": query, "variables": variables},
                timeout=30.0,
            )

            if response.status_code == 200:
                result = response.json()
                if "errors" in result:
                    error_msg = result["errors"][0].get("message", "Unknown error")
                    raise Exception(error_msg)
                return result.get("data")

            raise Exception(f"HTTP {response.status_code}: {response.text}")
        except httpx.RequestError as e:
            raise Exception(f"Request failed: {e}")
