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

所有表启用 RLS。`auth.uid()` 为 TEXT；普通新记录 owner_id 默认取它。原共享文档/设置允许 `COALESCE(auth.uid(),'shared')` 作为旧数据默认值，但写入策略必须校验原生认证身份。模板不可公开读取；profiles 只存显示名，不保存手机号。

评论偏移满足 start_offset>=0、end_offset>start_offset；文档和评论外键需存在。`shared_delete_comment` 校验调用人的 auth.uid() 和记录 owner_id，改写为删除标记，不删除他人回复。当前实现见 [002-comment-deletion.sql](002-comment-deletion.sql)，只适用于已有共享表、角色和 auth.uid() 的 WorkBuddy 环境。使用迁移前核对表结构及策略，不在其他环境盲目执行。

发布前在事务中以真实 anon/authenticated 角色及合成 A/B 身份验证：匿名无写入、A不能冒充B、模板仅本人可读、评论删除仅本人可调用、删除主评论保留回复、直接 UPDATE/DELETE 评论仍拒绝。回滚测试写入，保留真实数据。SQL 管理会话本身可能绕过 RLS，不能用管理员查询成功冒充用户权限测试。

## 认证

SDK `sendOtp({phone})` 返回 verificationId/isExistingUser；`verifyOtp({phone,verificationId,isExistingUser,token})` 内部对旧用户登录，对新用户注册，返回原生 session。不要仅设置本地标志模拟真实登录，不手动编造 UID。SDK 管理会话存储及刷新，退出时清理会话。

当前没有管理员预分配五个用户名密码账号；没有微信登录或微信消息发送接入。开发测试码 `123456` 仅属于 fixture，不可用于正式站点。
