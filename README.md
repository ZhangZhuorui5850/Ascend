# ZGCA 学习工作台

日历驱动的中关村备考学习管理系统。当前内容源来自上级 `zgca` 文件夹，尤其是 `知识地图页面.html` 和 `agent沟通/02_十周做题驱动备考计划.md`。

## 本地开发

```bash
npm install
npm run dev
```

打开 `http://localhost:3000`。

## 生产运行

```bash
npm run build
npm run start
```

## Docker / Mac mini

```bash
docker compose up -d --build
```

默认端口：`3000`。

默认持久化：

- `data/workbench.sqlite`
- `data/uploads/YYYY/MM/DD/original`
- `backups/`

Tailscale Serve 示例：

```bash
tailscale serve --bg 3000
```

## 备份

```bash
npm run backup
```

建议在 Mac mini 上用 cron 或 launchd 每天跑一次。备份会写到 `backups/YYYY-MM-DD/`。

## 已实现范围

- 日历页：按天显示学习、资料、复习、错题和总结状态。
- 当天工作台：管理当天计划、日记、总结、学习记录、错题和资料流。
- 右侧收纳窗口：Uppy 拖拽上传，文件默认复制入库。
- 知识地图：从当前 `知识地图页面.html` 抽取 M1-M7 知识点。
- 科目页：按 M1-M7 聚合知识点、资料、学习记录和错题。
- SQLite 本地数据库与 Docker 部署文件。
