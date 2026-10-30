# 协作开发

1. 仓库所有者邀请协作者；对方接受邀请后才能直接 push。仅有代码副本可以本地 commit，不代表拥有远端写权限。
2. 克隆并安装依赖。开发预览必须用 `npm run dev`，其数据为内存模拟数据。
3. 每个功能使用独立分支，例如：

```sh
git switch main
git pull --ff-only origin main
git switch -c feature/comment-improvements
npm ci
npm run dev
```

完成后运行检查并提交：

```sh
npm run check
npm test
npm run build
git status
git add <本次修改的文件>
git commit -m "feat: describe the change"
git push -u origin feature/comment-improvements
```

在 GitHub 发起 Pull Request 到 `main`。说明问题、修改后的行为、验证方式及是否包含数据库迁移。不要把构建产物、真实日结、截图中的私人内容、访问令牌或 `.env` 放进提交。

多人修改同一文件时，先提交或暂存自己的修改，再拉取远端并处理冲突；不要覆盖别人的代码或强制推送 `main`。推荐维护者在 GitHub 设置分支保护，要求 PR 和 `Validate` 检查通过。

## 版本与站点发布

合并代码不自动改变正式网站。维护者从审核后的提交执行 `npm ci`、测试及 `npm run build`，经 WorkBuddy 上传 `dist/` 到原应用。验证云端权限和网页后，再为该提交创建版本标签。Git 标签保存代码版本，不会复制数据库内容或回滚数据库。

`v0.1.0` 对应首次入库的线上评论删除版。尚未上线的账号/Agent 草稿没有混入此标签，后续功能从独立分支开发。
