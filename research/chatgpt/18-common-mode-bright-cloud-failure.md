# Common-mode bright-cloud assessment

Reading copy extracted from the returned HTML; the raw response is preserved beside it. The supplied evidence still had unresolved page/batch identity. Its 108 source-only zeros refer to earlier development evidence; the subsequently evaluated independent calendar has 96 source-only zeros.

我的判断：先完成冻结排名器的独立评估；同时立即纠正产品的决策承诺。将“云与天空的可感知色差”作为下一项物理模型研究，而非直接上线新的显色公式。

1. 这次暴露的是结构性缺口

代码中

RGBλ = cloudTransmission × exp(-τλ)

。灰色云透射因子在

(R-B)/R

中抵消，因此暖色主要来自大气光路的波长差异，缺少云本身相对于背景天空的显色对比。

WMO 明确指出：天空散射光参与云的照明，日落附近高云仍可能显白。

[International Cloud Atlas]

[International Cloud Atlas]

归档 ECMWF 的高分高度依赖云量输入，但云量替换实验只能解释

分数来源

，无法判定真实云量或着色失败的原因。08:00 归档的 57.8/4.5 与用户所见双约 50，仍须保留为批次身份未解决的问题。

2. 建议的执行顺序

1.

立即修正决策语义。

保留原始分数、版本和证据，但将 0–100 明确称为“实验性云层受光条件指数”。显著彩云保持“未判定”。双方高分一致也适用。将五分钟峰值窗口解释为模型计算峰段，避免表达为可靠观赏时刻。

2.

先盲评冻结排名器。

使用已预冻结的 122 场预测，比较原模型、native-layer 基线及排名器。108 个缺少独立负面影像覆盖的零标签按未确认处理。对可核实观测单独标注“显著彩云”“仅明亮或白云”“覆盖不足”。预先固定提示预算（例如每十场推荐两场），比较彩云命中率、亮白误报率及配对置信区间，并保留输入来源和预报提前量。若无法取得足够真实负例，结论应保持未决。该评估验证的是弱标签排序能力，实时 GFS/IFS 能力仍待验证。

3.

再验证最小物理增量。

离线构建太阳直射、天空散射、云散射及视线路径辐射的简化模型，比较云与背景的色度和明度对比。用不同云光学厚度、冰水类型及天空照明情景进行敏感性扫描。

若合理参数变化即可使“显著着色/亮白”结论翻转，就应输出显色不确定，而非一个确定分数。

单次散射模型适合研究薄云情景；更厚云层还涉及多次散射。NASA 的云光学反演和 libRadtran 文档说明了所需参数。

[Atmosphere Discipline Team Imager Products]

[libradtran.org]

3. 可证伪的上线标准

在独立、有观测覆盖的留出事件上，新方法须在相同提示预算下显著降低亮白天空误报，同时保持彩云命中能力；比较采用预注册指标与配对不确定区间。2026-11-10 用户的 16:55–17:08 观测作为

特定视野、特定时段的负面回归案例

，不扩展成上海全域无彩云，也不用于单日调阈值。

冻结排名器可能改善排序，却只有原始峰值和 native-layer 两类特征，依然可能继承共同显色盲区。因此，它是优先完成的证据检验，并非结构性问题的终点。

当前产品能够诚实支持的结论是：在给定天气输入和几何假设下，存在多少潜在云层受光机会。

对“值得出门看明显彩云”的判断，现阶段应保持审慎、允许弃判。真正决定下一阶段进展的关键是获得可核实的亮白负例与彩云正例，而非进一步提高光线积分的数值精度。

参考：

WMO 云色

·

WMO 云明度

·

Open-Meteo ECMWF

·

GFS

·

NASA 云光学

·

libRadtran
