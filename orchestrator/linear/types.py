"""Type definitions for Linear integration."""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class IssueFilters:
    """Filter criteria for fetching issues."""

    team: str  # Required: team key or name
    project: Optional[str] = None
    priority: Optional[int] = None  # 0=No priority, 1=Urgent, 2=High, 3=Medium, 4=Low
    labels: Optional[List[str]] = None
    status: Optional[str] = None  # State name like "Todo", "In Progress"
    assignee: Optional[str] = None  # User ID, email, or name
    custom_filter: Optional[Dict[str, Any]] = None  # Raw GraphQL filter


@dataclass
class IssueData:
    """Issue data for create/update operations."""

    title: Optional[str] = None
    description: Optional[str] = None
    team: Optional[str] = None
    project: Optional[str] = None
    priority: Optional[int] = None
    labels: Optional[List[str]] = None
    status: Optional[str] = None
    assignee: Optional[str] = None
    parent_id: Optional[str] = None


@dataclass
class LinearResponse:
    """Wrapper for Linear API responses."""

    success: bool
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
