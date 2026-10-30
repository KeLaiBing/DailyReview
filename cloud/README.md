# WorkBuddy 云端契约

代码通过 WorkBuddy Cloud SDK 访问原生认证、Postgres 数据接口和 RPC。这里仅记录契约，不包含生产数据或管理凭据；本地预览以测试内存实现代替这些接口。

原应用：`wbapp_kz8XqnJPqUZ8pGCrTsLoA2`。复制仓库不代表复制了该应用或其管理权限。初始化新环境需让具有权限的 WorkBuddy 部署任务创建/核对下列表及 RLS；当前仓库不提供一键重建完整云环境。

| 表 | 前端依赖的字段 | 权限 |
|---|---|---|
| `shared_documents` | id TEXT PK, date TEXT, title TEXT, html TEXT, created/updated BIGINT, rev INT, owner_id TEXT | 公开读；原生已认证用户可 INSERT/UPDATE；禁止数据面 DELETE |
| `shared_settings` | id TEXT PK（workspace）, workspace/folder TEXT, rev INT, owner_id TEXT | 同上 |
| `shared_profiles` | owner_id TEXT PK, display_name TEXT（1..40） | 公开读；仅本人 INSERT/UPDATE |
| `shared_templates` | id TEXT PK, owner_id TEXT, name TEXT（1..80）, html TEXT, created BIGINT | 本人 CRUD |
| `shared_comment_threads` | id TEXT PK, document_id TEXT FK, owner_id TEXT, quote TEXT（1..10000）, start_offset/end_offset INT, prefix/suffix TEXT, body TEXT（1..4000）, created BIGINT, deleted_at BIGINT NULL | 公开读；本人 INSERT；修改/删除仅走受限 RPC |
| `shared_comment_replies` | id TEXT PK, thread_id TEXT FK, owner_id TEXT, body TEXT（1..4000）, created BIGINT, deleted_at BIGINT NULL | 同上 |
| `shared_daily_reviews` | (document_id TEXT, review_date DATE) PK, source_text TEXT, source_rev INT, review JSONB, model TEXT, reviewer_id TEXT, updated BIGINT | 公开读；仅受限 RPC 保存 |
| `shared_quality_days` | (document_id TEXT, review_date DATE) PK, criteria TEXT[], awarded_at BIGINT | 公开读；仅 RPC 派生写入 |

所有表启用 RLS。`auth.uid()` 为 TEXT；普通新记录 owner_id 默认取它。原共享文档/设置允许 `COALESCE(auth.uid(),'shared')` 作为旧数据默认值，但写入策略必须校验原生认证身份。模板不可公开读取；profiles 只存显示名，不保存手机号。

评论偏移满足 start_offset>=0、end_offset>start_offset；文档和评论外键需存在。`shared_delete_comment` 校验调用人的 auth.uid() 和记录 owner_id，改写为删除标记，不删除他人回复。当前实现见 [002-comment-deletion.sql](002-comment-deletion.sql)，只适用于已有共享表、角色和 auth.uid() 的 WorkBuddy 环境。使用迁移前核对表结构及策略，不在其他环境盲目执行。

发布前在事务中以真实 anon/authenticated 角色及合成 A/B 身份验证：匿名无写入、A不能冒充B、模板仅本人可读、评论删除仅本人可调用、删除主评论保留回复、直接 UPDATE/DELETE 评论仍拒绝。回滚测试写入，保留真实数据。SQL 管理会话本身可能绕过 RLS，不能用管理员查询成功冒充用户权限测试。

## 认证

SDK `sendOtp({phone})` 返回 verificationId/isExistingUser；`verifyOtp({phone,verificationId,isExistingUser,token})` 内部对旧用户登录，对新用户注册，返回原生 session。不要仅设置本地标志模拟真实登录，不手动编造 UID。SDK 管理会话存储及刷新，退出时清理会话。

当前没有管理员预分配五个用户名密码账号；没有微信登录或微信消息发送接入。开发测试码 `123456` 仅属于 fixture，不可用于正式站点。

## 大模型点评与勋章

迁移 [003-daily-reviews.sql](003-daily-reviews.sql) 扩展既有云端，不创建本机服务。客户端从 `cloud.llm.models.list()` 选择原生文字模型，优先可用的 `hunyuan-chat`，通过 `cloud.llm.chat.completions.create()` 流式推理。网页不配置私有模型 Key，也不读取 Cockpit 或 ChatGPT 登录凭据。

实测该原生模型接口凭公开配置即可调用，不要求用户 session。页面会要求登录后发起点评，但这个 UI 限制不是模型接口的权限或费用保护；数据库 RLS 只保护记录写入。若需要强制每人调用配额，需平台支持的网关限流或受控云函数，不能依靠前端限流。

`shared_save_daily_review(p_document_id,p_date,p_source_rev,p_source_text,p_review,p_model)` 返回 `{review,qualified_days,earned}`。RPC 校验原生用户、北京时间当天、文档锁和已保存版本、JSON 类型/分数/证据；reviewer_id 从 auth.uid() 获取。相同文档/日期/文字返回已存点评；正文变化可更新点评，已获得的优质日期与勋章保留。优质条件三项 >=3 且总和 >=12；维度勋章来自 >=4 的维度。唯一键、文档行锁和合并写入防止并发重复累计天数。

权限测试必须使用真实数据库 anon/authenticated 角色，合成身份仅在回滚事务内使用。覆盖匿名调用、直接表写入、陈旧版本、无效日期、字符串或小数分数、缺失或不匹配证据、A/B 点评归属与同日幂等。生产记录不写入仓库。

**信任边界：** 该原生 SDK 提供浏览器调用模型；数据库验证提交结构、身份、版本、引文及奖章规则，但无法独立证明分数一定来自指定模型，也不重新从 HTML 提取原文。因此这是非对抗场景的鼓励机制，不应用作奖金、考核或防作弊认证。未来如需可信评审，应迁移至受控云函数：服务端读取日结、调用模型并直接保存；不能通过前端隐藏密钥或隐藏按钮解决。
