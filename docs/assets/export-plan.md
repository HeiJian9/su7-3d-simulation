> 0.7.1 当前资产：153 节点／140 网格／102,731 三角面／46 材质／15 纹理；25 个氛围灯面、16 处运行时补光。原 140 节点完整保留。唯一 Blender、GLB 与哈希见 current-geometry.json。`design-cabin-lighting.py --apply` 已执行并烘焙，不重复运行。正常导出仍只用 `npm run asset:export`；下文 0.7.0 是历史。

> 0.7.0 最新约定：当前资产为 140 节点／127 网格／99,445 三角面／46 材质／15 贴图。继续使用唯一 `assets/source/blender/su7-enhanced.blend`；正常导出只运行 `npm run asset:export`，再 `npm run asset:check` 和 `npm run build`。**下面早期导入步骤是历史，不能重跑覆盖已确认修复。** 原生尾箱、前盖、灯面、贴合灯带和雨刷均已烘焙。I7–I9 未修改模型文件。

# SU7 导出约定与后续增强计划

本轮资产流水线：正规原包（只读）→ 安全解开嵌套 ZIP → OBJ/MTL → Blender 工作工程 → 自包含 GLB → NodeIO 结构与 SHA-256 核验 → 浏览器实际加载。

## 可复现导出

1. `.tools/blender-install.json` 保存官方 Blender 版本、下载地址、校验和及本机路径。
2. `npm run asset:import -- --file 'assets/source/original/xiaomi-su7.zip' --confirm-source ca2cda599f5341068c992c9f44551bf9` 调用导入脚本。
3. `scripts/prepare_su7.py` 固定 OBJ 的 forward=−Z、up=Y，统一到 4.997 m 长度，保留比例与网格分组。
4. 导出 GLB：Y-up，导出 extras；不导出相机、灯光和动画，不使用 Draco。本轮没有减面。15 张图片全部内嵌。
5. `npm run asset:check` 核对运行哈希、字节数、84 网格和 92,410 三角面，写入结构报告。
6. `npm run build` 将当前资源复制到构建目录，再用 `npm start` 复核。只更新源资源而不重新构建，会导致正式服务的文件与清单不一致，加载器会拒绝错误大小／哈希的资源。

两份运行 GLB 必须相同：`assets/derived/su7-runtime.glb` 与 `apps/web/public/models/su7-runtime.glb`。原始 ZIP 不修改，解包材料在 `assets/source/extracted/`，可编辑纹理副本在 `assets/source/textures/`。

## I2 当前导出补充

I2 已在现有 `.blend` 完成四窗语义机构；当前使用 `npm run asset:export`，随后 `npm run build`。脚本导出 GLB、运行／文档／前端映射并登记哈希。初始 `asset:import` 在检测到 I2 映射时拒绝覆盖增强。运行校验写入 `i2-runtime-check.json`，保留 I1 历史报告。原始 ZIP 始终不修改，历史版本只通过 Git 保存。

## 后续顺序（下表为原 I1 计划；I2 当前结果见资产审查）

| 阶段 | 起点与输出 |
|---|---|
| I2 | 复核 Mesh46 / Mesh33 / Mesh39 / Mesh26 的四窗边界；检查重复遮挡；建立 WINDOW_* 及门局部坐标，校准 0/50/100% 行程；保存 Blender 与 GLB 对照 |
| I3 | 根据 Provider 待办配置 Gemini 真实音频与 TTS，再接录音闭环；本轮麦克风环境检查不能代替 ASR |
| I4 | 完整门集合、门内侧、铰链、门窗父子层级；尾箱盖与内腔 |
| I5 | 车漆白名单、灯芯／灯罩分组、真正的氛围灯灯带和局部照明 |
| I6 | 定位或补建双雨刷，建立扫掠、归位与档位校准 |

后续每次导出仍需验证材质、玻璃、坐标、纹理打包及原几何残留。原始零件候选不作为已经支持动作的证据。
