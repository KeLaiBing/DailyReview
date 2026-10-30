# 反馈机 · DailyReview

多人共享的日结云文档。`v0.1.0` 保存 2026-10-30 已上线的评论删除版本，六个站点文件与该次正式发布一致。

[正式站点](https://daily-journal-80695.app.workbuddy.host/) · [协作开发](CONTRIBUTING.md) · [云端契约](cloud/README.md) · [版本说明](CHANGELOG.md)

## 已有功能

- 可重命名空间、知识库和成员文档；每份文档用日期大标题组织每日记录。
- 连续正文编辑、待办、表格及表格内粘贴图片；文档目录及版本冲突提示。
- 手机短信验证码登录：新用户验证后走自动注册，已有用户登录。游客只读，登录成员共同编辑。
- 选定内容保存为个人日结模板；划词评论、回复和本人删除。删除主评论保留他人的回复。
- 文档/评论定时同步，非逐字实时协同。浏览器默认通过 SDK 保留登录会话。

Agent 评价、微信提醒、微信登录、管理员分配五个账号以及新版个人中心不包含在此稳定版本中。实际短信收取未纳入自动化测试。

## 本地开发

安装 Node.js 22 或更高版本及 Git：

```sh
git clone https://github.com/KeLaiBing/DailyReview.git
cd DailyReview
npm ci
npm run dev
```

打开终端显示的 `http://127.0.0.1:5173`。预览使用内存模拟数据，默认模拟成员“小林”登录，不连接正式数据库、不发送短信。退出后可用任意符合输入格式的测试手机号和验证码 `123456` 验证界面；刷新后恢复示例数据。加入 `?comments` 可预览本人评论及另一成员的回复。

这里的 Node 只用于静态开发预览、测试和打包，生产站点没有本机 Node 后端。不要直接双击 HTML 或自行用普通静态服务预览生产文件，否则会加载原始云配置。

```sh
npm run check
npm test
npm run build
```

测试仅使用隔离数据。`dist/` 仅含六个公开站点文件，构建不会发布网站；GitHub Actions 也只验证，不自动部署。

## 结构

| 路径 | 用途 |
|---|---|
| `index.html`、`editor.css` | 页面与样式 |
| `editor.js` | 编辑器、文档和空间同步、WorkBuddy 公开连接配置 |
| `collaboration.js` | 原生认证、模板、评论与回复 |
| `collaboration-core.js` | 引用位置匹配 |
| `comment-deletion.js` | 评论删除可见性规则 |
| `tests/` | 模拟云服务与自动化测试，不发布 |
| `scripts/` | 开发预览、检查、静态打包 |
| `cloud/` | 云数据库契约与评论删除迁移 |

## 云端与发布

生产通过 WorkBuddy Cloud SDK 使用原应用云数据库、原生身份认证和 RLS。`editor.js` 的 `wbpk_` 是网页本来就公开的 publishable key，不是模型密钥、管理员密钥或账号密码。权限由云端校验，不能依靠隐藏前端按钮。

代码仓库不包含真实日结、账号、会话、云数据库备份、Cockpit/WorkBuddy 本机模型配置或管理凭据。克隆代码不授予云端管理权；云端账号与 GitHub 权限各自独立。

发布由维护者使用 WorkBuddy 对原应用 `wbapp_kz8XqnJPqUZ8pGCrTsLoA2` 执行，上传 `npm run build` 生成的 `dist/`，不要上传整个仓库。新环境先按 [云端契约](cloud/README.md) 配置数据库及认证，再替换公开连接配置。不要在开发或 CI 中执行生产 SQL。

## 多人异地协作

成员可在自己的电脑克隆、创建分支、修改、测试和 commit。仓库所有者在 GitHub **Settings → Collaborators** 授予写权限后，成员可以 push 分支并创建 Pull Request；无写权限时通过 Fork + Pull Request 协作。私有仓库还需要先授予读取权限。

推荐保留 `main` 为稳定版，通过 PR 合并；数据库迁移在 PR 中单独说明。完整操作见 [CONTRIBUTING.md](CONTRIBUTING.md)。当前未代为添加成员或设置分支保护。
