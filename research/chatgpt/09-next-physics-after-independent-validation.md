# Independent assessment after the 164-event calendar

Completed 2026-11-07; the server reports 332 seconds of thinking. Exact HTML and provenance remain in the raw MCP response. The query includes all 164 scores, frozen local source and exact diagnostic profiles.

Scope note: the density-only comparator was declared before scoring; its interpretation is prespecified secondary/descriptive. The response calls the best density AUC a post-hoc observation. The preserved evaluation policy supplies the authoritative design distinction. Primary promotion was declined.

**建议下一步实现「观测方向的云散射辐亮度积分」**：让模型计算云层向观察者散射了多少有色光，再按可见天空角面积聚合。核心改动是散射源项（scattering source term），角域聚合是与之配套的观测量。

判断依据

原始 `coarse_cumulative` AUC 0.716、Top20 命中14；冻结候选 AUC 差值 −0.0093，置信区间跨零。`dense_cumulative` 的最高 AUC 0.727 属于事后观察，且 Top20 为13。**保留生产模型和完整四变体实验，不回选赢家。**

目前 `targetLight` 将太阳及视线路径的透射光谱转成云底亮度，`frame` 再累加候选云底的 `strength × weight`。这里缺少决定真实霞光的环节：**云粒子的光学厚度、散射相函数，以及光进入观察方向的效率**。同时，候选云底增多可能使聚合分数上升。

8月14日日落是值得解释的案例：有链接证据、grade3，`dense_adjacent` 发现14个候选目标，分数仍仅0.6。相反，7月13日高分零标签只有策展标签，尚不足以确认物理误报。

具体实现与判别

1. **建立辐亮度计算。** 沿观察视线积分每个云体积元的「入射太阳光 × 散射系数 × 相函数 × 到观察者的透射率」。先保留原云量、最大垂直重叠、固定消光系数及气溶胶设定；复用现有条件透射计算。按方位、仰角和实际立体角积分，输出 RGB 辐亮度、发光云面积与天空背景对比度。15% 阈值可保留用于显示，但连续云量应参与光学积分。

2. **做可归因的消融。** 保持输入一致，对比原模型、仅修改角域聚合、仅加入散射源项、两者联合。检查云层细分和视线采样加密后的收敛性、薄云线性极限、日向/背日散射差异及厚云遮蔽。先以单次散射构建可测试模型；厚云和深暮光用 [libRadtran 球面 MYSTIC](https://libradtran.org/doku.php?id=basic_usage&utm_source=chatgpt.com) 的多次散射结果判定近似边界。[[libradtran.org]](https://libradtran.org/doku.php?id=basic_usage&utm_source=chatgpt.com)

3. **独立验证物理与预测能力。** ERA5 可补充云冰/液水含量，结合有效半径估计光学厚度，作为单独输入消融；这与 [ECMWF ecRad 云光学](https://www.ecmwf.int/sites/default/files/elibrary/2016/16901-ecrad-new-radiation-scheme-ifs.pdf?utm_source=chatgpt.com) 的物理量一致。[[cds.climate.copernicus.eu]](https://cds.climate.copernicus.eu/datasets/reanalysis-era5-pressure-levels?tab=download&utm_source=chatgpt.com)[[ECMWF]](https://www.ecmwf.int/sites/default/files/elibrary/2016/16901-ecrad-new-radiation-scheme-ifs.pdf?utm_source=chatgpt.com) 用有时间、地点、朝向证据的照片检验云色与发光区域，并结合10分钟间隔的 [Himawari AHI](https://www.data.jma.go.jp/mscweb/en/himawari89/space_segment/spsg_ahi.html?utm_source=chatgpt.com) 影像核对云场。[[Himawari-8/9 Imager (AHI)]](https://www.data.jma.go.jp/mscweb/en/himawari89/space_segment/spsg_ahi.html?utm_source=chatgpt.com) 已检查的164例只用于机制诊断；在新日期预注册 AUC、Top20、配对区块区间，并另做固定预报时效验证。

**验收关键：** 新机制应在物理基准中产生合理的方向性辐亮度，对云层划分和角度采样保持收敛，并在独立观测上提供增益。全国热力图则只聚合实际覆盖的天空角域，明确标记采样边界。

垂直去相关、压力层加密和评分系数调整继续作为独立研究轴；当前优先打通「太阳照射 → 云散射 → 观察者可见辐亮度」这条因果链。
