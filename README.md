# SU7 交互实验室 · I2 + 阿里云语音

指定 Mona x Supercars 小米 SU7 的四窗控制场景。0.3.1 在 I2／框架基础上接入用户选择的阿里云千问 ASR + CosyVoice，真实接口、合成音源浏览器动作和真人麦克风基础闭环均已通过。完整需求以 [设计基线及服务修订](docs/SU7_INCREMENTAL_DESIGN.md) 为准。

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
| 四窗 | 独立滑块、关／半开／开、全开全关；0% 关闭，100% 全开 |
| 3D 选择 | 点击玻璃或全开后的开口选中；拖动镜头不触发选择 |
| 文字 | “左前窗开一半”“右后窗关闭”“再关一点”；缺少对象会追问 |
| 语音 | 点击麦克风说“左前车窗打开一半”，停顿自动结束，等待动作和 API 播报；支持结束／取消／重新录音 |
| 调试记录 | 查看资源、相机、GPU、FPS；保存诊断到 `docs/validation/` |

自由模式允许穿过车身，不模拟人体碰撞。输入框或滑块获得焦点时不响应相机移动。接口配置在根 `.env`，详见 [API_CONFIG.md](docs/API_CONFIG.md)。当前本机已配置真实阿里云服务；克隆项目时自行填入密钥。调试面板可保存车辆和语音阶段诊断，原三秒收音检查仍只测本地音量。

## 验证

```powershell
npm run typecheck
npm run lint
npm test
npm run asset:check
npm run test:e2e
```

浏览器回归使用本机 Microsoft Edge，覆盖 1920×1080 与 1366×768。`test:e2e` 在 3003 启动不读取 `.env` 的隔离服务，语音 Mock 不消耗真实 Key；结果在 `docs/validation/aliyun/`。`npm run speech:probe` 是显式真实 API 探针，会使用本机凭据并产生少量调用。I1 两分钟连续相机历史证据保留。真实接口／合成音源／真人分别记录，不能互相代替。

本轮完整回归保存在 `docs/validation/playwright-results-full.json`，最终界面定向复测在 `playwright-results-visual.json`，最近一次定向复测在 `playwright-results.json`。

实际结论见 [本轮验收报告](docs/I2_I3_VALIDATION.md)、[验收清单](docs/IMPLEMENTATION_CHECKLIST.md)。I1 [历史报告](docs/I0_I1_VALIDATION.md) 保留；不能用测试脚本本身代替通过记录。

## 资产与复现

- 原包：`assets/source/original/xiaomi-su7.zip`（用户从指定正规入口下载，已设只读）。
- 来源、许可与原包哈希：`assets/source/source-record.json`。
- Blender 工作工程：`assets/source/blender/su7-enhanced.blend`，纹理全部打包，已增强四窗机构。旧阶段仅通过 Git 历史保存。
- 运行资源：`apps/web/public/models/su7-runtime.glb`；同内容副本在 `assets/derived/`。
- 审查：[asset-audit.md](docs/assets/asset-audit.md)、[导出计划](docs/assets/export-plan.md)、节点／材质表。

仅在需要重新生成模型时安装本项目内的官方 Blender 4.5 LTS 便携版：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\setup-blender.ps1
npm run asset:export
npm run asset:check
npm run build
```

导出脚本基于当前 Blender 工程，更新 GLB、节点映射和哈希。四窗平移原始玻璃几何，不用缩放或透明度冒充。源重导入已加保护以避免覆盖增强。84 网格、92,410 三角面、24 材质保留，增加 8 个机构空节点。

阶段版本只使用 Git 提交／标签保存。I1 标签为 `v0.1.0-i1`，不复制旧工程或运行旧版对照服务。

第三方资源见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。未使用额外 HDRI、在线字体或其他车型。原包留存在本机交付目录，Git 忽略原包及便携工具的冗余大文件。

## 下一轮

当前先等待用户体验并补齐 I3 真人复杂场景验证，再按 [NEXT_ITERATION.md](docs/NEXT_ITERATION.md) 交接；不提前推进 I4。最新接入证据见 [阿里云报告](docs/ALIYUN_SPEECH_VALIDATION.md)，I2／框架历史报告保留。
