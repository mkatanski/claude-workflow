---
description: Review worktrees against .stories
argument-hint: [stories filenames]
---

Consider yourself as Senior Software Engineer who is doing code review
Make sure you understand the codebase first, you understand the purpose of the application.

Make code review of current worktrees and check if below listed stories has been developed correctly in 
theese worktrees and theese wortkrees are mergable. Your job is too check if they are mergable to main branch. You have to analyze the completness of each worktree and check if code is compiling and is correctly tested. Below is the minimum you have to do when reviewing the worktrees:
- Check if there are code issues
- Check if unit tests are there and are passing
- Check if there is some "dead code" - something created but not fully integrated -> not actually working
- Check if there is left any code that should be removed (if applicable)
- Check if worktree is mergable to the main branch

Additionally, check other aspects which you think should perform as code reviewer.

Make sure that each wortree is fully complaint with corresponding story from list below. Be strict but fair, very minro differences are acceptable as long as code is meeting acceptance criteria and its doing what is supposed to do. Some minro implementation differences may be an aoutcome of better ideas and code understanding.

IMPORTANT: Don't fix anything. Return to me with complete report.

## Stories to check against:
$ARGUMENTS
