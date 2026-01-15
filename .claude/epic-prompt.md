# Sample Epic Prompt

This is a sample epic prompt file. Replace this content with your actual feature request or epic description.

## Example Usage

To use the epic-to-implementation workflow:

1. Edit this file with your feature requirements
2. Run the workflow: `claude-orchestrator run epic-to-implementation`
3. The workflow will:
   - Analyze your prompt
   - Create a feature branch
   - Generate architecture and stories
   - Implement each story
   - Run tests and review code
   - Commit all changes

## Example Epic Format

```
Add user authentication with email/password login

Requirements:
- Users should be able to register with email and password
- Users should be able to log in with their credentials
- Password should be hashed securely
- Include session management with JWT tokens
- Add password reset functionality via email

Technical considerations:
- Use bcrypt for password hashing
- JWT tokens should expire after 24 hours
- Store user data in the existing database
```

---

**Delete everything above and write your epic here:**

