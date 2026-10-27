# 座舱灯光与丁达尔光束 · 0.6.4

> 此为0.6.4历史报告。用户继续指出中控灯线偏离后，0.6.5已按原饰条顶点重新布置，并将散射扩展到转向灯和氛围灯。当前结论、资产哈希见 [追加修正](LIGHTING_FOLLOWUP.md)。

2026-10-27，基于 `16cb5b9` / `v0.6.3-native-lamps`。用户指出原氛围灯条没有沿内饰线条贴合，要求增加层次和丁达尔效果。本次属于 I5 视觉修正，复用原车辆状态、颜色、亮度及执行器，I7 未启动。

## 实际修改

- 替换原五段三点折线细管，改为 **12 个窄面漫射灯片**：四门上沿、四处门把手下沿、左右仪表台和中控两侧；脚窝保留隐藏局部照明，取消显眼的额外发光条。
- 前门沿原 Mesh47／34 饰条顶边取点，后门沿 Mesh43／30 原面片走向取点；其他灯片投影到实际原饰件表面，每约 8 毫米采样。发光片厚度位置外移 0.55 毫米，宽 2.6–4 毫米。原饰件的断口处截断灯片，避免跨过空隙形成悬浮连接。
- 主灯线与辅助漫射片使用独立材质，所有区域共用原氛围灯开关、颜色和 0–100% 亮度。主灯线更清晰，辅助灯光较柔和；关闭或亮度为零时，两种材质和全部局部灯均停止发光。
- 增加八个有距离限制的局部光源：四门、两个脚窝、仪表台、中控。门上的实体灯片和四个对应光源都跟随实际门铰链运动。
- 新增“门板视角”，可直接观察门板的贴合、手扶区域及座舱照明；保留自由观察。

12 个灯片是本项目的展示增强，未声称复刻原厂氛围灯配置。原车饰板、座椅、车窗、外灯、雨刷与已确认的尾箱没有重新切分，内饰原低分辨率贴图仍保留。

## 丁达尔效果

前照灯增加实时体积散射，支持独立开关和 0–100% 空气散射强度，默认 35%。实际读取同一车辆近光／远光状态；关闭前灯后自动停止体积效果。夜间观察和“照射视角”可清楚比较。

实现使用带深度纹理的渲染目标，按当前相机射线积分灯前空气中的散射，遇到实际场景表面深度即停止；保留原灯芯、照地光斑及阴影。最终采用 64 次采样和空间抖动减轻分层条纹，没有添加可见圆锥模型，也没有以全屏雾或泛光覆盖座舱。技术依据：[Three.js DepthTexture](https://threejs.org/docs/pages/DepthTexture.html)、[ShaderMaterial](https://threejs.org/docs/pages/ShaderMaterial.html)。

这是展示用单次散射近似，未模拟多次散射、真实粒径分布或原厂光学配光；内饰使用表面发光与局部漫射照明，不将所有饰条变成探照光束。

## 验证

- 实际导出 GLB 的 12 个灯片逐顶点和三角形中心复核：与对应原饰件的采样间距最大 **0.685 毫米**；116 个既有节点的几何、材质归属、形态与父子关系对照前版一致。见 [几何记录](validation/cabin-lighting/geometry.json)。
- 原尾箱及外灯 25,210 个三角面的位置／UV 对照保持，关闭外表面无补面外漏；原生灯面材质归属保持。见 [尾箱复核](validation/cabin-lighting/trunk-geometry.log)、[外灯复核](validation/cabin-lighting/native-lamps.log)。
- 1920×1080 与 1366×768 共 **14 项相关浏览器检查通过**，包括灯光、车漆、氛围灯 0／50／100%、颜色、开门时光源跟随、关闭后归零、尾箱中断和转向灯原色恢复。
- 其中最终 64 次采样版本的 **2 项体积光画面对照通过**：真实截图中空气变亮，车顶采样区无明显污染，散射强度可调，关前灯后体积效果关闭，浏览器无脚本或着色器错误。体积光也另有专项复验记录。
- 相机与加载回归 **9 项通过、1 项按既有策略跳过**；含旋转、平移、缩放、自由移动、座舱、重置、输入隔离、坏模型重试，以及 1080p 连续两分钟操作。跳过项为另一分辨率的重复两分钟耐久测试。
- 71 项单元测试、类型检查、构建、ESLint 和 Blender 15 张纹理打包复核通过。构建仍有原有依赖注释及包体积提示。
- 本次没有调用真实 ASR／TTS，也未执行真人麦克风测试。既有语音命令继续进入原共享执行器，新增部件真人验收保持待验。

机器可读结果：[汇总](validation/cabin-lighting/summary.json)、[相关回归](validation/cabin-lighting/browser.json)、[最终体积光](validation/cabin-lighting/final-volume.json)、[相机回归](validation/cabin-lighting/camera-regression.json)、[生产地址验证](validation/cabin-lighting/production.json)。

画面：[用户原问题](assets/cabin-lighting/user-before.png)、[门板日间](assets/cabin-lighting/door-day.png)、[门板夜间](assets/cabin-lighting/door-night.png)、[座舱开启](assets/cabin-lighting/cabin-night.png)、[同视角关闭](assets/cabin-lighting/cabin-off.png)、[脚窝](assets/cabin-lighting/footwell.png)、[丁达尔开启](assets/cabin-lighting/tyndall-on.png)、[同视角关闭丁达尔](assets/cabin-lighting/tyndall-off.png)。用户原图与新图视角不同；亮度与丁达尔开关对照使用相同相机位置。

## 资产与体验

- 唯一工程：`assets/source/blender/su7-enhanced.blend`；运行资产：`apps/web/public/models/su7-runtime.glb`。
- GLB 6,568,536 字节，128 节点、116 网格、95,793 三角面、40 材质、15 张纹理。
- GLB SHA-256：`1948a0d8098be447e1b89f91b48ee68bbeeff8a0ef32f4893e5582e3ea534446`。
- Blender SHA-256：`02a76184d6c654967ab9fea43f213774ef65573a6a15df549a54b74dd296c4f2`。
- [贴合审查与光源映射](assets/cabin-lighting-audit.json)，全部角色仍在 [统一映射](assets/vehicle-mapping.json)。
- Git 阶段标签：`v0.6.4-cabin-lighting`，历史通过 Git 保留。

刷新 [http://localhost:3000](http://localhost:3000) 至页脚 `v0.6.4`。在“灯光外观”打开氛围灯，点击“门板视角”或“进入座舱”；在车灯区域开启近／远光、切换“夜间观察”及“照射视角”，调节“空气散射”或关闭“丁达尔光束”。较低分辨率下控制面板内部可滚动。

后续继续体验本阶段；新增真人语音验收和 I7 的推进条件保持原交接约定。
