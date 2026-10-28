# 车载智能助手工具与参数 · 0.7.0

唯一注册来源：[capabilities.ts](../packages/shared/src/capabilities.ts)。命令 Schema 同时供 VehicleLedger、手动入口、规则和 LLM 校验；`registeredTools()` 从这些 Zod Schema 生成工具定义。模型只能选择注册工具，不能提交脚本、场景节点路径或其它操作。

每个控车工具接收严格对象 `{actions:[...]}`。每个 action 包含 `component`、`targets`、`property`、`operation`，设值／调整另带 `value`；一次刮刷改用 `operation:"trigger",action:"swipe_once"`。完整机器 Schema 由 `scripts/report-i7-i9.mjs` 导出到 `docs/validation/i7-i9/tools.json`。

| 工具 | 对象 / 属性 | 操作与合法值 |
|---|---|---|
| vehicle_windows | window / fl, fr, rl, rr / openness | set 0–1；adjust −1–1；query |
| vehicle_doors | door / fl, fr, rl, rr / openness | 同上 |
| vehicle_trunk | trunk / rear / openness | 同上 |
| vehicle_frunk | frunk / front / openness | 同上 |
| vehicle_headlight_mode | headlights / front / mode | set off / low / high；query |
| vehicle_headlight_brightness | headlights / front / brightness | set 0–1；adjust −1–1；query |
| vehicle_turn_signals | turnSignal / vehicle / mode | set off / left / right / hazard；query |
| vehicle_cabin_light_switch | cabinLight / front, rear / enabled | set boolean；query |
| vehicle_cabin_light_brightness | cabinLight / front, rear / brightness | set 0–1；adjust −1–1；query |
| vehicle_paint | paint / body / color | set 六位 HEX `#RRGGBB`；query |
| vehicle_ambient_switch | ambient / cabin / enabled | set boolean；query |
| vehicle_ambient_color | ambient / cabin / color | set 六位 HEX；query |
| vehicle_ambient_brightness | ambient / cabin / brightness | set 0–1；adjust −1–1；query |
| vehicle_wiper_mode | wiper / front / mode | set off / intermittent / low / high；adjust 整数 −3–3；query |
| vehicle_wiper_once | wiper / front | trigger / swipe_once |
| vehicle_scatter_switch | scatter / scene / enabled | set boolean；query |
| vehicle_scatter_strength | scatter / scene / strength | set 0–1；adjust −1–1；query |
| vehicle_observation | observation / scene / night | set boolean；query |
| assistant_reply | 无车辆副作用 | kind clarify / unsupported / not_understood / noop / chat，加简短 message |

fl / fr / rl / rr 依次是左前、右前、左后、右后；cabinLight 的 front / rear 指前排、后排。灯光、车漆的目标域彼此独立。后行车灯红环是既有固定常亮资产，不伪造可调工具；统一散射开关控制其空气散射。

百分比和内部量统一：35% = 0.35，三成 = 0.3。`set .1` 是设为 10%，`adjust .1` 是增加十个百分点。模糊“一点”的步长集中在 `tuning.ts`，开度／亮度／散射为 0.1，雨刷为一档。相对调整被合法边界钳制并反馈上／下限。亮度调节不会擅自开灯。

所有调用先完整校验，再按返回语义顺序计算、一次提交；同对象 set→adjust 基于前一步值，query 保留对应顺序观察。每个 tool_call_id 只回传该工具涉及属性的结果。动画中途可改向；去重、版本、录音代次、手动抢占、取消与旧回复丢弃沿用同一执行器。

上下文包含最新真实状态、已采样的驱动值、可用部件、最新焦点、近期对话及未完成追问。共享目标约束禁止不明确指令擅自全选；模型被拒绝时最多重新生成一次澄清工具调用，拒绝回合明确为未执行。

协议链路：ASR → `/api/assistant/plan` → 真实 `tool_calls` → 两端校验 → 浏览器实际执行完成 → `/api/assistant/finish`，逐一回传 `tool_call_id` → 模型短答 → 原 CosyVoice。外部工具 API 没有启用 Beta strict 模式；严格参数约束由共享 Schema 在前后端执行，不将平台 JSON 输出模式称为 function calling。

诊断中的“自动路由”只在规则完整理解整句时快捷执行；规则不完整交给助手。“强制 LLM 验证”用于逐能力证据，取消仍走本地取消路径。模型没有返回工具调用、ID 不匹配、参数非法或平台拒绝工具协议时明确失败，绝不静默降级后标为成功。

A/B/C/D/E 反馈分别为：未实现功能“暂不支持该功能”；无法理解“我没听清，请再说一遍”；歧义追问；实际网络／模型／认证／执行故障；TTS 失败保留文字和独立重播。只有真实执行完成后才允许成功播报。
