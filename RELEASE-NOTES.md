# v0.7.5 — 重做 diff 面板：右侧大图、按文件查看、带 +N/-M 统计

## 改进 / Improvements

- **diff 面板改为右侧大面板**：点击「查看变更」后自动以固定右侧面板打开，宽度最大 900px，不再挤在分支弹出菜单里。
- **按文件查看 diff**：左侧列出所有变更文件（含未跟踪文件），点击文件名右侧只显示该文件的 diff。
- **文件级 +N/-M 统计**：每个文件后面显示新增/删除行数，与第二张图一致。
- **语法高亮 diff 行**：新增行绿色背景、删除行红色背景、元信息（@@、diff header）灰色。
- **未跟踪文件样式**：紫色「U」标签，与增删改重命名区分。

## 安装 / Install

```bash
dsh plugin --profile desktop add github:milestone-17/dsh-git-branch-switcher
```

或无需 git 的 tarball：`https://github.com/milestone-17/dsh-git-branch-switcher/releases/latest/download/dsh-git-branch-switcher.tgz`

> 装完需完全重启 DeepSeek Harness 应用（Host 半包随应用加载）。

---

# v0.7.4 — 修复 diff 面板报错「branchSwitcher[diff] is not a function」

## 修复 / Fixes

- **补声明 Host `snapshot` / `diff` 方法**：v0.7.0-v0.7.3 只在 Host `index.js` 里实现了方法，却漏了在 Client `createTypertRemoteInfo` 里声明，导致 DSH 运行时没有真正挂载这两个方法，点击「查看变更」就报 `child.remote.branchSwitcher[diff] is not a function`。现在补上了完整的 request/result codec 与 Remote 方法声明。

## 安装 / Install

```bash
dsh plugin --profile desktop add github:milestone-17/dsh-git-branch-switcher
```

或无需 git 的 tarball：`https://github.com/milestone-17/dsh-git-branch-switcher/releases/latest/download/dsh-git-branch-switcher.tgz`

> 装完需完全重启 DeepSeek Harness 应用（Host 半包随应用加载）。

---

# v0.7.3 — 修复 diff「全部变更」不显示未跟踪文件的问题

## 修复 / Fixes

- **diff 的「全部变更」现在包含未跟踪文件**：之前 `git diff HEAD` 不会列出 untracked 文件，导致工作区明明有一堆新文件，diff 面板却显示「没有可显示的变更」。现在改走 `git status --porcelain -z` 取文件列表，未跟踪文件会标为「未跟踪」；同时会为未跟踪文本文件合成统一 diff patch，点击后能看到完整新增内容。

## 安装 / Install

```bash
dsh plugin --profile desktop add github:milestone-17/dsh-git-branch-switcher
```

或无需 git 的 tarball：`https://github.com/milestone-17/dsh-git-branch-switcher/releases/latest/download/dsh-git-branch-switcher.tgz`

> 装完需完全重启 DeepSeek Harness 应用（Host 半包随应用加载）。

---

# v0.7.2 — 修复 diff「全部变更」加载卡住的问题

## 修复 / Fixes

- **diff 的「全部变更」不再卡住**：v0.7.1 把「全部变更」改成先 `snapshot` 整个工作区再 `diff`，对大仓库会明显变慢甚至一直显示「正在加载 diff…」。现在「全部变更」直接走 `git diff HEAD`（Host `diff` 新增 `to: "WORKTREE"` 语义），不再写临时索引/树对象；只有「最近基线」才需要快照。

## 安装 / Install

```bash
dsh plugin --profile desktop add github:milestone-17/dsh-git-branch-switcher
```

或无需 git 的 tarball：`https://github.com/milestone-17/dsh-git-branch-switcher/releases/latest/download/dsh-git-branch-switcher.tgz`

> 装完需完全重启 DeepSeek Harness 应用（Host 半包随应用加载）。

---

# v0.7.1 — 修复 diff「全部变更」为空的问题

## 修复 / Fixes

- **diff 的「全部变更」现在能正确显示改动**：之前错误地传了 `from=HEAD, to=HEAD`，导致无论工作区有多少改动都显示「没有可显示的变更」。现在会先用 `snapshot` 捕获当前工作区，再对比 `HEAD → 当前工作区`。

## 安装 / Install

```bash
dsh plugin --profile desktop add github:milestone-17/dsh-git-branch-switcher
```

或无需 git 的 tarball：`https://github.com/milestone-17/dsh-git-branch-switcher/releases/latest/download/dsh-git-branch-switcher.tgz`

> 装完需完全重启 DeepSeek Harness 应用（Host 半包随应用加载）。

---

# v0.7.0 — 侧栏模式 + 查看变更 / Diff 视图

这一版解决两个长期痛点：**分支面板太窄** 和 **想看 AI 这一轮改了什么必须切到 IDE**。

## 新能力 / New

- **侧栏模式**：点击分支面板搜索栏右侧的停靠按钮，面板从输入框上方弹层切换为右侧固定侧栏，宽度更大、内容不再被压缩；再次点击恢复弹层。模式通过 `localStorage` 记住，刷新后保持。
- **查看变更 / Diff 视图**：菜单底部新增「⇄ 查看变更」入口，打开后显示：
  - 范围选择器：「全部变更」（工作区 vs HEAD）或「最近基线」（工作区 vs 最近一次自动/手动快照）。
  - 文件列表：按新增、修改、删除、重命名分类，点击文件切换右侧 diff。
  - 统一 diff：显示完整的 `@@` hunks，新增/删除行视觉区分。
- **自动基线快照**：打开 diff 视图、完成推送/合并/暂存/恢复暂存/放弃合并后，Client 自动调用 Host 的 `snapshot` 方法记录当前工作树，为「最近基线」提供对比点；每个会话保留最近 32 条快照。

## 实现 / Implementation

- Host 新增 `branchSwitcher/snapshot` 与 `branchSwitcher/diff` 两个 direct 方法。
- `snapshot` 使用临时 `GIT_INDEX_FILE` 捕获工作树为 git tree 对象，不污染原索引。
- `diff` 支持 `HEAD` 与任意快照 id 的对比，返回文件列表与统一 diff patch。

## 安装 / Install

```bash
dsh plugin --profile desktop add github:milestone-17/dsh-git-branch-switcher
```

或无需 git 的 tarball：`https://github.com/milestone-17/dsh-git-branch-switcher/releases/latest/download/dsh-git-branch-switcher.tgz`

> 装完需完全重启 DeepSeek Harness 应用（Host 半包随应用加载）。

---

# v0.6.1 — 降低操作恐惧 + 首次安装引导 + 文案聚焦利益

这一版针对“用户装了但不知道在哪”“点了推送/合并怕点错”做体验优化。

## 修复 / Fixes

- **默认源分支优先 `main`**：新建分支时，源分支默认值从 `master → main → 当前分支` 改为 `main → master → 当前分支`，贴合现代仓库命名习惯。

## 新能力 / New

- **推送前看清会发生什么**：推送面板在改动列表上方新增一行结果摘要，例如“将提交 3 个文件到 feature-x，并推送到 origin/feature-x”；只推已有提交时显示“将推送 2 个提交到 origin/feature-x”。
- **合并前看清会发生什么**：工作区不干净触发合并确认时，确认框标题下方新增摘要“将把 feature-x 合并进 main，合并后回到 current-branch”。
- **首次安装引导**：安装后若当前会话还不是 git 仓库，会显示一个提示状态的「Git」胶囊；悬停即可看到“打开一个 git 仓库后，这里会显示当前分支”，点一下消失，不再打扰。
- **README 与市场描述重写**：从功能罗列转向“不离开聊天”“不挡草稿”“方向明确”三个利益点，帮助新用户 3 秒内理解价值。

## 安装 / Install

```bash
dsh plugin --profile desktop add github:milestone-17/dsh-git-branch-switcher
```

或无需 git 的 tarball：`https://github.com/milestone-17/dsh-git-branch-switcher/releases/latest/download/dsh-git-branch-switcher.tgz`

> 装完需完全重启 DeepSeek Harness 应用（Host 半包随应用加载）。

---

# v0.6.0 — 弹层贴合输入区 + 来源→目标流向 + 改动列表秒开

这一版修的是三件真会被日常撞上的事：**面板挡住了输入框**、**看不出推送/合并的方向**、**每次进面板都要干等改动列表**。

## 修复 / Fixes

- **弹层不再遮挡输入区**：推送面板以前会盖住输入卡片，把「提交信息」和发送按钮挤出屏幕，推送按钮点不到。现在面板挂到页面根节点、停靠在输入卡片**上方**，高度按「输入卡片上沿 − 会话头部」计算并限高（超出部分在面板内滚动）；内容变高、页面滚动或窗口缩放时都会自动重新定位。
- **外部点击判定修正**：面板移出胶囊 DOM 后，点面板内部不再被误判成「点了外面」而关掉；点面板外仍然关闭，Esc 行为不变。
- **Host 取数压到一轮**：`changes` 改用 `git status --porcelain -z --branch` 一次拿到改动条目、当前分支、上游与领先提交数；`git remote` 与合并中探测与之并发执行，去掉了被取代的两次 spawn。

## 新能力 / New

- **来源 → 目标流向**：推送面板顶部显示「本地分支 → 上游远端分支」（还没有上游时显示「尚无上游，首次推送会自动建立」）；合并面板顶部显示随选择实时更新的「来源 → 目标」流向条，两个下拉之间还有一枚朝下的箭头；来源与目标相同时流向条会同时给出提示。
- **改动列表秒开**：菜单打开时后台预取一次改动快照，推送 / 暂存 / 合并三个面板共用同一份快照，不再每次进面板都重新读一遍；合并面板改为**一次** `changes` 调用同时拿到改动列表与目标分支推断。推送、暂存、恢复暂存、合并成功后快照自动作废，下次进入面板重新取数。预取失败只记日志，菜单照常可用；真正进面板时取数失败仍落到既有错误提示，不会误报「工作区是干净的」。

## 安装 / Install

```bash
dsh plugin --profile desktop add github:milestone-17/dsh-git-branch-switcher
```

或无需 git 的 tarball：`https://github.com/milestone-17/dsh-git-branch-switcher/releases/latest/download/dsh-git-branch-switcher.tgz`

> 装完需完全重启 DeepSeek Harness 应用（Host 半包随应用加载）。
