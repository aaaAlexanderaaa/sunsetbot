**结论：认可有限经验收敛方案，暂缓数值验收签字。** 对六个固定真实介质，24-job 独立控制足以建立有边界的 *estimated quadrature convergence* 证据，无须先实现完整的 verified interval solver。当前全精度结果尚未完成，因此仍需保留失败状态。

### 对现有代码的判断

核心设计合理：源积分的 \(u\) 变换、有限 Markov 条件传输、几何断点、正值 Boole 求积，以及嵌套 RGB 误差传递形成了可信的数值基础。局部深度限制采用正值包络并纳入全局预算，也有合理依据。

**最值得修正的三处：**

1. **增加源积分的独立剖分控制。** 当前 `partition` 仅改变角度分区。建议同时将 `maximumEmissionOpticalDepth` 从 0.5 改为约 0.35。`shadowCrossings` 切分的是观察路径上的地球阴影边界；随源位置变化的太阳路径地形遮挡及 `solar.bounded` 状态仍可能在源积分内部跳变。针对这些事件增加定向测试，发现实际失配再补断点。
2. **补齐可复现性与失败证据。** 将六介质实际输入哈希加入 acceptance signature；保留预算异常的 `zeroIntervals`（当前捕获后丢弃），并将其他作业异常记录为失败。顶层诊断的最大误差目前仍只统计红通道，建议报告全部 RGB 中的最差归一化误差及对应通道。
3. **用六个真实介质复验几何包络。** 沿用已有解析 view-only source 测试方法，重点覆盖阴影出口、列边界和候选单元剔除边界。这样能直接检验支撑 exact-zero guard 与 bounded limits 的关键假设。

### 最终放行规则

保留预声明的全部门槛：24/24 作业完成并达到 `estimated_converged`；所有 \(g\)、raw/covered RGB 估计误差及独立控制差异满足 2%，gas-step 差异满足 0.1%；所有失败完整归档。

历史排序再增加一道**数值可分辨性门槛**：对每个事件，取四组控制结果各自的“积分值 ± 总误差估计”，形成经验数值区间。只有两事件区间分离才报告确定次序；重叠则标为 numerical tie。它是经验敏感性区间，并非严格置信区间。11/37 层差异属于介质表征敏感性，应单独报告。

### 六介质控制失败时

优先按失败类型定位。如果是分区不一致，先检查源积分遮挡/coverage 跳变；如果是 ray budget，下一步采用**全局误差优先队列**，把计算集中到对最终 RGB 误差贡献最大的区间。这是 QUADPACK/QAG 的成熟策略。[GSL 2.8 documentation](https://www.gnu.org/software/gsl/doc/html/integration.html?utm_source=chatgpt.com)

如果仍被太阳云不透明区域的松弛上界卡住，再针对失败区间构造太阳路径衰减上界。恢复任意微小正值的全域零保护会重现已经观察到的计算爆炸；继续保留明确的正背景自适应估计范围更符合研究目标。

以已完成帧的耗时计算，24 作业约需 **0.5–2.5 CPU 小时**，属于合理离线预算（超预算失败另计）。

最终允许的声明应限定为：**六个冻结介质在指定参数、独立剖分和误差门槛下表现出经验数值收敛；排序仅对数值可分辨的事件成立。** 新日期标签、辐射准确性与实际预测能力继续独立验证。

参考：urlGSL 自适应积分与全局误差控制https://www.gnu.org/software/gsl/doc/html/integration.html?utm_source=chatgpt.com；urlCubature 对窄峰漏检及经验收敛的讨论https://bnaras.github.io/cubature/reference/hcubature.html?utm_source=chatgpt.com。
