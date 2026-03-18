Bump the version number across all package.json files, commit, tag, push, and publish to npmjs.

## Arguments

`$ARGUMENTS` is the bump type: `patch` (default), `minor`, or `major`.

## Instructions

1. Parse `$ARGUMENTS` — if empty, default to `patch`. Valid values: `patch`, `minor`, `major`.
2. Read the current version from `package.json` (root).
3. Compute the new version by bumping the appropriate semver segment.
4. Update `version` in all package.json files that share the same version:
   - `package.json`
   - `agent/dashboard/package.json`
5. Show the before/after version.
6. Update any hardcoded CLI version reference in `src/cli.ts` if present.
7. Build the project with `npm run build`.
8. Commit with `git commit -m "chore: bump version to A.B.C"`.
9. Tag with `git tag vA.B.C`.
10. Push commits and tags.
11. Publish with `npm publish --access public --//registry.npmjs.org/:_authToken=$NPMJS_PUBLISH_TOKEN`.
12. Never print the token value.
