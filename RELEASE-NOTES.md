# v0.4.0 — 推送与合并 + 菜单质感升级

## 新能力 / New

- **推送服务**：菜单底部新增「↑ 推送」——列出当前分支全部未提交改动（新增/修改/删除/重命名/未跟踪），**勾选任意子集** → 填提交信息 → 提交并推送；首推自动建立上游（`-u origin HEAD`）；工作区干净时一键推送已有提交；远端拒绝时展示 git 原始错误，绝不 force push。
- **合并服务**：菜单底部新增「⇆ 合并」——来源/目标双下拉均可手选，**目标默认推断为来源分支的拉取来源**（建分支时记录 → 上游 → merge-base → master/main 三级回退）；合并后自动回到你原来的分支；冲突时列出冲突文件并提供「放弃合并」一键回滚。
- **方法数 4 → 8**：`status` / `checkout` / `fetch` / `create` / `changes` / `push` / `merge` / `mergeAbort`。

## 菜单质感 / Polish

- 圆角阶梯统一（菜单 16px、行/输入/按钮 10px、胶囊全圆），多层柔和阴影；
- 菜单入场动画（淡入 + 上移 + 微缩放，140ms）、面板切换过渡；
- 全部交互元素补齐 hover / active / `:focus-visible` 品牌色焦点环；
- 细圆角滚动条、圆角复选框（品牌色选中态）。

## 安全 / Safety

- 勾选文件用 `:(literal)` pathspec 传给 git，天然支持空格与中文路径，无注入面；
- 提交信息经 spawn argv 传递（无 shell）；
- 脏工作区在切换/新建/**合并**前都会先请求确认。

## 安装 / Install

```bash
dsh plugin --profile desktop add github:milestone-17/dsh-git-branch-switcher
```

或无需 git 的 tarball：`https://github.com/milestone-17/dsh-git-branch-switcher/releases/latest/download/dsh-git-branch-switcher.tgz`

> 装完需完全重启 DeepSeek Harness 应用（Host 半包随应用加载）。
