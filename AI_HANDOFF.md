# 千川流速：AI 接手说明

这份文件是新开发者或 AI 模型接手项目时的入口。先阅读本文件，再阅读 `docs/DEVELOPMENT.md` 和 `docs/DATA_CONTRACT.md`。所有路径均相对于项目根目录 `/Users/tangsir/千川流速`。

## 项目目标

这是一个 Chrome Manifest V3 扩展。它读取千川主播大屏已经渲染并且可见的“实时公屏” DOM，识别形如“XXX来了”的进入直播间消息，记录进入事件，计算滚动窗口内的人流速和去重观众数，并在页面浮层中展示。

当前目标是可靠统计可见 DOM，不调用千川接口、不读取隐藏数据、不 OCR、不上传用户数据。直播未开播时使用 `demo/demo.html` 进行离线验证。

## 当前状态

- 版本由 `package.json`、`package-lock.json` 和 `manifest.json` 共同维护；每次 `npm run sync` 默认递增补丁号。
- 当前分支：`main`。
- 远程仓库目标：`https://github.com/MYHOPE777/Liusu.git`，远程名约定为 `origin`。
- 当前仓库在本地还没有首个提交时，先将全部源代码、文档、测试和模拟数据作为首个版本提交。
- Chrome 安装时选择 `npm run package` 生成的原文件目录 `/Users/tangsir/千川流速/dist`，不需要压缩包。内容脚本仍只匹配主播路径；`web_accessible_resources` 只暴露 SVG 图标，`matches` 必须写为 `https://compass.jinritemai.com/*`。该字段不能使用 `/screen/anchor/talent*`，否则 Chrome 会拒绝加载清单。
- `src/route-bootstrap.js` 在 Compass 全站监听页面路由变化；它不读取公屏数据，只在登录页通过前端路由进入主播大屏时触发一次刷新，让主播路径内容脚本获得注入机会。Chrome 扩展详情中的网站访问必须允许 `compass.jinritemai.com`。
- 不安装扩展的用户入口是 `standalone/launcher.html`：首次把页面上的“千川流速启动”链接拖到 Chrome 书签栏，之后在主播大屏点击书签即可运行 `overlay-runner.js`。`bookmarklet-link.js` 由构建脚本从 `overlay-runner.js` 生成，`bookmarklet.txt` 保留为手动书签备用格式。该入口使用页面本地存储，不调用 `chrome.runtime`。
- `standalone/launcher.html` 同时校验 `compass.jinritemai.com/screen/anchor/talent` 和 `live_room_id`，并在新标签打开房间。普通用户不需要复制代码或打开 DevTools；DevTools Snippet 只作为开发调试备用入口。
- 已使用已登录的主播大屏页面验证真实结构：标题控制器为 `commentsManager`，消息面板常见 `commentsWrap--...` / `chatMessages--...` CSS Module 类名，单条消息常见 `levelMessage--...`。`src/dom-detector.js` 已跳过标题控制器并识别这些消息行；DOM 变化时继续优先修改该文件，不要绕过 DOM 去调用接口。
- 直播刷新恢复已实现：当前房间的活动 session id 放在 `sessionStorage`，事件从 IndexedDB 读回；离线 demo 使用 `localStorage` 保留模拟事件和公屏。`FlowCounter.load()` 会过滤无效持久化记录。

## 接手后的第一步

```sh
cd /Users/tangsir/千川流速
npm install
npm test
npm run check
npm run test:browser
npm run package
npm run test:browser -- dist
```

`npm run test:browser` 会先在独立 Chrome 中加载根目录真实扩展，确认加载成功，再检查 demo。手动打包后执行 `npm run test:browser -- dist` 验证 `dist/` 真实加载，避免只通过模拟页面测试却交付了无效清单。

如果需要保存当前修改并同步版本：

```sh
npm run sync
```

`sync` 默认递增补丁版本并更新三个版本文件，依次运行 `npm test`、`npm run check`、`npm run package`、`npm run test:browser -- dist`，自动在提交前验证待安装目录。验证通过后创建本地提交，然后尝试推送到 `origin/main`。网络或 GitHub 身份验证失败时，本地提交仍然保留；网络恢复后再次执行 `npm run sync` 会尝试推送待提交内容。次版本和主版本分别使用 `npm run sync -- minor`、`npm run sync -- major`。

## 不要破坏的约束

1. 只统计页面上可见的“实时公屏”行。
2. 首次加载的历史行必须建立基线，不能计入本场；空公屏异步灌入历史时使用短暂 warmup 基线。
3. 节点复用、列表滚动和同名重复进入必须分别处理：节点文本变化可以是新事件，同内容重绘不能重复计数。
4. 人流速是滚动窗口事件数除以有效窗口秒数，再乘显示单位秒数；无新事件时不使用人为衰减公式。窗口过期后速率归零。
5. 暂停和页面隐藏期间不收集事件，统计时排除暂停时长。
6. 真实直播事件只保存在浏览器本地 IndexedDB；不要把真实导出文件、浏览器缓存或昵称写入 Git。
7. Chrome 权限和内容脚本页面匹配范围保持最小：目前只有 `storage` 权限和千川主播大屏匹配规则。图标资源的 `web_accessible_resources.matches` 按 Chrome 规则使用本站 `/*`，不能照搬内容脚本的路径。

## 修改顺序

- 文字解析、统计公式、导出格式：修改 `src/detector-core.js`，同时补 `tests/core.test.cjs`。
- DOM 定位、可见性、MutationObserver、行复用：修改 `src/dom-detector.js`，同时补 `tests/dom.test.cjs`。
- IndexedDB、配置、会话、事件去重：修改 `src/background.js`，同时补 `tests/storage.test.cjs`。
- 直播页组装、定时刷新、暂停和导出调用：修改 `src/content.js`。
- 刷新恢复或会话生命周期：同时检查 `src/content.js` 的 sessionStorage 引用、`src/detector-core.js` 的 `FlowCounter.load()` 和 `src/background.js` 的 `readSession()`。
- 浮层结构和显示文案：修改 `src/panel.js`；浏览器验证看 `test-results/demo.png`。
- 离线交互：修改 `demo/demo.html`、`demo/demo.js`、`demo/demo.css`。demo 的本地状态键为 `qianchuan-flow-demo-state`，重置必须同时清空事件和该键，不把 demo 文件加入扩展 manifest。

修改后必须执行测试，再用 `npm run sync` 保存版本。完整接口、字段和样例见 `docs/DEVELOPMENT.md` 与 `docs/DATA_CONTRACT.md`。
