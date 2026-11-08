**结论：两个下界的数学构造成立，逐源单元包络值得集成。** 在所声明的正仰角、径向观测者、非负消光和固定截面云场下，没有发现几何不等式的方向错误。主要风险在于**全局上界的组合、数值积分的一致性，以及集成时的数据完整性**。

## 1\. 数学正确性

`clearDepthLowerBound` 的核心推导成立：

- 固定距离时，height 随 μ 增大；固定 μ 时，height 随距离增大。因此 `height(highMu,end)` 确实是整块上界。
- 在两个指定观看方向上，截面 x 的极值由 `highMu,start` 和 `lowMu,end` 覆盖。
- 气体密度随高度非增，AOD 在相邻原始列间线性变化。因此端点及全部 AOD 插值节点足以取得矩形内的密度下界。

提出的 \(s_c=\max(s_0,s_{\rm plane},s_{\rm height})\) 同样成立：近侧截面交点在 μLow 最早到达，底部球面在 μHigh 最早到达。各项都是必要到达距离的下界，取最大值仍然保守。

对每个源单元，云自身的视线散射积分满足

\[
\int k_c(s)e^{-\int_{\mathrm{entry}}^s k_c(t)\,dt}\,ds\leq1.
\]

因此推荐的每通道角区间上界是：

\[
B_{g,\lambda}=(b-a)P_{g,\max}E_{0,\lambda}
\min\left(1,\sum_c f_c Q_c e^{-\tau^-_{c,\lambda}}\right),
\]

其中 \(Q_c=\mathbb E[T_{\rm common}(s_c)\mid U_c<f_c]\)。

太阳透射率和其余视线透射率均至多为 1，故该式覆盖完整、未经 tail pruning 的云辐射。

## 2\. 必须修正的地方

1\. **示例中的全局乘法需要额外前提。** `0.07410 × 7.99005e-13 = 5.92e-14` 只有在该气体透射上界适用于所有候选源单元时，才构成整体上界。对所给 x=100 km、f=0.03435 的单元，独立上界是 **2.745e-14**（乘相函数前）。其他单元需要分别计算并求和。

2\. **必须传入全部 AOD 插值节点。** 新 helper 接受外部 `columnPositions`，但旧 factory 仅持有正云量的 `cells`。如果从这些 cells 推导节点，会遗漏晴空列处的 AOD 低谷，导致气体深度下界偏高。应从 `sectionMedium` 的原始完整列提供节点，并校验 observerHeight 与实际 observer 一致。

3\. **解析气体积分与实际数值积分尚缺严格桥接。** 新 helper 下界约束的是连续气体光深；`directionalRay` 使用分段 Simpson 近似。180 条 0.1 km 测试射线以及浮点余量支持实践可靠性，但尚未给出生产 4 km 数值光深相对于该下界的严格保证。若要称为数值证书，需要显式包络 Simpson 误差及浮点舍入，或采用向外舍入的区间计算。参见 urlBoost 官方区间舍入说明https://www.boost.org/doc/libs/develop/libs/numeric/interval/doc/rounding.htm。[boost.org](https://www.boost.org/doc/libs/develop/libs/numeric/interval/doc/rounding.htm?utm_source=chatgpt.com)

4\. **集成时应移除旧的 `distance <= 0 → return 1` 快速返回。** 即使太阳阴影下界为零，单元几何距离仍可产生有效气体衰减。另需正确处理 \(s_c=0\)，因为 `medium.trace` 拒绝零长度。

## 3\. 对实际求解器的判断

`adaptiveSimpson` 的 Richardson 修正等价于正权 Boole 求积，因此在逐点辐射上界成立时，`onLimitError` 用完整包络吸收 RGB 的 subordinate source/tail uncertainty，这个思路成立。

给定单元的 680 nm 上界约 \(2.745\times10^{-14}\)，再乘该角区间的最大 HG 相函数约 2.055 及 Δμ≈0.003583，得到约 **\(2.02\times10^{-16}\)** 的单元角积分上界（每单位方位角）。这表明新方法对所述零样本案例具有很大的收敛余量。

**最终判断：可以按逐单元方案接入研究求解器。** 验收重点应是全部候选单元求和、生产气体步长一致性、独立未剪枝源积分，以及原先超预算案例的端到端复测。完成这些后，可支持局部零区间的保守误差界；全域收敛声明仍保持现有的 `estimated_converged` 口径。
