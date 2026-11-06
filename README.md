# Git Branch Switcher for DeepSeek Harness

**A composer chip that shows the current git branch of your session's working directory — TRAE-style branch switching, one-click `git fetch`, and create-a-branch-and-switch, all without leaving the chat.**

在 DeepSeek Harness 输入框工具行显示当前 git 分支的胶囊按钮：TRAE 风格的分支菜单、一键 `git fetch` 同步远端、**新建分支并立即切换过去**（源分支自己选，默认 master）；工作区不干净时先弹确认。界面文案按浏览器语言自动切换（zh / en）。

[![release](https://img.shields.io/github/v/release/milestone-17/dsh-git-branch-switcher?label=release)](https://github.com/milestone-17/dsh-git-branch-switcher/releases)
[![license](https://img.shields.io/github/license/milestone-17/dsh-git-branch-switcher?label=license)](./LICENSE)
[![stars](https://img.shields.io/github/stars/milestone-17/dsh-git-branch-switcher?style=flat&label=stars)](https://github.com/milestone-17/dsh-git-branch-switcher/stargazers)
![DSH](https://img.shields.io/badge/DSH-%3E%3D0.2.1--rc.2-2f6feb?logo=deepseek&logoColor=white)

![Icon](./icon.svg)

| 分支菜单 / Branch menu | 新建分支 / New branch | 同步远端 / Fetch |
|---|---|---|
| ![分支切换菜单](./docs/screenshot.png) | ![新建分支](./docs/screenshot-create.png) | ![同步远端分支](./docs/screenshot-fetch.png) |

## 为什么是它 / Why this one

- **胶囊在输入框工具行**（slot `conversation.input.left`），紧贴你打字的地方 —— 不用抬头去找会话头部。
- **远端分支是完整的一等公民**：一键 `git fetch --all --prune`，远端跟踪分支单独分组，可一键检出为本地跟踪分支。
- **能建分支**：菜单底部「＋ 新建分支」，选好源分支（默认 `master`）点「创建并切换」，当前会话的工作目录**立刻**落到新分支。
- **不猜你的意图**：工作区不干净、目标分支不存在时先弹确认；分支名做白名单校验，不给 git 注入留口子。
- **会话级**：每个会话按各自的工作目录独立显示分支；非 git 目录自动隐藏。
- **纯本地**：只在本地跑 git，除 `git fetch` 外不碰网络，不上传任何数据。

## 功能对照 / Feature map

| | 说明 |
|---|---|
| 当前分支胶囊 | 输入框工具行左侧；游离 HEAD 显示「游离 HEAD」；非 git 目录自动隐藏 |
| TRAE 风格菜单 | 顶部搜索框、本地/远端分组、当前分支勾选高亮、远端名胶囊标签、底部「＋ 新建分支」 |
| 切换本地分支 | `git switch`，按最近提交排序，最多 500 条 |
| 切到远端分支 | 本地无同名分支时自动 `git switch --track` 建本地跟踪分支 |
| 一键同步远端 | `git fetch --all --prune`，完成后提示结果，失败时显示 git 原始错误 |
| 新建分支并切换 | 选源分支（默认 `master` → `main` → 当前分支，也可选远端跟踪分支），`git switch -c` 后会话立即切过去 |
| 安全确认 | 脏工作区切换/新建前确认；分支名白名单校验 |

## 安装 / Install

### 方式一：Git 源安装（推荐）

```bash
dsh plugin --profile desktop install git+https://github.com/milestone-17/dsh-git-branch-switcher.git
```

国内网络可用镜像通道（内容与官方仓库一致）：

```bash
dsh plugin --profile desktop install git+https://ghproxy.net/https://github.com/milestone-17/dsh-git-branch-switcher.git
dsh plugin --profile desktop install git+https://gitclone.com/github.com/milestone-17/dsh-git-branch-switcher.git
```

### 方式二：预构建包（无需 git）

[Release v0.3.0](https://github.com/milestone-17/dsh-git-branch-switcher/releases/tag/v0.3.0) 附带 `dsh-git-branch-switcher-0.3.0.tgz`：

```bash
dsh plugin --profile desktop install https://github.com/milestone-17/dsh-git-branch-switcher/releases/download/v0.3.0/dsh-git-branch-switcher-0.3.0.tgz
```

### 方式三：市场索引

本仓库自带 `market-index.json`（DSH 官方格式，format-1），部署到任意静态地址后在插件页「发现」里添加该 URL，即可在市场里看到并一键安装：

```
https://ghproxy.net/https://raw.githubusercontent.com/milestone-17/dsh-git-branch-switcher/master/market-index.json
```

### 方式四：本地目录安装

```bash
dsh plugin --profile desktop install /path/to/dsh-git-branch-switcher
```

### ⚠️ 安装后需要重启 DeepSeek Harness 应用

插件图在应用启动时组装，安装/更新/卸载插件后**重启应用才会生效**（正在运行的会话不受影响，重启后从侧栏恢复即可）。若重启后仍看不到分支胶囊，先确认会话的工作目录确实是一个 git 仓库 —— 非 git 目录下胶囊会按设计自动隐藏。

## 收录状态 / Where to find it

- 社区插件目录 [awesome-dsh-plugin/awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)（PR: [#12252](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/12252)）—— 该目录是 [dsh-market](https://github.com/dsh-market/dsh-market) 市场插件目录的来源，合并后市场自动收录。
- 社区插件注册表 [zhu1090093659/dsh-community-plugins](https://github.com/zhu1090093659/dsh-community-plugins/pull/82)。
- 仓库带 `dsh-plugin` / `deepseek-harness` GitHub topic，可按主题检索。
- 能力卡：[unStone/dsh-xray](https://unstone.github.io/dsh-xray/p/milestone-17__dsh-git-branch-switcher.html)（C3：可 spawn 子进程 / 执行系统命令 —— git 类插件的正常评级）。

发布新版本时：更新 `market-index.json` 里 `versions[0].version`、`publishTimestamp`（Unix 秒）与 `source.commit`（40 位完整 commit SHA），并在 GitHub Release 附上新的 `.tgz`，推送到仓库即可。

## 工作原理 / How it works

- Host 半包（`index.js`）：`TypertRemoteService` 子类 `branchSwitcher`，四个 direct 方法：
  - `status`：解析会话工作目录 → `rev-parse --show-toplevel`、`rev-parse --abbrev-ref HEAD`、`for-each-ref refs/heads`、`for-each-ref refs/remotes`、`status --porcelain`，返回本地分支、远端跟踪分支与改动数。
  - `checkout`：本地分支直接 `git switch`；只有远端跟踪分支时 `git switch --track <remote>/<branch>` 自动建本地跟踪分支；工作区不干净或目标不存在时先返回确认请求。
  - `fetch`：`git fetch --all --prune`，随后返回刷新后的仓库状态与截断后的 git 输出。
  - `create`：`git switch -c <新分支> <源分支>`，源分支可以是本地分支，也可以是远端跟踪分支（解析成具体的 ref）；重名或源分支不存在时分别报 `branchSwitcher/branch-exists`、`branchSwitcher/base-missing`；工作区不干净时先返回确认请求。
  - 所有 git 调用经 `subprocess.spawn` 无 shell 执行，stdio 全程收集、1 MiB 上限。
- Client 半包（`client.js`）：内联 `createTypertRemoteInfo` 声明四个 direct 方法（`branchSwitcher/status`、`branchSwitcher/checkout`、`branchSwitcher/fetch`、`branchSwitcher/create`），`ctx.remote.$mount` 挂载后取 `remote.branchSwitcher` 命名空间调用；UI 注册到 `conversation.input.left`，样式全部使用 `--dsw-alias-*` 主题变量，跟随浅色/深色主题。
- 分支名经白名单校验，拒绝以 `-` 开头、含空白/控制字符、`..`、`~ ^ :` 结尾等可注入参数或引用的名称。

## 开发 / Development

```bash
pnpm install
node tests/host-smoke.test.mjs     # Host 半包：真实 git 仓库 + 本地裸库远端，覆盖状态/切换/脏树确认/fetch/远端分支跟踪/新建分支
node tests/client-smoke.test.mjs   # Client 半包：模块装载、slot 注册、Remote 调用桥（含 create）
```

## 隐私 / Privacy

插件只在本地执行 git 命令；`git fetch` 会按仓库自身的 remote 配置访问网络，其余命令均为本地只读/切换操作。插件不上传任何数据。

## License

MIT
