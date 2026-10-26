# 模型服务边界

仓库默认不提供模型账户、密钥、推理额度或线上服务使用权。使用者须自行取得服务资格，并遵守所用服务的条款、费用和数据处理要求。密钥只能保存在服务端。

当前真实适配器为 `server/ecnu.ts` 和 `server/ecnu-images.ts`，通过 ECNU 的文本流接口与生图接口工作。文本配置支持代码中列明的 `ecnu-max` / `ecnu-plus`，生图模型、请求格式与可接受图片来源也与 ECNU 绑定。修改一个基础 URL 不能保证兼容其他供应商。

启用真实服务时，关闭 `STUDIO_SYNTHETIC`，设置自己的 `ECNU_API_KEY` 和 `STUDIO_ENABLE_AI=1`。可选项如下：

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `ECNU_TEXT_MODEL` | `ecnu-max` | 文本模型，当前仅支持 `ecnu-max`、`ecnu-plus` |
| `ECNU_TEXT_REASONING` | `off` | 关闭思考；其余可选值以适配器校验为准 |
| `ECNU_TEXT_TIMEOUT_MS` | `240000` | 单次文本调用超时，毫秒 |

`STUDIO_ENABLE_AI=0` 时真实适配器不会发起生成请求；合成模式使用 `SyntheticProvider`，两种模式均不需要把密钥暴露给浏览器。自动测试通过本地固定资料或模拟响应完成，不应加入真实模型调用。

接入其他服务时，实现 `server/generation.ts` 中的 `GenerationProvider`，保留结构校验、复核、错误边界和中止行为，再在服务入口选择该适配器。当前任务队列并发为 1；暂停会中止本地等待，但不保证上游已经停止计算或免计费。

生成资料和预置案例均需独立学科审查。来源标记和机器初检不能代替专家审核，也不构成教学效果已经获得验证的证据。
