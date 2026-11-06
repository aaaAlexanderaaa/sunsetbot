# Revised engine review

Extracted from the preserved raw MCP HTML response.
结论：上一轮的关键工程失真大部分已修正，但云遮挡概率仍存在实质性建模错误。当前适合交付为实验性「太阳方向霞光潜力」服务，暂不宜把分数和峰值作为可靠的观赏决策依据。
已解决的部分
云量与条件消光分离、同一云格复用出现变量、太阳方位动态插值、球面双光路、降水区间语义、空峰值、缺失资料标记和原始数据留存，均在实现中有对应机制。
官方资料也支持时间分辨率说明：IFS 0.25° 原生约3小时，Open-Meteo 输出小时序列；ECMWF 等压面云量由湿度诊断，GFS 则提供原生云量。 [https://open-meteo.com/en/docs/ecmwf-api?utm_source=chatgpt.com] [open-meteo.com]  [https://open-meteo.com/en/docs/gfs-api?utm_source=chatgpt.com] [open-meteo.com]  [https://open-meteo.com/en/docs/ecmwf-api?utm_source=chatgpt.com] [open-meteo.com]
仍需修正的问题（按优先级）
1. 云重叠模型仍会制造系统性遮挡。 maximum 让相隔数百公里的云格共享同一个随机变量。例如目标云量20%、远处遮挡云量50%，条件于目标有云后，程序会认定远处遮挡云必然存在。更严重的是，cloudTransmission 将目标层内各格云量强制提升至整层最大云量：20%与80%的两层会被条件化成100%同时出现，造成额外消光。应保留原始分数，只对目标云存在事件进行条件积分，并引入随空间、垂直距离衰减的相关性。ECMWF 的云重叠研究支持这种距离相关处理。 [https://agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2018MS001364?utm_source=chatgpt.com] [Wiley Online Library]  [https://www.ecmwf.int/en/elibrary/74210-parameterization-cloud-overlap-function-wind-shear-and-its-impact-ecmwf-forecast?utm_source=chatgpt.com] [ECMWF]
2. 云底重建与光路取样存在不一致。 cloudDecks 用15%阈值插值云底，atmosphere 却按最近等压面分段取云量。比如7.2km云量0%、9.2km云量60%，云底被放在7.7km，但8.2km以下的消光仍按无云处理。这会直接影响目标是否受光。另需修正地表以下等压面可能导致的零分母/NaN边界情况。
3. 远处低空霞光仅部分得到恢复。 0.5°阈值下，150km处云底约需达到3.1km、300km处约需9.7km才会入选。300km延伸主要增加远处高云覆盖。三方位只是随太阳转动的截面插值，也尚未覆盖侧向天空的霞云面积。
4. 云色与观赏质量仍有结构性缺项。 目前基本以穿透衰减估计云底受光，厚云的侧面、云顶反射及散射贡献缺席。WMO 对云色的解释明确涉及云的位置、高度及不同受光表面。 [https://cloudatlas.wmo.int/en/appearance-of-clouds-colour.html?utm_source=chatgpt.com] [International Cloud Atlas] 这会产生特定类型火烧云的漏报。
当前最影响用户判断的是什么？
是模型结构假设的变化可能改变观赏等级，而界面仍输出单一0–100分和5分钟峰时。 两种重叠情景及气溶胶高度范围只是局部敏感性，尚未覆盖云位置误差、模型分歧和真实预报技巧。
建议交付前先修复上述条件概率及云底取样问题，完成42点三方位真实调用验收。首版继续展示分数，但明确定位为实验性截面指数；将精确峰时标为模型参考时刻，并优先呈现云况、方向、资料新鲜度与情景分歧。
19项回归通过和离线重放说明工程基础已有进展；180份输入留存则为后续评估提供了条件。下一阶段最有价值的证据是连续观测配对，并与简单分层云量基线比较。 在此之前，哪些误差实际主导上海朝晚霞的漏报与误报，仍需实测确定。
参考： [https://open-meteo.com/en/docs/ecmwf-api?utm_source=chatgpt.com] Open-Meteo ECMWF ·  [https://doi.org/10.1029/2018MS001364?utm_source=chatgpt.com] ECMWF云重叠研究 ·  [https://cloudatlas.wmo.int/en/appearance-of-clouds-colour.html?utm_source=chatgpt.com] WMO云色原理
