# SU7 后备箱：恢复原生接缝

2026-10-27，本报告记录尾箱版本 **0.6.2**，基于 `fbd609b` 修正，用户已确认效果。当前 0.6.3 仅修灯面材质，见 [灯组件修正](NATIVE_LAMPS.md)，尾箱原生几何与接缝保留。0.6.1 的尾箱接缝外观结论撤回；当时开度和状态测试通过，不能证明分件符合原车模。历史源码、模型及报告通过 Git 保存，没有复制旧工程。

## 根因与修改

用户指出的黑色尖片、底部黑斑和错误分界确实存在。前两次使用人为设定的空间截面切割 Paint5 和灯组，破坏了原组件边界，又以凸包封面／外伸内衬回边补切口。部分补面穿出原车身表面，形成与原有接缝不一致的黑线。原模型本来已有完整的面片岛，之前没有正确利用。

本次从 Git 的原始 I3 导入资产恢复尾部 11 个源网格，按**完整原生面片岛**归组，切面操作为零。保留其顶点、UV 和角点法线；恢复 Paint5 原有圆角下沿及灯组天然分界。原生下方铭牌面板、中央灯组、上盖和相关饰件共同抬起，两侧灯翼／保险杠／后挡玻璃固定。门窗及已校准的双雨刷保留。

移除 `TRUNK_LID_EDGE_RETURNS`、两侧 `TRUNK_LAMP_END_*` 及 `BODY_REAR_LAMP_END_*` 等外露补面。内盖由原生底板轮廓向内收缩，内腔／密封边退入原外壳内部。删除旧人为切割修补脚本，使用 `scripts/repair_trunk_seams.py`；它已烘焙并有重复执行保护。恢复期间临时读取的旧 Blender 文件已自动删除，唯一工作工程仍为 `su7-enhanced.blend`。

## 实际证据

| 检查 | 实际结果 |
|---|---|
| 原始面片一致性 | 导出的固定／活动尾部合计 **21,308 个三角面**与原始 I3 GLB 逐面匹配；顶点位置和 UV 最大误差均为 0；法线方向最大差约 0.039°，在 Blender 自定义法线编码精度内。原停放雨刷 536 个源面被排除，没有恢复到当前雨刷下面。 |
| 原生边界 | Paint5 的 8,314 个原始三角面完整保留，未加入人为切线；圆角铭牌板、上盖及灯组按完整岛移动。原生归属和源面记录见审查 JSON。 |
| 关闭外表面 | 正后、左右后和后上四个视角，共 **18,497 条命中原尾箱外表面的射线**，没有被新增内衬／密封片抢先遮住。检查区域 Y≥0.60 m、Z≥1.90 m；其他车身和穿过原有间隙的远处内侧命中另计，不冒充尾箱外表面。 |
| 关闭图对照 | 相同镜头、相同照明，比较原生面片与加入内衬的模型，RGB 平均绝对差约 0.0013/255；原图均值>100 而修后<40 的新增黑色像素为 0。该图像检查仅为补充，另有实际 GLB 几何和射线检查。 |
| 其他部件 | **101 个无关节点**的顶点、索引、UV、世界矩阵、父层级及雨刷形态数据签名不变；运行雨刷扫掠检查继续通过。 |
| 浏览器 | Edge 1920×1080、1366×768 共 **14 项通过**：原生尾箱关闭近看／半开／全开、真实热点、中途改向、拖动隔离、四门及 36 种门窗组合、车漆保护、灯光及实际资产加载。近看图另复拍两项通过，完整下沿避开了工具栏遮挡。 |
| 工程 | **71 项单元测试**、类型检查、构建、ESLint 通过；当前 Blender 工程的 15 张打包纹理解码通过。 |

结果：[实际 GLB 与原始资产对照](validation/trunk-native-seams/geometry.json)、[完整原生岛归属](assets/trunk-native-seams.json)、[14 项浏览器验证](validation/trunk-native-seams/browser.json)、[近看复拍](validation/trunk-native-seams/closeups.json)、[关闭图比较](validation/trunk-native-seams/closed-image-comparison.json)、[Blender 可携带性](validation/trunk-native-seams/blend-portability.json)、[正式服务检查](validation/trunk-native-seams/production.json)。

另以 Git 中实际 0.6.1 资产作反例：其 Paint5 已被人为截面增面，不能通过当前原始完整三角面检查。该反例被正确拒绝，见 [negative-control.json](validation/trunk-native-seams/negative-control.json)。没有另存旧模型副本。

本次没有调用真实 ASR／TTS，正式服务检查只读取配置状态，并关闭播报反馈。新增部件的真人麦克风待验项保持未勾选，未推进 I7。

## 画面

用户问题图：[关闭时的黑片](assets/trunk-correction/user-before-closed.png)、[红线与原有轮廓](assets/trunk-correction/user-seam-guide.png)、[打开后的边界](assets/trunk-correction/user-before-half.png)。问题图与修正图的相机不同；修正后的三个开度使用固定镜头。

正式浏览器：[关闭近看](assets/trunk-correction/production-closed-detail.png)、[关闭全图](assets/trunk-correction/production-closed-close.png)、[半开近看](assets/trunk-correction/production-half-detail.png)、[半开全图](assets/trunk-correction/production-half.png)、[全开](assets/trunk-correction/production-full.png)。这是实际网页截图，近看图直接使用浏览器截取区域，没有涂除黑线或修改图片内容。

两种分辨率近看：[1920×1080](assets/trunk-correction/browser-closed-close-Edge-1920x1080.png)、[1366×768](assets/trunk-correction/browser-closed-close-Edge-1366x768.png)。Blender 结构检查：[原生关闭参考](assets/trunk-correction/render-closed-native-reference.png)、[关闭](assets/trunk-correction/render-closed.png)、[半开](assets/trunk-correction/render-half.png)、[全开](assets/trunk-correction/render-full.png)、[侧后](assets/trunk-correction/render-side.png)。

## 当前资产与复现

- `.blend`：`assets/source/blender/su7-enhanced.blend`，SHA-256 `b56ec2ec49065ba6f91240554798e6134511ccfc1b53b100c642c5a1872dadcb`。
- GLB：`apps/web/public/models/su7-runtime.glb`，6,547,164 字节，SHA-256 `4e2be993e0b2ad99f6f5112be838489260580916e96e45d1e68bb9b823db87ce`；`assets/derived/` 同步。
- 当前 **135 节点、123 网格、95,149 三角面、39 材质、15 张纹理**。三份机构映射已同步，标记 `I6.4-native-trunk-seams`。
- Git 阶段标签：`v0.6.2-native-trunk-seams`。日常导出只运行 `npm run asset:export`，不重复运行一次性修补脚本。导出包含原始三角面、UV／法线和外表面遮挡检查；Blender Python 错误会返回失败退出码。
- 单独复核使用 `node scripts/verify-trunk-seams.mjs` 或原入口 `node scripts/verify-trunk-correction.mjs`；原始对照从 Git 标签 `v0.3.2-i3-complete` 读取，不额外保留旧模型副本。

演示：[http://localhost:3000](http://localhost:3000)。刷新至页脚 `v0.6.2`，选择后方视角，检查关闭／半开／全开。原生外形和接缝已恢复；内衬、内腔和弯臂仍为简化展示结构，未声称原厂 CAD 精度。
