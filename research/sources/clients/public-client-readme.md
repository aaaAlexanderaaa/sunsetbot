# 火烧云消息推送服务

每天都去看自己的城市是否有火烧云

太麻烦了！

于是我写了个程序，定时去获取火烧云指数，配置简单

如果火烧云满足你的阈值，直接将消息推送至你的微信

![](https://image.fengfengzhidao.com/rj_10259001f2cfba6630b318de3b4d39ee065.png)


程序使用go语言编写，项目运行很方便，支持docker部署

## 如何运行此项目
如果你不会go语言

那么可以看看我的go零基础入门课程

https://www.bilibili.com/video/BV1B6MwzGEYc/

搭建go环境
https://www.fengfengzhidao.com/article/ZtYtBIsBg90FB71eC4QU

这些都做好之后，配置好settings.yaml

使用 `go run main.go` 即可运行项目


## 没有编程基础
没事，在右侧我提供了release文件，找到对应版本

有windows的可执行文件、linux的可执行文件、还有docker的镜像包

直接运行即可

## 消息推送
使用server酱推送到微信

注册server酱账号： https://sct.ftqq.com/

注册成功之后获取 sendKey，填入配置文件

免费账号有五次推送机会，对我们来说足够了

## 配置文件
```yaml
monitor: # 监控配置
  city: 长沙 # 监控的城市
  evening: # 晚霞的监控配置，当前获取当天的晚霞
    enable: true # 是否启用
    quality: 0.4 # 校验指标，满足指标就进行推送
    time: 0 0 15,17 * * * # 定时任务的时间配置，每天的下午3点，5点
  morning: # 朝霞的监控配置，当天获取第二天的朝霞
    enable: false  # 朝霞很多人都起不来，默认不获取
    quality: 0.7
    time: 0 0 20 * * 5,6 # 每周五、周六的晚上八点
bot:
  enable: false
  target: "ft" # 推送的目标：ft：方糖，也就是server酱
  sendKey: # server酱上面的sendKey
```
修改你所在的城市，修改晚霞和朝霞的推送时间


## 如何部署
如果你有自己的云服务器
那么你可以直接构建docker镜像，然后使用docker运行容器

### 使用docker运行
需要修改一下你的配置文件，然后使用目录映射的方式
```bash
docker run -itd --name sunset -v /opt/sunset/settings.yaml:/app/settings.yaml sunset:v1.0.11
```