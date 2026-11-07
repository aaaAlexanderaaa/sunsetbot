# Independent real-cloud numerical convergence assessment

Completed 2026-11-08 in Asia/Singapore; the server reports 532 seconds of thinking. The self-contained question provides exact solver code and six fixed-medium refinement comparisons. The response preserves finite-coverage qualifications and recommends support-aware integration with a global error ledger.

## 1\. 诊断：存在两类主要的数值漏采样

**你的主诊断成立，但修复需要同时处理源项边界层和天空角域的支撑集。**

从源码可以直接确认：

- **角域存在精确镜像对称性。** 对于固定太阳侧或背太阳侧，`φ=+δ` 与 `φ=−δ` 的介质、太阳路径、条件透射率及 HG 相函数相同。因此当前 28 个角节点实际上只有 **14 个独立方向**，每侧每个高度区间只有一个独立方位采样位置（5°）。
- **源项积分的步长准则遗漏入射光尺度。** `κ_view Δs≤0.5` 控制观察路径上的衰减，却未控制 `T_solar(s)` 的变化。太阳掠射厚云时，极薄的受光边界层可以落在两个 Gauss 节点之间。
- **粗、密压力层属于两套不同的离散云场。** 11 层与 37 层之间的输出差异包含输入表示差异，应分别对每套固定介质证明积分收敛。

当前数据还显示：在六个固定介质案例中，角度细化使红光积分增加约 1.24–4.42 倍，源项细化增加约 1.11–2.04 倍。两者都需要修复；角域漏采样尤其严重。

另外，所谓 source refinement 同时改变了 `gasStepKm`，所以现有实验尚未单独量化气体积分误差。

还有两个应立即修复的漏采样点：`litCells` 每段只检查三个位置，可能漏掉几何上很薄的受光区域；`sourceTailAbsoluteTolerance=1e-9` 是单射线、单段的截断尺度，最终必须用累计的 `omittedTailIntegralUpperBound` 对照积分的全局误差预算。

## 2\. 源项：精确处理已知衰减，自适应处理太阳照明

推荐在每个 `trace` 段内利用条件云模型的一个精确性质：

给定源点存在云 `U_source<f`，当前段从起点到源点的视线云透射率必然包含因子 \(e^{-\kappa t}\)。

因此可作变量变换：

\[
u=1-e^{-\kappa t},\qquad
t=-\frac{\log(1-u)}{\kappa}
\]

原本的 \(f\kappa e^{-\kappa t}dt\) 变成 \(f\,du\)。这精确消除了当前段的视线云衰减刚性，同时完整保留 `cloudTransmission` 中太阳路径与视线路径共享 U 的条件期望。

**在 u 空间采用带段内单侧端点采样的自适应 Simpson。** 初始采样端点、中点、四分点，通过粗细 Simpson 差估计积分误差，缓存已计算节点。额外监控太阳有效透射率的对数变化，遇到显著变化时强制细分。

关键是先沿用现有 `trace` 分段，并增加已知的太阳可见性事件：地球阴影、太阳路径地形遮挡状态变化，以及可定位的太阳射线掠过云层边界事件。Simpson 能识别端点边界层，但孤立于段内部的极窄受光区域仍需要几何定位或主动探测。

`gasStepKm` 应独立收敛测试；先固定气体精度，再验证源项。

## 3\. 角域：支持集驱动的嵌套自适应积分

你的球面投影公式正确，适合构建角域断点。实现时补充三个约束：

**云支持的水平边界**使用最近列的中点边界，并裁剪到 `|x|≤150km`；垂直边界使用实际 `fraction>0` 的连通压力带，考虑地形与云层上下限。角域投影还必须裁剪 `s≤350km`、天顶高度和地球阴影。对于 `γ=0`，高于观察者的点投向天顶；与观察者重合的点需单独处理退化情形。

推荐积分顺序是：

\[
I_{g,\lambda}
=2\sum_{\text{toward,opposite}}
\int_0^{10^\circ}\!\!d\delta
\int_{\mu_{\min}}^{\mu_{\max}}
P_g(\delta,\mu)Q_\lambda(\delta,\mu)\,d\mu
\]

这里 \(Q_\lambda\) 是已收敛的单射线源积分，\(\mu=\sin e\)，角度积分以弧度计算。因对称性只需计算每侧 0–10°，然后乘二。

固定 δ 时，将云支持连通带的投影角点转为 μ 断点，合并重叠支持区间，仅对有效区间运行自适应积分。再对 δ 做外层自适应积分。内部 `f` 和 κ 的变化交给数值误差控制，避免为全部 37 层生成过量角域分块。

**关键防漏规则：** 对几何上可能有受光云的角块，即使当前辐亮度采样全为零，也应继续依据几何支持和保守贡献上界判定。只有几何空集或贡献上界足够小时，才能直接丢弃；否则到达计算上限就标记未收敛。直接太阳阴影与地形遮挡形成的受光轮廓也应参与分块。

这与 QUADPACK 的已知断点自适应积分思路一致。[quadpack](https://jacobwilliams.github.io/quadpack/proc/dqagp.html?utm_source=chatgpt.com) 通用自适应 cubature 文档也明确指出：支撑宽度小于采样间距时，误差估计可能出现假收敛。[hcubature • cubature](https://bnaras.github.io/cubature/reference/hcubature.html?utm_source=chatgpt.com)

## 4\. 数值验收与计算预算

对每个红光角积分定义：

\[
\epsilon(I)=\max(10^{-10},\,0.02|I|)
\]

建议用全局误差账本控制，而非单独的积分层级容差：

\[
E_{\rm total}=
E_{\rm angle}+E_{\rm source}+E_{\rm gas}+B_{\rm tail}
\leq\epsilon(I)
\]

第一版可将误差预算的 60% 给角域、25% 给源项、5% 给气体、5% 给截断，保留 5% 裕量。各项须按实际角权重累计；不同 HG 场景共用射线采样，但逐场景检查误差。

初始安全上限可设为源项递归深度 18、μ 深度 12、δ 深度 10，角射线计算预算先取 512 次。上限仅用于限制运行成本：**耗尽预算时输出 `not_converged`，同时记录剩余误差，严禁把停止当作收敛。**

诊断至少保存：每层积分估计误差、最大递归深度、达到上限的区间及其贡献、太阳可见性切换次数、真实太阳射线 trace 次数、累计截断上界、未覆盖路径的辐亮度贡献，以及双侧积分。

验收时，对六个固定真实介质分别运行严格约四倍的误差容差收紧实验，并用改变初始角度分块的独立参考计算检查结果稳定性。还应增加一个强回归测试：关闭气体灭光及太阳遮挡、设常数入射光且 g=0 时，完整发射视线满足

\[
4\pi L=1-\mathbb E[T_{\rm view,cloud}]
\]

这个恒等式可直接使用真实云分数和原有 U 相关模型检验源积分。

## 最终实施判断

**首选组合是：云支持几何预分区 + u 变量下端点感知源积分 + μ/δ 嵌套自适应积分 + 全局误差预算。**

通过镜像对称、跨波长和 HG 场景共享几何采样、缓存自适应节点及优先细分最大误差贡献区间，可以控制研究原型的成本。当前首先要交付的是可信的数值收敛状态；随后再讨论天气标签、预测评分及生产替换。

参考：urlGSL / QUADPACK 积分方法https://www.gnu.org/software/gsl/doc/html/integration.html；urlCubature 文档与窄支撑假收敛说明https://bnaras.github.io/cubature/reference/hcubature.html。
