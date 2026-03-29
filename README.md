# JSON Mate

JSON Mate 是一个面向真实调试场景的 JSON 浏览器扩展。它把 JSON 查看、局部编辑、路径定位、常见值转换和独立工具箱整合到一套更顺手的工作流里，适合接口调试、日志排查、数据校验和临时转换。

## 适合做什么

- 把网页中的原始 JSON 响应渲染成可展开的树形界面
- 在右侧 workspace 中查看路径、编辑 key/value、复制路径和值
- 对当前值执行 URL、时间戳、布尔值等常见转换
- 在独立 Toolkit 中完成 Base64、Unicode、URL、HTML、大小写等转换
- 用更接近产品化的界面替代原版偏旧的交互和视觉风格

## 功能亮点

- 自动接管真实 JSON 页面：识别网页中的 JSON 后直接切到树形查看，不再停留在浏览器原生的纯文本展示
- Launcher + Recent + Collections：可从扩展入口快速打开在线示例、最近访问记录和已收藏 JSON 页面
- 收藏工作流：在查看真实 JSON 页面时，可直接加入收藏，并按 Collection 组织常用入口
- 上下文感知的 workspace：选中节点后，只显示当前值真正适用的快捷工具、图片预览和跳转动作
- 更稳的字符串编辑：字符串按原始值展示，不再被引号和转义干扰，并支持局部撤销与重做
- 图片与链接值识别：常见图片 URL、缩略图字段和外链值会自动按语义展示，而不是只当普通字符串处理
- Send to Toolkit 工作流：可把当前值送入独立 Toolkit 继续处理，并把结果回写到原来的编辑上下文
- 面向大 JSON 的渐进渲染：优先展示顶层与首批可见节点，延后计算重型元信息，减少首次打开等待
- 顶层示例数据：便于验证布尔值、时间戳、多行文本、数组、对象、图片链接等常见结构
- 多语言界面：当前支持 English、简体中文、繁體中文、日本語，扩展内页面可切换，浏览器原生扩展卡片也支持本地化
- 独立 Toolkit：适合做整段文本的集中转换和清洗
- GitHub Releases + GitHub Pages：便于公开分发、版本跟踪和对外展示

## 安装方式

### 1. Chrome Web Store

推荐的最终安装方式。通过 Chrome Web Store 安装的扩展会由浏览器自动检查并分发更新。

当前仓库已经准备好 GitHub Release 工作流，并为 Chrome Web Store 自动发布预留了 workflow step。完成商店上架和密钥配置后，这条链路即可用起来。

### 2. GitHub Releases

适合测试版分发、私下试用或手动安装。

1. 打开本仓库的 Releases 页面
2. 下载 `json-mate-vX.Y.Z.zip`
3. 解压到本地目录
4. 打开 Chromium 内核浏览器的扩展管理页
5. 开启开发者模式
6. 选择“加载已解压的扩展程序”

注意：这种方式不会自动更新，需要手动下载新版本。

### 3. 本地开发加载

适合开发和调试。

1. 克隆仓库
2. 运行 `npm install`
3. 运行 `npm run build:wxt`
4. 在扩展管理页启用开发者模式
5. 加载 `.output/wxt/chrome-mv3`
6. 修改代码后重新执行构建，或使用 `npm run dev:wxt`

## 如何使用

### 查看页面 JSON

- 打开返回 JSON 的页面
- JSON Mate 会自动识别并渲染树形结构
- 双击节点可打开右侧 workspace

### 在 Workspace 中编辑

- 选中节点后查看 `Path`、`Key`、`Value`
- 修改 key 或 value 后再执行 `Apply edit`
- `Undo edit` 适合回退手工修改，工具型动作会直接进入撤销历史

### 使用 Toolkit

- 从 workspace 中点 `More`
- 或从 launcher / options 中进入 Toolkit
- 在左侧快速过滤工具，在右侧处理整段文本
- 处理完成后可将结果回写到当前查看值，减少来回复制

## 版本与发布

- 扩展版本使用严格 `x.y.z` 的 SemVer 形式
- 发布包文件名与 `package.json` 版本保持一致，例如 `json-mate-v0.2.4.zip`
- GitHub Release workflow 以 `vX.Y.Z` tag 为发布触发源
- GitHub Pages 站点用于展示功能、安装方式和下载入口

## 更新策略

- Chrome Web Store 安装：浏览器自动检查和更新
- GitHub Releases 安装：手动下载新版本
- 本地开发加载：由开发者自行刷新

## 隐私与权限

JSON Mate 的核心能力是识别并渲染页面中的 JSON 内容，以及提供本地转换工具。扩展权限用于页面 JSON 检测、设置存储和相关页面交互。

## 链接

- 项目仓库：`https://github.com/etng/crxJsonMate`
- Releases：`https://github.com/etng/crxJsonMate/releases`
- Pages：`https://etng.github.io/crxJsonMate/`
