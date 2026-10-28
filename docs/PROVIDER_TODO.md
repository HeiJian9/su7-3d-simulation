> 13:39 更新：前备箱、车漆、后排顶灯和一次刮刷真人补验已保存并核对，见本轮报告与 human-evidence.json。下面相应“待补”描述为较早记录，以此修订为准。剩余为录像原文件偏移归档与更广声学样本的统计限制。

# Provider 当前状态与待办 · 0.7.0

2026-10-28：当前北京百炼 ASR `qwen3-asr-flash`、DeepSeek `deepseek-v4.1-flash-1017` / `openai-chat-tools`、TTS `cosyvoice-v3-flash` / `longanyang`。用户授权复用已有阿里云 Key，根 `.env` 已配置；没有缺失凭据，不重新索取。

真实工具调用覆盖、18 条 ASR→DeepSeek→渲染→TTS 固定音源闭环、本地关键词固定正负样本与真实周期均已记录。真人点击入口、真实关键词→后备箱→播报→恢复监听，以及前备箱／车漆／后排顶灯／一次刮刷四工具补验均有独立诊断证据。固定音源与真人分开记录。详见 [本轮报告](I7_I9_VALIDATION.md) 和 [参数](LLM_TOOLS.md)。

本机关键词引擎为 sherpa-onnx 2.0.1 中文 INT8 模型，无额外云服务 Key。第一次实际体验的连接断开已记录，随后补充传输背压、幅度约束、断开原因与可见性状态修正。30 秒单轮和 15 秒开口准备已经前后端统一。

以下 0.6.0 状态表为历史；当前 DeepSeek 已接入，不再是预留。

当前 0.6.0，2026-10-27。阿里云 Key 仅存本机根 `.env`，不进入网页、报告或 Git。已安全确认 ASR／TTS 配置存在，未打印凭据。

| 能力 | 当前证据 | 待办 |
|---|---|---|
| ASR | qwen3-asr-flash / dashscope-asr；I3 真人证据保留，I4–I6 新能力真实音频输入转写通过 | 新部件真人麦克风复验待补；合成音源不称为真人 |
| TTS | cosyvoice-v3-flash / longanyang；真实 API 音频播放，动作确认后反馈，失败／重播／停播保护 | 新部件真人听感及收音复验另列 |
| Intent | 门窗、尾箱、灯光、车漆、氛围灯、雨刷规则共用 VehicleLedger | DeepSeek 完整兜底在 I7，未调用；INTENT 配置保留 |

Gemini 原指定已按用户选择修订；适配保留，未声称 Gemini 通过。见 [API_CONFIG.md](API_CONFIG.md)。本机没有缺失的 ASR／TTS Key、模型或音色配置，不要求重新提供 Key。

健康接口的 `not-verified` 是启动配置标记，实际验证以 [当前报告](I4_I6_VALIDATION.md) 和诊断为准。3003 自动回归跳过 `.env`，故障用例明确属于 Mock／注入；3000 演示及 `speech:verify-i4-i6` 显式调用真实接口。后者使用合成语音输入，有明确音源记录，不替代真人验收。
