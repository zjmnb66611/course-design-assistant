# 工具契约

所有调用都使用 `{"tool":"工具名","arguments":{...}}`。工具白名单固定，不允许任意代码、命令、网络地址或写入路径。

| 工具 | arguments | 结果 |
|---|---|---|
| parse_brief | text：不超过20000字的文本 | patch、来源行 evidence、warnings、raw |
| draft_plan | project：活动项目 | agenda、建议 tasks、risks、missing、规则引用 |
| suggest_budget | project；lean：可选布尔值 | items、占位分配假设 |
| analyze_budget | project | 明细、小计、预备金、计划总额、预算结余、资金缺口、未核销数量，金额单位为分 |
| review_activity | project | 缺项、超支、资金和人工核对记录 |
| knowledge_lookup | query：最多300字的规则关键词，可为空 | 匹配知识条目 |
| build_report | project | markdown：完整策划与预算报告 |

## 项目结构

`format` 必须为 `college-activity-assistant`，`version` 为1。项目样例见 `examples/project.json`。必须包含 name、raw、basic、reservePercent、items、funding、tasks、approvals、scenarios；未知输出字段不采信。

- basic：title、kind、people、budget、date、time、duration、venue、goal、organizer，均为字符串。日期为 YYYY-MM-DD、时刻为 HH:mm，未知条件留空。人数为1到100000的整数；时长15到1440分钟；金额最多两位小数、数量最多三位小数。
- items：最多200项。id 为字母/数字/下划线/连字符，最长80；label、category、quantity、unit、unitPrice、actual、quote、source、note。actual 空白表示未核销；quote 仅 estimate/quoted，quoted 表示用户标记已询价。
- funding：最多20项。id、name、amount、status（pending/confirmed）、source。确认状态来自用户记录，不等于系统验证到账。
- tasks：最多100项。id、title、owner、offset、status（todo/doing/done）、note。offset 是相对活动日期的日历天数，-180到180的整数。
- approvals：venue、finance、safety、team，布尔值；表示人工核对记录。
- scenarios：最多4个输入快照，只保存 name、basic、items、funding、reservePercent。

金额非负，每项和总额上限为1000000000元。单价和数量乘积按半分进位，预备金按明细小计乘百分比四舍五入；金额返回整数分。核算工具不会自动删除缺口或调整金额。

## 运行示例

```text
node scripts/run-tool.cjs --input examples/request.json
```

`--input` 只读取明确指定的 JSON 文件，最大1.5MB。也可使用标准输入。每次只处理一条请求，错误以退出码1与结构化错误返回。工具没有 HTTP 端点，静态 GitHub Pages 不承载 Node 运行时。
