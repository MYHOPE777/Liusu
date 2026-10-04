# 数据与文本契约

本文档描述项目对输入文本、DOM 行、内存统计、IndexedDB 和导出文件的公开约定。改字段名、含义或边界时，必须同步修改实现、测试、样例和本文件。

## 1. 实时公屏文本

### 接受

| 原始文本 | 规范化后 | 输出 username |
| --- | --- | --- |
| `小明来了` | `小明来了` | `小明` |
| ` Alice  来了！ ` | `Alice 来了！` | `Alice` |
| `小红来了~` | `小红来了~` | `小红` |
| `用户\u200b来了` | `用户来了` | `用户` |

### 忽略

| 文本 | 原因 |
| --- | --- |
| `来了` | 缺少用户名 |
| `用户：我来了` | 含冒号，通常是聊天文本 |
| `小明来了，送了礼物` | 不是完整行尾进入消息 |
| `用户发言` | 没有“来了”后缀 |
| 空文本、隐藏行 | 不属于可见实时公屏 |

解析入口是 `parseEntry(text)`，返回字符串或 `null`，不会返回对象，也不会修改输入。

## 2. DOM 行对象

DOM 适配层把页面转换为以下最小结构：

```ts
type ScreenRow = {
  key: string; // 当前 DOM 节点生命周期内稳定
  text: string; // 已去零宽字符、合并空白、trim
};
```

`key` 不是跨页面或跨会话的永久 id，不能写入事件作为业务去重依据，只用于判断节点是否被复用。业务事件 id 由 `FlowCounter.add` 生成。

Observer 证据结构：

```ts
type SnapshotEvidence = {
  freshKeys: Set<string>;
  warming?: boolean;
  initialBaseline?: boolean;
};
```

## 3. 进入事件

```ts
type EntryEvent = {
  id: string;
  timestamp: number; // Unix milliseconds
  username: string;
  tabInstanceId: string | null;
  roomId: string | null;
};
```

写入 IndexedDB 后会额外加 `sessionId`：

```ts
type StoredEntryEvent = EntryEvent & { sessionId: string };
```

同一个昵称再次出现是新的进入事件；统计“去重观众”时才按窗口内 `username` 去重。不要在 `FlowCounter.add` 中全场去重，否则会丢失重复进入速度。

## 4. 统计结果

```ts
type Stats = {
  events: number;          // 当前窗口进入事件数，包含同名重复
  unique: number;          // 当前窗口 username 去重数
  rate: number;            // 按 unitSeconds 换算后的人流速
  elapsedSeconds: number;  // 本场有效时长
  totalEvents: number;     // 本场内存事件总数
};
```

比较结果：

```ts
type RateComparison = {
  currentRate: number;
  previousRate: number;
  currentEvents: number;
  previousEvents: number;
  available: boolean;
  direction: 'increase' | 'decrease' | 'flat' | 'unavailable';
  changePercent: number | null;
};
```

空闲结果：

```ts
type Activity = {
  hasEvents: boolean;
  lastEventAt: number | null;
  idleSeconds: number;
};
```

## 5. 会话对象

```ts
type Session = {
  id: string;
  roomId: string | null;
  mode: 'live' | 'simulation' | string;
  pageUrl?: string;
  tabId: number | null;
  tabInstanceId: string;
  startedAt: number;
  endedAt: number | null;
  updatedAt: number;
  eventCount: number;
};
```

`createSession` 会删除传入 metadata 中的 `events` 字段，防止会话和事件重复存储。`endSession` 只写入结束时间，不删除事件。

## 6. 导出文件

### CSV

列顺序不能随意改变：

```csv
id,timestamp,username,tabInstanceId,roomId
event-1,1700000005000,"小明",document-id,room-7
event-2,1700000010000,"小红",document-id,room-7
```

任何包含逗号、换行或双引号的字段都必须双引号包围；字段内双引号写成两个双引号。以 `=`, `+`, `-`, `@` 开头的字段会加单引号防止表格公式执行。

### JSON

```json
{
  "id": "session-id",
  "roomId": "room-7",
  "mode": "live",
  "startedAt": 1700000000000,
  "eventCount": 1,
  "events": [
    {
      "id": "event-1",
      "timestamp": 1700000005000,
      "username": "小明",
      "tabInstanceId": "document-id",
      "roomId": "room-7"
    }
  ]
}
```

导出前会以事件 `id` 合并 IndexedDB 和当前内存数组。JSON 的会话字段可能随版本增加，读取方应忽略未知字段。

## 7. 配置

```ts
type Config = {
  windowSeconds: 10 | 30 | 60 | 300;
  unitSeconds: 1 | 60 | 3600;
  panelCollapsed: boolean;
  mode: 'live' | 'simulation' | string;
};
```

配置存储于 `chrome.storage.local['qianchuanConfig']`。配置不是会话数据，重置本场不会清除配置。

## 8. 刷新恢复存储

直播内容脚本使用页面 `sessionStorage` 保存当前房间的活动会话引用：

```text
qianchuan-flow-session:<roomId> -> session.id
```

该引用不是事件数据，也不是跨房间共享的 id。启动时只有在 `readSession(session.id)` 返回同一 `roomId` 且 `endedAt` 为空时才恢复；否则删除引用并创建新会话。重置会结束旧会话并清理引用。

离线 demo 使用 `localStorage['qianchuan-flow-demo-state']` 保存合成数据：

```json
{
  "startedAt": 1700000000000,
  "events": [],
  "paused": false
}
```

这些浏览器本地状态不应提交到 Git。`FlowCounter.load(events)` 只接受带有限数值 `timestamp` 和非空字符串 `username` 的记录，忽略格式错误的持久化项。

## 9. 兼容策略

- 新增字段应提供默认值或允许缺失。
- 不要把 DOM 节点、`Set`、`Map` 或 `Error` 直接写进 IndexedDB/JSON。
- 时间统一使用 Unix milliseconds；界面才转换为秒和分钟。
- 用户昵称按原始大小写和 Unicode 字符保存；统计去重使用严格字符串相等，不做模糊合并。
- 任何真实数据 fixture 必须使用合成昵称，例如 `示例用户A`，不能复制直播间真实用户数据。
