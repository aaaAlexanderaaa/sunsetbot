# Independent model-priority assessment

Completed after the full 20-event ERA5/EAC4 intervention. The exact response and self-contained question are retained alongside this reading copy. This is an independent assessment; source claims are checked against primary documentation.

结论：下一版优先修复“垂直云层如何转化为可见、受光的云底”这一表示问题。 暂时冻结散射系数、AOD 参数和最终评分映射。

1. 为什么优先解决它

源码存在两个可直接验证的结构性信息损失：

cloudDecks() 使用全柱累计最大云量。假设低云覆盖 60%、高云覆盖 40%，中间晴空，高云将完全失去成为受光目标的资格。

cloudTransmission() 同一水平柱的所有高度共享一个随机变量 U，相当于强制垂直最大重叠。现有 cloudOverlapSensitivity 主要改变水平相关性，未测试分离云层的垂直重叠。

ECMWF 对连续云层和分离云层采用不同的重叠假设。 https://journals.ametsoc.org/view/journals/atsc/64/6/jas3925.1.xml?utm_source=chatgpt.com [American Meteorological Society Journals]  https://confluence.ecmwf.int/spaces/FUG/pages/673550490/Section%2B2A.1.5.2%2BClouds?utm_source=chatgpt.com [ECMWF Confluence Wiki]

另有压力层抽样损失：6/3 晚霞 ERA5 原生高云覆盖 80.7%，中心柱最高压力层云量仅 12.1%，低于硬编码 15% 阈值。原生高云量来自模型层的垂直整合，因而这个差异值得沿完整扇面追踪。 https://codes.ecmwf.int/grib/param-db/?id=188&utm_source=chatgpt.com [codes.ecmwf.int]  https://confluence.ecmwf.int/spaces/FUG/pages/673550490/Section%2B2A.1.5.2%2BClouds?utm_source=chatgpt.com [ECMWF Confluence Wiki]

2. 三类因素的归因

因素

现有证据支持的判断

数据表示与云场

最值得优先检验。仅替换云量使 AUC 从 .667 降至 .569；仅替换高度基本不变

光学模型

仍有重要嫌疑。GFS 简单基线 .922 明显领先完整模型 .667，但二者消费的云量表示不同，需同输入对照

观测标签

泛化结论的主要限制。只有 3 个正例、涉及 2 天，51 个正负配对高度相关

AOD 替换对 GFS 排序几乎无影响，但 ERA5+EAC4 从 .569 升至 .637，因此仍保留气溶胶作为受控变量。

6/10 朝霞尤其关键：ERA5 原生高云 82.7%，记录却为负例。这提醒我们，恢复高云覆盖信息只是必要的上游修复，最终仍要验证受光与观赏质量。

3. 可实施的下一版

建议采用一个独立的云柱表示模块：增加可用压力层密度，识别连续云段及分离云段，分别计算垂直重叠；将云层是否存在、是否可见、是否受光分开处理。ERA5 原生低中高云量作为一致性检查，云水、冰含量先保留诊断用途。

Open-Meteo GFS 已提供更密的压力层及原生低中高云量，生产路径具备实现基础。 https://open-meteo.com/en/docs/gfs-api?utm_source=chatgpt.com [open-meteo.com] ERA5 全模型层可用于少量案例交叉核验。

4. 下一轮判别实验

固定 2023-06-11 至 2023-08-31，共 82 天、164 场作为新日期集合。先冻结候选版本，再读取标签评分。

同源 2×2 消融：11 层/密集压力层 × 旧云底算法/新云底算法；另做 15% 阈值单因素消融。全部固定光学参数、AOD、网格与时间窗口。

机制检查：逐扇面衡量原生高云覆盖与压力层重建差异，重点检查“原生高云多、压力层检出少”的正负案例，观察修复是否同时增加误报。

独立验收：通过原站分日期、分页获取记录，结合现场照片与卫星云图核验；缺乏观测证据的负例标为待定。主指标为配对 ΔAUC，按日期整体 bootstrap；辅以固定提醒预算下的精确率。建议至少积累 20 个可信正例。

判别规则很直接：增加层数有效，指向抽样损失；修复垂直重叠有效，指向云底语义；云层一致性改善而排名仍差，则转向散射、光学厚度与天空面积权重。

最后，把 ERA5 回放的结构验证与固定起报、固定提前量的 GFS 预报验证分别报告。Open-Meteo Historical Forecast 使用短预报拼接，适合前者，尚需额外控制提前量才能评价真实业务预报能力。 https://open-meteo.com/en/docs/historical-forecast-api?utm_source=chatgpt.com [open-meteo.com]

参考： https://confluence.ecmwf.int/spaces/FUG/pages/673550490/Section%2B2A.1.5.2%2BClouds?utm_source=chatgpt.com ECMWF 云层重叠 ·  https://confluence.ecmwf.int/pages/viewpage.action?pageId=222489098&utm_source=chatgpt.com ERA5 模型层获取 ·  https://sunsetbot.top/record/custom/?utm_source=chatgpt.com 原站历史记录检索
