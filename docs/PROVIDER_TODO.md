# Provider 当前状态与待办

2026-10-26 更新：用户已选择阿里云百炼、创建并在本机保存 Key。当前真实接入已完成，不再停留在无配置框架。密钥从未打印或进入 Git。

| 能力 | 当前状态 | 后续验证 |
|---|---|---|
| ASR | 北京 qwen3-asr-flash / dashscope-asr；WAV Data URL，真实转写与三次真人输入通过 | 真实噪声、自动静音结束、设备差异 |
| TTS | cosyvoice-v3-flash / longanyang；真实中文音频及播放完成通过 | 真人扬声器回声、打断与复杂澄清 |
| Intent | 四窗规则和统一执行器已接真实 ASR；DeepSeek 未接入 | I7 再接 DeepSeek 与完整上下文 |

原 Gemini 指定已按本轮服务选择修订，保留适配选项，但未宣称 Gemini 验收通过。协议和配置见 [API_CONFIG.md](API_CONFIG.md)，实际证据见 [ALIYUN_SPEECH_VALIDATION.md](ALIYUN_SPEECH_VALIDATION.md)。

自动回归用 3003 端口的 --test-unconfigured 服务，跳过读取 .env，Mock 明确标记；真实演示 3000 使用用户本机凭据。健康接口只输出配置情况，not-verified 是启动时配置探针状态，实际通过证据以本轮报告为准。
