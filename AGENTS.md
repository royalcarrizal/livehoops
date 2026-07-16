# LiveHoops Agent Working Agreement

This file is the shared operating agreement for Codex, Claude Code, and any
other coding agent working in this repository. Follow it before making changes.
`AGENTS.md` is the single source of truth; agent-specific instruction files must
import or defer to it and must not duplicate or contradict it.

## Project basics

- LiveHoops is a mobile-first React 19 + Vite PWA.
- Supabase provides authentication, Postgres, Storage, Realtime, and Edge
  Functions. Mapbox provides maps and geocoding. Firebase provides push
  notifications.
- Install dependencies with `npm install`.
- Start locally with `npm run dev`.
- Validate code with `npm run lint`, `npm test`, and `npm run build`.
- Never commit `.env` files, API keys, service-role keys, access tokens, or
  other secrets.

## Non-negotiable Git workflow

Every feature, bug fix, refactor, database change, or documentation change must
use this complete workflow. A read-only review does not require a branch, but
the agent must create one before making any change.

1. Start from a clean, current `main`:
   - Inspect `git status` first. Never overwrite or discard another person's
     uncommitted work.
   - Switch to `main` and update it from `origin/main` using a fast-forward-only
     pull.
2. Create a fresh branch for exactly one task. Never implement directly on
   `main` and never reuse an old merged branch.
   - Codex branches: `codex/<short-task-name>`.
   - Claude branches: `claude/<short-task-name>`.
3. Make only the changes required for that branch's assigned task. Do not mix
   unrelated cleanup or another agent's assigned work into the branch.
4. Run the relevant tests while working. Before publishing, run at minimum:
   - `npm run lint`
   - `npm test`
   - `npm run build`
5. Review `git diff` and `git status`. Stage only the intended files, then make
   small, descriptive commits. Never silently include unrelated user changes.
6. Push the feature branch to GitHub with upstream tracking. Never push feature
   work directly to `main`.
7. Open a draft Pull Request from the feature branch into `main`. The PR must
   explain:
   - what changed and why;
   - tests and checks run, including any failures;
   - database migrations or manual configuration involved;
   - known risks, follow-up work, and screenshots for visible UI changes.
8. When practical, have the other agent review the PR. The agent that wrote the
   change must address valid findings on the same feature branch.
9. Do not merge the PR, deploy publicly, or run production database changes
   without the user's explicit approval.
10. After an approved merge, switch back to `main`, update from `origin/main`,
    confirm the merge, and delete the completed local branch when safe. Start
    the next task from a new branch created from this updated `main`.

An implementation task is not complete merely because the code works locally.
Unless the user explicitly requests local-only work, completion means the work
is tested, committed, pushed, documented in a draft PR, and ready for approval.

## Codex and Claude coordination

- One task has one owning agent, one branch, and one clearly stated file or
  subsystem scope.
- If both agents work at the same time, they must use separate Git worktrees as
  well as separate branches. Never run two writing agents in the same checkout.
- Before editing, inspect the current branch, worktree status, recent commits,
  and relevant existing code. Do not assume the other agent's state.
- Do not edit files owned by another active task. If scopes overlap, stop and
  ask the user to choose ownership or sequencing before continuing.
- Do not cherry-pick, rebase, merge another active branch, resolve cross-agent
  conflicts, force-push, or rewrite shared history without explicit approval.
- The preferred collaboration pattern is builder plus independent reviewer:
  Codex reviews Claude's changes, and Claude reviews Codex's changes.
- Git history, tracked SQL, and PR descriptions are the official handoff record.
  Do not rely on chat memory as the only record of important work.

## Supabase and production safety

- Save every database change as a new, clearly named, version-controlled SQL
  file under `supabase/` before applying it anywhere. Do not make dashboard-only
  schema or policy changes that are absent from Git.
- Treat row-level security, authentication, privacy, check-ins, friendships,
  admin access, location data, push notifications, and `SECURITY DEFINER`
  functions as security-sensitive. Review caller authorization and test both
  allowed and denied cases.
- Record which migration was applied, to which environment, and the result in
  the PR and handoff.
- Never run SQL against production, deploy an Edge Function, change production
  secrets, or deploy the public app without explicit user approval. Prefer
  staging verification first.
- Never use destructive Git commands or destructive database operations to
  solve a problem unless the user explicitly authorizes that exact action.

## Engineering expectations

- Read and understand the relevant implementation before editing it.
- Preserve existing behavior unless the task intentionally changes it.
- Keep changes focused, simple, and consistent with existing patterns.
- Add or update tests for behavior changes and regression fixes. Do not weaken,
  skip, or delete tests merely to make a check pass.
- For user-visible changes, verify the mobile layout and important loading,
  empty, error, offline, and permission-denied states.
- Report errors returned by Supabase instead of assuming a query succeeded.
- Do not add or upgrade production dependencies without explaining the need and
  receiving user approval.
- Update documentation when setup, architecture, environment configuration,
  database behavior, or user-visible behavior changes.

## Required handoff

At the end of every implementation task, tell the user and the next agent:

- the branch name, commit(s), and Pull Request link;
- the exact behavior implemented and the important files changed;
- the validation commands run and their results;
- every SQL migration or external configuration change, including environment
  and application status;
- anything incomplete, unverified, risky, or requiring user approval;
- the recommended next action.

Never claim a test, migration, push, deployment, merge, or production action
succeeded unless it was actually run and its result was verified.
