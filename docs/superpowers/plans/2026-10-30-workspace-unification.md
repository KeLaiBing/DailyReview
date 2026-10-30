# DailyReview 工作目录统一计划

**目标：** 唯一开发/Git 根目录为 `D:/Sciences/common/DailyReview`，WorkBuddy 复用现有应用，旧项目完整归档，已有未提交修改保持原样。

**方法：** 先保存未提交文件副本、二进制 Git 补丁与 SHA256 清单到被 Git 忽略的 `private/workspace-migration-20261030/`。迁移 `.workbuddy/applications.yaml` 和原 `.genie` 文件，保持应用 ID 与 `DailyReview/dist` 发布路径；通过 WorkBuddy 空间界面核验。旧项目保留全部文件（包括隐藏文件、数据与历史 Git），移入 `D:/Sciences/common/_archive/日结-20261030`，不会合并旧源码到主项目。

- [x] 在改动前备份 8 个未提交文件，并记录 Git HEAD、索引和工作区状态。
- [x] 将本机关联复制到 DailyReview；核对 SHA256、原应用 ID 和发布路径；确认 Git 忽略这些文件。
- [x] 将 WorkBuddy 项目空间指向 DailyReview，并确认能看到原应用。
- [x] 校验绝对源/目标路径后归档旧目录，核验归档前后的文件清单与 SHA256。
- [x] 添加唯一工作目录说明和 AGENTS.md，防止未来编辑归档或旧路径。
- [x] 再次核验原 8 个文件的 SHA256 和 Git diff 均未改变；记录迁移结果。

验证以文件完整性、Git 状态和 WorkBuddy 界面为准。本次不修改产品代码，不构建或发布尚未提交的功能，也不改线上数据。

## 实际迁移结果

- WorkBuddy 已建立并选中 `DailyReview` 空间，识别 Git `main`。新空间只读查询验证原云应用为 ACTIVE，原域名可访问；未新建应用或发布代码。
- 原空间重命名为“日结（已归档，仅查历史）”，保留旧对话。
- 旧目录被运行中的会话占用，无法整体重命名，因此移动其全部原有内容到指定归档。1,507 个文件与 331 个目录已核验，文件 SHA256 全部一致。
- 原路径只保留迁移说明、跳转工作目录的 AGENTS.md，以及占用迁移中留下的空 .git 目录；不存在活动源码或有效旧仓库。不强行关闭用户会话。
- 工作区修改备份、归档清单与最终核验结果存放于被 Git 忽略的 `private/workspace-migration-20261030/`。
