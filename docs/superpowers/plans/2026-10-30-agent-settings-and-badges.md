# 日结模型设置与个人勋章 Implementation Plan

> **For agentic workers:** 按本计划在当前会话逐项执行，保留已有修改，不另开代理或工作目录。

**Goal:** 实测一份单日日结的大模型点评，增加 WorkBuddy / 自定义 API 设置，保证模板生成日期 H1，按成员累计不同勋章。

**Architecture:** 保持 WorkBuddy 云数据与原发布应用。独立模型适配模块统一点评输出，自定义 API Key 只在当前页面内存中使用；非敏感偏好按登录成员保存在本机。实查发现历史 owner_id 是创建者且存在匿名值，因此新增明确所属成员 member_id；勋章按此成员汇总，同成员同日期同类型去重。

**Tech Stack:** 原生 JavaScript、WorkBuddy Cloud SDK、Postgres RPC、node:test、jsdom。

## 执行步骤

- [x] 备份原 8 个修改文件至 private/agent-enhancements-20261030，运行基线测试（31 通过，2 个旧 UI 断言不符）。参考 xiangying 模型目录与选择记忆。
- [x] 新增 model-client.js：校验 HTTPS API 地址、POST chat/completions、超时/错误/响应限制；新增 model-settings.js 管理设置窗口、原生模型目录和当前页面密钥。接入 index.html、scripts/assets.cjs 与 journal-agent.js。保留原生默认路径，不暗中回退供应商。
- [x] tests/model-client.test.cjs 覆盖非法地址、非敏感偏好、API 请求/错误/取消；tests/editor.test.cjs 覆盖设置持久化/切换账号密钥清理、单日输入、切换模型、重复点评幂等和 API 失败不发奖。
- [x] collaboration-core.js / collaboration.js 按日期识别已有 H1，保留表格/图片/待办，模板旧日期移除，正文一级标题降为二级，确保一天只产生一个日期 H1。测试无标题模板、旧标题、重复日期与保存后的 HTML。
- [x] agent-core.js / journal-agent.js 按当前文档所属成员查询所有文档并汇总历史奖章；未知归属仅显示当前文档并明确提示，不猜测身份。editor.js 新文档保留创建者 owner_id 并默认绑定已设置名称的 member_id。测试跨文档跨日累计与他人隔离。
- [ ] WorkBuddy 核验实际模型目录、计费依据、云端 owner_id 和代理能力；用明确标记的合成日结调用真实模型，校验输出/原文证据，合成数据库写入只在回滚事务内验证。
- [ ] npm run check、npm test、npm run build；浏览器验证模板、模型设置与勋章界面。经原 WorkBuddy 应用发布并核对线上资源；记录实测范围与未验证的自定义 API。

## 验证要点

单日输入测试在相邻日期中放置不同文本，断言发给模型的 record 不含相邻日期内容。个人统计测试让同一 member_id 的两份文档有相同日期不同 criteria，断言优质天数只加一、维度奖章分别累计；另一个成员的记录不能混入。密钥测试检查 localStorage 和云 RPC 参数均不含 Key。模型变更允许明确重新点评，旧勋章不减少，同日不重复授予。
