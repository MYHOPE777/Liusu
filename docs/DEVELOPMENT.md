# 开发文档

## 1. 范围与运行环境

千川流速是一个不依赖构建框架的 Chrome Manifest V3 扩展。源文件是浏览器可以直接加载的 UMD/普通脚本，测试使用 Node.js 内置 `node:test`、jsdom、fake-indexeddb 和 Playwright。

支持的真实页面规则在 `manifest.json` 和 `src/background.js` 中同时约束：

```text
https://compass.jinritemai.com/screen/anchor/talent...
```

`web_accessible_resources` 仅暴露面板使用的 `assets/icons/*.svg`，其 `matches` 为 `https://compass.jinritemai.com/*`。Chrome 对该字段只按来源匹配，并要求路径必须是 `/*`；写成 `/screen/anchor/talent*` 会报 `Invalid match pattern` 并拒绝整个清单。内容脚本的主播路径匹配仍然保留。

`src/route-bootstrap.js` 以 `https://compass.jinritemai.com/*` 注入，但只轮询 URL 变化，不读取页面内容；发现登录页通过前端路由进入主播大屏时刷新页面，随后由主播路径内容脚本启动。Chrome 扩展详情必须允许网站访问 `compass.jinritemai.com`。

离线页面 `demo/demo.html` 只模拟 DOM，不访问扩展 API，方便直播未开播时测试检测、统计、暂停、滚动和导出。

## 2. 文件地图

| 文件 | 责任 | 可否独立测试 |
| --- | --- | --- |
| `manifest.json` | MV3 清单、内容脚本、权限和页面范围 | `npm run check` |
| `src/detector-core.js` | 文本解析、序列检测、统计、百分比比较、导出 | `tests/core.test.cjs` |
| `src/dom-detector.js` | 定位“实时公屏”、过滤可见行、监听 DOM 变更 | `tests/dom.test.cjs` |
| `src/background.js` | IndexedDB 仓库、配置、Chrome runtime 消息处理 | `tests/storage.test.cjs` |
| `src/storage.js` | 内容脚本到 background 的 Promise API | 由浏览器流程间接验证 |
| `src/content.js` | 直播页状态机、事件保存、每秒刷新、暂停和导出 | 浏览器手工/模拟验证 |
| `src/route-bootstrap.js` | 登录页到主播大屏的路由切换刷新 | `tests/navigation.test.cjs` |
| `standalone/overlay-runner.js` | 不依赖扩展 API 的页面悬浮统计脚本 | `tests/standalone.test.cjs` |
| `standalone/bookmarklet.txt` | 可保存为书签的独立脚本 | `tests/standalone.test.cjs` |
| `standalone/launcher.html` / `launcher.js` | 校验 URL 并打开指定主播大屏房间 | `tests/launcher.test.cjs` |
| `src/panel.js` | Shadow DOM 浮层、控件、数据显示 | `npm run test:browser` 截图 |
| `src/styles.css` | 内容脚本页面的基础样式隔离 | 浏览器验证 |
| `demo/demo.html` | 离线模拟器结构 | `npm run test:browser` |
| `demo/demo.js` | 模拟事件、滚动、清空和每秒刷新 | 浏览器验证 |
| `scripts/check.cjs` | manifest、权限、内容脚本范围、资源匹配和语法检查 | `npm run check` |
| `scripts/package.cjs` | 将扩展文件复制到 `dist/` | `npm run package` |
| `scripts/sync.cjs` | 递增版本、验证、提交和网络同步 | `npm run sync` |
| `tests/*.test.cjs` | 核心、DOM 和存储回归测试 | `npm test` |

## 3. 启动与事件流

直播页的主要流程如下：

```text
content.js start()
  -> 读取 chrome.storage.local 配置
  -> background 创建 tabInstanceId 和 live session
  -> findPublicScreen(document)
  -> readRows(screen) 建立初始基线
  -> observeScreen(screen, callback)
  -> SequenceDetector.scan(rows, evidence)
  -> parseEntry(row.text)
  -> FlowCounter.add(usernames, timestamp)
  -> QianchuanStore.appendEvents(session.id, events)
  -> Panel.update(stats, comparison, activity)
```

此外，`content.js` 在初始化完成后每秒执行一次：

```text
locate() -> sample() -> render()
```

所以没有新进入事件时，面板仍然会刷新“最近进入”的空闲秒数、趋势采样和滚动窗口结果。窗口中最后一批事件仍在有效期内时，人流速数值可能保持不变；事件离开窗口后人流速变为 `0.0`，这符合严格滚动窗口定义。

### 3.1 刷新恢复

直播页面会把当前房间的活动会话 id 写入 `sessionStorage`，键名为 `qianchuan-flow-session:<roomId>`。页面刷新后先读取该 id，再通过 `QianchuanStore.readSession()` 恢复未结束的会话和事件；房间不一致、会话已结束或引用失效时会清理引用并创建新会话。恢复时使用会话原始 `startedAt`，所以本场有效时长、滚动窗口和“最近进入”不会因为刷新归零。

点击“重置本场”会结束旧会话、删除当前页面的会话引用并创建新会话。`sessionStorage` 只保存引用，真实事件仍保存在扩展后台的 IndexedDB 中。

离线 `demo/demo.html` 没有扩展后台，因此使用 `localStorage['qianchuan-flow-demo-state']` 保存开始时间、事件数组和暂停状态。刷新会恢复事件及可见模拟公屏，重置会删除这份本地状态。若 `file:` 环境禁止本地存储，demo 会降级为当前页面内存模式。

## 4. DOM 输入契约

### 4.1 定位面板

`findPublicScreen(document)` 先寻找规范化文本等于 `实时公屏` 的可见元素，再向上寻找不超过 6 层的面板。优先使用以下显式容器标记：

```text
[data-public-screen]
[data-live-screen]
[data-screen="public"]
[data-screen-type="public"]
[role="log"]
```

如果真实页面没有显式标记，会在近邻元素的 `id/class` 中寻找 `public/screen/live/chat/comment/message/panel` 等线索。不能退化到整个 `body` 或页面级 `main`，否则会把其它文本误当作公屏消息。

已在已登录的主播大屏页面验证一组真实结构：标题控制器使用 `id="commentsManager"`，外层容器使用类似 `commentsWrap--...` 的 CSS Module 类名，消息列表位于 `chatMessages--...` 下，单条进入行使用类似 `levelMessage--...` 的类名。检测器会跳过 `commentsManager` 标题控制器，向外层消息面板继续查找，并把 camelCase 的单数 `message/row/entry/comment/visitor/item` 类名识别为行；`chatMessages`、`commentsWrap` 等复数包装器不会被当成一条消息。该页面仍可能因账号、登录状态或直播状态不同而返回不同结构，新增结构应先补合成 DOM 回归测试。

### 4.2 行读取与可见性

`readRows(container)` 返回按 DOM 顺序排列的：

```js
{ key: 'dom-row-1', text: '小明来了' }
```

行优先使用 `[data-live-message]`、`[data-public-message]`、`[data-screen-row]`、`[data-live-row]`、`[data-entry-row]`、`[role="listitem"]`。找不到显式行时再使用 `row/message/item/entry/comment/chat-line/visitor` 类名和列表的直接子节点。

以下内容会被过滤：空文本、隐藏元素、`display:none`、`visibility:hidden/collapse`、`hidden`、`aria-hidden="true"`、标题元素和表单脚本元素。

### 4.3 文本解析

`parseEntry(text)` 先移除零宽字符并合并空白，只接受完整行尾的“来了”及可选标点：

```text
小明来了          -> 小明
 Alice 来了！     -> Alice
小红来了~         -> 小红
用户：我来了      -> 忽略
来了              -> 忽略
小明来了，送礼     -> 忽略
```

用户名中出现半角或全角冒号时会忽略，以避免把聊天文本当成进入事件。

### 4.4 首屏和 DOM 复用

`observeScreen` 的回调证据对象可能包含：

- `warming`：空屏启动后的短暂同步阶段，所有行只建立基线。
- `freshKeys`：MutationObserver 证明为新插入或文本变化的稳定节点 key。
- `initialBaseline`：warmup 结束时的最终基线。

`SequenceDetector` 通过文本重叠和节点 key 识别列表尾部追加、滚动窗口、节点复用和同内容重绘。没有可靠重叠时会重新建立基线，宁可少计一次，也不凭空制造进入事件。

## 5. 统计规则

`FlowCounter` 保存本场内存事件数组，不直接依赖 DOM。每个事件都会带 `id`、`timestamp`、`username`、`tabInstanceId`、`roomId`。

### 5.1 滚动窗口

给定当前时间 `now`、窗口秒数 `windowSeconds` 和显示单位 `unitSeconds`：

```text
windowStart = max(startedAt, now - windowSeconds * 1000)
activeWindowSeconds = 有效窗口时长（扣除暂停和隐藏）
events = timestamp 在 [windowStart, now] 的事件
unique = events 中 username 的去重数量
rate = events.length / activeWindowSeconds * unitSeconds
```

显示单位为人/秒、人/分钟、人/小时，对应 `unitSeconds` 为 `1`、`60`、`3600`。本场刚开始时窗口可能小于完整窗口，因此一个事件在最初几秒内的显示速率会较高，随着有效时长增加而回落；不要在统计层加入没有业务定义的衰减系数。

### 5.2 上一分钟比较

`comparePreviousMinute(now, unitSeconds)` 固定比较：

```text
当前窗口   [now - 60s, now]
上一分钟   [now - 120s, now - 60s)
```

只有两段都有有效时长且会话已覆盖上一分钟时才显示比较结果。上一分钟速率为 0 时不计算无穷大的百分比：当前有进入显示“↑ 新增”，两边都是 0 显示“持平”。其它情况使用：

```text
(currentRate - previousRate) / previousRate * 100
```

### 5.3 空闲状态

`activity(now)` 返回：

```js
{
  hasEvents: true,
  lastEventAt: 1700000000000,
  idleSeconds: 12
}
```

`idleSeconds` 同样排除暂停区间。面板每秒显示“最近进入 N 秒前”；尚无事件时显示“暂无进入”。

## 6. 本地存储契约

### 6.1 IndexedDB

数据库名是 `qianchuan-flow`，版本为 `1`。首次打开创建两个 object store：

```text
sessions: keyPath=id，index roomId
events:   keyPath=id，index sessionId
```

会话对象示例：

```json
{
  "id": "session-id",
  "roomId": "room-7",
  "mode": "live",
  "pageUrl": "https://compass.jinritemai.com/screen/anchor/talent?live_room_id=room-7",
  "tabId": 12,
  "tabInstanceId": "document-id",
  "startedAt": 1700000000000,
  "endedAt": null,
  "updatedAt": 1700000000000,
  "eventCount": 0
}
```

事件对象示例：

```json
{
  "id": "event-id",
  "sessionId": "session-id",
  "timestamp": 1700000005000,
  "username": "小明",
  "tabInstanceId": "document-id",
  "roomId": "room-7"
}
```

`appendEvents` 按 session 串行排队，并按稳定事件 id 去重；重复提交不会增加 `eventCount`。IndexedDB 不可用时仓库退回内存模式，扩展提示本地存储不可用，但统计仍可运行。内容脚本刷新恢复依赖 `sessionStorage` 保存的会话 id；事件本体和导出数据仍以 IndexedDB 为准。

### 6.2 chrome.storage.local 配置

配置 key 为 `qianchuanConfig`，默认值：

```json
{
  "windowSeconds": 60,
  "unitSeconds": 60,
  "panelCollapsed": false,
  "mode": "live"
}
```

### 6.3 内容脚本消息

`src/storage.js` 使用 `chrome.runtime.sendMessage` 发送：

```js
{
  type: 'QIANCHUAN_STORE',
  action: 'getContext|getConfig|setConfig|createSession|appendEvents|endSession|listSessions|readSession|deleteSession',
  payload: {}
}
```

background 返回 `{ ok: true, data }` 或 `{ ok: false, error }`。增加新 action 时必须同时修改 repository `handle`、内容脚本 API 和存储测试。

## 7. 导出文本格式

CSV 固定列顺序：

```text
id,timestamp,username,tabInstanceId,roomId
```

每个字段都进行双引号和双引号转义；以 `= + - @` 开头的内容会加单引号，避免导入表格软件时被当成公式。JSON 是会话对象加 `events` 数组，导出时会合并 IndexedDB 与当前内存事件，按事件 id 去重。合成样例见 `docs/examples/sample-session.json` 和 `docs/examples/sample-events.csv`。

真实数据导出由用户点击面板按钮触发，下载到用户浏览器，不自动上传仓库。

## 8. 测试与验收

### 单元测试

```sh
npm test
```

覆盖文本解析、首屏基线、列表滚动、节点复用、暂停、窗口统计、上一分钟比较、空闲状态、导出转义、DOM 可见性、warmup、IndexedDB 去重和并发写入。

### 清单和语法检查

```sh
npm run check
```

检查 MV3、权限只有 `storage`、内容脚本的主播页面匹配规则、SVG 资源的本站 `/*` 匹配规则、清单引用文件和所有 `src/*.js` 语法。内容脚本与资源匹配规则须分别校验。

### 真实扩展加载与离线模拟

```sh
npm run test:browser
```

首先使用 Playwright 启动独立 Chrome，实际加载根目录扩展并确认成功；Chrome 对清单的报错必须使验证失败。然后打开 `demo/demo.html`，添加合成事件、验证刷新恢复，并截图到 `test-results/demo.png`。需要人工查看时，重点确认浮层能看到：人流速、上一分钟比较、最近进入、窗口进入、去重观众、暂停/重置/导出按钮和两个选择器。无新进入时等待几秒，应看到“最近进入 N 秒前”变化。

### 打包

```sh
npm run package
npm run test:browser -- dist
```

把 `manifest.json`、`src/`、`assets/` 复制到被 `.gitignore` 忽略的 `dist/`。交付原文件目录 `/Users/tangsir/千川流速/dist`；Chrome 的“加载已解压的扩展程序”选择此目录。手动打包后检查 `dist/manifest.json` 版本，并执行 `npm run test:browser -- dist`，在独立 Chrome 实际加载 `dist/`，确认生成目录也通过清单校验。

## 9. 版本和 Git 流程

版本必须在以下三个文件保持一致：

```text
package.json
package-lock.json（顶层和 packages[""]）
manifest.json
```

不要手工只改其中一个。标准流程：

```sh
# 普通修改
npm test
npm run check
npm run test:browser
npm run sync

# 较大功能或不兼容改动
npm run sync -- minor
npm run sync -- major
```

`sync.cjs` 在发现工作区有改动时才递增版本；没有改动时不制造空版本，只尝试推送已有本地提交。它依次执行 `npm test`、`npm run check`、`npm run package`、`npm run test:browser -- dist`，自动在提交前验证生成目录，再 `git add -A`、提交 `chore(release): vX.Y.Z`，最后执行 `git push -u origin main`。推送失败不会回滚提交。

## 10. 隐私、安全和权限

- manifest 只声明 `storage`，没有网络 host 权限。
- 内容脚本只匹配主播大屏页面。
- 不读取隐藏 DOM、不调用后端接口、不上传昵称。
- CSV 导出防止常见表格公式注入。
- `dist/`、`node_modules/`、`test-results/` 和本地环境文件被 `.gitignore` 忽略。
- 真实直播导出文件和 IndexedDB 不应添加到仓库；仓库中的 examples 只能使用合成昵称和时间戳。

## 11. 已知限制与下一步

1. 真实直播页 DOM 尚未在开播时采样验证；如果标题或行结构变化，先在 `dom-detector.js` 增加测试 fixture，再调整定位逻辑。
2. 只能识别已经渲染到 DOM 的“来了”文本；接口层、隐藏消息和 OCR 不属于当前范围。
3. 页面被浏览器冻结或扩展被禁用时，JavaScript 定时器无法保证每秒执行；恢复页面后会继续按有效时长统计。
4. 当前没有远程服务端数据合并；不同设备的本地 IndexedDB 不会自动合并。
5. 如果要增加历史查询、删除会话或新的导出字段，先更新 `DATA_CONTRACT.md`、测试和样例，再修改实现。

## 12. 给后续 AI 的工作模板

接到新需求时先回答四个问题：

1. 需求属于 DOM、统计、存储、UI、demo 还是发布流程哪一层？
2. 哪个现有不变量可能被影响？
3. 要新增或更新哪个测试和数据样例？
4. 修改后是否需要递增 patch/minor/major 版本？

然后按“读相关代码 -> 写失败测试或 fixture -> 最小修改 -> 全套验证 -> `npm run sync`”执行。不要在没有真实 DOM 证据时猜测千川内部接口；不要删除用户已有本地提交或清理未知工作区文件。
