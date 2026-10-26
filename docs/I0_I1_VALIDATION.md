# I0–I1 实际验收报告

日期：2026-10-26（Asia/Shanghai）。版本：`0.1.0`。本轮结论：**指定 SU7 的资产基线与浏览器观察场景通过；停止在 I1，等待用户体验。**

演示：http://localhost:3000 。当前运行 `npm start` 的正式构建，Express 同源提供网页和本地 API，仅监听 `127.0.0.1:3000`。

## 范围与环境

- 实施 R01、R02、R04、R18，以及 R03/R19 的导入工作工程与资产溯源部分；没有提前实施 I2 之后的控车能力。
- Windows，本机 Node.js 24.14.0 / npm 11.9.0，Microsoft Edge 156，WebGL 2，NVIDIA GeForce RTX 5070（ANGLE / D3D11）。
- 依赖锁定：React / React DOM 19.3.1、Three.js 0.186.1、R3F 9.8.2、Drei 10.7.9、Vite 7.3.7、TypeScript 5.9.3、Express 5.3.0、Zustand 5.0.16、Zod 4.6.7。采用兼容的稳定主线；具体树见 [dependencies.json](validation/dependencies.json)。
- 用户已在录屏，本轮未安装或操作录屏工具。录像原文件与时间偏移未提供，墙钟标记保存在 [SESSION_LOG.md](SESSION_LOG.md)，不宣称已整理完整录像。

## 验收与证据

| 项目 | 真实结果 | 证据 |
|---|---|---|
| A01 依赖安装／构建／启动 | `npm ci` 成功，344 个包；TypeScript、ESLint、生产构建通过；`npm start` 启动；首页／health／asset 为 200 | [build.log](validation/build.log)、[typecheck.log](validation/typecheck.log)、[lint.log](validation/lint.log)、[http-checks.json](validation/http-checks.json) |
| 指定模型 | 正规入口登录交接后由用户下载原包；真实 GLB 的魔数、完整 SHA-256、字节数和结构通过，未加载占位车 | [资产审查](assets/asset-audit.md)、[artifact-hashes.json](validation/artifact-hashes.json)、[runtime-check.json](assets/runtime-check.json) |
| Blender 工作工程 | 84 网格、92,410 三角面；复制到独立目录后禁用外部路径，15 张打包纹理仍可解码 | [blend-portability-check.json](assets/blend-portability-check.json) |
| A02 外观观察 | 实际左键旋转、右键平移、滚轮缩放通过；另有左键平移工具。相机重置恢复到 `[5.4, 2.65, -6.1]` | [完整浏览器回归](validation/playwright-results-full.json)、[手工相机记录](validation/browser-checks.json) |
| A02 车内外自由移动 | 座舱预设、转头、W/E 移动、输入控件聚焦时不移动、R 返回均通过；补充实测 W 穿过前风挡并越过车头包围盒，再按 S 返回 | [定向自由观察复测](validation/playwright-results.json)、座舱截图 |
| 快捷视角 | 前 `[0,1.7,-7.8]`、后 `[0,1.7,7.8]`、左 `[-7.8,1.7,0]`、右 `[7.8,1.7,0]` 的实际定位通过 | [视口和快捷视角复测](validation/playwright-results-visual.json) |
| 手势分类 | >5px 拖动与点击分开，回到起点的长拖动仍识别为拖动；浏览器实测显示“相机拖动” | [unit-tests.json](validation/unit-tests.json)、完整浏览器回归 |
| 失败恢复 | 注入损坏模型响应时显示大小校验失败与重试；恢复实际资源后重试成功，不会以空场景宣称加载成功 | 完整浏览器回归中的 corrupt model 用例；此处注入仅用于故障测试 |
| 双分辨率 | 1920×1080 与 1366×768 的资源加载、旋转／平移／缩放、自由观察、输入隔离、重置和失败恢复通过 | 完整浏览器回归、[外观 1366×768](assets/su7-exterior-Edge-1366x768.png)、[座舱 1366×768](assets/su7-cabin-Edge-1366x768.png) |
| 连续操作 | 1080p 连续相机操作 120,763 ms，116 个外观／平移／缩放／座舱／自由移动／重置循环，pageerror 为 0 | 完整浏览器回归的 continuous-camera-result 附件；[逐秒性能](validation/scene-diagnostics-2026-10-26T09-59-16-015Z.json) |
| I0 麦克风 | 用户允许权限并发声；真实输入峰值 RMS=0.302969，75 次采样，3002 ms 后释放 track；无音频保存或上传 | [麦克风原始诊断](validation/scene-diagnostics-2026-10-26T09-52-59-971Z.json)、[界面截图](assets/microphone-probe.png) |
| 依赖与凭据 | npm audit 全量结果 0 漏洞；Provider 未接入、未调用、未打印密钥；`.env` 被忽略 | [npm-audit.json](validation/npm-audit.json)、[PROVIDER_TODO.md](PROVIDER_TODO.md)、源码与忽略规则 |

完整回归为 **9 通过、1 跳过**：8 项功能测试在两种分辨率执行，2 分钟稳定性只在 1080p 执行一次。1366×768 的重复长测明确跳过。之后针对界面细节、四方位快捷镜头复测 4 项通过，再补充车内外穿行复测 2 项通过；不同报告不是累计成更多独立功能。

I1 没有挂载车窗／车门动作。手势分类与无误动作在本轮成立，I2 挂接真实部件拾取后必须再次回归，不能借此认为 I2 的点击控制已验收。

## 性能基线

1080p 连续操作报告使用真实 Edge / RTX 5070 渲染，用户录屏保持运行；该自动回归浏览器为 headless，另有前台 Edge 的人工操作与截图验证。

| 指标 | 实际值／边界 |
|---|---|
| 稳态采样 | 121 个逐秒样本，覆盖第 1–121 秒 |
| FPS | 最低 207，中位数 240，最高 240；仅对本机、本模型和该测试负载成立 |
| draw calls | 128–171（含阴影等渲染调用），模型本身 84 网格 |
| 首个 SU7 渲染 | 341 ms / 页面导航起；新浏览器上下文，操作系统磁盘缓存未清空，不冒称完全冷机测量 |
| 模型与纹理 | 6,245,740 bytes，15 张内嵌图，最大 1024×1024 |
| 前台人工观察 | 激活浏览器后约 235–240 FPS；早期后台／被遮挡窗口曾被浏览器限制到约 1 FPS，不用它充当前台性能 |

最终正式页面的前台确认：实际模型首帧 1664 ms、240 FPS、171 calls，浏览器 error 日志为空；见 [最终诊断截图](assets/final-diagnostics.png) 和 [原始诊断](validation/scene-diagnostics-2026-10-26T10-10-22-957Z.json)。用户体验入口见 [最终外观截图](assets/final-exterior.png)。

麦克风报告中的 `loadMs` 来自开发热更新后的导航累计时间，**不能作为冷启动指标**；正式稳定性报告的 341 ms 是独立的页面导航测量。截图上的瞬时 FPS 也不代替连续采样。

## 发现、修正与复测

1. **深色轮胎透明缺片**：OBJ/MTL 的 diffuse 亮度误接 Alpha。检查 PNG Alpha 后修正映射并重新导出，真实轮胎完整，几何数量保持不变。
2. **开发模式假超时**：React StrictMode 清理时取消第一次请求，旧 catch 覆盖新状态。增加活动请求保护，后续重载和回归未复现。
3. **座舱视野被座椅遮挡**：将驾驶位相机前移，座舱 FOV 调至 68°，可见方向盘、仪表、中控屏；外观仍为 42°。
4. **重置与阻尼**：预设切换重建当前控制器并清空按键，避免残余阻尼带偏重置；两种分辨率的精确位置断言通过。
5. **1366×768 调试面板遮挡返回按钮**：将较窄视口的调试面板移至上方并限制高度，重新验证返回按钮与四方位镜头通过。
6. **缩放自动测试失败**：测试在点击返回后把滚轮发在工具栏上，尚未操作场景。将鼠标移回画布后测试通过；未放宽缩放断言。
7. **原生工具无法保持 Ctrl 跨调用**：一次试验实际产生了旋转，记录明确标注为无效的平移证据。平移最终由真实右键 Playwright 操作与手工平移工具分别验证。
8. **Windows 依赖重装占用**：开发服务运行时 `npm ci` 遇到 esbuild 文件占用。停止本项目服务后重新安装成功，再构建并以正式服务重跑。
9. **Blender 延迟加载**：初始检查直接读取 `has_data` 导致误判；强制从打包内容解码像素后，独立目录检查通过。

## 保留的限制与后续边界

- 车模属于现成可视化资产，不是实车工程 CAD。原有贴图／内饰有简化；雨刷与尾箱尚无可直接控制的语义映射，详细缺口见资产审查。
- Three.js / R3F 依赖会输出 Clock／阴影类型弃用提示，部分 GPU 着色器有精度警告；未出现 pageerror 或可见渲染故障。打包有约 1.42 MB 主 JS chunk 与第三方注释警告，已记录，当前本机加载与性能通过。
- 不执行 A03–A20 的后续整体验收，不把 I0 麦克风信号检查当成 Gemini、DeepSeek 或 TTS 成功。
- A20 的完整增强资产、全部控车、真实 API 与全过程录像交付仍属于 I8，保持未验收。
- 下一轮从 [NEXT_ITERATION.md](NEXT_ITERATION.md) 开始；等待用户体验和新的推进授权。

本轮代码与可运行资产保留为本地 Git 版本 **v0.1.0-i1**；无远程推送或公网部署。原始下载 ZIP 保留于交付目录并设为只读，未纳入 Git 的重复大文件；其来源与哈希在版本内记录。
