(() => {
	const STORAGE_KEY = "json-mate-site-language";
	const SUPPORTED_LANGUAGES = ["zh", "en"];

	const messages = {
		zh: {
			"language.label": "语言",
			"nav.primaryLabel": "主导航",
			"nav.features": "功能",
			"nav.install": "安装",
			"nav.releases": "版本",
			"footer.label": "页脚",
			"footer.tagline": "开源 JSON 浏览器扩展。",
			"footer.privacy": "隐私",
			"footer.issues": "问题反馈",
			"footer.releases": "版本记录",

			"home.title": "JSON Mate",
			"home.metaDescription": "JSON Mate 是一个面向调试场景的 JSON 浏览器扩展，支持树形查看、局部编辑、路径复制、文本转换和启动器。",
			"home.hero.eyebrow": "浏览器 JSON 扩展",
			"home.hero.title": "在浏览器里查看、编辑和转换 JSON。",
			"home.hero.summary": "打开接口响应后直接进入树形视图。右侧面板可查看路径和值，快捷工具可以处理 URL、Base64、Unicode、HTML 和大小写转换。",
			"home.hero.download": "安装到 Chrome",
			"home.hero.installOptions": "其他安装方式",
			"home.hero.releaseLabel": "当前版本信息",
			"home.hero.current": "查看最新版本",
			"home.hero.currentWithVersion": "当前版本：{version}",
			"home.hero.manual": "Chrome 商店已上架",
			"home.product.alt": "JSON Mate 工作区，左侧是树形视图，右侧是属性面板、快捷工具和显示选项。",
			"home.product.caption": "树形视图、属性面板和快捷工具在同一工作区。",
			"home.install.eyebrow": "安装",
			"home.install.title": "推荐从 Chrome 应用商店安装。",
			"home.install.summary": "Chrome 应用商店会自动分发后续更新。GitHub 保留最新发布包，方便手动安装和版本核对。",
			"home.install.gridLabel": "安装渠道",
			"home.install.release.title": "GitHub 发布包",
			"home.install.release.description": "下载最新 ZIP 备用包",
			"home.install.chrome.title": "Chrome 应用商店",
			"home.install.chrome.description": "安装后由 Chrome 自动更新",
			"home.install.edge.title": "Edge 加载项",
			"home.install.edge.description": "Microsoft Edge 商店",
			"home.install.firefox.title": "Firefox 扩展",
			"home.install.firefox.description": "Firefox 版本评估中",
			"home.install.source.title": "源代码",
			"home.install.source.description": "查看源码和问题反馈",
			"home.badges.available": "可用",
			"home.badges.planned": "规划中",
			"home.badges.open": "打开",
			"home.features.eyebrow": "功能",
			"home.features.title": "常用调试动作放在同一个工作区。",
			"home.features.tree.title": "树形查看",
			"home.features.tree.description": "打开 JSON URL 后自动接管页面，树形查看数组、对象和原始值，支持选中节点后继续操作。",
			"home.features.inspector.title": "属性面板",
			"home.features.inspector.description": "右侧面板显示路径、键、值和类型信息。面板宽度可拖动，适合宽屏调试。",
			"home.features.tools.title": "快捷工具",
			"home.features.tools.description": "URL、Base64、Unicode、HTML、大小写等转换可以直接处理当前值，也能在弹窗里单独使用。",
			"home.features.launcher.title": "启动器",
			"home.features.launcher.description": "点击扩展图标先看到输入框，再管理最近打开和收藏的 JSON 入口。",
			"home.workflow.eyebrow": "使用流程",
			"home.workflow.title": "打开响应，定位字段，再复制或转换。",
			"home.workflow.summary": "JSON Mate 的页面结构围绕这几个动作设计。内容保留在浏览器本地；遥测端点只接收匿名使用统计。",
			"home.workflow.open.title": "打开 JSON",
			"home.workflow.open.description": "直接打开接口响应，或从启动器输入 JSON URL。",
			"home.workflow.select.title": "选择字段",
			"home.workflow.select.description": "在树里选中字段，右侧面板同步显示路径和值。",
			"home.workflow.tools.title": "使用工具",
			"home.workflow.tools.description": "复制路径、打开 URL、预览图片、转换文本或编辑值。",

			"privacy.title": "JSON Mate 隐私说明",
			"privacy.metaDescription": "JSON Mate 隐私说明：扩展如何处理页面 JSON、匿名使用统计发送什么，以及如何关闭。",
			"privacy.eyebrow": "隐私",
			"privacy.heading": "JSON Mate 隐私说明",
			"privacy.intro": "JSON Mate 用于查看、编辑和转换 JSON 数据。扩展会在本地读取当前页面中的 JSON 内容来完成渲染和工具操作，但不会把 JSON 内容上传到 JSON Mate 的遥测服务。",
			"privacy.telemetry.heading": "匿名使用统计",
			"privacy.telemetry.summary": "匿名使用统计默认开启，可在扩展设置页关闭。统计用于了解活跃安装量、版本分布和核心功能入口使用情况。",
			"privacy.sent.heading": "会发送的信息：",
			"privacy.sent.installId.title": "匿名安装 ID",
			"privacy.sent.installId.description": "随机生成，仅用于区分安装，不包含账号或设备身份；服务端只保存不可逆哈希用于去重统计。",
			"privacy.sent.version.title": "扩展版本",
			"privacy.sent.version.description": "例如 0.4.2，用于判断版本分布。",
			"privacy.sent.event.title": "事件类型",
			"privacy.sent.event.description": "install、update、daily_active、viewer_open、toolkit_open。",
			"privacy.sent.environment.title": "粗粒度环境",
			"privacy.sent.environment.description": "扩展语言、浏览器大类、操作系统大类。",
			"privacy.sent.country.title": "粗粒度来源",
			"privacy.sent.country.description": "Cloudflare 提供的国家/地区码；不保存 IP、URL、域名或 referrer。",
			"privacy.sent.date.title": "日期",
			"privacy.sent.date.description": "按 UTC 日期聚合，客户端会限频发送。",
			"privacy.notSent.heading": "不会发送的信息：",
			"privacy.notSent.content.title": "JSON 内容",
			"privacy.notSent.content.description": "不会上传页面 JSON、API 响应体或用户粘贴文本。",
			"privacy.notSent.page.title": "页面信息",
			"privacy.notSent.page.description": "不会上传页面 URL、域名、路径或查询参数。",
			"privacy.notSent.actions.title": "操作内容",
			"privacy.notSent.actions.description": "不会上传 JSON path、搜索词、转换输入或转换输出。",
			"privacy.optOut.heading": "关闭方式",
			"privacy.optOut.summary": "打开 JSON Mate 设置页，关闭“发送匿名使用统计”。关闭后扩展不会继续发送遥测请求，并会清理本地遥测 ID 与发送记录。",
			"privacy.chrome.heading": "Chrome Web Store 用户数据政策",
			"privacy.chrome.summary": "通过 Google API 获得的信息会遵守 Chrome Web Store 用户数据政策，包括 Limited Use 要求。",
			"privacy.feedback.heading": "反馈",
			"privacy.feedback.prefix": "反馈问题请使用",
			"privacy.feedback.suffix": "。提交问题时请先脱敏示例数据。",
		},
		en: {
			"language.label": "Language",
			"nav.primaryLabel": "Primary navigation",
			"nav.features": "Features",
			"nav.install": "Install",
			"nav.releases": "Releases",
			"footer.label": "Footer",
			"footer.tagline": "Open-source JSON viewer extension.",
			"footer.privacy": "Privacy",
			"footer.issues": "Issues",
			"footer.releases": "Release notes",

			"home.title": "JSON Mate",
			"home.metaDescription": "JSON Mate is a browser extension for debugging JSON with a tree viewer, inspector, path copying, local editing, text transforms and a launcher.",
			"home.hero.eyebrow": "Browser JSON extension",
			"home.hero.title": "View, edit and transform JSON in the browser.",
			"home.hero.summary": "Open an API response and work with it as a tree. The inspector shows paths and values, while quick tools handle URL, Base64, Unicode, HTML and case transforms.",
			"home.hero.download": "Add to Chrome",
			"home.hero.installOptions": "Other install options",
			"home.hero.releaseLabel": "Current release details",
			"home.hero.current": "View latest release",
			"home.hero.currentWithVersion": "Current: {version}",
			"home.hero.manual": "Available on the Chrome Web Store",
			"home.product.alt": "JSON Mate workspace with a tree viewer, inspector panel, quick tools and display options.",
			"home.product.caption": "Tree viewer, inspector and quick tools in one workspace.",
			"home.install.eyebrow": "Install",
			"home.install.title": "Install from the Chrome Web Store.",
			"home.install.summary": "The Chrome Web Store delivers future updates automatically. GitHub keeps the latest release package for manual installation and version checks.",
			"home.install.gridLabel": "Install channels",
			"home.install.release.title": "GitHub Release",
			"home.install.release.description": "Download the latest ZIP package",
			"home.install.chrome.title": "Chrome Web Store",
			"home.install.chrome.description": "Automatic updates through Chrome",
			"home.install.edge.title": "Edge Add-ons",
			"home.install.edge.description": "Microsoft Edge listing",
			"home.install.firefox.title": "Firefox Add-ons",
			"home.install.firefox.description": "Firefox build under review",
			"home.install.source.title": "Source code",
			"home.install.source.description": "Browse source and issues",
			"home.badges.available": "Available",
			"home.badges.planned": "Planned",
			"home.badges.open": "Open",
			"home.features.eyebrow": "Features",
			"home.features.title": "Common JSON debugging actions in one workspace.",
			"home.features.tree.title": "Tree viewer",
			"home.features.tree.description": "JSON URLs are rendered as a navigable tree for arrays, objects and primitive values, with follow-up actions on the selected node.",
			"home.features.inspector.title": "Inspector panel",
			"home.features.inspector.description": "The side panel shows path, key, value and type details. Its width can be dragged for wide-screen debugging.",
			"home.features.tools.title": "Quick tools",
			"home.features.tools.description": "Run URL, Base64, Unicode, HTML and case transforms on the selected value, or open the tools from the popup.",
			"home.features.launcher.title": "Launcher",
			"home.features.launcher.description": "The extension popup opens with an input first, followed by recent and saved JSON endpoints.",
			"home.workflow.eyebrow": "Workflow",
			"home.workflow.title": "Open a response, select a field, then copy or transform.",
			"home.workflow.summary": "JSON Mate is structured around those repeated debugging steps. Content stays in the browser; telemetry endpoints only receive anonymous usage events.",
			"home.workflow.open.title": "Open JSON",
			"home.workflow.open.description": "Open an API response directly, or enter a JSON URL from the launcher.",
			"home.workflow.select.title": "Select value",
			"home.workflow.select.description": "Pick a field in the tree and the side panel shows its path and value.",
			"home.workflow.tools.title": "Use tools",
			"home.workflow.tools.description": "Copy paths, open URLs, preview images, transform text or edit values.",

			"privacy.title": "JSON Mate Privacy Policy",
			"privacy.metaDescription": "JSON Mate privacy policy: how the extension handles page JSON, what anonymous usage telemetry sends, and how to opt out.",
			"privacy.eyebrow": "Privacy",
			"privacy.heading": "JSON Mate Privacy Policy",
			"privacy.intro": "JSON Mate is used to view, edit and transform JSON data. The extension reads JSON from the current page locally to render the viewer and tools, and does not upload JSON content to JSON Mate telemetry services.",
			"privacy.telemetry.heading": "Anonymous Usage Statistics",
			"privacy.telemetry.summary": "Anonymous usage statistics are enabled by default and can be disabled in the extension settings. They help estimate active installs, version distribution and core entry-point usage.",
			"privacy.sent.heading": "Information sent:",
			"privacy.sent.installId.title": "Anonymous installation ID",
			"privacy.sent.installId.description": "Randomly generated to distinguish installs. It does not include account or device identity; the server stores only an irreversible hash for deduplication.",
			"privacy.sent.version.title": "Extension version",
			"privacy.sent.version.description": "For example, 0.4.2, used to understand version distribution.",
			"privacy.sent.event.title": "Event type",
			"privacy.sent.event.description": "install, update, daily_active, viewer_open, toolkit_open.",
			"privacy.sent.environment.title": "Coarse environment",
			"privacy.sent.environment.description": "Extension locale, browser family and operating-system family.",
			"privacy.sent.country.title": "Coarse location",
			"privacy.sent.country.description": "Country or region code from Cloudflare request metadata; IP, URL, domain and referrer are not stored.",
			"privacy.sent.date.title": "Date",
			"privacy.sent.date.description": "Aggregated by UTC day. The client rate-limits telemetry sends.",
			"privacy.notSent.heading": "Information not sent:",
			"privacy.notSent.content.title": "JSON content",
			"privacy.notSent.content.description": "Page JSON, API response bodies and pasted text are not uploaded.",
			"privacy.notSent.page.title": "Page information",
			"privacy.notSent.page.description": "Page URLs, domains, paths and query parameters are not uploaded.",
			"privacy.notSent.actions.title": "Operation content",
			"privacy.notSent.actions.description": "JSON paths, search terms, transform input and transform output are not uploaded.",
			"privacy.optOut.heading": "Opt out",
			"privacy.optOut.summary": "Open JSON Mate settings and turn off “Share anonymous usage statistics”. After that, the extension stops sending telemetry requests and clears the local telemetry ID and send records.",
			"privacy.chrome.heading": "Chrome Web Store User Data Policy",
			"privacy.chrome.summary": "Information received from Google APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements.",
			"privacy.feedback.heading": "Feedback",
			"privacy.feedback.prefix": "Please report issues through ",
			"privacy.feedback.suffix": ". Sanitize sample data before posting.",
		},
	};
	let latestReleaseTag = null;

	const readSavedLanguage = () => {
		try {
			const value = window.localStorage.getItem(STORAGE_KEY);
			return SUPPORTED_LANGUAGES.includes(value) ? value : null;
		} catch {
			return null;
		}
	};

	const writeSavedLanguage = (language) => {
		try {
			window.localStorage.setItem(STORAGE_KEY, language);
		} catch {
			// Storage may be blocked in private contexts; the page still switches for this session.
		}
	};

	const detectLanguage = () => {
		const saved = readSavedLanguage();
		if (saved) {
			return saved;
		}

		const browserLanguages = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
		return browserLanguages.some((language) => String(language).toLowerCase().startsWith("zh")) ? "zh" : "en";
	};

	const renderLatestRelease = (language) => {
		if (!latestReleaseTag) {
			return;
		}

		const dictionary = messages[language] || messages.zh;
		const releaseElement = document.querySelector("[data-release-version]");
		if (releaseElement) {
			releaseElement.textContent = dictionary["home.hero.currentWithVersion"].replace("{version}", latestReleaseTag);
		}
	};

	const applyLanguage = (language, shouldPersist = false) => {
		const dictionary = messages[language] || messages.zh;
		document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
		document.documentElement.dataset.language = language;

		document.querySelectorAll("[data-i18n]").forEach((element) => {
			const key = element.getAttribute("data-i18n");
			if (dictionary[key]) {
				element.textContent = dictionary[key];
			}
		});

		document.querySelectorAll("[data-i18n-attr]").forEach((element) => {
			const pairs = element.getAttribute("data-i18n-attr").split(";");
			pairs.forEach((pair) => {
				const [attribute, key] = pair.split(":").map((item) => item.trim());
				if (attribute && key && dictionary[key]) {
					element.setAttribute(attribute, dictionary[key]);
				}
			});
		});

		document.querySelectorAll("[data-lang-option]").forEach((button) => {
			const isActive = button.getAttribute("data-lang-option") === language;
			button.setAttribute("aria-pressed", String(isActive));
		});

		renderLatestRelease(language);

		if (shouldPersist) {
			writeSavedLanguage(language);
		}
	};

	const loadLatestRelease = async () => {
		if (!document.querySelector("[data-release-version]")) {
			return;
		}

		try {
			const response = await fetch("/api/release", {
				headers: { accept: "application/json" },
			});
			if (!response.ok) {
				return;
			}

			const payload = await response.json();
			if (typeof payload.tagName !== "string" || payload.tagName.length > 64) {
				return;
			}

			latestReleaseTag = payload.tagName;
			const language = document.documentElement.dataset.language || detectLanguage();
			renderLatestRelease(language);
		} catch {
			// Keep the stable “latest release” link when the version service is unavailable.
		}
	};

	document.addEventListener("click", (event) => {
		const button = event.target.closest("[data-lang-option]");
		if (!button) {
			return;
		}

		const language = button.getAttribute("data-lang-option");
		if (SUPPORTED_LANGUAGES.includes(language)) {
			applyLanguage(language, true);
		}
	});

	applyLanguage(detectLanguage());
	loadLatestRelease();
})();
