# Release Runbook

GitPlus releases are managed by Release Please and GitHub Actions.

## Required Secrets

- `RELEASE_PLEASE_TOKEN`: Fine-grained PAT or GitHub App token that can merge approved PRs, trigger downstream workflows, and create release PRs, labels, tags, and releases. Do not use the default `GITHUB_TOKEN`; bot-authored PRs from `GITHUB_TOKEN` do not trigger required downstream workflows.
- `NPM_TOKEN`: npm automation token with publish access for `@neublink/gitplus`.
- `CLAUDE_CODE_OAUTH_TOKEN`: Claude Code OAuth token used by Claude-related CI workflows.

## Expected Flow

1. Merge conventional commits to `main`.
2. `Release Please` runs on the `main` push and opens or updates the release PR.
3. Maintainers review and merge the release PR.
4. Release Please creates the GitHub release and tag.
5. `.github/workflows/release.yml` runs on the tag, validates the package, publishes to npm, and smoke-tests the published package.

## Verify a Release

- GitHub: confirm the tag and release exist at `https://github.com/neublink/gitplus/releases`.
- GitHub Actions: confirm the `Release` workflow completed successfully for the release tag.
- npm: run `npm view @neublink/gitplus version` and confirm it matches the GitHub release.
- Install smoke test: run `npm install -g @neublink/gitplus@<version>` and then `gitplus --version`.

## Manual Recovery

Use this when a bot-authored merge or missed event suppresses the expected push workflow.

1. Open GitHub Actions and select `Release Please`.
2. Click `Run workflow` on `main`.
3. Confirm the run uses `RELEASE_PLEASE_TOKEN` and completes successfully.
4. If a release PR is opened or updated, merge it after checks pass.
5. Confirm the tag-triggered `Release` workflow starts. If it does not, rerun `Release Please` once after verifying the tag was not already created.
6. Verify GitHub and npm using the checks above.

If npm publish failed after the GitHub release was created, rerun the failed `Release` workflow job after confirming `NPM_TOKEN` is still valid and the package version has not already been published.
