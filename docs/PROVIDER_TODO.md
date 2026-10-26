# Provider 当前状态与待办

当前 0.3.2。用户选择的阿里云北京地域 Key 仅存本机根 .env，未打印、未写入报告或 Git。I3 当前四窗范围已通过，证据边界见 [I3 最终报告](I3_FINAL_VALIDATION.md)。

| 能力 | 当前状态 | 后续边界 |
|---|---|---|
| ASR | qwen3-asr-flash / dashscope-asr；真实转写、真人自动静音结束和基础指令通过 | 新设备／噪声环境按实际反馈回归 |
| TTS | cosyvoice-v3-flash / longanyang；真实中文播报、真人停播与新录音先后顺序通过 | 不承诺任意房间声学表现；失败重播已故障注入验证 |
| Intent | 四窗规则、澄清补全、取消和统一执行器通过 | I7 接 DeepSeek，规则未完整命中才走结构化兜底；当前未调用 |

原 Gemini 指定已按服务选择修订，保留原适配，但未声称 Gemini 通过。配置及协议见 [API_CONFIG.md](API_CONFIG.md)。自动回归使用 3003 端口 --test-unconfigured 服务，跳过读取 .env；真实演示在 3000。健康接口只返回配置情况，not-verified 是启动配置标记，真实验收以报告和诊断为准。
