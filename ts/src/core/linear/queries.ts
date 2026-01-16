/**
 * GraphQL query definitions for Linear API.
 */

/** Query to fetch all teams */
export const TEAMS_QUERY = `
query Teams {
  teams {
    nodes {
      id
      name
      key
    }
  }
}
`;

/** Query to fetch all users */
export const USERS_QUERY = `
query Users {
  users {
    nodes {
      id
      name
      email
    }
  }
}
`;

/** Query to fetch workflow states for a team */
export const WORKFLOW_STATES_QUERY = `
query WorkflowStates($teamId: String!) {
  team(id: $teamId) {
    states {
      nodes {
        id
        name
        type
      }
    }
  }
}
`;

/** Query to fetch issues with filters and blocking relations */
export const ISSUES_WITH_BLOCKERS_QUERY = `
query IssuesWithBlockers($filter: IssueFilter, $first: Int) {
  issues(filter: $filter, first: $first) {
    nodes {
      id
      identifier
      title
      priority
      state {
        id
        name
        type
      }
      project {
        id
        name
      }
      labels {
        nodes {
          id
          name
        }
      }
      assignee {
        id
        name
        email
      }
      relations {
        nodes {
          type
          relatedIssue {
            id
            identifier
            state {
              type
            }
          }
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
`;

/** Query to get single issue with full details */
export const ISSUE_DETAILS_QUERY = `
query IssueDetails($id: String!) {
  issue(id: $id) {
    id
    identifier
    title
    description
    priority
    priorityLabel
    estimate
    dueDate
    createdAt
    updatedAt
    state {
      id
      name
      type
      color
    }
    team {
      id
      key
      name
    }
    project {
      id
      name
      state
    }
    assignee {
      id
      name
      email
    }
    creator {
      id
      name
      email
    }
    labels {
      nodes {
        id
        name
        color
      }
    }
    parent {
      id
      identifier
    }
    children {
      nodes {
        id
        identifier
        title
        state {
          name
        }
      }
    }
    relations {
      nodes {
        type
        relatedIssue {
          id
          identifier
          title
          state {
            name
            type
          }
        }
      }
    }
    comments {
      nodes {
        id
        body
        createdAt
        user {
          name
        }
      }
    }
    attachments {
      nodes {
        id
        title
        url
      }
    }
  }
}
`;

/** Mutation to create an issue */
export const ISSUE_CREATE_MUTATION = `
mutation IssueCreate($input: IssueCreateInput!) {
  issueCreate(input: $input) {
    success
    issue {
      id
      identifier
      title
      state {
        name
      }
    }
  }
}
`;

/** Mutation to update an issue */
export const ISSUE_UPDATE_MUTATION = `
mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) {
  issueUpdate(id: $id, input: $input) {
    success
    issue {
      id
      identifier
      title
      state {
        id
        name
      }
      assignee {
        id
        name
      }
    }
  }
}
`;

/** Mutation to create a comment */
export const COMMENT_CREATE_MUTATION = `
mutation CommentCreate($issueId: String!, $body: String!) {
  commentCreate(input: {issueId: $issueId, body: $body}) {
    success
    comment {
      id
      body
      createdAt
      user {
        name
      }
    }
  }
}
`;
