"""Comprehensive unit tests for Linear API client wrapper.

This module provides extensive test coverage for the LinearClientWrapper class,
including all public methods, caching behavior, error handling, and edge cases.
"""

import os
from typing import Dict, List, Optional
from unittest.mock import MagicMock, patch

import httpx
import pytest

from orchestrator.linear.client import LinearClientWrapper
from orchestrator.linear.types import IssueData, IssueFilters, LinearResponse


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def mock_api_key() -> str:
    """Provide a mock API key for testing."""
    return "lin_api_test_key_12345"


@pytest.fixture
def client(mock_api_key: str) -> LinearClientWrapper:
    """Create a LinearClientWrapper instance with a mock API key."""
    return LinearClientWrapper(api_key=mock_api_key)


@pytest.fixture
def mock_teams_response() -> Dict:
    """Provide a mock teams query response."""
    return {
        "data": {
            "teams": {
                "nodes": [
                    {"id": "team-id-1", "name": "Engineering", "key": "ENG"},
                    {"id": "team-id-2", "name": "Design", "key": "DES"},
                    {"id": "team-id-3", "name": "Product", "key": "PROD"},
                ]
            }
        }
    }


@pytest.fixture
def mock_users_response() -> Dict:
    """Provide a mock users query response."""
    return {
        "data": {
            "users": {
                "nodes": [
                    {
                        "id": "user-id-1",
                        "name": "John Doe",
                        "email": "john@example.com",
                    },
                    {
                        "id": "user-id-2",
                        "name": "Jane Smith",
                        "email": "jane@example.com",
                    },
                    {
                        "id": "user-id-3",
                        "name": "Bob Wilson",
                        "email": "bob@example.com",
                    },
                ]
            }
        }
    }


@pytest.fixture
def mock_states_response() -> Dict:
    """Provide a mock workflow states query response."""
    return {
        "data": {
            "team": {
                "states": {
                    "nodes": [
                        {"id": "state-backlog", "name": "Backlog", "type": "backlog"},
                        {"id": "state-todo", "name": "Todo", "type": "unstarted"},
                        {
                            "id": "state-in-progress",
                            "name": "In Progress",
                            "type": "started",
                        },
                        {"id": "state-done", "name": "Done", "type": "completed"},
                        {
                            "id": "state-canceled",
                            "name": "Canceled",
                            "type": "canceled",
                        },
                    ]
                }
            }
        }
    }


@pytest.fixture
def mock_issue_response() -> Dict:
    """Provide a mock single issue query response."""
    return {
        "data": {
            "issue": {
                "id": "issue-id-123",
                "identifier": "ENG-123",
                "title": "Test Issue",
                "description": "Test description",
                "priority": 2,
                "priorityLabel": "High",
                "state": {
                    "id": "state-todo",
                    "name": "Todo",
                    "type": "unstarted",
                    "color": "#5e6ad2",
                },
                "team": {"id": "team-id-1", "key": "ENG", "name": "Engineering"},
                "assignee": {
                    "id": "user-id-1",
                    "name": "John Doe",
                    "email": "john@example.com",
                },
                "labels": {"nodes": [{"id": "label-1", "name": "bug", "color": "#ff0000"}]},
            }
        }
    }


@pytest.fixture
def mock_issues_with_blockers_response() -> Dict:
    """Provide a mock issues with blockers query response."""
    return {
        "data": {
            "issues": {
                "nodes": [
                    {
                        "id": "issue-1",
                        "identifier": "ENG-101",
                        "title": "First Issue",
                        "priority": 1,
                        "state": {"id": "state-todo", "name": "Todo", "type": "unstarted"},
                        "relations": {"nodes": []},
                    },
                    {
                        "id": "issue-2",
                        "identifier": "ENG-102",
                        "title": "Second Issue (blocked)",
                        "priority": 2,
                        "state": {"id": "state-todo", "name": "Todo", "type": "unstarted"},
                        "relations": {
                            "nodes": [
                                {
                                    "type": "blocked",
                                    "relatedIssue": {
                                        "id": "blocker-1",
                                        "identifier": "ENG-100",
                                        "state": {"type": "started"},
                                    },
                                }
                            ]
                        },
                    },
                    {
                        "id": "issue-3",
                        "identifier": "ENG-103",
                        "title": "Third Issue",
                        "priority": 3,
                        "state": {"id": "state-todo", "name": "Todo", "type": "unstarted"},
                        "relations": {"nodes": []},
                    },
                ],
                "pageInfo": {"hasNextPage": False, "endCursor": None},
            }
        }
    }


# =============================================================================
# Initialization Tests
# =============================================================================


class TestLinearClientWrapperInit:
    """Tests for LinearClientWrapper initialization."""

    def test_init_with_explicit_api_key_succeeds(self, mock_api_key: str) -> None:
        """Test that initialization succeeds with an explicit API key."""
        client = LinearClientWrapper(api_key=mock_api_key)
        assert client._api_key == mock_api_key

    def test_init_with_env_var_api_key_succeeds(self, mock_api_key: str) -> None:
        """Test that initialization succeeds with API key from environment variable."""
        with patch.dict(os.environ, {"LINEAR_API_KEY": mock_api_key}):
            client = LinearClientWrapper()
            assert client._api_key == mock_api_key

    def test_init_without_api_key_raises_value_error(self) -> None:
        """Test that initialization without API key raises ValueError."""
        with patch.dict(os.environ, {}, clear=True):
            # Ensure LINEAR_API_KEY is not set
            if "LINEAR_API_KEY" in os.environ:
                del os.environ["LINEAR_API_KEY"]
            with pytest.raises(ValueError) as exc_info:
                LinearClientWrapper()
            assert "Linear API key required" in str(exc_info.value)

    def test_init_explicit_key_overrides_env_var(self, mock_api_key: str) -> None:
        """Test that explicit API key takes precedence over environment variable."""
        env_key = "lin_api_from_env"
        with patch.dict(os.environ, {"LINEAR_API_KEY": env_key}):
            client = LinearClientWrapper(api_key=mock_api_key)
            assert client._api_key == mock_api_key

    def test_init_caches_are_empty(self, client: LinearClientWrapper) -> None:
        """Test that caches are initialized as empty."""
        assert client._teams_cache is None
        assert client._users_cache is None
        assert client._states_cache == {}


# =============================================================================
# GraphQL Execution Tests
# =============================================================================


class TestExecuteGraphQL:
    """Tests for _execute_graphql method."""

    def test_execute_graphql_success_returns_data(
        self, client: LinearClientWrapper, mock_api_key: str
    ) -> None:
        """Test successful GraphQL execution returns data."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"data": {"test": "value"}}

        with patch.object(httpx, "post", return_value=mock_response) as mock_post:
            result = client._execute_graphql("query { test }", {})

            assert result == {"test": "value"}
            mock_post.assert_called_once()
            call_kwargs = mock_post.call_args.kwargs
            assert call_kwargs["headers"]["Authorization"] == mock_api_key
            assert call_kwargs["headers"]["Content-Type"] == "application/json"

    def test_execute_graphql_with_variables_sends_correct_payload(
        self, client: LinearClientWrapper
    ) -> None:
        """Test that variables are correctly included in the request payload."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"data": {"result": "success"}}

        variables = {"teamId": "team-123", "filter": {"priority": {"eq": 1}}}

        with patch.object(httpx, "post", return_value=mock_response) as mock_post:
            client._execute_graphql("query Test($teamId: String!) { test }", variables)

            call_kwargs = mock_post.call_args.kwargs
            assert call_kwargs["json"]["variables"] == variables

    def test_execute_graphql_http_error_raises_exception(
        self, client: LinearClientWrapper
    ) -> None:
        """Test that HTTP errors raise an exception with status code and body."""
        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_response.text = "Unauthorized"

        with patch.object(httpx, "post", return_value=mock_response):
            with pytest.raises(Exception) as exc_info:
                client._execute_graphql("query { test }", {})

            assert "HTTP 401" in str(exc_info.value)
            assert "Unauthorized" in str(exc_info.value)

    def test_execute_graphql_graphql_errors_raises_exception(
        self, client: LinearClientWrapper
    ) -> None:
        """Test that GraphQL errors in response raise an exception."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "errors": [{"message": "Field 'nonexistent' not found"}]
        }

        with patch.object(httpx, "post", return_value=mock_response):
            with pytest.raises(Exception) as exc_info:
                client._execute_graphql("query { nonexistent }", {})

            assert "Field 'nonexistent' not found" in str(exc_info.value)

    def test_execute_graphql_request_error_raises_exception(
        self, client: LinearClientWrapper
    ) -> None:
        """Test that network request errors raise an exception."""
        with patch.object(
            httpx, "post", side_effect=httpx.RequestError("Connection failed")
        ):
            with pytest.raises(Exception) as exc_info:
                client._execute_graphql("query { test }", {})

            assert "Request failed" in str(exc_info.value)

    def test_execute_graphql_uses_correct_api_url(
        self, client: LinearClientWrapper
    ) -> None:
        """Test that the correct Linear API URL is used."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"data": {}}

        with patch.object(httpx, "post", return_value=mock_response) as mock_post:
            client._execute_graphql("query { test }", {})

            assert mock_post.call_args.args[0] == "https://api.linear.app/graphql"

    def test_execute_graphql_uses_30_second_timeout(
        self, client: LinearClientWrapper
    ) -> None:
        """Test that requests use a 30 second timeout."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"data": {}}

        with patch.object(httpx, "post", return_value=mock_response) as mock_post:
            client._execute_graphql("query { test }", {})

            call_kwargs = mock_post.call_args.kwargs
            assert call_kwargs["timeout"] == 30.0


# =============================================================================
# Team Resolution Tests
# =============================================================================


class TestResolveTeamId:
    """Tests for _resolve_team_id method."""

    def test_resolve_team_id_by_name_returns_id(
        self, client: LinearClientWrapper, mock_teams_response: Dict
    ) -> None:
        """Test resolving team ID by team name."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = mock_teams_response

        with patch.object(httpx, "post", return_value=mock_response):
            result = client._resolve_team_id("Engineering")

            assert result == "team-id-1"

    def test_resolve_team_id_by_key_returns_id(
        self, client: LinearClientWrapper, mock_teams_response: Dict
    ) -> None:
        """Test resolving team ID by team key."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = mock_teams_response

        with patch.object(httpx, "post", return_value=mock_response):
            result = client._resolve_team_id("ENG")

            assert result == "team-id-1"

    def test_resolve_team_id_by_id_returns_id(
        self, client: LinearClientWrapper, mock_teams_response: Dict
    ) -> None:
        """Test resolving team ID when the ID itself is provided."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = mock_teams_response

        with patch.object(httpx, "post", return_value=mock_response):
            result = client._resolve_team_id("team-id-2")

            assert result == "team-id-2"

    def test_resolve_team_id_case_insensitive(
        self, client: LinearClientWrapper, mock_teams_response: Dict
    ) -> None:
        """Test that team name/key resolution is case-insensitive."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = mock_teams_response

        with patch.object(httpx, "post", return_value=mock_response):
            result = client._resolve_team_id("engineering")
            assert result == "team-id-1"

            # Reset cache for second test
            client._teams_cache = None

        with patch.object(httpx, "post", return_value=mock_response):
            result = client._resolve_team_id("eng")
            assert result == "team-id-1"

    def test_resolve_team_id_not_found_returns_none(
        self, client: LinearClientWrapper, mock_teams_response: Dict
    ) -> None:
        """Test that non-existent team returns None."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = mock_teams_response

        with patch.object(httpx, "post", return_value=mock_response):
            result = client._resolve_team_id("NonExistentTeam")

            assert result is None

    def test_resolve_team_id_caches_results(
        self, client: LinearClientWrapper, mock_teams_response: Dict
    ) -> None:
        """Test that team results are cached after first query."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = mock_teams_response

        with patch.object(httpx, "post", return_value=mock_response) as mock_post:
            # First call
            client._resolve_team_id("Engineering")
            # Second call should use cache
            client._resolve_team_id("Design")

            # Should only be called once due to caching
            assert mock_post.call_count == 1

    def test_resolve_team_id_empty_response_returns_none(
        self, client: LinearClientWrapper
    ) -> None:
        """Test handling of empty teams response."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"data": {"teams": {"nodes": []}}}

        with patch.object(httpx, "post", return_value=mock_response):
            result = client._resolve_team_id("Engineering")

            assert result is None

    def test_resolve_team_id_missing_teams_key_returns_none(
        self, client: LinearClientWrapper
    ) -> None:
        """Test handling of response without teams key."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"data": {}}

        with patch.object(httpx, "post", return_value=mock_response):
            result = client._resolve_team_id("Engineering")

            assert result is None


# =============================================================================
# User Resolution Tests
# =============================================================================


class TestResolveUserId:
    """Tests for _resolve_user_id method."""

    def test_resolve_user_id_by_email_returns_id(
        self, client: LinearClientWrapper, mock_users_response: Dict
    ) -> None:
        """Test resolving user ID by email address."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = mock_users_response

        with patch.object(httpx, "post", return_value=mock_response):
            result = client._resolve_user_id("john@example.com")

            assert result == "user-id-1"

    def test_resolve_user_id_by_name_returns_id(
        self, client: LinearClientWrapper, mock_users_response: Dict
    ) -> None:
        """Test resolving user ID by name."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = mock_users_response

        with patch.object(httpx, "post", return_value=mock_response):
            result = client._resolve_user_id("John Doe")

            assert result == "user-id-1"

    def test_resolve_user_id_by_id_returns_id(
        self, client: LinearClientWrapper, mock_users_response: Dict
    ) -> None:
        """Test resolving user ID when the ID itself is provided."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = mock_users_response

        with patch.object(httpx, "post", return_value=mock_response):
            result = client._resolve_user_id("user-id-2")

            assert result == "user-id-2"

    def test_resolve_user_id_case_insensitive(
        self, client: LinearClientWrapper, mock_users_response: Dict
    ) -> None:
        """Test that user resolution is case-insensitive."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = mock_users_response

        with patch.object(httpx, "post", return_value=mock_response):
            result = client._resolve_user_id("JOHN@EXAMPLE.COM")
            assert result == "user-id-1"

            # Reset cache for second test
            client._users_cache = None

        with patch.object(httpx, "post", return_value=mock_response):
            result = client._resolve_user_id("jane smith")
            assert result == "user-id-2"

    def test_resolve_user_id_not_found_returns_none(
        self, client: LinearClientWrapper, mock_users_response: Dict
    ) -> None:
        """Test that non-existent user returns None."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = mock_users_response

        with patch.object(httpx, "post", return_value=mock_response):
            result = client._resolve_user_id("unknown@example.com")

            assert result is None

    def test_resolve_user_id_caches_results(
        self, client: LinearClientWrapper, mock_users_response: Dict
    ) -> None:
        """Test that user results are cached after first query."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = mock_users_response

        with patch.object(httpx, "post", return_value=mock_response) as mock_post:
            # First call
            client._resolve_user_id("john@example.com")
            # Second call should use cache
            client._resolve_user_id("jane@example.com")

            # Should only be called once due to caching
            assert mock_post.call_count == 1


# =============================================================================
# State Resolution Tests
# =============================================================================


class TestResolveStateId:
    """Tests for _resolve_state_id method."""

    def test_resolve_state_id_by_name_returns_id(
        self, client: LinearClientWrapper, mock_states_response: Dict
    ) -> None:
        """Test resolving state ID by state name."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = mock_states_response

        with patch.object(httpx, "post", return_value=mock_response):
            result = client._resolve_state_id("team-id-1", "In Progress")

            assert result == "state-in-progress"

    def test_resolve_state_id_by_id_returns_id(
        self, client: LinearClientWrapper, mock_states_response: Dict
    ) -> None:
        """Test resolving state ID when the ID itself is provided."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = mock_states_response

        with patch.object(httpx, "post", return_value=mock_response):
            result = client._resolve_state_id("team-id-1", "state-todo")

            assert result == "state-todo"

    def test_resolve_state_id_case_insensitive(
        self, client: LinearClientWrapper, mock_states_response: Dict
    ) -> None:
        """Test that state resolution is case-insensitive."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = mock_states_response

        with patch.object(httpx, "post", return_value=mock_response):
            result = client._resolve_state_id("team-id-1", "in progress")

            assert result == "state-in-progress"

    def test_resolve_state_id_not_found_returns_none(
        self, client: LinearClientWrapper, mock_states_response: Dict
    ) -> None:
        """Test that non-existent state returns None."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = mock_states_response

        with patch.object(httpx, "post", return_value=mock_response):
            result = client._resolve_state_id("team-id-1", "NonExistentState")

            assert result is None

    def test_resolve_state_id_caches_per_team(
        self, client: LinearClientWrapper, mock_states_response: Dict
    ) -> None:
        """Test that state results are cached per team."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = mock_states_response

        with patch.object(httpx, "post", return_value=mock_response) as mock_post:
            # First call for team 1
            client._resolve_state_id("team-id-1", "Todo")
            # Second call for same team should use cache
            client._resolve_state_id("team-id-1", "Done")
            # Third call for different team should make new request
            client._resolve_state_id("team-id-2", "Todo")

            # Should be called twice - once per unique team
            assert mock_post.call_count == 2


# =============================================================================
# Issue Filter Building Tests
# =============================================================================


class TestBuildIssueFilter:
    """Tests for _build_issue_filter method."""

    def test_build_issue_filter_basic_team_filter(
        self, client: LinearClientWrapper
    ) -> None:
        """Test building basic filter with just team."""
        filters = IssueFilters(team="ENG")
        result = client._build_issue_filter(filters, "team-id-1")

        assert result == {"team": {"id": {"eq": "team-id-1"}}}

    def test_build_issue_filter_with_priority(
        self, client: LinearClientWrapper
    ) -> None:
        """Test building filter with priority."""
        filters = IssueFilters(team="ENG", priority=1)
        result = client._build_issue_filter(filters, "team-id-1")

        assert result["priority"] == {"eq": 1}

    def test_build_issue_filter_with_status(
        self, client: LinearClientWrapper, mock_states_response: Dict
    ) -> None:
        """Test building filter with status."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = mock_states_response

        with patch.object(httpx, "post", return_value=mock_response):
            filters = IssueFilters(team="ENG", status="Todo")
            result = client._build_issue_filter(filters, "team-id-1")

            assert result["state"] == {"id": {"eq": "state-todo"}}

    def test_build_issue_filter_with_project(
        self, client: LinearClientWrapper
    ) -> None:
        """Test building filter with project name."""
        filters = IssueFilters(team="ENG", project="My Project")
        result = client._build_issue_filter(filters, "team-id-1")

        assert result["project"] == {"name": {"eq": "My Project"}}

    def test_build_issue_filter_with_labels(
        self, client: LinearClientWrapper
    ) -> None:
        """Test building filter with labels."""
        filters = IssueFilters(team="ENG", labels=["bug", "urgent"])
        result = client._build_issue_filter(filters, "team-id-1")

        assert result["labels"] == {"name": {"in": ["bug", "urgent"]}}

    def test_build_issue_filter_with_assignee(
        self, client: LinearClientWrapper, mock_users_response: Dict
    ) -> None:
        """Test building filter with assignee."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = mock_users_response

        with patch.object(httpx, "post", return_value=mock_response):
            filters = IssueFilters(team="ENG", assignee="john@example.com")
            result = client._build_issue_filter(filters, "team-id-1")

            assert result["assignee"] == {"id": {"eq": "user-id-1"}}

    def test_build_issue_filter_with_custom_filter(
        self, client: LinearClientWrapper
    ) -> None:
        """Test building filter with custom GraphQL filter."""
        custom = {"estimate": {"gt": 3}, "dueDate": {"lt": "2024-12-31"}}
        filters = IssueFilters(team="ENG", custom_filter=custom)
        result = client._build_issue_filter(filters, "team-id-1")

        assert result["estimate"] == {"gt": 3}
        assert result["dueDate"] == {"lt": "2024-12-31"}

    def test_build_issue_filter_all_fields(
        self,
        client: LinearClientWrapper,
        mock_states_response: Dict,
        mock_users_response: Dict,
    ) -> None:
        """Test building filter with all fields populated."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        # Return different responses based on query content
        call_count = [0]
        responses = [mock_states_response, mock_users_response]

        def side_effect(*args, **kwargs) -> MagicMock:
            result = MagicMock()
            result.status_code = 200
            result.json.return_value = responses[min(call_count[0], 1)]
            call_count[0] += 1
            return result

        with patch.object(httpx, "post", side_effect=side_effect):
            filters = IssueFilters(
                team="ENG",
                priority=2,
                status="Todo",
                project="Project X",
                labels=["feature"],
                assignee="john@example.com",
            )
            result = client._build_issue_filter(filters, "team-id-1")

            assert result["team"] == {"id": {"eq": "team-id-1"}}
            assert result["priority"] == {"eq": 2}
            assert result["project"] == {"name": {"eq": "Project X"}}
            assert result["labels"] == {"name": {"in": ["feature"]}}


# =============================================================================
# Blocking Detection Tests
# =============================================================================


class TestIsBlocked:
    """Tests for _is_blocked method."""

    def test_is_blocked_no_relations_returns_false(
        self, client: LinearClientWrapper
    ) -> None:
        """Test that issue with no relations is not blocked."""
        issue = {"relations": {"nodes": []}}
        assert client._is_blocked(issue) is False

    def test_is_blocked_with_blocking_relation_started_returns_true(
        self, client: LinearClientWrapper
    ) -> None:
        """Test that issue with active blocker is considered blocked."""
        issue = {
            "relations": {
                "nodes": [
                    {
                        "type": "blocked",
                        "relatedIssue": {
                            "id": "blocker",
                            "state": {"type": "started"},
                        },
                    }
                ]
            }
        }
        assert client._is_blocked(issue) is True

    def test_is_blocked_with_blocking_relation_unstarted_returns_true(
        self, client: LinearClientWrapper
    ) -> None:
        """Test that issue blocked by unstarted issue is considered blocked."""
        issue = {
            "relations": {
                "nodes": [
                    {
                        "type": "blocked",
                        "relatedIssue": {
                            "id": "blocker",
                            "state": {"type": "unstarted"},
                        },
                    }
                ]
            }
        }
        assert client._is_blocked(issue) is True

    def test_is_blocked_with_blocking_relation_backlog_returns_true(
        self, client: LinearClientWrapper
    ) -> None:
        """Test that issue blocked by backlog issue is considered blocked."""
        issue = {
            "relations": {
                "nodes": [
                    {
                        "type": "is_blocked_by",
                        "relatedIssue": {
                            "id": "blocker",
                            "state": {"type": "backlog"},
                        },
                    }
                ]
            }
        }
        assert client._is_blocked(issue) is True

    def test_is_blocked_with_completed_blocker_returns_false(
        self, client: LinearClientWrapper
    ) -> None:
        """Test that issue with completed blocker is not blocked."""
        issue = {
            "relations": {
                "nodes": [
                    {
                        "type": "blocked",
                        "relatedIssue": {
                            "id": "blocker",
                            "state": {"type": "completed"},
                        },
                    }
                ]
            }
        }
        assert client._is_blocked(issue) is False

    def test_is_blocked_with_canceled_blocker_returns_false(
        self, client: LinearClientWrapper
    ) -> None:
        """Test that issue with canceled blocker is not blocked."""
        issue = {
            "relations": {
                "nodes": [
                    {
                        "type": "blocked",
                        "relatedIssue": {
                            "id": "blocker",
                            "state": {"type": "canceled"},
                        },
                    }
                ]
            }
        }
        assert client._is_blocked(issue) is False

    def test_is_blocked_with_non_blocking_relation_returns_false(
        self, client: LinearClientWrapper
    ) -> None:
        """Test that non-blocking relations don't affect blocked status."""
        issue = {
            "relations": {
                "nodes": [
                    {
                        "type": "blocks",  # This issue blocks another, not blocked
                        "relatedIssue": {
                            "id": "other-issue",
                            "state": {"type": "started"},
                        },
                    },
                    {
                        "type": "related",
                        "relatedIssue": {
                            "id": "related-issue",
                            "state": {"type": "started"},
                        },
                    },
                ]
            }
        }
        assert client._is_blocked(issue) is False

    def test_is_blocked_multiple_blockers_one_active_returns_true(
        self, client: LinearClientWrapper
    ) -> None:
        """Test that issue is blocked if any blocker is active."""
        issue = {
            "relations": {
                "nodes": [
                    {
                        "type": "blocked",
                        "relatedIssue": {
                            "id": "blocker-1",
                            "state": {"type": "completed"},
                        },
                    },
                    {
                        "type": "blocked",
                        "relatedIssue": {
                            "id": "blocker-2",
                            "state": {"type": "started"},  # Active
                        },
                    },
                ]
            }
        }
        assert client._is_blocked(issue) is True

    def test_is_blocked_missing_relations_returns_false(
        self, client: LinearClientWrapper
    ) -> None:
        """Test that issue without relations key is not blocked."""
        issue = {}
        assert client._is_blocked(issue) is False


# =============================================================================
# Get Next Issue Tests
# =============================================================================


class TestGetNextIssue:
    """Tests for get_next_issue method."""

    def test_get_next_issue_returns_first_unblocked(
        self,
        client: LinearClientWrapper,
        mock_teams_response: Dict,
        mock_issues_with_blockers_response: Dict,
    ) -> None:
        """Test that get_next_issue returns first unblocked issue."""
        call_count = [0]

        def side_effect(*args, **kwargs) -> MagicMock:
            result = MagicMock()
            result.status_code = 200
            if call_count[0] == 0:
                result.json.return_value = mock_teams_response
            else:
                result.json.return_value = mock_issues_with_blockers_response
            call_count[0] += 1
            return result

        with patch.object(httpx, "post", side_effect=side_effect):
            filters = IssueFilters(team="ENG")
            result = client.get_next_issue(filters)

            # ENG-101 should be returned (first unblocked)
            assert result == "ENG-101"

    def test_get_next_issue_skips_blocked_issues(
        self,
        client: LinearClientWrapper,
        mock_teams_response: Dict,
    ) -> None:
        """Test that blocked issues are skipped when skip_blocked is True."""
        blocked_issues_response = {
            "data": {
                "issues": {
                    "nodes": [
                        {
                            "id": "issue-1",
                            "identifier": "ENG-101",
                            "relations": {
                                "nodes": [
                                    {
                                        "type": "blocked",
                                        "relatedIssue": {"state": {"type": "started"}},
                                    }
                                ]
                            },
                        },
                        {
                            "id": "issue-2",
                            "identifier": "ENG-102",
                            "relations": {"nodes": []},
                        },
                    ]
                }
            }
        }

        call_count = [0]

        def side_effect(*args, **kwargs) -> MagicMock:
            result = MagicMock()
            result.status_code = 200
            if call_count[0] == 0:
                result.json.return_value = mock_teams_response
            else:
                result.json.return_value = blocked_issues_response
            call_count[0] += 1
            return result

        with patch.object(httpx, "post", side_effect=side_effect):
            filters = IssueFilters(team="ENG")
            result = client.get_next_issue(filters, skip_blocked=True)

            # ENG-102 should be returned (ENG-101 is blocked)
            assert result == "ENG-102"

    def test_get_next_issue_skip_blocked_false_returns_blocked(
        self,
        client: LinearClientWrapper,
        mock_teams_response: Dict,
    ) -> None:
        """Test that blocked issues are included when skip_blocked is False."""
        blocked_first_response = {
            "data": {
                "issues": {
                    "nodes": [
                        {
                            "id": "issue-1",
                            "identifier": "ENG-101",
                            "relations": {
                                "nodes": [
                                    {
                                        "type": "blocked",
                                        "relatedIssue": {"state": {"type": "started"}},
                                    }
                                ]
                            },
                        },
                        {
                            "id": "issue-2",
                            "identifier": "ENG-102",
                            "relations": {"nodes": []},
                        },
                    ]
                }
            }
        }

        call_count = [0]

        def side_effect(*args, **kwargs) -> MagicMock:
            result = MagicMock()
            result.status_code = 200
            if call_count[0] == 0:
                result.json.return_value = mock_teams_response
            else:
                result.json.return_value = blocked_first_response
            call_count[0] += 1
            return result

        with patch.object(httpx, "post", side_effect=side_effect):
            filters = IssueFilters(team="ENG")
            result = client.get_next_issue(filters, skip_blocked=False)

            # ENG-101 should be returned even though blocked
            assert result == "ENG-101"

    def test_get_next_issue_team_not_found_returns_none(
        self,
        client: LinearClientWrapper,
    ) -> None:
        """Test that get_next_issue returns None when team is not found."""
        empty_teams_response = {"data": {"teams": {"nodes": []}}}

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = empty_teams_response

        with patch.object(httpx, "post", return_value=mock_response):
            filters = IssueFilters(team="NonExistent")
            result = client.get_next_issue(filters)

            assert result is None

    def test_get_next_issue_no_issues_returns_none(
        self,
        client: LinearClientWrapper,
        mock_teams_response: Dict,
    ) -> None:
        """Test that get_next_issue returns None when no issues match."""
        empty_issues_response = {"data": {"issues": {"nodes": []}}}

        call_count = [0]

        def side_effect(*args, **kwargs) -> MagicMock:
            result = MagicMock()
            result.status_code = 200
            if call_count[0] == 0:
                result.json.return_value = mock_teams_response
            else:
                result.json.return_value = empty_issues_response
            call_count[0] += 1
            return result

        with patch.object(httpx, "post", side_effect=side_effect):
            filters = IssueFilters(team="ENG")
            result = client.get_next_issue(filters)

            assert result is None

    def test_get_next_issue_all_blocked_returns_none(
        self,
        client: LinearClientWrapper,
        mock_teams_response: Dict,
    ) -> None:
        """Test that get_next_issue returns None when all issues are blocked."""
        all_blocked_response = {
            "data": {
                "issues": {
                    "nodes": [
                        {
                            "id": "issue-1",
                            "identifier": "ENG-101",
                            "relations": {
                                "nodes": [
                                    {
                                        "type": "blocked",
                                        "relatedIssue": {"state": {"type": "started"}},
                                    }
                                ]
                            },
                        },
                    ]
                }
            }
        }

        call_count = [0]

        def side_effect(*args, **kwargs) -> MagicMock:
            result = MagicMock()
            result.status_code = 200
            if call_count[0] == 0:
                result.json.return_value = mock_teams_response
            else:
                result.json.return_value = all_blocked_response
            call_count[0] += 1
            return result

        with patch.object(httpx, "post", side_effect=side_effect):
            filters = IssueFilters(team="ENG")
            result = client.get_next_issue(filters, skip_blocked=True)

            assert result is None


# =============================================================================
# Get Issue Tests
# =============================================================================


class TestGetIssue:
    """Tests for get_issue method."""

    def test_get_issue_success_returns_response_with_data(
        self, client: LinearClientWrapper, mock_issue_response: Dict
    ) -> None:
        """Test successful issue fetch returns LinearResponse with data."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = mock_issue_response

        with patch.object(httpx, "post", return_value=mock_response):
            result = client.get_issue("ENG-123")

            assert result.success is True
            assert result.data is not None
            assert result.data["identifier"] == "ENG-123"
            assert result.data["title"] == "Test Issue"
            assert result.error is None

    def test_get_issue_not_found_returns_error(
        self, client: LinearClientWrapper
    ) -> None:
        """Test that non-existent issue returns error response."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"data": {"issue": None}}

        with patch.object(httpx, "post", return_value=mock_response):
            result = client.get_issue("ENG-999")

            assert result.success is False
            assert result.data is None
            assert "Issue not found" in str(result.error)

    def test_get_issue_api_error_returns_error(
        self, client: LinearClientWrapper
    ) -> None:
        """Test that API error returns error response."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "errors": [{"message": "Invalid issue ID format"}]
        }

        with patch.object(httpx, "post", return_value=mock_response):
            result = client.get_issue("invalid-id")

            assert result.success is False
            assert "Invalid issue ID format" in str(result.error)

    def test_get_issue_network_error_returns_error(
        self, client: LinearClientWrapper
    ) -> None:
        """Test that network error returns error response."""
        with patch.object(
            httpx, "post", side_effect=httpx.RequestError("Connection timeout")
        ):
            result = client.get_issue("ENG-123")

            assert result.success is False
            assert result.error is not None


# =============================================================================
# Create Issue Tests
# =============================================================================


class TestCreateIssue:
    """Tests for create_issue method."""

    def test_create_issue_success_returns_created_issue(
        self, client: LinearClientWrapper, mock_teams_response: Dict
    ) -> None:
        """Test successful issue creation returns the created issue."""
        create_response = {
            "data": {
                "issueCreate": {
                    "success": True,
                    "issue": {
                        "id": "new-issue-id",
                        "identifier": "ENG-456",
                        "title": "New Issue",
                        "state": {"name": "Backlog"},
                    },
                }
            }
        }

        call_count = [0]

        def side_effect(*args, **kwargs) -> MagicMock:
            result = MagicMock()
            result.status_code = 200
            if call_count[0] == 0:
                result.json.return_value = mock_teams_response
            else:
                result.json.return_value = create_response
            call_count[0] += 1
            return result

        with patch.object(httpx, "post", side_effect=side_effect):
            data = IssueData(title="New Issue", team="ENG")
            result = client.create_issue(data)

            assert result.success is True
            assert result.data is not None
            assert result.data["identifier"] == "ENG-456"

    def test_create_issue_missing_title_returns_error(
        self, client: LinearClientWrapper
    ) -> None:
        """Test that creating issue without title returns error."""
        data = IssueData(team="ENG")  # No title
        result = client.create_issue(data)

        assert result.success is False
        assert "title and team are required" in str(result.error)

    def test_create_issue_missing_team_returns_error(
        self, client: LinearClientWrapper
    ) -> None:
        """Test that creating issue without team returns error."""
        data = IssueData(title="Test Issue")  # No team
        result = client.create_issue(data)

        assert result.success is False
        assert "title and team are required" in str(result.error)

    def test_create_issue_team_not_found_returns_error(
        self, client: LinearClientWrapper
    ) -> None:
        """Test that creating issue with non-existent team returns error."""
        empty_teams = {"data": {"teams": {"nodes": []}}}
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = empty_teams

        with patch.object(httpx, "post", return_value=mock_response):
            data = IssueData(title="Test Issue", team="NonExistent")
            result = client.create_issue(data)

            assert result.success is False
            assert "Team not found" in str(result.error)

    def test_create_issue_with_all_fields(
        self,
        client: LinearClientWrapper,
        mock_teams_response: Dict,
        mock_users_response: Dict,
        mock_states_response: Dict,
    ) -> None:
        """Test creating issue with all optional fields."""
        create_response = {
            "data": {
                "issueCreate": {
                    "success": True,
                    "issue": {
                        "id": "new-issue-id",
                        "identifier": "ENG-456",
                        "title": "Full Issue",
                    },
                }
            }
        }

        call_count = [0]

        def side_effect(*args, **kwargs) -> MagicMock:
            result = MagicMock()
            result.status_code = 200
            # Sequence: teams -> states -> users -> create
            responses = [
                mock_teams_response,
                mock_states_response,
                mock_users_response,
                create_response,
            ]
            result.json.return_value = responses[min(call_count[0], len(responses) - 1)]
            call_count[0] += 1
            return result

        with patch.object(httpx, "post", side_effect=side_effect):
            data = IssueData(
                title="Full Issue",
                description="Full description",
                team="ENG",
                priority=2,
                assignee="john@example.com",
                status="Todo",
                parent_id="parent-issue-id",
            )
            result = client.create_issue(data)

            assert result.success is True

    def test_create_issue_api_failure_returns_error(
        self, client: LinearClientWrapper, mock_teams_response: Dict
    ) -> None:
        """Test that API failure during creation returns error."""
        create_failure = {
            "data": {"issueCreate": {"success": False, "issue": None}}
        }

        call_count = [0]

        def side_effect(*args, **kwargs) -> MagicMock:
            result = MagicMock()
            result.status_code = 200
            if call_count[0] == 0:
                result.json.return_value = mock_teams_response
            else:
                result.json.return_value = create_failure
            call_count[0] += 1
            return result

        with patch.object(httpx, "post", side_effect=side_effect):
            data = IssueData(title="Test Issue", team="ENG")
            result = client.create_issue(data)

            assert result.success is False
            assert "Failed to create issue" in str(result.error)


# =============================================================================
# Update Issue Tests
# =============================================================================


class TestUpdateIssue:
    """Tests for update_issue method."""

    def test_update_issue_success_returns_updated_issue(
        self, client: LinearClientWrapper
    ) -> None:
        """Test successful issue update returns the updated issue."""
        update_response = {
            "data": {
                "issueUpdate": {
                    "success": True,
                    "issue": {
                        "id": "issue-id",
                        "identifier": "ENG-123",
                        "title": "Updated Title",
                        "state": {"id": "state-1", "name": "In Progress"},
                        "assignee": None,
                    },
                }
            }
        }

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = update_response

        with patch.object(httpx, "post", return_value=mock_response):
            data = IssueData(title="Updated Title")
            result = client.update_issue("ENG-123", data)

            assert result.success is True
            assert result.data is not None
            assert result.data["title"] == "Updated Title"

    def test_update_issue_no_fields_returns_error(
        self, client: LinearClientWrapper
    ) -> None:
        """Test that updating with no fields returns error."""
        data = IssueData()  # All fields None
        result = client.update_issue("ENG-123", data)

        assert result.success is False
        assert "No fields to update" in str(result.error)

    def test_update_issue_with_status_fetches_team(
        self,
        client: LinearClientWrapper,
        mock_issue_response: Dict,
        mock_states_response: Dict,
    ) -> None:
        """Test that updating status fetches team ID from issue first."""
        update_response = {
            "data": {
                "issueUpdate": {
                    "success": True,
                    "issue": {
                        "id": "issue-id",
                        "identifier": "ENG-123",
                        "title": "Test Issue",
                        "state": {"id": "state-done", "name": "Done"},
                        "assignee": None,
                    },
                }
            }
        }

        call_count = [0]

        def side_effect(*args, **kwargs) -> MagicMock:
            result = MagicMock()
            result.status_code = 200
            # Sequence: get issue (for team) -> get states -> update
            responses = [mock_issue_response, mock_states_response, update_response]
            result.json.return_value = responses[min(call_count[0], len(responses) - 1)]
            call_count[0] += 1
            return result

        with patch.object(httpx, "post", side_effect=side_effect):
            data = IssueData(status="Done")
            result = client.update_issue("ENG-123", data)

            assert result.success is True

    def test_update_issue_api_failure_returns_error(
        self, client: LinearClientWrapper
    ) -> None:
        """Test that API failure during update returns error."""
        update_failure = {
            "data": {"issueUpdate": {"success": False, "issue": None}}
        }

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = update_failure

        with patch.object(httpx, "post", return_value=mock_response):
            data = IssueData(title="Updated Title")
            result = client.update_issue("ENG-123", data)

            assert result.success is False
            assert "Failed to update issue" in str(result.error)


# =============================================================================
# Assign Issue Tests
# =============================================================================


class TestAssignIssue:
    """Tests for assign_issue method."""

    def test_assign_issue_success_returns_updated_issue(
        self, client: LinearClientWrapper, mock_users_response: Dict
    ) -> None:
        """Test successful issue assignment returns the updated issue."""
        assign_response = {
            "data": {
                "issueUpdate": {
                    "success": True,
                    "issue": {
                        "id": "issue-id",
                        "identifier": "ENG-123",
                        "title": "Test Issue",
                        "state": {"id": "state-1", "name": "Todo"},
                        "assignee": {"id": "user-id-1", "name": "John Doe"},
                    },
                }
            }
        }

        call_count = [0]

        def side_effect(*args, **kwargs) -> MagicMock:
            result = MagicMock()
            result.status_code = 200
            if call_count[0] == 0:
                result.json.return_value = mock_users_response
            else:
                result.json.return_value = assign_response
            call_count[0] += 1
            return result

        with patch.object(httpx, "post", side_effect=side_effect):
            result = client.assign_issue("ENG-123", "john@example.com")

            assert result.success is True
            assert result.data is not None
            assert result.data["assignee"]["name"] == "John Doe"

    def test_assign_issue_user_not_found_returns_error(
        self, client: LinearClientWrapper, mock_users_response: Dict
    ) -> None:
        """Test that assigning to non-existent user returns error."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = mock_users_response

        with patch.object(httpx, "post", return_value=mock_response):
            result = client.assign_issue("ENG-123", "nonexistent@example.com")

            assert result.success is False
            assert "User not found" in str(result.error)

    def test_assign_issue_api_failure_returns_error(
        self, client: LinearClientWrapper, mock_users_response: Dict
    ) -> None:
        """Test that API failure during assignment returns error."""
        assign_failure = {
            "data": {"issueUpdate": {"success": False, "issue": None}}
        }

        call_count = [0]

        def side_effect(*args, **kwargs) -> MagicMock:
            result = MagicMock()
            result.status_code = 200
            if call_count[0] == 0:
                result.json.return_value = mock_users_response
            else:
                result.json.return_value = assign_failure
            call_count[0] += 1
            return result

        with patch.object(httpx, "post", side_effect=side_effect):
            result = client.assign_issue("ENG-123", "john@example.com")

            assert result.success is False
            assert "Failed to assign issue" in str(result.error)


# =============================================================================
# Add Comment Tests
# =============================================================================


class TestAddComment:
    """Tests for add_comment method."""

    def test_add_comment_success_returns_comment(
        self, client: LinearClientWrapper
    ) -> None:
        """Test successful comment creation returns the comment."""
        comment_response = {
            "data": {
                "commentCreate": {
                    "success": True,
                    "comment": {
                        "id": "comment-id-1",
                        "body": "Test comment body",
                        "createdAt": "2024-01-15T10:00:00Z",
                        "user": {"name": "Bot User"},
                    },
                }
            }
        }

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = comment_response

        with patch.object(httpx, "post", return_value=mock_response):
            result = client.add_comment("ENG-123", "Test comment body")

            assert result.success is True
            assert result.data is not None
            assert result.data["body"] == "Test comment body"

    def test_add_comment_api_failure_returns_error(
        self, client: LinearClientWrapper
    ) -> None:
        """Test that API failure during comment creation returns error."""
        comment_failure = {
            "data": {"commentCreate": {"success": False, "comment": None}}
        }

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = comment_failure

        with patch.object(httpx, "post", return_value=mock_response):
            result = client.add_comment("ENG-123", "Test comment")

            assert result.success is False
            assert "Failed to create comment" in str(result.error)

    def test_add_comment_network_error_returns_error(
        self, client: LinearClientWrapper
    ) -> None:
        """Test that network error during comment creation returns error."""
        with patch.object(
            httpx, "post", side_effect=httpx.RequestError("Connection reset")
        ):
            result = client.add_comment("ENG-123", "Test comment")

            assert result.success is False
            assert result.error is not None


# =============================================================================
# Edge Cases and Error Handling Tests
# =============================================================================


class TestEdgeCasesAndErrorHandling:
    """Tests for edge cases and error handling scenarios."""

    def test_malformed_api_response_missing_data_key(
        self, client: LinearClientWrapper
    ) -> None:
        """Test handling of response without 'data' key."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"not_data": {}}

        with patch.object(httpx, "post", return_value=mock_response):
            result = client._execute_graphql("query { test }", {})
            assert result is None

    def test_rate_limiting_http_429_raises_exception(
        self, client: LinearClientWrapper
    ) -> None:
        """Test that HTTP 429 (rate limit) raises an exception."""
        mock_response = MagicMock()
        mock_response.status_code = 429
        mock_response.text = "Rate limit exceeded"

        with patch.object(httpx, "post", return_value=mock_response):
            with pytest.raises(Exception) as exc_info:
                client._execute_graphql("query { test }", {})

            assert "HTTP 429" in str(exc_info.value)

    def test_server_error_http_500_raises_exception(
        self, client: LinearClientWrapper
    ) -> None:
        """Test that HTTP 500 raises an exception."""
        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_response.text = "Internal Server Error"

        with patch.object(httpx, "post", return_value=mock_response):
            with pytest.raises(Exception) as exc_info:
                client._execute_graphql("query { test }", {})

            assert "HTTP 500" in str(exc_info.value)

    def test_graphql_multiple_errors_returns_first(
        self, client: LinearClientWrapper
    ) -> None:
        """Test that multiple GraphQL errors returns the first one."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "errors": [
                {"message": "First error"},
                {"message": "Second error"},
            ]
        }

        with patch.object(httpx, "post", return_value=mock_response):
            with pytest.raises(Exception) as exc_info:
                client._execute_graphql("query { test }", {})

            assert "First error" in str(exc_info.value)

    def test_empty_issue_identifier_in_response(
        self, client: LinearClientWrapper, mock_teams_response: Dict
    ) -> None:
        """Test handling of issue without identifier in response."""
        issues_no_identifier = {
            "data": {
                "issues": {
                    "nodes": [
                        {"id": "issue-1", "relations": {"nodes": []}},  # No identifier
                    ]
                }
            }
        }

        call_count = [0]

        def side_effect(*args, **kwargs) -> MagicMock:
            result = MagicMock()
            result.status_code = 200
            if call_count[0] == 0:
                result.json.return_value = mock_teams_response
            else:
                result.json.return_value = issues_no_identifier
            call_count[0] += 1
            return result

        with patch.object(httpx, "post", side_effect=side_effect):
            filters = IssueFilters(team="ENG")
            result = client.get_next_issue(filters)

            # Should return None since identifier is missing
            assert result is None

    def test_api_key_is_not_exposed_in_errors(
        self, client: LinearClientWrapper
    ) -> None:
        """Test that API key is not included in error messages."""
        with patch.object(
            httpx, "post", side_effect=httpx.RequestError("Connection failed")
        ):
            with pytest.raises(Exception) as exc_info:
                client._execute_graphql("query { test }", {})

            # API key should not appear in error message
            assert "lin_api_test" not in str(exc_info.value)

    def test_unicode_in_issue_title_and_description(
        self, client: LinearClientWrapper, mock_teams_response: Dict
    ) -> None:
        """Test handling of Unicode characters in issue data."""
        create_response = {
            "data": {
                "issueCreate": {
                    "success": True,
                    "issue": {
                        "id": "new-issue-id",
                        "identifier": "ENG-456",
                        "title": "Unicode test: cafe",
                    },
                }
            }
        }

        call_count = [0]

        def side_effect(*args, **kwargs) -> MagicMock:
            result = MagicMock()
            result.status_code = 200
            if call_count[0] == 0:
                result.json.return_value = mock_teams_response
            else:
                result.json.return_value = create_response
            call_count[0] += 1
            return result

        with patch.object(httpx, "post", side_effect=side_effect):
            data = IssueData(
                title="Unicode test: cafe",
                description="Description with emojis and special chars",
                team="ENG",
            )
            result = client.create_issue(data)

            assert result.success is True


# =============================================================================
# Cache Behavior Tests
# =============================================================================


class TestCacheBehavior:
    """Tests for caching behavior across different methods."""

    def test_team_cache_persists_across_multiple_calls(
        self, client: LinearClientWrapper, mock_teams_response: Dict
    ) -> None:
        """Test that team cache persists across multiple resolution calls."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = mock_teams_response

        with patch.object(httpx, "post", return_value=mock_response) as mock_post:
            # Multiple calls to resolve different teams
            client._resolve_team_id("Engineering")
            client._resolve_team_id("Design")
            client._resolve_team_id("Product")
            client._resolve_team_id("NonExistent")

            # Should only make one API call
            assert mock_post.call_count == 1

    def test_user_cache_persists_across_multiple_calls(
        self, client: LinearClientWrapper, mock_users_response: Dict
    ) -> None:
        """Test that user cache persists across multiple resolution calls."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = mock_users_response

        with patch.object(httpx, "post", return_value=mock_response) as mock_post:
            # Multiple calls to resolve different users
            client._resolve_user_id("john@example.com")
            client._resolve_user_id("jane@example.com")
            client._resolve_user_id("bob@example.com")

            # Should only make one API call
            assert mock_post.call_count == 1

    def test_state_cache_is_team_specific(
        self, client: LinearClientWrapper, mock_states_response: Dict
    ) -> None:
        """Test that state cache is specific to each team."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = mock_states_response

        with patch.object(httpx, "post", return_value=mock_response) as mock_post:
            # Resolve states for team 1
            client._resolve_state_id("team-1", "Todo")
            client._resolve_state_id("team-1", "Done")

            # Resolve states for team 2
            client._resolve_state_id("team-2", "Todo")

            # Should make two API calls (one per team)
            assert mock_post.call_count == 2

    def test_cache_survives_failed_resolution(
        self, client: LinearClientWrapper, mock_teams_response: Dict
    ) -> None:
        """Test that cache persists even after failed resolution attempt."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = mock_teams_response

        with patch.object(httpx, "post", return_value=mock_response) as mock_post:
            # Try to resolve non-existent team
            result1 = client._resolve_team_id("NonExistent")
            assert result1 is None

            # Resolve existing team (should use cache)
            result2 = client._resolve_team_id("Engineering")
            assert result2 == "team-id-1"

            # Should only make one API call
            assert mock_post.call_count == 1


# =============================================================================
# Integration-like Tests
# =============================================================================


class TestIntegrationScenarios:
    """Tests for realistic usage scenarios combining multiple methods."""

    def test_full_issue_workflow_create_assign_comment(
        self,
        client: LinearClientWrapper,
        mock_teams_response: Dict,
        mock_users_response: Dict,
    ) -> None:
        """Test a full workflow: create issue, assign it, and add comment."""
        create_response = {
            "data": {
                "issueCreate": {
                    "success": True,
                    "issue": {"id": "new-id", "identifier": "ENG-100", "title": "Test"},
                }
            }
        }
        assign_response = {
            "data": {
                "issueUpdate": {
                    "success": True,
                    "issue": {
                        "id": "new-id",
                        "identifier": "ENG-100",
                        "title": "Test",
                        "state": {"id": "s1", "name": "Todo"},
                        "assignee": {"id": "user-id-1", "name": "John Doe"},
                    },
                }
            }
        }
        comment_response = {
            "data": {
                "commentCreate": {
                    "success": True,
                    "comment": {
                        "id": "comment-1",
                        "body": "Started work",
                        "createdAt": "2024-01-01T00:00:00Z",
                        "user": {"name": "Bot"},
                    },
                }
            }
        }

        call_count = [0]
        responses = [
            mock_teams_response,
            create_response,
            mock_users_response,
            assign_response,
            comment_response,
        ]

        def side_effect(*args, **kwargs) -> MagicMock:
            result = MagicMock()
            result.status_code = 200
            result.json.return_value = responses[min(call_count[0], len(responses) - 1)]
            call_count[0] += 1
            return result

        with patch.object(httpx, "post", side_effect=side_effect):
            # Create issue
            create_result = client.create_issue(
                IssueData(title="Test Issue", team="ENG")
            )
            assert create_result.success is True

            # Assign issue
            assign_result = client.assign_issue("ENG-100", "john@example.com")
            assert assign_result.success is True

            # Add comment
            comment_result = client.add_comment("ENG-100", "Started work")
            assert comment_result.success is True

    def test_get_next_issue_with_filters_and_blocking(
        self,
        client: LinearClientWrapper,
        mock_teams_response: Dict,
        mock_users_response: Dict,
        mock_states_response: Dict,
    ) -> None:
        """Test getting next issue with complex filters and blocking checks."""
        issues_response = {
            "data": {
                "issues": {
                    "nodes": [
                        {
                            "id": "issue-1",
                            "identifier": "ENG-101",
                            "relations": {
                                "nodes": [
                                    {
                                        "type": "blocked",
                                        "relatedIssue": {"state": {"type": "started"}},
                                    }
                                ]
                            },
                        },
                        {
                            "id": "issue-2",
                            "identifier": "ENG-102",
                            "relations": {"nodes": []},
                        },
                    ]
                }
            }
        }

        call_count = [0]
        responses = [
            mock_teams_response,
            mock_states_response,
            mock_users_response,
            issues_response,
        ]

        def side_effect(*args, **kwargs) -> MagicMock:
            result = MagicMock()
            result.status_code = 200
            result.json.return_value = responses[min(call_count[0], len(responses) - 1)]
            call_count[0] += 1
            return result

        with patch.object(httpx, "post", side_effect=side_effect):
            filters = IssueFilters(
                team="ENG",
                status="Todo",
                priority=2,
                assignee="john@example.com",
            )
            result = client.get_next_issue(filters, skip_blocked=True)

            # Should skip blocked ENG-101 and return ENG-102
            assert result == "ENG-102"
