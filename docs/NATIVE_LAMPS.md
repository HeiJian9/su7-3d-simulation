# 原生灯组件修正 · 0.6.3

> 历史阶段记录。0.6.6根据用户新要求将原后环设为常亮红色，并增加前后排可控顶灯，见 [当前报告](DOME_TAIL_LIGHTING.md)。

> 本报告资产哈希对应 0.6.3 历史版本。当前 0.6.4 座舱与体积光结果见 [座舱灯光报告](CABIN_LIGHTING.md)。

2026-10-27，基于 `9ee4d5f` / `v0.6.2-native-trunk-seams`。用户已确认尾箱修正效果，本次只修正车灯发光对象，尾箱形状与开合层级保留。

问题属实：前次使用额外细管和短杆替代原生灯面，虽然模式／闪烁状态正确，实际发光对象与用户指定组件不符。

## 修改

- 删除全部 14 个旧 `HEADLIGHT_*`、`TURN_*` 代理几何。
- 前照灯改为原 **Mesh61** 的八个投射灯面，每侧四个；近光全部点亮，远光增强亮度并保留更远的实际投射照明。原横向饰件不再被额外白色长条覆盖。
- 前转向改为原 **Mesh73／Mesh62** 独立横向灯面。灯壳 Mesh68 保留原材质，不将整块灯壳染亮。
- 后转向按用户最新标注改为原 **Mesh20／Mesh19 的内侧四段模块**。每侧 14 个原始三角面，固定段 6 面、尾盖段 8 面；尾盖开启后相应灯段随盖运动。外侧 Mesh21 C 形轮廓恢复原材质。
- 转向灯只在闪烁亮起时使用黄色 `#ffd000`；熄灭的半周期和关闭后均恢复各模块原色。修正了原色十六进制字符串缺少 `#` 导致黄色残留的问题，两分辨率测试逐次核对材质实际颜色与发光强度。
- 独立克隆发光材质，保留原粗糙度／金属度；单侧与双闪继续使用同一执行器和 0.72 秒周期。前灯与转向独立。车漆、氛围灯及原灯壳不会一起变色。

本次没有补建新的车外发光几何，没有修改原生顶点、UV 或法线。能力映射在 [vehicle-mapping.json](assets/vehicle-mapping.json)，面片与材质分配记录在 [native-lamp-audit.json](assets/native-lamp-audit.json)。内饰氛围灯的实体灯带保留。

## 实际验证

原生材质归属检查确认：八个投射面均来自 Mesh61，每面 10 个三角面；前转向每侧 91 面，来自原 Mesh73／62；后转向每侧 14 面，来自原 Mesh20／19，未亮颜色及 PBR 参数与修正前一致。C 形轮廓未分配转向材质，14 个旧代理节点均不存在。见 [原生灯面检查](validation/native-lamps/native-membership.json)。

原始 GLB 对照覆盖灯组及尾部 **25,210 个三角面**，顶点／UV 最大误差为 0，法线方向误差在原有编码精度内。除本轮明确删除的代理和改材质的灯面外，87 个既有节点的几何／层级／雨刷形态签名不变。尾箱关闭外表面遮挡检查继续通过，见 [原始几何复核](validation/native-lamps/source-geometry.log)。

1920×1080 与 1366×768 共 **10 项通过**：近远光、八个真实灯面发光、转向点亮／熄灭的实际颜色恢复、左右互斥／双闪同步、尾盖开启时灯面跟随、尾箱接缝与中断、车漆与氛围灯回归。见 [浏览器结果](validation/native-lamps/browser.json)。生产地址另存 [七张固定视角截图及状态](validation/native-lamps/production-visual.json)。单元测试 71 项、类型检查、构建、ESLint 和 15 张打包纹理验证通过。真实 ASR／TTS 本次没有重新调用，新增部件真人麦克风项仍保持待验。

画面：[前灯关闭](assets/native-lamps/front-off.png)、[原生投射灯近光](assets/native-lamps/front-low.png)、[夜间四投射面近看](assets/native-lamps/front-projectors-detail.png)、[远光](assets/native-lamps/front-high.png)、[前转向亮起](assets/native-lamps/front-right.png)、[前转向熄灭恢复原色](assets/native-lamps/front-signal-off.png)、[后内侧右转向](assets/native-lamps/rear-right.png)、[后双闪亮起](assets/native-lamps/rear-hazard.png)、[后双闪熄灭恢复原色](assets/native-lamps/rear-blink-off.png)、[完全关闭](assets/native-lamps/rear-disabled.png)。这些均为实际浏览器截图；夜间图使用现有“夜间观察”模式。位置依据 [用户最新标注](assets/native-lamps/user-rear-guide.png)。

## 当前资产

- 运行 GLB：6,524,528 字节，121 节点、109 网格、94,549 三角面、39 材质、15 张纹理。
- GLB SHA-256：`1cdc55cf42a6ba2d860fc2c1616d339ae3184e18bf575d9da1ef0c68111ebbf5`。
- Blender SHA-256：`4be82f98d96da5f5d59e3eeb5f3a032317f5b50808a1ce5255ffebbc1d3d3c35`。
- 唯一 Blender 工程仍为 `assets/source/blender/su7-enhanced.blend`；原生灯面分配已经烘焙，修补脚本不能重复执行。日常导出使用 `npm run asset:export`，现含原生灯面归属与原始几何检查。
- Git 标签 `v0.6.3-native-lamps`，不复制旧工程。用户继续体验，I7 未启动。

演示：[http://localhost:3000](http://localhost:3000)。刷新至页脚 `v0.6.3`，在“灯光外观”中切换近光／远光、左右转向及双闪。显示灯面和光照变化，未模拟原厂光学配光或认证级光强。
