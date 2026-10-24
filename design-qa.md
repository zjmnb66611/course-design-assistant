# 活动智策 v3.1 界面与文案验收

- final result: passed
- 范围：保留现有液态玻璃界面和首屏循环动画；优化中文内容、清理链接下划线与提示小框，增加自定义活动类型及助手操作。
- source visual truth：用户截图 `C:/Users/ASUS/Pictures/Screenshots/屏幕截图 2026-10-22 072157.png` 指定活动类型区域；提交222da20的完整基线 `../../outputs/activity-content/preview-home-before.png`。
- implementation screenshot：`../../outputs/activity-content/preview-home.png`、`preview-custom-type.png`、`preview-assistant.png`、`preview-assistant-dark.png`、`preview-mobile-custom.png`、`preview-mobile-assistant.png`。
- viewport：桌面1440×1000、手机390×844 CSS像素，deviceScaleFactor 1；完整首屏对照均为1440×1000像素，无密度转换。
- full-view comparison evidence：`../../outputs/activity-content/copy-ui-comparison.png`，左右相同视口、空活动、浅色、减少动态状态。
- focused evidence：自定义类型表单、助手变更预览及手机截图分别检查。用户要求的额外自定义输入属于预期布局增加，未改导航和页面框架。

## 视觉与交互

- 原字体、页面栅格、玻璃材质、配色、侧栏、工具栏及主题保留；四个原始样式/特效/加载文件没有内容变更。
- 侧栏链接、下载链接取消默认下划线；“打开”和方案数量提示取消装饰边框；表单边界和键盘焦点仍可辨认。
- 自定义名称只在选择“自定义”时出现，80字限制，切回预设再返回可保留名称；浅色、深色和手机布局均检查。
- 助手展示当前活动或尚未应用的会话信息；建议显示字段、预算、实支、任务及核对状态变更，用户确认后才写入。
- 首屏玻璃环三个循环动画仍在；减少动态、工具面板和手机隐藏状态保留原逻辑。所有样例均为合成数据，无真实用户数据。

## 内容和功能核验

- humanize按用户选择的balanced-fast流程执行：G5初审34项，G6候选改写，G5复审和F5事实核对均通过。报告不提供未经测量的AI概率。
- 49项Node核心/MCP处理/离线构建检查通过；整数分核算公式保留，抽出内部calculateBudget统一校验当前活动和对比方案。
- 源码及离线各55项业务检查、60组布局；助手扩展32项浏览器检查通过；无页面或控制台异常。
- 30项JSON Schema契约及实际MCP声明验证通过，覆盖旧项目、预设和自定义对比方案、非法类型与过长名称。只调用消息处理函数，未启动MCP服务。
- 独立解包CLI与网页核心哈希一致，Skill格式检查通过。TeleAgent平台账号接入仍未实测；PostHog连接需重新认证，未使用其访问数据。

## 复核记录

- 首轮复核发现检查意图带新字段时进入生成流程、默认120分钟说明不足、空明细缺口表达及嵌套Schema遗漏；均已修复后复核。
- 补充明确核对记录失效、任务和实支替换风险；没有隐藏金额、资金状态或能力边界来减少文字。
- 无待修P0/P1/P2界面问题。截图的版本小字随后由v3.0同步为v3.1，未调整其他布局。
- 此文件记录本机候选验收，发布状态以用户接受后的GitHub Pages部署及线上验收为准。没有启动或停止项目服务。

追加复查：文件竞争、过期建议、不完整数字、隐藏超限方案、中文数字歧义及撤销来源已复现并修复；细节见security-review.md。G5/F5报告记录此前文案审阅快照，当前代码哈希及测试证据以本轮交付清单为准。
