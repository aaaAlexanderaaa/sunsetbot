# Conditional probability review

**结论：核心概率积分与给定随机模型一致。** 未发现条件概率归一化、水平 Markov 递推或云底面积计算中的数学错误。但有两处实现值得优先排查，其中一处会直接改变透射率。

递推实际计算的是：

\[
T=\mathbb E\left[e^{-\sum\tau_i\mathbf1(U_{c(i)}<f_i)}\mid U_t\in[a,b)\right]
\]

全局阈值分箱使这一离散概率积分精确。两条光路的同格光学厚度相加正确；云底面积 \(f-\max(f_{\text{below}})\) 也正确。500 km 示例给出 \(T\approx0.4999773\)，符合预期。

## 关键发现

1\. **同格云量加权平均存在数学风险（高优先级）。** `weightedFraction` 只有在相同 `(column,level)` 的所有 `fraction` 恒定时才等价。反例：同格两段分别 \(f=0.2,0.8\)，各 \(\tau=1\)，真实透射率为 **0.4478**，合并后为 **0.5677**，高估约27%。应检查实际采样是否产生不同 fraction；若可能出现，保留各段阈值，若理论上禁止则增加一致性断言。

2\. **观察光路固定截去末端1 km（明确的积分域差异）。** `distance - 1` 会遗漏这段内的云、气溶胶和分子消光，使透射率偏高。若意在避免目标云自遮挡，应按目标云面精确截断相关格元，而非整段截短。

3\. **输入契约与边界。** 核实 `coefficient` 为未乘 \(f\) 的云内消光系数，单位与 `ds` 匹配；`x` 使用 km；\(f\in[0,1]\)。此外，`cloudDecks` 返回值需要调用方补齐 `index/x`；`bounded=false` 时应避免将截断积分当作完整结果。

4\. **指数层另有非线性偏差。** 当前先求平均透射率再取平方根。若希望得到面积平均的非线性亮度，\(\sqrt{\mathbb E[T]}\geq\mathbb E[\sqrt T]\)，会系统抬高混合透射场景的得分；`clamp` 还可能压缩情景分差。这影响指数解释，云透射率本身仍按上述公式计算。

**建议下一轮回归优先覆盖：同键不同云量、目标前1 km遮挡、输入单位及不完整光路。**

物理边界方面，ECMWF 辐射方案还使用云水、云冰和粒径信息确定云光学性质；现有指数保留经验光学厚度假设是合理的实验定位。[ECMWF Confluence Wiki](https://confluence.ecmwf.int/spaces/FUG/pages/673550490/Section%2B2A.1.5.2%2BClouds?utm_source=chatgpt.com)

参考：urlECMWF 云场说明https://confluence.ecmwf.int/spaces/FUG/pages/673550490/Section%2B2A.1.5.2%2BClouds · urlOpenIFS 云辐射实现https://github.com/ecmwf-ifs/openifs/blob/main/ifs-source/radiation/module/radiation_cloud.F90

**最终判断：概率模型修复方向正确；当前最值得确认的是云量合并是否破坏阈值事件，以及光路末端截断带来的系统性高透射。**
