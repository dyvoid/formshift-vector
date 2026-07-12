# Git Strategy for Formshift: Vector

## Core Approach: Trunk-Based Development

Single `main` branch. Short-lived branches (hours, not days). Everything merges fast or gets scrapped.

Direct commits to `main` are the exception, not the norm -- see [Branch Protection](#branch-protection)
for the two cases where they're allowed.

---

## Branch Naming

```
main
task/layer-stack-ui
experiment/konva-canvas-interaction
fix/stale-response-race
```

---

## Merging

- **Fast-forward only** -- no merge commits, keeps history linear
- **Rebase onto `main`** before merging, never merge `main` into your branch
- **No squashing** -- each atomic commit is a meaningful unit; squashing destroys the audit trail

---

## Commits

One commit = one AI task or prompt session. Keep commits atomic and scoped.

AI-generated code has no inherent intent -- the commit message is the only record of *why* this code
exists. Use [Conventional Commits](https://www.conventionalcommits.org):

```
feat(stack): drag-to-reorder for raster layers
fix(preview): discard superseded trace responses
chore(deps): update lockfile
```

Annotate AI-assisted commits in the body, not the subject, to keep the subject readable:

```
feat(stack): drag-to-reorder for raster layers

ai-assisted: <model>
```

---

## Feature Flags

Use feature flags to manage incomplete work on `main`. Without them, trunk-based development forces a
choice between blocking merges until a feature is done or shipping incomplete code. Feature flags
remove that tradeoff: merge when the code is safe, release when the feature is ready.

---

## Generated Sources

Do not commit generated source files. They create noisy diffs and painful merge conflicts. Commit
lockfiles for reproducibility; regenerate everything else from source. Bundled artifacts (the
embedded Python runtime, the Formshift Server package, the potrace binary) are build-time packaging
inputs and never live in this repo.

---

## Code Review

Review diffs skeptically -- AI code looks clean but can be subtly wrong.

High-blast-radius files always get manual review:

- `.gitignore`
- Anything touching the server connection (auth-token handling, port capture) or shell-level
  security surface (preload/IPC, content security policy)
- Packaging/installer configuration -- it distributes a GPL-2.0 potrace binary, so this is a
  licensing boundary, not just build plumbing (see the Packaging section of
  [Design](architecture/design.md))
- CI/CD config

---

## CI

CI is load-bearing for trunk-based development -- slow or weak pipelines break the entire strategy.

Before anything merges to `main`:

- All existing tests must pass
- New code must be covered by tests -- AI optimizes for code that *looks* correct, not code that *is* correct
- Build must succeed
- Lint and type-check must pass (concrete tools land with the stack ADR; whatever they are, they gate)

---

## Branch Protection

Enforce the strategy at the repo level on GitHub:

- No direct push to `main`, with two exceptions:
  - Non-functional changes (documentation, comments, formatting) that touch no runtime behavior
  - The user has explicitly authorized a direct commit to `main` for this change
- Neither exception is a standing default -- re-evaluate every time. When in doubt, branch.
- Require fast-forward / rebase-based merges
- Require CI to pass before merge

---

## Versioning

Tag meaningful milestones (M0, M1, M2... per `docs/ROADMAP.md`), plus semantic-version tags once
installers ship to real users (M1 delivers the first packaged installer). Pre-M1, milestone tags
are sufficient.
