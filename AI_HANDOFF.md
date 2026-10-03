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
- 真实直播 DOM 尚未在开播状态下验证；DOM 变化时优先修改 `src/dom-detector.js`，不要绕过 DOM 去调用接口。

## 接手后的第一步

```sh
cd /Users/tangsir/千川流速
npm install
npm test
npm run check
npm run test:browser
npm run package
```

如果需要保存当前修改并同步版本：

```sh
npm run sync
```

`sync` 默认递增补丁版本，运行全部验证，更新三个版本文件，创建本地提交，然后尝试推送到 `origin/main`。网络或 GitHub 身份验证失败时，本地提交仍然保留；网络恢复后再次执行 `npm run sync` 会尝试推送待提交内容。次版本和主版本分别使用 `npm run sync -- minor`、`npm run sync -- major`。

## 不要破坏的约束

1. 只统计页面上可见的“实时公屏”行。
2. 首次加载的历史行必须建立基线，不能计入本场；空公屏异步灌入历史时使用短暂 warmup 基线。
3. 节点复用、列表滚动和同名重复进入必须分别处理：节点文本变化可以是新事件，同内容重绘不能重复计数。
4. 人流速是滚动窗口事件数除以有效窗口秒数，再乘显示单位秒数；无新事件时不使用人为衰减公式。窗口过期后速率归零。
5. 暂停和页面隐藏期间不收集事件，统计时排除暂停时长。
6. 真实直播事件只保存在浏览器本地 IndexedDB；不要把真实导出文件、浏览器缓存或昵称写入 Git。
7. Chrome 权限和页面匹配范围保持最小：目前只有 `storage` 权限和千川主播大屏匹配规则。

## 修改顺序

- 文字解析、统计公式、导出格式：修改 `src/detector-core.js`，同时补 `tests/core.test.cjs`。
- DOM 定位、可见性、MutationObserver、行复用：修改 `src/dom-detector.js`，同时补 `tests/dom.test.cjs`。
- IndexedDB、配置、会话、事件去重：修改 `src/background.js`，同时补 `tests/storage.test.cjs`。
- 直播页组装、定时刷新、暂停和导出调用：修改 `src/content.js`。
- 浮层结构和显示文案：修改 `src/panel.js`；浏览器验证看 `test-results/demo.png`。
- 离线交互：修改 `demo/demo.html`、`demo/demo.js`、`demo/demo.css`，不把 demo 文件加入扩展 manifest。

修改后必须执行测试，再用 `npm run sync` 保存版本。完整接口、字段和样例见 `docs/DEVELOPMENT.md` 与 `docs/DATA_CONTRACT.md`。
