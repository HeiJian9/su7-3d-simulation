# Provider 当前状态与待办

当前 0.6.0，2026-10-27。阿里云 Key 仅存本机根 `.env`，不进入网页、报告或 Git。已安全确认 ASR／TTS 配置存在，未打印凭据。

| 能力 | 当前证据 | 待办 |
|---|---|---|
| ASR | qwen3-asr-flash / dashscope-asr；I3 真人证据保留，I4–I6 新能力真实音频输入转写通过 | 新部件真人麦克风复验待补；合成音源不称为真人 |
| TTS | cosyvoice-v3-flash / longanyang；真实 API 音频播放，动作确认后反馈，失败／重播／停播保护 | 新部件真人听感及收音复验另列 |
| Intent | 门窗、尾箱、灯光、车漆、氛围灯、雨刷规则共用 VehicleLedger | DeepSeek 完整兜底在 I7，未调用；INTENT 配置保留 |

Gemini 原指定已按用户选择修订；适配保留，未声称 Gemini 通过。见 [API_CONFIG.md](API_CONFIG.md)。本机没有缺失的 ASR／TTS Key、模型或音色配置，不要求重新提供 Key。

健康接口的 `not-verified` 是启动配置标记，实际验证以 [当前报告](I4_I6_VALIDATION.md) 和诊断为准。3003 自动回归跳过 `.env`，故障用例明确属于 Mock／注入；3000 演示及 `speech:verify-i4-i6` 显式调用真实接口。后者使用合成语音输入，有明确音源记录，不替代真人验收。
