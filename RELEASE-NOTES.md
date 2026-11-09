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
