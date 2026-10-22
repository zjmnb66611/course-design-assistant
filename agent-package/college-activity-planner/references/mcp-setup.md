# 可选 MCP 接入

如果目标客户端支持 MCP stdio，可将命令设置为 `node`，参数设置为解压目录内 `scripts/mcp-stdio.cjs` 的绝对路径。该工具进程不监听端口，不调用网络，不写文件；只在客户端启动连接后读取请求并返回计算结果。

通用客户端配置示例（不是 TeleAgent 官方导入格式）：

```json
{
  "mcpServers": {
    "college-activity-planner": {
      "command": "node",
      "args": ["<解压目录>/college-activity-planner/scripts/mcp-stdio.cjs"]
    }
  }
}
```

本适配器实现 initialize、initialized 通知、ping、tools/list 和 tools/call，公开7个只读工具，支持常见协议版本协商。消息处理函数已做本机单元测试；尚未在 TeleAgent 实际账号完成连接或全客户端兼容测试。未在本轮启动常驻工具进程或端口服务。

实际接入建议：在用户自己的 TeleAgent 客户端中配置本机工具，检查能列出7个工具；运行示例预算应返回 totalCents=264000（2640.00元）；再导入 SKILL.md 和知识库，验证语言理解、追问、工具调用、输出数字一致性与权限提示。平台账号、额度、技能权限及当前客户端配置界面由平台提供。

官方参考：

- [TeleAgent 产品说明：技能导入与 MCP 扩展](https://www.teleai.com.cn/product/teleagent)
- [MCP stdio 传输](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- [MCP 工具](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)
- [MCP 初始化生命周期](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle)
