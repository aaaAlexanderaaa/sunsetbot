# Independent directional-transfer design assessment

Completed 2026-11-07; the server reports 448 seconds of thinking. The self-contained query includes actual engine, overlap and solar-geometry code, the full input constraints and completed validation findings. The raw MCP response preserves exact provenance.

Local scope: source dependencies remain pinned to SunCalc 1.9.0. The first observable is radiance normalized by the direct irradiance at each sampled wavelength; calibrated RGB colour requires a solar spectrum and spectral response. The exact implementation declares longitude-based section extrusion, nearest-column terrain and symmetric 150 km source support.

## 结论

**建议采用你提出的 2.5D extrusion，作为第一版 directional single-scattering 实验。** 保留现有一维随机云场及条件透射算法，用三维球面光路计算太阳直射、云单次散射、观测者接收，再进行真实立体角积分。

这是一条科学上自洽、工程上可控的路线。现阶段扩展到二维或三维随机云场，会同时改变空间相关结构，使散射源项的独立贡献难以识别。

关键边界：第一版预测的是**给定天气资料下的期望方向辐亮度**。横向完全相关的 extrusion 会影响云形态、空间方差及“至少出现一片亮云”的事件概率，但线性角积分仍可利用逐视线期望计算。

## 1\. 采用的物理方程

对观测方向 \(\omega\) 和波长 \(\lambda\)，定义：

\[
\boxed{
\bar L_\lambda(\omega)=
E_{0,\lambda}
\int_{\mathrm{LOS}}
H_\odot(q)\,
\omega_{0,\lambda}\kappa_c(q)\,
p_g(\mu)\,
e^{-\tau_{\mathrm{clear},\lambda}}\,
f_c\,
\mathcal T_c(q)\,ds
}
\]

其中：

\[
\mathcal T_c(q)=
\mathbb E\left[
e^{-(\tau_{c,\mathrm{sun}}+\tau_{c,\mathrm{view}})}
\mid U_c<f_c
\right]
\]

- \(E_{0,\lambda}\)：大气外太阳法向光谱辐照度。
- \(H_\odot\)：球面地球及地形遮挡产生的直射可用性。
- \(\kappa_c\)：既有条件云消光系数。
- \(\omega_0\)：云单次散射反照率，作为声明的光学情景。
- \(p_g\)：归一化散射相函数。
- \(\tau_{\mathrm{clear}}\)：太阳与观测两段光路的 Rayleigh、aerosol 消光之和。

你的 `cloudTransmission` 可以直接实现 \(\mathcal T_c\)：传入两段光路的全部 cloud pieces，条件设置为当前源单元的 `[0,f_c]`，结果乘一次 \(f_c\)。

**三个必要约束：**

第一，云量始终决定出现概率，\(\kappa_c\) 始终代表有云时的消光。保留现有 U 相关性及联合透射，避免把 \(f_c\kappa_c\) 直接当作均匀介质消光。

第二，所有 \(f_c>0\) 的压力带参与体源项。`cloudDecks` 的 15% 门槛、累计最大云量增量和 base-face 选择只留在旧版及桥接消融中。尤其当上层云量低于下层时，上层仍可能发光。

第三，沿视线积分辐亮度，不额外施加距离平方衰减或太阳水平面余弦因子。太阳入射采用法向辐照度，距离对视场面积的影响已经由立体角处理。

这与 libRadtran 对 radiance 和太阳几何的区分，以及 ecRad 对 cloud fraction 和 in-cloud optical properties 的区分一致。[libradtran.org](https://www.libradtran.org/doku.php?id=basic_usage&utm_source=chatgpt.com) [ECMWF Confluence](https://confluence.ecmwf.int/download/attachments/70945505/ecrad_documentation.pdf?api=v2&modificationDate=1655480733414&version=5&utm_source=chatgpt.com)

## 2\. 几何：最重要的实现修正

**观测扇区与介质定义域应分开。**

介质为 \(U(X)\) 在横向 \(Y\) 上复制形成的场；窄扇区只限制观察方向。太阳光路应允许穿过扇区外的横向区域，继续查询同一个 extruded field。这样可以避免人为制造侧边透明边界。

在上海观测点构造 ECEF 局部基，以当前太阳方位定义 \(X\) 轴。每个三维点统一转换为地心高度及地表测地距离投影 \(X,Y\)，其中云量、压力带和 U 只依赖 \(X,h\)。太阳方向使用同一 ECEF 下的平行向量。

这样可保证太阳光路和视线重复进入同一 \(X\) 云柱时，使用相同 U，而不会因方位角另行抽样。

相函数采用：

\[
p_g(\mu)=
\frac{1-g^2}{4\pi(1+g^2-2g\mu)^{3/2}}
\]

定义 \(\mathbf s\) 为散射点指向太阳，\(\mathbf v\) 为观测者指向散射点，则 \(\mu=\mathbf s\cdot\mathbf v\)。向日方向是前向散射，背日方向是后向散射。必须用这个几何测试排除相函数正负号颠倒。[Springer](https://link.springer.com/article/10.1186/s41476-017-0038-8?utm_source=chatgpt.com)

建议固定 \(g=0.85\) 作为声明的基准情景，同时报告 \(g=0\)（各向同性）及两个预设敏感性情景。缺少粒径与相态时，所有这些都是模型假设。

还有一个应立即检查的版本风险：现有 `astro.mjs` 使用 SunCalc v1 的弧度及南基准方位角约定。SunCalc v2 已将输出改为角度、北基准方位角及视高度。**必须核对并固定实际依赖版本**，否则太阳方向和 Earth-shadow 会整体错误。[GitHub](https://github.com/mourner/suncalc/releases?utm_source=chatgpt.com)

第一版统一使用几何太阳中心、直线传播与球面遮挡。有限太阳圆盘和大气折射作为独立几何敏感性实验；接近日出日落时，它们可能改变阴影边界。[NOAA Global Monitoring Laboratory](https://gmd-prod.cmdl.noaa.gov/grad/solcalc/calcdetails.html?utm_source=chatgpt.com)

## 3\. 角积分、面积与可观测量

固定两个相同角宽的观测扇区，分别朝向太阳与背向太阳，规定相同的 elevation 范围，并限制发光体距离在双方都有气象支持的区域。建议先用共同的 ±150 km 发光范围；向日侧 150–300 km 单独报告。更远的已采样柱仍用于光路消光。

每个角像素严格使用：

\[
\Delta\Omega
=
\Delta\phi(\sin e_{\mathrm{hi}}-\sin e_{\mathrm{lo}})
\]

输出实际有效立体角 \(\Omega_{\rm valid}\)、680/550/440 nm 光谱辐亮度、向日/背日积分，以及 R/B 光谱比。三波长是 RGB radiance proxy；正式摄影色彩还需要光谱响应及色度转换。太阳光谱可采用固定的 ASTM E-490 参考。[NLR](https://www.nlr.gov/grid/solar-resource/spectra-astm-e490?utm_source=chatgpt.com)

**第一主观测量建议为固定视场内的 680 nm 积分辐亮度**，保持物理单位和固定角域，暂不引入 `sqrt`、warmth、指数压缩及 GFS 乘子。其余颜色与面积作为诊断量。GFS 降水/能见度留作独立外部条件。

“发光角面积”可以定义为每条视线至少遇到一个几何上受太阳直射的云单元的概率，再对 \(\Delta\Omega\) 积分。用 U 场的 union probability 计算，天然避免多个压力带或发光采样点重复计面积。它表示**潜在受光云角面积**；另以固定亮度阈值给出可见亮区面积，并标注阈值情景。

## 4\. 数值求解与验收

将 14 个随机云柱始终保持为固定概率单元。求光深时，精确切分水平最近柱边界、压力带边界、3/8 km 消光分界、地形交点和大气顶边界。Rayleigh 与 aerosol 的连续项在切分后的片段内数值积分。体源项可用中点积分并按局部光深自适应细分。

这样改细射线步长只改变积分精度，**不会增加 U 的数量，也不会改变云场概率律**。

必须包含以下验收：

1. 均匀 slab 的同侧照明/观察与两侧照明/观察解析解；光学薄极限呈线性。
2. 零散射源、零云量、完全 Earth shadow 均输出零云散射辐亮度；不透明前景使背景贡献趋零。
3. HG 相函数满足全立体角归一化、平均余弦 \(g\) 及正确前后向关系。
4. 两云柱测试满足 \(P(C_1\cap C_2)=\rho\min(f_1,f_2)+(1-\rho)f_1f_2\)，其中 \(\rho=e^{-\Delta X/50}\)。
5. 视线与太阳光路共享云柱时，与联合条件透射的解析或高精度参考一致。
6. 角像素和体源步长分别加密，直到积分量收敛；保持原 14 柱不变，并记录误差、无效光路与缺失资料比例。

超过采样边界且仍有相关消光的太阳光路应标记为未覆盖。缺失 AOD 也应显式处理，避免在新物理实验中悄悄按零消光得到偏亮结果。

## 5\. 消融与历史诊断

保留之前建议的四个工程对照：原版、只换角面积、只换散射源、两者都换。但它们存在一个结构性区别：旧版 base-face 目标与新版体积源项具有不同的积分域。因此建议增加一个**固定旧目标集合与 15% 门槛的桥接对照**，用来拆解改动来源；最终物理候选模型则使用全部正云量及体积积分。

真正干净的方向性消融，应在同一体积积分、同一角域下比较 isotropic 与 HG，并对相函数参数做预声明敏感性分析。

20+164 个既有事件用于几何、数值及失败案例诊断，尤其检查高云受光、低云遮挡、背日错误和历史低分正例。新日期、新 source freeze 后再做配对 AUC 与日期块 bootstrap。11/37 层分别匹配各自相同输入的旧模型，不混合输入分辨率与源项改动。

最终最值得保留的判断是：**这个实验能够检验“显式方向散射源项能否解释历史错误”，但在照片方位/时间和负例观测覆盖未验证之前，AUC 的上限仍受标签可观测性约束。** 因此先把 radiance、solid angle、shadow、coverage 做到可审计，再决定是否升级云场维度，比继续调整评分函数更有识别价值。

参考：urllibRadtran Basic Usagehttps://www.libradtran.org/doku.php?id=basic_usage · urlecRad User Guidehttps://confluence.ecmwf.int/display/ECRAD · urlHenyey–Greenstein Phase Functionshttps://www.pbr-book.org/4ed/Volume_Scattering/Phase_Functions · urlASTM E-490 Solar Spectrumhttps://www.nlr.gov/grid/solar-resource/spectra-astm-e490 · urlSunCalc releaseshttps://github.com/mourner/suncalc/releases
