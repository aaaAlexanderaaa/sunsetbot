# Independent data-access assessment

Captured from the fresh Ask ChatGPT MCP conversation. The raw JSON preserves the response. Publisher claims used by the implementation are checked separately in `docs/reanalysis-access.md`.

结论：先走官方 CDS + ADS，注册一次，后续自动化

这是目前最可靠、用户操作最少的路线：CDS 获取 ERA5 三维云场，ADS 获取 CAMS EAC4 AOD550。两个服务共用 ECMWF 账号和 API Key，只需分别接受数据集许可。

它们完整覆盖你的历史日期，支持服务端按区域裁剪，避免下载全球数据。 https://cds.climate.copernicus.eu/datasets/reanalysis-era5-pressure-levels?utm_source=chatgpt.com [cds.climate.copernicus.eu]  https://ads.atmosphere.copernicus.eu/datasets/cams-global-reanalysis-eac4?tab=overview&utm_source=chatgpt.com [ads.atmosphere.copernicus.eu]  https://confluence.ecmwf.int/spaces/DAC/pages/453683015/Using%2Bthe%2BECMWF%2Bdata%2Bstore%2B-%2BECDS?utm_source=chatgpt.com [ECMWF Confluence Wiki]

1. 为什么这样选？

数据源

核心字段

主要代价

判断

https://cds.climate.copernicus.eu/datasets/reanalysis-era5-pressure-levels?tab=download&utm_source=chatgpt.com CDS ERA5

五项逐层变量齐全

免费账号、许可

主路线

https://github.com/google-research/arco-era5?utm_source=chatgpt.com Google ARCO ERA5

齐全、匿名访问

每变量每小时约 154 MB 全球分块

不适合小区域批量

https://earthdatahub.destine.eu/collections/era5/datasets/era5-pressure-levels?utm_source=chatgpt.com DestinE Earth Data Hub

齐全

另需 API Key；60 天×15°分块

备用

Google Earth Engine

齐全、服务端裁剪

Google Cloud 项目及授权

已有项目时可考虑

Earthmover ERA5

缺 cc/clwc/ciwc

字段缺失

排除

Google ARCO 的 10 天、5 变量读取对应约 185 GB 未压缩全球分块，实际传输量受压缩影响。官方 CDS 则直接裁剪所需区域。 https://github.com/google-research/arco-era5/blob/main/README.md?utm_source=chatgpt.com [GitHub]  https://earthdatahub.destine.eu/collections/era5/datasets/era5-pressure-levels?utm_source=chatgpt.com [Earth Data Hub]  https://huggingface.co/spaces/hugging-science/ai-weather-models-with-earthmover-data/blob/9e063d181ace66d0824ad1ffd8b6d8d15bac2324/docs/DATA_SOURCES.md?utm_source=chatgpt.com [Hugging Face]  https://developers.google.com/earth-engine/guides/access?utm_source=chatgpt.com [Google for Developers]

2. 用户实际只需做三件事

打开  https://cds.climate.copernicus.eu/how-to-api?utm_source=chatgpt.com CDS API 设置页，点击 Register 注册、验证邮箱并登录。

分别进入  https://cds.climate.copernicus.eu/datasets/reanalysis-era5-pressure-levels?tab=download&utm_source=chatgpt.com ERA5 下载页 和  https://ads.atmosphere.copernicus.eu/datasets/cams-global-reanalysis-eac4?tab=download&utm_source=chatgpt.com EAC4 下载页，在下载表单底部接受各自的 CC-BY 许可。

登录  https://cds.climate.copernicus.eu/how-to-api?utm_source=chatgpt.com CDS API 设置页，取得个人访问令牌。后续在 macOS 本地配置 ~/.cdsapirc 并安装 cdsapi>=0.7.7。令牌保留在本地，无需发到聊天中。

ADS 使用同一个令牌，但 API 地址须指定为 https://ads.atmosphere.copernicus.eu/api；CDS 为 https://cds.climate.copernicus.eu/api。 https://cds.climate.copernicus.eu/en/how-to-api?utm_source=chatgpt.com [Climate Data Store]  https://ads.atmosphere.copernicus.eu/how-to-api?utm_source=chatgpt.com [Atmosphere Data Store]  https://confluence.ecmwf.int/spaces/DAC/pages/453683015/Using%2Bthe%2BECMWF%2Bdata%2Bstore%2B-%2BECDS?utm_source=chatgpt.com [ECMWF Confluence Wiki]

**想先拿到真实样本：**完成前两步后，可以直接在 ERA5 网页下载一小时 GRIB，暂时跳过 API 配置。

3. 确定的下载规格

**ERA5：**选择 Reanalysis、逐小时、0.25°、区域 [38,110,26,132]（北、西、南、东）。

字段为 fraction_of_cloud_cover、specific_cloud_liquid_water_content、specific_cloud_ice_water_content、temperature、geopotential。

建议在要求的 11 层上增加 100/70/50 hPa，共 14 层。

单位分别是云量 0–1、云液水/冰水 kg/kg、温度 K、位势 m²/s²。位势高度可用 z/9.80665 近似转换；地形可另取 ERA5 single-level geopotential。 https://confluence.ecmwf.int/pages/viewpage.action?pageId=185081924&utm_source=chatgpt.com [ECMWF Confluence Wiki]

先下载 2023-06-01 10:00 UTC 单小时作读取验收，再获取 2023-05-31 至 2023-06-10 UTC 全时次，覆盖北京时间 6 月 1 日清晨及全部 20 场事件。

CAMS EAC4：选择 total_aerosol_optical_depth_550nm，0.75°、每三小时。它是整柱二维、无量纲 AOD，属于快速访问字段，2022–2023 年可用。 https://ads.atmosphere.copernicus.eu/datasets/cams-global-reanalysis-eac4?tab=overview&utm_source=chatgpt.com [ads.atmosphere.copernicus.eu]  https://confluence.ecmwf.int/pages/viewpage.action?navigatingVersions=true&pageId=340784983&utm_source=chatgpt.com [ECMWF Confluence Wiki]

4. 数据量和后续链路

按 14 层、五变量、float32 估算：

首批含 UTC 前置日：约 0.32 GB 原始数值。

完整标注期：约 16 GB。

官方单请求字段上限文档列为 120,000；按月请求最多约 52,080 字段，符合官方推荐的拆分方式。实际 GRIB 大小与排队时间依服务情况变化。 https://confluence.ecmwf.int/pages/viewpage.action?pageId=601307425&utm_source=chatgpt.com [ECMWF Confluence Wiki]

完成授权后，后续的按月提交、失败重试、GRIB 读取、字段及时间校验、区域裁剪和数据归档都适合由本地程序自动完成。

**最后一个实验边界：**ERA5 提供网格平均云量与云水，仍需重建云重叠和散射。建议保持既有基线与冻结光学模型不变，分别替换 GFS/ERA5 输入，才能区分输入误差与光学结构误差。
