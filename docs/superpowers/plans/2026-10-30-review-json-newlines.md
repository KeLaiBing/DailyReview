# 点评跨行引文 JSON 修复 Implementation Plan

**Goal:** 修复 Hunyuan 返回跨行 evidence 时 JSON 字符串含原始换行，导致完整点评无法解析的问题。

**Architecture:** 在 agent-core.js 的 JSON.parse 之前，仅转义字符串内部未转义的 C0 控制字符；已经转义的字符和字符串外空白保持原样。分数、证据、截断检测继续走原严格校验，不推测缺失字段，不重新调用模型。

**Tech Stack:** JavaScript、node:test、jsdom、原 WorkBuddy 静态发布。

- [x] 用截图对应文档当天内容和 hunyuan-chat 实际复现：finish_reason=stop，JSON.parse 报字符串内部非法控制字符；原始结果仅保存在忽略目录 private/review-format-fix。
- [x] 在 tests/agent-core.test.cjs 添加原始 LF/CR/TAB、既有转义、跨行证据、截断和虚假证据回归；原实现两项失败，修复后通过。
- [x] agent-core.js 增加字符串状态扫描，使用 JSON.stringify(char).slice(1,-1) 转义字符串内控制字符；提示词明确跨行引用须使用 JSON 转义。额外兼容单一完整 JSON 对象外的说明文字，不接受多对象或截断对象。
- [x] tests/editor.test.cjs 验证跨行模型结果能完成保存并避免重复发奖；实际失败结果重放及真实模型重新调用校验通过。真实响应含个人日结，仅保留在 Git 忽略目录。
- [x] npm run check、49 项 npm test、npm run build 和 GitHub CI 通过；WorkBuddy 发布 v0.3.1 到原应用。线上 11 个资源与构建逐字节一致，直接加载线上解析器重放原失败响应及新模型响应均通过。源码提交 3130b66；无真实日结进入 Git，未修改云端日结或手动发奖。
