# Git Branch Switcher for DeepSeek Harness

在 DeepSeek Harness 输入框工具行显示当前 git 分支的胶囊按钮，点击弹出分支列表，一键切换本地分支或远端跟踪分支（远端分支可一键同步）；存在未提交更改或目标分支缺失时先弹确认。界面文案按浏览器语言自动切换（zh / en）。

A composer chip that shows the current git branch of the session's working directory and switches local or remote-tracking branches from a popup menu, with a one-click `git fetch` and a confirmation step before switching on a dirty tree.

![Icon](./icon.svg)

![分支切换菜单](./docs/screenshot.png)

![同步远端分支](./docs/screenshot-fetch.png)

## 功能 / Features

- 胶囊显示当前分支（游离 HEAD 时显示“游离 HEAD”），位于输入框工具行左侧（slot `conversation.input.left`）。
- 点击弹出分支菜单：仓库根路径、未提交更改数、分支过滤框、本地分支列表（按最近提交排序，最多 500 条）。
- **一键同步远端分支**：菜单右上角的「同步远端分支」执行 `git fetch --all --prune`；完成后远端跟踪分支出现在「远端分支」分组，并提示同步结果（失败时显示 git 的错误信息）。
- **切到远端分支**：点「远端分支」里的条目即可切换；本地没有同名分支时自动执行 `git switch --track` 创建本地跟踪分支（上游即所选远端分支）。
- 切换分支前若工作区不干净或目标分支不存在，弹出确认对话框。
- 非 git 目录自动隐藏，不影响其他会话。
- 会话级数据：每个会话根据各自的工作目录独立显示分支。

## 安装 / Install

### 方式一：Git 源安装（推荐）

在 DeepSeek Harness 插件页 →「发现」→「添加市场索引」填入本仓库的索引地址，或直接用 CLI：

```bash
dsh plugin --profile desktop install git+https://github.com/milestone-17/dsh-git-branch-switcher.git
```

国内网络可用镜像通道（内容与官方仓库一致）：

```bash
dsh plugin --profile desktop install git+https://ghproxy.net/https://github.com/milestone-17/dsh-git-branch-switcher.git
dsh plugin --profile desktop install git+https://gitclone.com/github.com/milestone-17/dsh-git-branch-switcher.git
```

市场索引（自建市场或第三方 index 服务可直接引用）：

```
https://ghproxy.net/https://raw.githubusercontent.com/milestone-17/dsh-git-branch-switcher/master/market-index.json
```

### 方式二：本地目录安装

在插件页选择「安装本地包」指向本仓库目录，或：

```bash
dsh plugin --profile desktop install /path/to/dsh-git-branch-switcher
```

### 重要：安装后需要重启 DeepSeek Harness 应用

插件图在应用启动时组装，安装/更新/卸载插件后**重启应用才会生效**（正在运行的会话不受影响，重启后从侧栏恢复即可）。若重启后仍看不到分支胶囊，先确认会话的工作目录确实是一个 git 仓库——非 git 目录下胶囊会按设计自动隐藏。

### 方式三：自建插件市场索引

DSH 目前没有面向第三方的官方插件市场；插件页「发现」选项卡接受自定义市场索引 URL。把本仓库的 `market-index.json` 部署到任意静态地址（例如 GitHub Pages 或 raw 文件地址），然后在插件页「发现」里添加该 URL，即可看到并安装本插件。

```
https://<your-host>/dsh-plugins/market-index.json
```

本插件已提交收录到社区插件目录 [awesome-dsh-plugin/awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)（PR: [#12252](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/12252)），该目录是 [dsh-market](https://github.com/dsh-market/dsh-market) 市场插件的目录来源，合并后市场会自动收录；同时也登记在社区插件注册表 [zhu1090093659/dsh-community-plugins](https://github.com/zhu1090093659/dsh-community-plugins/pull/82)。仓库同时带有 `dsh-plugin` GitHub topic，可被按主题检索。

发布新版本时：更新 `market-index.json` 里 `versions[0].version`、`publishTimestamp`（Unix 秒）与 `source.commit`（40 位完整 commit SHA），推送到仓库即可。

## 工作原理 / How it works

- Host 半包（`index.js`）：`TypertRemoteService` 子类 `branchSwitcher`，三个 direct 方法：
  - `status`：解析会话工作目录 → `rev-parse --show-toplevel`、`rev-parse --abbrev-ref HEAD`、`for-each-ref refs/heads`、`for-each-ref refs/remotes`、`status --porcelain`，返回本地分支、远端跟踪分支与改动数。
  - `checkout`：本地分支直接 `git switch`；只有远端跟踪分支时 `git switch --track <remote>/<branch>` 自动建本地跟踪分支；工作区不干净或目标不存在时先返回确认请求。
  - `fetch`：`git fetch --all --prune`，随后返回刷新后的仓库状态与截断后的 git 输出。
  - 所有 git 调用经 `subprocess.spawn` 无 shell 执行，stdio 全程收集、1 MiB 上限。
- Client 半包（`client.js`）：内联 `createTypertRemoteInfo` 声明三个 direct 方法（`branchSwitcher/status`、`branchSwitcher/checkout`、`branchSwitcher/fetch`），`ctx.remote.$mount` 挂载后取 `remote.branchSwitcher` 命名空间调用；UI 注册到 `conversation.input.left`，样式全部使用 `--dsw-alias-*` 主题变量，跟随浅色/深色主题。
- 分支名经白名单校验，拒绝以 `-` 开头、含空白/控制字符、`..`、`~ ^ :` 结尾等可注入参数或引用的名称。

## 开发 / Development

```bash
pnpm install
node tests/host-smoke.test.mjs     # Host 半包：真实 git 仓库 + 本地裸库远端，覆盖状态/切换/脏树确认/fetch/远端分支跟踪
node tests/client-smoke.test.mjs   # Client 半包：模块装载、slot 注册、Remote 调用桥
```

## 隐私 / Privacy

插件只在本地执行 git 命令；`git fetch` 会按仓库自身的 remote 配置访问网络，其余命令均为本地只读/切换操作。插件不上传任何数据。

## License

MIT
