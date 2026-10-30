> 0.8.3：R06／R09 延长并补齐中央流星投射、增强矩阵薄雾；R10／R13／R15 新增 welcomeLogo / doors 开关、亮度、相对调节、查询和语音；R14 主展示刷新重置，遥控刷新及 SSE 重连保留同步。当前 22 项控车工具。实际证据与验收层级见 [WELCOME_CONTROLS.md](WELCOME_CONTROLS.md)。

> 0.8.1 新增 welcomeRain / front / enabled（set、query）及 brightness（set、adjust、query）。对应 vehicle_welcome_rain_switch、vehicle_welcome_rain_brightness；真实千问 ASR → DeepSeek tool_calls → 渲染执行 → tool_call_id 回传 → CosyVoice 播放证据：[六轮固定合成输入](validation/welcome-correction/live-speech.json)。本轮不是新增真人记录。原覆盖证据如下。

> 0.7.1 视觉更新：现有氛围灯工具覆盖扩展后的全部 25 灯面及 16 处照明，仍使用同一开关／颜色／亮度状态。六种配色通过既有命令批次执行，不新增工具或脱离统一账本的控制。以下 0.7.0 真实 API 证据保留；0.7.1 视觉与手动／Mock 回归见 [报告](FINAL_POLISH.md)。

# 实际能力 → 工具 → 参数 → 效果 → 证据

共 99 个已通过案例，其中 98 个真实 LLM 工具回合；取消为本地规则。分三个会话保存，不能当作一个连续会话。源报告包含首次歧义失败和中断信息；只将逐案例成功记录计入覆盖，修正后的追问在最后一段复测。真人与固定音频另列。

| 实际属性 | 工具 | 真实调用操作 | 真实结果证据 |
|---|---|---|---|
| ambient:cabin:brightness | vehicle_ambient_brightness | adjust / set / query | [adjust](validation/i7-i9/live-capabilities-range-40-99.json)（case 27）；[set](validation/i7-i9/live-capabilities-range-40-99.json)（case 28）；[query](validation/i7-i9/live-capabilities-range-40-99.json)（case 29） |
| ambient:cabin:color | vehicle_ambient_color | set / query | [set](validation/i7-i9/live-capabilities-range-40-99.json)（case 26）；[query](validation/i7-i9/live-capabilities-range-40-99.json)（case 30） |
| ambient:cabin:enabled | vehicle_ambient_switch | set / query | [set](validation/i7-i9/live-capabilities-range-40-99.json)（case 25）；[query](validation/i7-i9/live-capabilities-range-40-99.json)（case 31） |
| cabinLight:front:brightness | vehicle_cabin_light_brightness | set / adjust / query | [set](validation/i7-i9/live-capabilities-range-40-99.json)（case 14）；[adjust](validation/i7-i9/live-capabilities-range-40-99.json)（case 15）；[query](validation/i7-i9/live-capabilities-range-40-99.json)（case 16） |
| cabinLight:front:enabled | vehicle_cabin_light_switch | set / query | [set](validation/i7-i9/live-capabilities-range-40-99.json)（case 13）；[query](validation/i7-i9/live-capabilities-range-40-99.json)（case 17） |
| cabinLight:rear:brightness | vehicle_cabin_light_brightness | set / adjust / query | [set](validation/i7-i9/live-capabilities-range-40-99.json)（case 20）；[adjust](validation/i7-i9/live-capabilities-range-40-99.json)（case 21）；[query](validation/i7-i9/live-capabilities-range-40-99.json)（case 22） |
| cabinLight:rear:enabled | vehicle_cabin_light_switch | set / query | [set](validation/i7-i9/live-capabilities-range-40-99.json)（case 19）；[query](validation/i7-i9/live-capabilities-range-40-99.json)（case 23） |
| door:fl:openness | vehicle_doors | set / adjust / query | [set](validation/i7-i9/live-capabilities-segment-0-39.json)（case 5）；[adjust](validation/i7-i9/live-capabilities-segment-0-39.json)（case 6）；[query](validation/i7-i9/live-capabilities-segment-0-39.json)（case 7） |
| door:fr:openness | vehicle_doors | set / adjust / query | [set](validation/i7-i9/live-capabilities-segment-0-39.json)（case 13）；[adjust](validation/i7-i9/live-capabilities-segment-0-39.json)（case 14）；[query](validation/i7-i9/live-capabilities-segment-0-39.json)（case 15） |
| door:rl:openness | vehicle_doors | set / adjust / query | [set](validation/i7-i9/live-capabilities-segment-0-39.json)（case 21）；[adjust](validation/i7-i9/live-capabilities-segment-0-39.json)（case 22）；[query](validation/i7-i9/live-capabilities-segment-0-39.json)（case 23） |
| door:rr:openness | vehicle_doors | set / adjust / query | [set](validation/i7-i9/live-capabilities-segment-0-39.json)（case 29）；[adjust](validation/i7-i9/live-capabilities-segment-0-39.json)（case 30）；[query](validation/i7-i9/live-capabilities-segment-0-39.json)（case 31） |
| frunk:front:openness | vehicle_frunk | set / adjust / query | [set](validation/i7-i9/live-capabilities-segment-0-39.json)（case 37）；[adjust](validation/i7-i9/live-capabilities-segment-0-39.json)（case 38）；[query](validation/i7-i9/live-capabilities-segment-0-39.json)（case 39） |
| headlights:front:brightness | vehicle_headlight_brightness | set / adjust / query | [set](validation/i7-i9/live-capabilities-range-40-99.json)（case 2）；[adjust](validation/i7-i9/live-capabilities-range-40-99.json)（case 3）；[query](validation/i7-i9/live-capabilities-range-40-99.json)（case 4） |
| headlights:front:mode | vehicle_headlight_mode | set / query | [set](validation/i7-i9/live-capabilities-range-40-99.json)（case 1）；[query](validation/i7-i9/live-capabilities-range-40-99.json)（case 6） |
| observation:scene:night | vehicle_observation | set / query | [set](validation/i7-i9/live-capabilities-range-40-99.json)（case 48）；[query](validation/i7-i9/live-capabilities-range-40-99.json)（case 49） |
| paint:body:color | vehicle_paint | set / query | [set](validation/i7-i9/live-capabilities-range-40-99.json)（case 33）；[query](validation/i7-i9/live-capabilities-range-40-99.json)（case 34） |
| scatter:scene:enabled | vehicle_scatter_switch | set / query | [set](validation/i7-i9/live-capabilities-range-40-99.json)（case 42）；[query](validation/i7-i9/live-capabilities-range-40-99.json)（case 47） |
| scatter:scene:strength | vehicle_scatter_strength | set / adjust / query | [set](validation/i7-i9/live-capabilities-range-40-99.json)（case 44）；[adjust](validation/i7-i9/live-capabilities-range-40-99.json)（case 45）；[query](validation/i7-i9/live-capabilities-range-40-99.json)（case 46） |
| trunk:rear:openness | vehicle_trunk | set / adjust / query | [set](validation/i7-i9/live-capabilities-segment-0-39.json)（case 33）；[adjust](validation/i7-i9/live-capabilities-segment-0-39.json)（case 34）；[query](validation/i7-i9/live-capabilities-segment-0-39.json)（case 35） |
| turnSignal:vehicle:mode | vehicle_turn_signals | set / query | [set](validation/i7-i9/live-capabilities-range-40-99.json)（case 8）；[query](validation/i7-i9/live-capabilities-range-40-99.json)（case 11） |
| window:fl:openness | vehicle_windows | set / adjust / query | [set](validation/i7-i9/live-capabilities-segment-0-39.json)（case 1）；[adjust](validation/i7-i9/live-capabilities-segment-0-39.json)（case 2）；[query](validation/i7-i9/live-capabilities-segment-0-39.json)（case 3） |
| window:fr:openness | vehicle_windows | set / adjust / query | [set](validation/i7-i9/live-capabilities-segment-0-39.json)（case 9）；[adjust](validation/i7-i9/live-capabilities-segment-0-39.json)（case 10）；[query](validation/i7-i9/live-capabilities-segment-0-39.json)（case 11） |
| window:rl:openness | vehicle_windows | set / adjust / query | [set](validation/i7-i9/live-capabilities-segment-0-39.json)（case 17）；[adjust](validation/i7-i9/live-capabilities-segment-0-39.json)（case 18）；[query](validation/i7-i9/live-capabilities-segment-0-39.json)（case 19） |
| window:rr:openness | vehicle_windows | set / adjust / query | [set](validation/i7-i9/live-capabilities-segment-0-39.json)（case 25）；[adjust](validation/i7-i9/live-capabilities-segment-0-39.json)（case 26）；[query](validation/i7-i9/live-capabilities-segment-0-39.json)（case 27） |
| wiper:front:mode | vehicle_wiper_mode | set / adjust / query | [set](validation/i7-i9/live-capabilities-range-40-99.json)（case 35）；[adjust](validation/i7-i9/live-capabilities-range-40-99.json)（case 36）；[query](validation/i7-i9/live-capabilities-range-40-99.json)（case 37） |
| wiper:front:swipe | vehicle_wiper_once | trigger | [trigger](validation/i7-i9/live-capabilities-range-40-99.json)（case 40） |

工具 Schema 与单位见 [LLM_TOOLS.md](LLM_TOOLS.md)。每条机器记录保留 tool_call_id、参数、实际驱动值、完成状态和原文件索引。灯光强度另有实际 SpotLight／灯面／散射数据和双分辨率像素差验证，见 I7–I9 验收报告。

真实固定音频完整链路：[18 条语音](validation/i7-i9/live-speech.json)；[真实关键词与六组固定输入](validation/i7-i9/wake-fixed-audio.json)；[唤醒完整周期](validation/i7-i9/wake-cycle-fixed-audio.json)。这些均不标为真人。
