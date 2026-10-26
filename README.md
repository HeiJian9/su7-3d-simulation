# SU7 交互实验室 · I0–I1

指定 Mona x Supercars 小米 SU7 的本地浏览器观察场景。当前版本只完成资产准备、外观与座舱观察；完整需求继续以 [设计基线](docs/SU7_INCREMENTAL_DESIGN.md) 为准。

## 打开演示

地址：**http://localhost:3000**。当前使用 `npm start` 运行构建后的正式本地服务，仅监听本机。

Windows PowerShell，Node.js 24.14+：

```powershell
Set-Location 'D:\code\Projects\3D simulation'
npm ci
npm run build
npm start
```

按 Ctrl+C 停止。重新执行 `npm ci` 前先停止正在运行的开发服务，避免 Windows 锁定 esbuild 文件。

开发模式：`npm run dev`，网页 3000、Express 3001，Vite 代理 `/api`。切换运行方式前先停止原服务。

## 操作

| 入口 | 操作 |
|---|---|
| 外观 | 左键旋转、右键平移、滚轮缩放 |
| 平移 | 左键也可平移，方便触控板或单键鼠标 |
| 自由观察 | 左键拖动转头、右键拖动平移、滚轮前后移动 |
| 自由移动 | 点击 3D 场景后，WASD／方向键移动，Q/E 升降；速度可调 |
| 快捷视角 | 前、后、左、右、进入座舱 |
| 恢复 | “回到车辆”或场景中按 R |
| 调试记录 | 查看资源、相机、GPU、FPS；保存诊断到 `docs/validation/` |

自由模式允许穿过车身，不模拟人体碰撞。输入框或滑块获得焦点时不响应相机移动。I0 麦克风检查仅在调试面板内进行三秒本地音量分析，不保存、上传音频，也不转写或执行命令。

## 验证

```powershell
npm run typecheck
npm run lint
npm test
npm run asset:check
npm run test:e2e
```

浏览器回归使用本机 Microsoft Edge，覆盖 1920×1080 与 1366×768；另在 1080p 连续操作相机两分钟。`test:e2e` 可复用正在运行的本地服务，或启动已构建的 `npm start`。结果保存到 `docs/validation/playwright-results.json`，HTML 详情位于 `playwright-report/`。

本轮完整回归保存在 `docs/validation/playwright-results-full.json`，最终界面定向复测在 `playwright-results-visual.json`，最近一次定向复测在 `playwright-results.json`。

实际结论见 [本轮验收报告](docs/I0_I1_VALIDATION.md)、[验收清单](docs/IMPLEMENTATION_CHECKLIST.md)；不能用测试脚本本身代替通过记录。

## 资产与复现

- 原包：`assets/source/original/xiaomi-su7.zip`（用户从指定正规入口下载，已设只读）。
- 来源、许可与原包哈希：`assets/source/source-record.json`。
- Blender 工作工程：`assets/source/blender/su7-enhanced.blend`，纹理全部打包。当前是导入基线，尚无机构增强。
- 运行资源：`apps/web/public/models/su7-runtime.glb`；同内容副本在 `assets/derived/`。
- 审查：[asset-audit.md](docs/assets/asset-audit.md)、[导出计划](docs/assets/export-plan.md)、节点／材质表。

仅在需要重新生成模型时安装本项目内的官方 Blender 4.5 LTS 便携版：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\setup-blender.ps1
npm run asset:import -- --file 'assets/source/original/xiaomi-su7.zip' --confirm-source ca2cda599f5341068c992c9f44551bf9
npm run asset:check
npm run build
```

导入器针对本次实际下载的 OBJ 嵌套 ZIP，保留 84 个网格组；如果后续下载的是其他格式，需先审查再适配导入器。`--confirm-source` 是操作者对来源的确认，不是自动鉴定模型身份。

第三方资源见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。未使用额外 HDRI、在线字体或其他车型。原包留存在本机交付目录，Git 忽略原包及便携工具的冗余大文件。

## 下一轮

本轮停止在 I1。先由用户体验；获准推进后，从 [NEXT_ITERATION.md](docs/NEXT_ITERATION.md) 的四窗检查与分件校准开始。门窗、尾箱、换色、车灯、雨刷和语音控制尚未实现。
