# Fork 维护指南

本文面向维护 Fork（例如 `ShallowDream724/All-Model-Chat`）的开发者，目标是：在频繁同步上游（upstream）大量变更时，把冲突和维护成本降到最低。

## 1) 配置 upstream 远端（只需一次）

```bash
git remote add upstream https://github.com/yeahhe365/All-Model-Chat.git
git fetch upstream --tags
```

如已存在 upstream，可用以下命令确认：

```bash
git remote -v
```

## 2) 同步上游：两种常用策略

两种方式都能“同步上游大量变更”，区别在于是否重写历史。

### A. Merge（不改历史，适合多人协作/不想 force push）

```bash
git checkout main
git fetch upstream
git merge upstream/main
git push origin main
```

优点：不会重写历史；push 不需要 `--force-with-lease`。  
缺点：会产生 merge commit；历史不如 rebase 线性。

### B. Rebase（线性历史，适合个人 Fork/自定义提交较少）

```bash
git checkout main
git fetch upstream
git rebase upstream/main
git push --force-with-lease origin main
```

优点：历史线性；Fork 的改动始终在最上面。  
缺点：需要 force push；如果有人基于你的 `main` 开发，需要先沟通。

## 3) 大量变更/重复冲突的应对

### 开启 rerere（强烈推荐）

当你需要反复 rebase/merge，且冲突点经常重复时，`rerere` 会记录你解决冲突的方式，下次遇到相同冲突可以自动复用。

```bash
git config --global rerere.enabled true
```

### 让 Fork 改动更“好同步”的经验法则

- 尽量用新增文件/新增配置覆盖上游行为，避免大幅修改上游同一文件的同一段代码。
- 每个逻辑改动尽量拆成“小而清晰”的 commit，方便未来 `rebase -i` / `cherry-pick`。
- 同步后快速检查 Fork 相对上游的差异：

```bash
git range-diff upstream/main...main
```

## 4) 版本迭代与日志（Changelog）

- 日常开发：把变更写到 `CHANGELOG.md` 的 `Unreleased` 下。
- 准备发布：把 `Unreleased` 内容整理到版本区块，并（可选）打 tag：

```bash
git tag v1.8.3
git push origin v1.8.3
```

版本号建议：
- 跟随上游版本并在 Fork 侧自增（例如上游 `1.8.2`，Fork 发布 `1.8.3`），或
- 使用预发布标识区分 Fork（例如 `1.8.2-fork.1`）。

## 5) GitHub 网页端同步（适合无冲突场景）

在仓库页面点击 “Sync fork / Update branch”。若出现冲突或变更量很大，建议按本文第 2 节在本地同步，更可控。

