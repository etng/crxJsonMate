# Iframe Viewer 参考规格

## 范围

这份文档只定义嵌入式 iframe viewer 的参考行为。

纳入范围：

- 受支持的原始 JSON payload 页面自动接管
- iframe 内的树渲染、检查区、行内链接入口和图片预览
- 接管页里的工作区开合行为
- 搜索、编辑、撤销/重做、快捷工具、值转换，只要它们出现在 iframe 壳里

不在范围内：

- detached viewer 独立窗口的 standalone 布局
- 独立的 `viewer.html`
- iframe 之外的 toolkit 页面行为

新增纳入范围：

- `raw` / `pretty` 这类字符串值作为独立 JSON 文档在新窗口打开的 handoff 流程
- 点击浏览器工具栏图标后的 launcher 入口

## 参考基线

- 基线 release tag：`v0.2.2`
- 基线提交：`fd8fc2e`（`chore(release): publish v0.2.2`）
- 参考 worktree：`/Users/y10n/tmp/crx_ext_JsonMate-legacy-ref`

这个参考 worktree 是从基线 tag 建出来的，只用于观察，不修改当前开发工作区。

## 参考源码

- [content_scripts.js](/Users/y10n/tmp/crx_ext_JsonMate-legacy-ref/content_scripts.js)
- [viewer.html](/Users/y10n/tmp/crx_ext_JsonMate-legacy-ref/json-mate/viewer.html)
- [viewer-bootstrap.js](/Users/y10n/tmp/crx_ext_JsonMate-legacy-ref/json-mate/js/viewer-bootstrap.js)
- [json-mate-viewer.js](/Users/y10n/tmp/crx_ext_JsonMate-legacy-ref/json-mate/js/json-mate-viewer.js)
- [background.js](/Users/y10n/tmp/crx_ext_JsonMate-legacy-ref/background.js)

## 参考行为

### 嵌入式接管

- content script 识别受支持的原始 payload 后，会在当前页面内注入一个全页 iframe overlay。
- 注入的 iframe 指向 `json-mate/viewer.html?type=iframe`。
- 在 iframe 初始化期间，原页面会显示 loading tip。
- iframe 会先向父页面发送 `viewerLoadedOk`，然后父页面再用 `postJson` 把数据送进去。
- 默认嵌入流是“覆盖当前页”，不是另开新标签页。
- 浏览器工具栏图标点击后的 launcher，也应落到这套 iframe viewer 壳，而不是旧的 standalone 弹框。
- 如果当前页选中了可解析的 JSON / JSONP / JSONL，launcher 会直接带着这份内容进入 viewer。
- 如果当前页选中了文本但尚不能整体解析，launcher 会打开同一套 viewer 壳，并把选中文本放进手工输入区。
- 如果当前页没有选中文本，launcher 仍然打开同一套 viewer 壳，并提供空的手工输入区。
- launcher 空态不应只是光秃秃的空页面；应同时给出手工输入区、可直接试用的 fixture 入口，以及可打开地址的入口。
- launcher 默认应使用新标签页，而不是弹窗。

### 工作区壳

- 面板打开和收起都由右上角同一个 logo handle 负责。
- 这个 handle 是独立浮在右上角的品牌图标，不是面板头部里另一个不同形态的按钮。
- 收起后，只保留这个 logo handle 本身，不再额外出现左侧或别处的大 badge，也不保留右侧背景。
- 用户点击这个 handle 时，应隐藏右侧全部控制和背景；再次点击则恢复。
- 工作区一旦收起，树选择本身不应把它自动重新打开。
- 全局设置入口属于整个工作区，不应挂在“显示选项”这个局部区块的头部里。
- 面板里包含：树操作、路径检查、key 编辑、value 编辑、快捷工具、显示选项。
- 嵌入壳不依赖 standalone viewer 的 hero 布局。

### 树与检查区

- 树行可以被选中。
- 展开/收起点击区与整行选择是分开的。
- 当前节点会同步更新 `Path`、`Key` 和 value 编辑器。
- 节点保持选中时，用户应能持续编辑 value，不会被同步逻辑立刻改回旧值。
- 右侧 `Path` 字段不应带 `Root.` 前缀；它应显示可编辑路径本体，根节点可为空。
- URL 可以通过明显的行内入口打开，而不是只能从 inspector 里打开。
- 图片类值会显示行内预览，点击后打开图片预览弹层。
- 当树行处于选中态时，URL 行内图标要跟随选中态反色，不能因为颜色不反转而看不清。

### 编辑与工具

- `Apply edit`、`Undo`、`Redo`、`Copy`、快捷工具，都是嵌入式工作流的一部分。
- 当非字符串值的编辑内容无法按原类型解析时，不应静默丢弃；应明确让用户选择忽略本次写入，或按字符串保存。
- 当当前值可压缩或拼接时，`Single line` 应可用。
- 显示选项的切换会直接影响树的当前渲染。
- 显示选项里应有一个总开关式的“极简模式”。
- 极简模式应作为单独的一块，不和下面那组细节显示开关混在同一个层级里。
- 当极简模式打开时，下方细节显示开关不再生效，树回到更克制的基础显示。
- 即使极简模式打开，值显示仍然保留。
- 当极简模式关闭时，下方细节显示开关重新按各自配置生效。
- 链接按钮应有单独的显示开关，默认打开。
- 链接按钮属于值旁边的附加显示，应受极简模式约束。
- 右侧显示选项在 iframe 模式下必须保留，不能因为模式收口而直接砍掉。
- 至少应保留图标、数组长度、数组索引、值预览、图片预览、文件夹图标这些切换项。
- 图片预览本身必须受显示选项控制，关闭后树上不再出现图片缩略预览。
- toolkit 在 iframe 模式里应以内嵌 overlay 打开。
- 如果某个字符串值本身可解析为 JSON / JSONP / JSONL，应提供“作为 JSON 在新窗口打开”的入口。
- `raw` / `pretty` 这类多行 JSON 字符串也应走这条入口。
- 这条入口应把值当成一份新的文档，而不是把当前整页文档重新打开。
- 这条入口只对首字符明确为 `[` 或 `{` 的字符串值开放。
- `12.34` 这类普通数字字符串不应被当成下一层 JSON。
- 新窗口应通过扩展页 URL 参数拿到原始 JSON 文本，再按现有自动识别链解析。
- 新窗口应同时拿到来源 path 和来源页面 URL，便于多标签页区分来源。
- 新窗口应继续使用 embedded iframe takeover 那套界面壳，不再落到 standalone viewer 的另一套布局。
- detached viewer 的标签标题应由来源 path、来源 URL、`JSON Mate Viewer` 组成。

### 搜索

- 搜索应是嵌入式弹层，而不是整页替换。
- 搜索按钮属于树操作条的一部分，应与展开/收起按钮编组在一起。
- 在切换搜索模式时，输入框焦点应保持稳定。
- 再次打开搜索时，应记住上一次使用的是 `Keys` 还是 `Values`。
- 搜索结果的选择路径应与直接点击树节点使用同一套状态链。
- 搜索历史要保留该条记录使用的是哪种模式。

## 禁止串味项

- 不要把 standalone viewer 的 hero 区控件串进 embedded iframe 壳。
- 不要在 iframe 接管页显示 pending-payload-only 控件。
- 不要把 URL 入口移到只有 inspector 里可见，而树和值行里没有。
- 不要让搜索因为 rerender 或延迟 focus 导致输入框重新选中或被清空。
- 不要让 icon-only 控件截获本该打到树行上的点击。
- 不要把图片预览入口和普通外链入口混成同一类交互。

## 验收清单

### A. 接管壳

- [ ] 打开受支持的原始 payload 页面时，会在当前页面内注入 iframe overlay。
- [ ] iframe 覆盖当前页，而不是默认新开标签页。
- [ ] loading tip 只在 iframe 初始化期间出现。
- [ ] 嵌入壳不暴露 standalone 专属控件。
- [ ] 浏览器工具栏 launcher 不会掉回旧的 standalone 坏壳。
- [ ] 浏览器工具栏 launcher 的默认打开方式是新标签页。

### B. 工作区面板

- [ ] 右上角独立的 logo handle 能稳定切换工作区开合。
- [ ] 收起后只保留右上角同一个 logo handle。
- [ ] 面板开合状态对用户来说是清楚的。
- [ ] 嵌入面板不泄漏 detached-viewer-only 控件。
- [ ] 嵌入面板不泄漏 pending-payload-only 控件。

### C. 树交互

- [ ] 点击可见树行能稳定选中对应节点。
- [ ] 展开/收起不会抢走行点击。
- [ ] count badge 和图标不会让整行看起来点不中。
- [ ] 首次进入时的第一下点击，手感应立即且可靠。

### D. 检查区一致性

- [ ] 选中节点后，`Path`、`Key`、value 编辑器会一起更新。
- [ ] 节点保持选中时，value 编辑器可以持续输入，不会被同步逻辑立刻重置。
- [ ] `Path` 字段不显示 `Root.` 前缀。
- [ ] `Copy path`、`Copy key`、`Copy value` 始终对应当前节点。
- [ ] `Undo` / `Redo` 会正确反映最后一次手工编辑状态。
- [ ] `Single line` 在适用时会明显改变编辑器表现。

### E. URL 与媒体

- [ ] `homepage` 这类 URL 值会显示明显可见的行内跳转入口。
- [ ] URL 入口点击后会按预期开新标签页或新窗口。
- [ ] URL 行内图标在节点选中态下仍然清晰可见。
- [ ] `avatar`、`logo`、`thumbnail` 这类字段会显示图片预览。
- [ ] 非图片 URL 不会被误判成图片。

### F. 搜索

- [ ] 搜索按钮位于树操作条中，而不是单独漂浮在别处。
- [ ] 打开搜索后，焦点落在输入框中。
- [ ] 在 `Keys` 和 `Values` 间切换后，焦点仍留在输入框中。
- [ ] 再次打开搜索时，会延续上一次使用的搜索模式。
- [ ] 输入过程中，不会被 rerender 或延迟 select 覆盖。
- [ ] 搜索历史会同时保留 query 和 mode。
- [ ] 选择搜索结果后，会跳到节点并同步更新检查区。

### G. E2E 覆盖

- [ ] `sample-object.json`
- [ ] `sample-array.json`
- [ ] `sample-tools.json`
- [ ] `sample-types.json`
- [ ] `sample-search.json`
- [ ] `sample.jsonl`
- [ ] `sample.jsonp`
- [ ] `noise.html` 或其他普通 HTML 页面不能被误接管
- [ ] raw/pretty 打开下一层时，detached viewer 标题包含来源 path 和来源 URL

## 建议的 E2E 场景

- [ ] 在受支持的 JSON 页面上，embedded takeover 会出现，iframe 能加载成功。
- [ ] 点击树行会把检查区同步到同一个节点。
- [ ] URL 值会显示明显可见的行内打开入口。
- [ ] 图片值仍会打开图片预览弹层。
- [ ] 右上角同一个 toggle 图标可以收起并重新展开工作区。
- [ ] `Expand current / Collapse current / Expand all / Collapse all` 会真实改变树的展开状态。
- [ ] 搜索能打开、保留焦点，并允许持续输入。
- [ ] 搜索历史能区分 `Key` 和 `Value` 查询。
- [ ] 手工编辑之后，`Undo` / `Redo` 能正确往返恢复。
- [ ] 当前值适用时，`Single line` 会明显压缩编辑器内容。
- [ ] iframe 里的显示选项仍然存在，且图片预览开关会真实改变树上的预览展示。
- [ ] 极简模式打开后，下方细节显示开关失效；关闭后恢复。

## 验证说明

legacy 参考 worktree 只用于观察。创建 worktree 的过程没有改动当前开发工作区。
