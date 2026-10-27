# SU7 后备箱盖板与内腔修正

2026-10-27，版本 0.6.1；基于 `b19870f` / `v0.6.0-i4-i6-functional` 原地修正。没有替换指定 SU7，也没有复制旧工程。历史版本只由 Git 保存。

用户指出的问题成立。旧分件将统一高度 `Y ≥ 0.812 m` 当作尾盖下边界，只抬起上方盖板；带“北京小米 / SU7 Max”的下方外板与三个铭牌留在固定车身。补建的密封圈没有依附实际开口，浅盒内腔的后壁又高到 `Y=0.805 m`，形成外露线框和矩形挡板。旧中心射线只证明某条射线可以进入内腔，没有证明完整盖板、边界和外观正确。原尾箱外观通过结论撤回，I4 历史报告与验收清单已明确更正。

## 实际修改

1. 将旧 `TRUNK_*` 原始分片与对应静态分片在关闭姿态重新合并，保留原 UV／材质，再按三维盖板范围切开。保留原上盖、下方铭牌面板、中央灯条与相关饰件，统一归入 `TRUNK_REAR_ROOT`。
2. `Mesh52`（SU7）、`Mesh55`（北京小米）、`Mesh56`（Max）及原 `TRUNK_Mesh58`（xiaomi）随盖板移动。两侧灯翼和保险杠保持固定。新切开的灯壳补端面，转向段重新贴合各自灯罩。
3. 删除旧 `TRUNK_SEAL` 和旧内皮／浅盒。重新补建盖内覆盖板、回边、向后排座椅下方延伸的开放内腔、贴合车身的法兰／密封边及两侧弯臂。原扰流板机构保留，内侧覆盖板位于其下方。
4. 展示铰链位置约 `(0, 1.075, 1.965) m`，最大转角校准为 100°；手动、文字和既有语音仍驱动同一真实盖板状态。更新了模型内热点。

外观参考为用户红线及 [小米 SU7 官方后备箱图片](https://s1.xiaomiev.com/activity-outer-assets/0328/images/su7/su7_12_2.jpg)。内衬、弯臂和角度为本项目展示拟合，仍是简化结构，不声称厂商 CAD 或内饰细节完全复刻。

## 实际验证

| 验证 | 结果与证据 |
|---|---|
| 完整下沿／铭牌运动 | 实际导出 GLB 的三条后向射线，关闭时先命中盖板或铭牌；全开后先命中前方深内腔，约 `Z=1.24–1.29 m`，原下方面板没有留在车身。四个铭牌半开位移 0.42–0.54 m，全开位移 0.76–0.99 m。 |
| 固定车身与其他机构 | 101 个无关节点的顶点、索引、UV、雨刷形态、世界矩阵及父层级签名与修正前一致；打开盖板时固定部件世界位置不变；保险杠射线仍命中固定 Paint5。 |
| 开口与密封边 | 旧悬空环不存在。替换密封圈所有导出顶点到支撑法兰最大距离约 4.44 mm；内腔最低约 0.365 m，向前延伸至 Z≈1.17 m。新旧原始表面总面积差最大约 `1.34e−7 m²`，未用删除外壳或重叠外壳冒充开口。 |
| 浏览器专项 | Edge 1920×1080、1366×768，2 项通过：固定镜头 0／50／100%、实际旋转矩阵、真实热点点击、中途改向及镜头拖动隔离。 |
| 功能回归 | 两分辨率 18 项通过：四门、36 种门窗组合、规则澄清、灯光、车漆保护、氛围灯、模型哈希、旋转／平移／缩放／自由移动／座舱／重置。 |
| 工程 | 71 项单元测试通过；类型检查、构建、ESLint 通过。实际运行雨刷顶点／形态扫掠复核通过，15 张 Blender 打包纹理均可脱离原路径解码。 |

实际数值见 [导出几何检查](validation/trunk-correction/geometry.json)、[原表面分件记录](assets/trunk-correction-audit.json)、[未改部件签名](assets/trunk-correction-baseline.json)、[专项浏览器报告](validation/trunk-correction/browser.json)、[18 项回归](validation/trunk-correction/regression.json)、[Blender 打包检查](validation/trunk-correction/blend-portability.json)。没有用状态值或截图单独替代几何检查。

正式 3000 服务另已检查 0.6.1 版本、下载资源哈希及三种实际开度：[正式服务检查](validation/trunk-correction/production.json)。现有 ASR／TTS 配置存在；为避免本次模型复核产生播报请求，检查时关闭了语音反馈，实际语音请求为零。正式画面：[关闭](assets/trunk-correction/production-closed.png)、[半开](assets/trunk-correction/production-half.png)、[全开](assets/trunk-correction/production-full.png)。

本次没有调用或重新验证真实语音 API；没有使用预写转写或 Mock 宣称语音通过。新增部件的真人麦克风复验仍待用户方便时完成。I7 未启动。

## 画面证据

修正前为用户原始问题截图：[关闭及红线](assets/trunk-correction/user-before-closed.png)、[半开及红线](assets/trunk-correction/user-before-half.png)、[外露框架](assets/trunk-correction/user-before-cargo.png)。这些图片不是修正后同机位的自动截图，不声称前后相机完全相同。

修正后同一浏览器镜头的三个开度：

- 1080p：[关闭](assets/trunk-correction/browser-closed-Edge-1920x1080.png)、[半开](assets/trunk-correction/browser-half-Edge-1920x1080.png)、[全开](assets/trunk-correction/browser-full-Edge-1920x1080.png)、[内腔近看](assets/trunk-correction/browser-cargo-Edge-1920x1080.png)。
- 1366×768：[关闭](assets/trunk-correction/browser-closed-Edge-1366x768.png)、[半开](assets/trunk-correction/browser-half-Edge-1366x768.png)、[全开](assets/trunk-correction/browser-full-Edge-1366x768.png)、[内腔近看](assets/trunk-correction/browser-cargo-Edge-1366x768.png)。
- Blender 结构检查渲染：[关闭](assets/trunk-correction/render-closed.png)、[半开](assets/trunk-correction/render-half.png)、[全开内侧](assets/trunk-correction/render-full.png)、[内腔](assets/trunk-correction/render-cargo.png)、[侧后方](assets/trunk-correction/render-side.png)。渲染使用检查照明，与浏览器展厅照明不同。

## 资产、版本与复现

- 唯一 Blender 工程：`assets/source/blender/su7-enhanced.blend`，SHA-256 `ab59b98f7c0006d68d6838d9e90ecfc48e5b2396fbd65192cb3d45a4953283af`。
- 运行 GLB：`apps/web/public/models/su7-runtime.glb`，6,966,520 字节，SHA-256 `79a90cfc87317a6598406409e2abf7770d2037007f527563f426f8144ede3520`；导出副本位于 `assets/derived/`。
- 当前 140 节点、128 网格、110,056 三角面、39 材质、15 张纹理；机构映射在 [vehicle-mapping.json](assets/vehicle-mapping.json)，三份运行映射已同步。
- Git 阶段标签：`v0.6.1-trunk-correction`；本轮汇总见 [summary.json](validation/trunk-correction/summary.json)。没有建立新版／旧版目录副本。
- 修补脚本 `scripts/repair_trunk.py` 已烘焙，存在一次性保护，不能在当前工程重复运行。日常重新导出使用 `npm run asset:export`，它包含完整尾箱和无关节点保护检查。
- 运行 `node scripts/verify-trunk-correction.mjs` 复核当前 GLB；`npx playwright test tests/e2e/trunk-correction.spec.ts` 复核浏览器。测试服务 3003 不读取本机凭据，画面中“ASR/TTS 待配置”是隔离测试环境的真实状态。

演示 [http://localhost:3000](http://localhost:3000)：刷新后选择“后方视角”，在“门与尾箱”页切换关闭／半开／全开；也可输入“后备箱打开一半”或点击盖板热点。等待用户体验，保留真人待验与 I7 边界。
