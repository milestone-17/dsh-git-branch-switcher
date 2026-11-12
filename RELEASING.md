# Releasing this plugin

## Current published artifacts

| Channel | Location | Status |
|---|---|---|
| GitHub Release | `https://github.com/milestone-17/dsh-git-branch-switcher/releases` | published, latest = `v0.9.0` |
| Git source install | `dsh plugin --profile desktop add github:milestone-17/dsh-git-branch-switcher` | works |
| Tarball | `https://github.com/milestone-17/dsh-git-branch-switcher/releases/latest/download/dsh-git-branch-switcher.tgz` | works |
| DSH market index | `market-index.json` in this repo (format 1) | published per version |
| npm | `@milestone-l/dsh-git-branch-switcher` | published, latest = `0.9.0` |

## npm authentication

This machine has **no** `registry.npmjs.org` credential configured. The `~/.npmrc`
only carries tokens for the internal mirrors, and the default registry is
`http://mirrors.npm.caocaokeji.cn/repository/npm/` (read-only for publishing).

Authenticate with a **token**, never with the account password:

```bash
npm login --registry=https://registry.npmjs.org/
# or, non-interactively, with a token from npmjs.org → Access Tokens:
npm config set //registry.npmjs.org/:_authToken <TOKEN> --location=user
npm config set registry https://registry.npmjs.org/ --location=user
```

Verify with `npm whoami --registry=https://registry.npmjs.org/`.

## Package naming

The npm package name is `@milestone-l/dsh-git-branch-switcher`. Keep
`package.json`'s `name` in sync with it, and keep the npm name referenced in
`README.md` and `market-index.json` consistent with what is actually published.

## Release procedure

1. Run the tests: `node tests/host-smoke.test.mjs` and `node tests/client-smoke.test.mjs`.
2. Bump `version` in `package.json`.
3. Update `RELEASE-NOTES.md` and `README.md`.
4. Pack: `npm pack --pack-destination dist`, then rename the tarball to
   `dist/dsh-git-branch-switcher-<version>.tgz` and copy it to
   `dist/dsh-git-branch-switcher.tgz`.
5. Commit the code, the `market-index.json` version entry, and the release commit.
6. Tag and create the GitHub Release with both tarballs attached.
7. Publish to npm: `npm publish --registry=https://registry.npmjs.org/`.

`scripts/release-v0.9.0.py` shows the GitHub-API-only path, used when git push
is unavailable.
