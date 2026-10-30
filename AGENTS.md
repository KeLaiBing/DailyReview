# DailyReview 工作约定

## 唯一主项目

- 本仓库是反馈机的唯一活动源码。此机器的根目录为 `D:/Sciences/common/DailyReview`；其他开发者使用自己的 Git 克隆目录。
- 开发、测试、构建和 Git 提交均在本仓库根目录执行。旧 `D:/Sciences/common/日结` 已退出开发流程，旧代码归档于 `D:/Sciences/common/_archive/日结-20261030`，只供查阅；不要从归档覆盖当前源码。
- 开始修改前检查 `git status --short` 和相关 diff，保留用户未提交的修改。不能用 reset、restore、checkout 或旧代码覆盖这些修改；只提交当前任务明确修改的文件。
- 根据任务主动匹配可用 skills，并在开始时说明使用了哪些；没有合适的 skills 时如实说明。

## WorkBuddy 与发布

- WorkBuddy 选择本仓库作为工作空间，不要再从旧“日结”空间开始开发。
- 复用原云应用 `wbapp_kz8XqnJPqUZ8pGCrTsLoA2` 和原站点 `https://daily-journal-80695.app.workbuddy.host/`。不能因工作目录迁移而创建新应用、换数据库或换域名。
- 本机关联位于被 Git 忽略的 `.workbuddy/applications.yaml` 与 `.wbapp_kz8XqnJPqUZ8pGCrTsLoA2.genie`。仓库已有公开连接配置无需因目录迁移而更换。
- 生产发布包只取本仓库执行 `npm run build` 后的 `dist/`；不要上传仓库根目录、私有资料、测试或 node_modules。
- 本机 Node 只用于隔离开发预览、测试与打包；生产采用 WorkBuddy 云服务，不增加本机生产后端。

## 验证与资料

- 常用命令：`npm run dev`、`npm run check`、`npm test`、`npm run build`。开发预览使用隔离数据。
- 不提交 `.workbuddy/`、`*.genie`、`private/`、`data/`、`archive/`、`dist/`、`node_modules/`、账号凭据或真实日结。
- 本机迁移备份和校验清单位于 `private/workspace-migration-20261030/`；旧工作日志、报告和数据保留在归档目录。
- 若需 Python，本机使用 `C:/Users/jaor4/.conda/envs/py312/python.exe`，不用裸 `python` / `python3`。
