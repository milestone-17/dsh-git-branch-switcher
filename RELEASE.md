# 发版流程 / Release checklist

插件有三条分发通道，各自要更新的东西不同。**发布新版本时按下面顺序做，市场的下载链接会自动跟着走，不需要再提目录 PR。**

## 通道一览

| 通道 | 装的是哪份 | 需要做什么 |
|---|---|---|
| Git 源安装 | 仓库默认分支的最新 commit | 不用管，自动跟随 |
| 目录条目的 `tarball:`（市场详情页） | **Release 里版本名固定的 .tgz** | 打 Release 时上传 `dsh-git-branch-switcher.tgz`（无版本号），目录条目指向 `releases/latest/download/...` → 自动跟随 |
| 本仓库 `market-index.json` | `versions[0].source.commit` 指定的 commit | 手动改版本号 + 时间戳 + commit sha |

> 目录规则里 **tarball 优先于源码安装命令**，所以 tarball 的版本必须是最新的。
> 用「无版本号文件名 + `releases/latest/download/`」这个组合后，以后每次发版只要上传同名资产，目录条目不用动。

## 步骤

```bash
# 1. 改版本号
npm version 0.3.0 --no-git-tag-version     # 或手改 package.json

# 2. 跑测试
node tests/host-smoke.test.mjs
node tests/client-smoke.test.mjs

# 3. 打包（两个文件名都要）
npm pack --pack-destination dist
cp dist/luochbiao-dsh-git-branch-switcher-0.3.0.tgz dist/dsh-git-branch-switcher-0.3.0.tgz
cp dist/luochbiao-dsh-git-branch-switcher-0.3.0.tgz dist/dsh-git-branch-switcher.tgz

# 4. 提交并推 tag
git add -A && git commit -m "release: v0.3.0"
git tag v0.3.0 && git push origin master --tags

# 5. 建 Release 并上传两个资产
gh release create v0.3.0 \
  --title "v0.3.0 — <一句话说明>" \
  --notes-file RELEASE-NOTES.md \
  dist/dsh-git-branch-switcher-0.3.0.tgz dist/dsh-git-branch-switcher.tgz

# 6. 更新 market-index.json（版本号 / publishTimestamp / source.commit）
#    publishTimestamp = 当前 Unix 秒：date +%s
```

## 别忘了

- [ ] `market-index.json` 的 `versions[0]`：version、publishTimestamp、source.commit 都是新的
- [ ] Release 里两个资产都在（带版本号 + 不带版本号）
- [ ] `README.md` 的截图若变了，重新跑一次截图脚本并覆盖 `docs/`
- [ ] `screenshots.json` 里列出的图片在仓库里都存在（市场详情页会按它渲染）
- [ ] 桌面 profile 是 link 到本仓库的，**重启 DSH 应用**才会加载新的 Host 代码
- [ ] 提交到权威目录的 PR 分支若需要同步（比如描述变了），推同一分支即可，不用重开 PR
