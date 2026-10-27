# SU7 交互实验室 · I4–I6

指定 Mona x Supercars 小米 SU7 交互展示工程。0.6.6 已实现四窗、四门、后备箱、近远光／转向灯、车漆、座舱灯带和双雨刷，手动／文字／语音共用执行器。尾箱原生接缝已修复并获用户确认，见 [尾箱修正](docs/TRUNK_CORRECTION.md)；车外灯光改回原投射灯面与转向灯面，删除细管／短杆代理，见 [原生灯组件修正](docs/NATIVE_LAMPS.md)。本次沿原内饰线条贴合 12 个氛围灯面，增加局部照明与可调丁达尔光束，见 [中控布局与全灯源散射报告](docs/LIGHTING_FOLLOWUP.md)。真实阿里云 ASR／TTS 的新能力闭环已通过合成音源测试；**新增部件真人麦克风复验待补，整轮未标记全部通过**。

0.6.6新增默认红色常亮后灯环，以及可点击和语音开关的前后排向下主灯，见 [本轮报告](docs/DOME_TAIL_LIGHTING.md)。

总体需求见 [设计基线及服务修订](docs/SU7_INCREMENTAL_DESIGN.md)，当前结果见 [I4–I6 报告](docs/I4_I6_VALIDATION.md) 与 [清单](docs/IMPLEMENTATION_CHECKLIST.md)。I7 DeepSeek 尚未接入。

## 打开演示

本机地址：[http://localhost:3000](http://localhost:3000)。Windows PowerShell，Node.js 24.14+：

```powershell
Set-Location 'D:\code\Projects\3D simulation'
npm ci
npm run build
npm start
```

仅监听本机，Ctrl+C 停止。开发模式 `npm run dev` 使用网页 3000、Express 3001，切换方式前停止原服务。配置在根 `.env`，仅服务端读取；见 [API_CONFIG.md](docs/API_CONFIG.md)。本机 ASR／TTS 已配置，克隆到其他机器时自行填写；密钥不提交或发到聊天。

## 操作

| 入口 | 操作 |
|---|---|
| 相机 | 左键旋转、右键平移、滚轮缩放；自由观察点击场景后 WASD／方向键移动、Q/E 升降；R 或“回到车辆”复位 |
| 面板 | 四窗／门与尾箱／灯光外观／雨刷，可整体折叠 |
| 门窗与尾箱 | 独立 0–100%、关／半开／全开；窗随门移动，仍沿门局部方向升降 |
| 模型内入口 | 点玻璃／开口选窗；门与尾箱标签开关；进入座舱后点灯光、氛围灯、雨刷标注 |
| 灯光 | 近光、远光、关闭；左右转向、双闪、关闭；“夜间观察＋照射视角”比较地面照明 |
| 外观 | 七种展示漆色及自定义颜色；灯带开关、颜色、0–100% 亮度 |
| 雨刷 | 0 关闭、1 间歇、2 低速、3 高速；刮一下；停止后回程归位 |
| 语音 | 点麦克风说话，停顿自动结束；支持手动结束、取消、重录和打断播报 |
| 调试 | 保存诊断 JSON 到 `docs/validation/`，包含相机、车辆及语音阶段 |

示例：“右后门开一半”“后备箱再关一点”“打开近光灯”“打开双闪”“车身换成蓝色”“打开氛围灯”“氛围灯换成紫色，亮度设为百分之四十”“雨刷调到二档”“雨刷再快一点”“关闭雨刷”“刮一下”。“打开雨刷”默认低速。缺少具体门窗会追问，未完整命中规则时保持车辆不变，不假装已有大模型兜底。

镜头拖动不触发模型入口；输入控件获得焦点时不移动相机。自由模式可穿过车身，不模拟人体碰撞。内饰低分辨率图集限制保留，机构为展示拟合，不声称厂商 CAD 精度。

## 验证

```powershell
npm run typecheck
npm run lint
npm test
npm run asset:check
npm run test:e2e
```

Edge 回归覆盖 1920×1080 和 1366×768，3003 `--test-unconfigured` 不读取 `.env`，Mock 用例有明确标识。结果在 `docs/validation/i4-i6/`，画面在 `docs/assets/i4-i6/`。

`npm run speech:verify-i4-i6` 显式调用真实 ASR／TTS；`npm run speech:verify-i4-i6 -- --additional` 补相对调整和否定等用例。音源为 API 合成语音，经浏览器录音后转写，不注入文本，不冒充真人。I3 历史真人证据见 [I3 最终报告](docs/I3_FINAL_VALIDATION.md)。

## 资产与版本

- 原包 `assets/source/original/xiaomi-su7.zip` 保持只读，正规来源、CC BY 4.0 和哈希见 `assets/source/source-record.json`。
- 唯一工作工程 `assets/source/blender/su7-enhanced.blend`，15 张纹理全部打包。
- 运行 GLB `apps/web/public/models/su7-runtime.glb`，导出副本在 `assets/derived/`。
- [机构／材质／热点映射](docs/assets/vehicle-mapping.json)、[修改记录](docs/assets/I4_I6_MODIFICATIONS.md)。
- 当前 128 节点、116 网格、96,553 三角面、40 材质、15 张纹理；哈希见 `docs/assets/current-geometry.json`。

需要重新导出时使用项目内 Blender 4.5 LTS 便携工具，运行 `npm run asset:export`、`npm run build`。导出从当前工程复位机构、更新资源和哈希，不重跑 I2 分件。

历史只使用 Git：`v0.1.0-i1`、`v0.3.2-i3-complete`、`v0.4.0-i4-mechanics`、`v0.5.0-i5-appearance`、`v0.6.0-i4-i6-functional`、`v0.6.1-trunk-correction`、`v0.6.2-native-trunk-seams`、`v0.6.3-native-lamps`、`v0.6.6-dome-tail`，不复制旧工程或运行旧版对照服务。[第三方许可](THIRD_PARTY_NOTICES.md)。

先等待体验及补齐新增部件真人语音复验，再获授权推进 I7。见 [下一轮起点](docs/NEXT_ITERATION.md)。
