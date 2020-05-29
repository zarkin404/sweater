var MAX_CYCLES = 3;
var currentCycle = 0;

// 主程序
var main = (executeNextCycle) => {
  var secretp = "";
  var taskList = [];

  // 恢复被覆盖的 alert 函数
  (() => {
    var frame = document.createElement("iframe");
    frame.style.display = "none";
    document.body.appendChild(frame);
    window.alert = frame.contentWindow.alert;
  })();

  // 请求函数
  var request = (functionId, body = {}) =>
    fetch("https://api.m.jd.com/client.action", {
      body: `functionId=${functionId}&body=${JSON.stringify(
        body
      )}&client=wh5&clientVersion=1.0.0`,
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      method: "POST",
      credentials: "include",
    });

  // 模拟任务完成请求
  var collector = (task, actionType) => {
    console.log(actionType ? "@领取任务：" : "@执行任务：", task);

    request("cakebaker_ckCollectScore", {
      taskId: task.taskId,
      itemId: task.itemId,
      actionType: actionType ? 1 : undefined,
      safeStr: JSON.stringify({ secretp }),
    })
      .then((res) => res.json())
      .then((res) => {
        console.log("调用结果：", res.data);

        // 如果是执行任务，即任务已经完成，则进行下一个任务
        if (!actionType) {
          start();
        }
      });
  };

  // 甄选优品任务处理
  var superiorTask = (() => {
    // 是否有请求正在执行
    var isBusy = false;

    return (rawTaskCollection) => {
      var getFeedDetail = (copiedTaskCollection) => {
        request("cakebaker_getFeedDetail", {
          taskIds: copiedTaskCollection["productInfoVos"]
            .map((item) => item.itemId)
            .toString(),
        })
          .then((res) => res.json())
          .then((res) => {
            var result = res.data.result;

            // 确认任务集合所在键名
            var taskCollectionContentKeyName = Object.keys(result).find(
              (keyName) =>
                /Vos?$/.test(keyName) && !["taskVos"].includes(keyName)
            );

            result[taskCollectionContentKeyName].forEach((taskCollection) => {
              Array(taskCollection.maxTimes - taskCollection.times)
                .fill(true)
                .forEach((_, index) => {
                  taskList.unshift({
                    taskName: taskCollection.taskName,
                    taskId: taskCollection.taskId,
                    taskType: taskCollection.taskType,
                    waitDuration: taskCollection.waitDuration,
                    itemId: taskCollection.productInfoVos[index].itemId,
                  });
                });
            });

            // 解除请求锁定
            isBusy = false;
          });
      };

      if (!isBusy) {
        isBusy = true;
        getFeedDetail(JSON.parse(JSON.stringify(rawTaskCollection)));
      } else {
        // 一秒后重试
        setTimeout(
          getFeedDetail,
          1000,
          JSON.parse(JSON.stringify(rawTaskCollection))
        );
      }
    };
  })();

  // 开始任务
  var start = () => {
    var task = taskList.pop();

    if (task) {
      // 除了小精灵和连签外的任务要先领取
      if (!["小精灵", "连签得金币"].includes(task.taskName)) {
        setTimeout(collector, 0, task, true);
      }
      // 至少等 2 秒再执行任务
      setTimeout(collector, (2 + task.waitDuration) * 1000, task);
    } else {
      // 执行下一轮任务
      executeNextCycle();
    }
  };

  (() => {
    // 获取基础信息
    Promise.all([
      request("cakebaker_getHomeData"),
      // 请求稍微慢点，避免提示【点太快啦！等下再来吧】
      new Promise((resolve) => {
        setTimeout(() => {
          request("cakebaker_getTaskDetail").then(resolve);
        }, 1000);
      }),
    ])
      .then(([homeData, taskData]) =>
        Promise.all([homeData.json(), taskData.json()])
      )
      .then(([homeData, taskData]) => {
        // 如果无法获取任务详情
        if (taskData.data.bizCode !== 0) {
          if (
            taskData.data.bizCode === -7 &&
            !~navigator.userAgent.indexOf("jdapp")
          ) {
            console.log("当前浏览器 UA：" + navigator.userAgent);
            throw "任务详情获取失败，请确保已设置正确的浏览器 User-Agent。";
          } else {
            throw `【错误信息：${JSON.stringify(taskData.data)}】`;
          }
        }

        // 获取签名 token
        secretp = homeData.data.result.cakeBakerInfo.secretp;

        // 生成任务队列
        taskData.data.result.taskVos.forEach(async (taskCollection) => {
          // 跳过部分邀请任务
          if (/助力|站队/.test(taskCollection.taskName)) return;

          // 针对甄选优品任务的处理
          if (taskCollection["productInfoVos"]) {
            superiorTask(taskCollection);
          }

          // 确认任务集合所在键名
          var taskCollectionContentKeyName = Object.keys(taskCollection).find(
            (keyName) =>
              /Vos?$/.test(keyName) &&
              !["productInfoVos", "scoreRuleVos"].includes(keyName)
          );

          // 某类任务下的任务集合内容
          taskCollectionContent = taskCollection[taskCollectionContentKeyName];

          if (!taskCollectionContent) return;

          Array(taskCollection.maxTimes - taskCollection.times)
            .fill(true)
            .forEach((_, index) => {
              taskList.push({
                taskName: taskCollection.taskName,
                taskId: taskCollection.taskId,
                taskType: taskCollection.taskType,
                waitDuration: taskCollection.waitDuration,
                itemId:
                  taskCollectionContent instanceof Array
                    ? taskCollectionContent[index].itemId
                    : taskCollectionContent.itemId,
              });
            });
        });

        console.log(taskList);

        // 开始任务
        start();
      });
  })();
};

// 循环执行主程序
var excuteMain = () => {
  console.log(
    `💡 正在执行第 ${currentCycle + 1} 轮任务，还有 ${
      MAX_CYCLES - (currentCycle + 1)
    } 轮未执行。`
  );

  new Promise(main).then(() => {
    currentCycle++;

    if (currentCycle < MAX_CYCLES) {
      excuteMain();
    } else {
      console.log("@任务已完成！");
      alert("任务完成！");
    }
  });
};

excuteMain();
