// 先打开 https://login.m.taobao.com/login.htm?redirectURL=https%3A%2F%2Fwww.tmall.com%2F 登录

(() => {
  // 初始化
  var define = undefined;
  var appKey = "12574478";
  var apiMap = {
    COLLECT_COINS: "mtop.aplatform.2020618.get",
    GET_TASKS: "mtop.taobao.pentaprism.scene.query",
    GET_TASK_ITEM: "mtop.taobao.pentaprism.scene.queryitem",
    DO_TASK: "mtop.taobao.pentaprism.scene.trigger",
    GET_SHOPS: "mtop.cloudsail.ad.card",
  };

  // 获取 Token
  var getToken = () => document.cookie.match(/_m_h5_tk=(\w+?)_/)[1];

  // 获取时间戳
  var getTimestamp = () => Date.now();

  // 生成签名
  var signature = (timestamp, data) =>
    md5(`${getToken()}&${timestamp}&${appKey}&${data}`);

  // 发起请求
  var request = (api, data = {}, remark) => {
    var timestamp = getTimestamp();
    var data = JSON.stringify(data);

    return fetch(
      `https://h5api.m.tmall.com/h5/${api}/1.0/?${Object.entries({
        api,
        appKey,
        t: timestamp,
        sign: signature(timestamp, data),
        data: encodeURIComponent(data),
      })
        .map(([key, value]) => `${key}=${value}`)
        .join("&")}`,
      {
        credentials: "include",
      }
    )
      .then((res) => res.json())
      .then((res) => {
        console.log(`💡 正在${remark}，请求结果：`, res.ret, res.data);
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(res);
          }, 2000);
        });
      });
  };

  // 加载 MD5 外部库
  var loadMD5 = () =>
    new Promise((resolve) => {
      if (!document.querySelector("#md5")) {
        var md5Script = document.createElement("script");
        Object.assign(md5Script, {
          id: "md5",
          type: "text/javascript",
          src: "//cdn.staticfile.org/blueimp-md5/2.16.0/js/md5.min.js",
        });
        document.getElementsByTagName("head")[0].appendChild(md5Script);
        md5Script.onload = resolve;
      } else {
        resolve();
      }
    });

  // 收集金币
  var collectCoins = () =>
    request(
      apiMap["COLLECT_COINS"],
      { bizType: "hudong2020618.gameGather" },
      "收集金币"
    );

  // 执行门店任务
  var shopTask = () =>
    new Promise(async (resolve) => {
      var shopList = (await request(
        apiMap["GET_SHOPS"],
        { adScene: "2020618-ad-card-wall-1", excludeIdList: "", adCount: "10" },
        "获取店铺列表"
      )).data.model;

      for (var shop of shopList) {
        var res = (await request(
          apiMap["GET_TASK_ITEM"],
          shop.task,
          `获取【${shop.assets.title || shop.assets.subTitle}】的任务参数`
        )).data;

        if (res.errorMsg) {
          console.log(`💣 出错了：${res.errorMsg}`);
        } else {
          await request(
            apiMap["DO_TASK"],
            res.model.taskParams,
            `执行【${shop.assets.title || shop.assets.subTitle}】任务`
          );
        }
      }

      resolve();
    });

  //  执行主任务
  var mainTask = async () => {
    var taskList = (await request(
      apiMap["GET_TASKS"],
      { sceneId: "92" },
      "获取任务列表"
    )).data.model;

    for (var signTask of taskList[0].subList) {
      if (signTask.progress.status === "ACCEPTED") {
        await request(apiMap["DO_TASK"], signTask.taskParams, "执行签到");
      }
    }

    var tryAgain = false;

    for (var task of taskList) {
      // 跳过签到
      if (task.index === "0") continue;

      if (task.status === "ACCEPTED") {
        tryAgain = true;
        await request(
          apiMap["DO_TASK"],
          task.taskParams,
          `执行${task.assets.title}`
        );
      }
    }

    if (tryAgain) {
      mainTask();
    } else {
      console.log("💡 任务完成！");
      alert("任务完成！");
    }
  };

  // 启动程序
  loadMD5()
    .then(collectCoins)
    // .then(shopTask)
    .then(mainTask);
})();
