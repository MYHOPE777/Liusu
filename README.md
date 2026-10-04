# 千川流速

一个本地 Chrome Manifest V3 扩展，用来统计主播实时大屏中新增的“XXX来了”消息。扩展只读取页面已经渲染的可见 DOM，不调用直播接口、不请求隐藏数据、不使用 OCR，也不上传用户名或行为数据。

## 现在能做什么

- 页面进入后建立当前公屏基线，历史消息不计入本场。
- 如果公屏容器先出现、历史行异步加载，空屏会短暂同步历史基线，避免把首屏灌入的旧消息算作新进入。
- 每条新“来了”消息计为一次进入事件；同一昵称重复进入会重复计数。
- 在统计窗口内按昵称去重，显示进入事件数、去重观众数和人流速。
- 显示当前完整一分钟相对上一完整分钟的速度变化，标记提升、降低或持平。
- 支持 10 秒、30 秒、1 分钟、5 分钟窗口，以及人/秒、人/分钟、人/小时单位。
- 页面浮层支持暂停/继续、重置本场、拖拽、折叠、CSV/JSON 导出。
- 记录按标签页和直播间隔离，事件明细和配置保存在扩展本地 IndexedDB / `chrome.storage.local`。
- 页面未找到“实时公屏”时只显示状态，不尝试接口或 OCR 兜底。

## 加载扩展

1. 在项目目录运行 `npm run package`，生成原文件目录 `/Users/tangsir/千川流速/dist`。
2. 打开 Chrome `chrome://extensions`，启用“开发者模式”。
3. 点击“加载已解压的扩展程序”，选择 `/Users/tangsir/千川流速/dist`，无需压缩包。
4. 打开匹配的主播大屏地址：`https://compass.jinritemai.com/screen/anchor/talent...`。

扩展当前只在该地址范围注入内容脚本。`web_accessible_resources` 只向 `compass.jinritemai.com` 页面暴露面板的 SVG 图标；Chrome 要求该字段的路径为 `/*`，因此使用 `https://compass.jinritemai.com/*`。内容脚本仍使用主播路径匹配。真实直播页的 DOM 行结构如果发生变化，只需要调整 `src/dom-detector.js`，统计和本地存储接口不变。

## 离线模拟

直播未开播时可直接打开 [demo/demo.html](/Users/tangsir/千川流速/demo/demo.html)。页面提供模拟公屏和“添加‘来了’”“连续进入 5 人”“模拟列表滚动”等操作，覆盖同名重复、列表滚动和空屏场景。模拟数据只保留在当前页面内。

## 开发交接与数据文档

- [AI 接手说明](AI_HANDOFF.md)：项目目标、当前状态、不可破坏的约束和修改顺序。
- [开发文档](docs/DEVELOPMENT.md)：架构、事件流、DOM 规则、统计公式、IndexedDB、测试和发布流程。
- [数据与文本契约](docs/DATA_CONTRACT.md)：公屏文本、事件、会话、统计结果、配置和导出格式。
- [合成会话样例](docs/examples/sample-session.json) 与 [CSV 样例](docs/examples/sample-events.csv)：仅用于开发，不包含真实直播数据。

## 验证命令

```sh
npm install
npm test
npm run check
npm run test:browser
npm run package
npm run test:browser -- dist
```

`npm run test:browser` 先让独立 Chrome 加载项目根目录的真实扩展，确认加载成功，再测试离线 demo。`npm run package` 将扩展原文件复制到 `dist/`；手动打包后执行 `npm run test:browser -- dist` 验证生成目录也能加载。`demo/` 是离线验收页面，不会被复制到扩展目录。

## 版本与仓库同步

每次完成修改后执行：

```sh
npm run sync
```

该命令会递增补丁版本号，同时更新 `package.json`、`package-lock.json` 和扩展 `manifest.json`，运行测试和清单检查、重新生成 `dist/`，并在提交前自动验证 `dist/` 真实加载和离线 demo。验证通过后创建本地 Git 提交，并尝试推送到 `origin/main`。网络暂不可用时会保留本地提交；网络恢复后再次执行即可集中推送。需要发布次版本或主版本时可使用 `npm run sync -- minor` 或 `npm run sync -- major`。
