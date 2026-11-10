# Bright-sky false-alarm assessment

Reading copy extracted from the returned HTML; raw markup is preserved beside it. The returned text has a discontinuity after the proposed category rule, so omitted material supplies no evidence. The answer assesses the supplied code and interventions; the observation identity remains pending.

结论：立即修正决策层，而非重写评分公式。
将现有分数定位为「受光云层启发式指标」，用双模式一致性决定能否给出观赏建议。保留原始分数供诊断。
1. 今天这次应如何呈现
上海 17:00：
ECMWF：57.8，中等潜力
GFS：4.5，条件偏弱
用户结论：模式显著分歧，彩云可见性判断可信度低。
可直接复用现有档位：一方 ≥40、另一方
目前尚无法确认真实云场，也无法将用户反馈归因于 ECMWF，原始页面、位置和模型仍待核实。
3. 三种修正的判断
双模式分歧 + 原生/气压层一致性诊断：立即实施。
记录主导气压层、贡献占比、云场冲突和来源版本。原生云层用于可信度诊断。
原生云层 veto：暂不采用。
ECMWF 原生高云仍达 36.2%，不会否定此次高云信号；低云与气压层存在不同诊断来源，直接否决会引入未经验证的漏报。Open-Meteo 文档也说明 ECMWF 压力层云量来自湿度估算。
[Open Meteo]
快速散射/背景对比度代理：作为独立候选验证。
它更贴近观赏目标，但缺乏云光学厚度和相态等约束，直接替换可能制造另一种系统误差。现有高成本 solver 同样应等待独立评估。
4. 用保留数据验证
冻结上述分歧规则，以既有 08:00/16:00 缓存的双模式预测匹配公共观测。以有时间、位置及视角依据的照片或固定天空相机确认「可见彩云」；卫星资料辅助判断云是否存在。108 个来源性零标签仍按弱标签处理。
在独立预测日历上比较原版与新决策层的
误报率、漏报率、有效推荐覆盖率
，尤其检查暂停推荐是否真正减少无彩云出行，而非仅靠弃权改善表面准确率。164 次 ERA5 回顾结果可以保留为历史基线，但其证据强度无法直接迁移到实时双模式决策。
现有定时采集范围维持不变；普通请求只读本地缓存。
核心判断：先让产品准确表达它知道什么、分歧在哪里，再让新物理模型通过独立观测证明能预测可见色彩。
参考：
ECMWF API
·
GFS API
·
WMO 云彩颜色
·
NOAA 云彩颜色
