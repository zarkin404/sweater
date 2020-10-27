(() => {
  // 请求间隔，单位：毫秒（不能小于 2000 毫秒）
  const REQUEST_INTERVAL = 2000

  // API 名称映射表
  const API = {
    GET_HOME_DATA: 'stall_getHomeData', // 获取任务凭据
    GET_TASK_DATA: 'stall_getTaskDetail', // 获取普通任务列表
    GET_FEED_DATA: 'stall_getFeedDetail', // 获取甄选优品任务列表
    COLLECT_SCORE: 'stall_collectScore' // 领取分数
  }

  // 任务凭据
  let secretp = ''
  // 任务列表
  let taskList = []

  // 请求函数
  const request = (functionId, body = {}) =>
    fetch('https://api.m.jd.com/client.action', {
      body: `functionId=${functionId}&body=${JSON.stringify(body)}&client=wh5`,
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      method: 'POST',
      credentials: 'include',
    })

  // 恢复被覆盖的 alert 函数，用于提醒用户
  ;(() => {
    const frame = document.createElement('iframe')
    frame.style.display = 'none'
    document.body.appendChild(frame)
    window.alert = frame.contentWindow.alert
  })()

  // 领取分数
  const scoreCollector = (task, actionType, lastResolve) =>
    request(API.COLLECT_SCORE, {
      taskId: task.taskId,
      itemId: task.itemId,
      actionType,
      ss: JSON.stringify({ secretp })
    })
      .then(res => res.json())
      .then(res => {
        console.log((actionType ? '领取' : '执行') + '任务：', task, '，调用结果：', res)

        return new Promise(resolve => {
          if (actionType) {
            // 如果是领取任务，则延迟 (waitDuration * 1000 + REQUEST_INTERVAL) 毫秒再继续执行任务
            setTimeout(scoreCollector, task.waitDuration * 1000 + REQUEST_INTERVAL, task, undefined, resolve)
          } else {
            // 如果是领取任务后的执行任务，或者执行普通任务，则延迟 REQUEST_INTERVAL 毫秒再返回
            setTimeout(() => {
              lastResolve ? lastResolve() : resolve()
            }, REQUEST_INTERVAL)
          }
        })
      })

  // 甄选优品任务处理
  const processFeedTask = rawTaskId => 
    request(API.GET_FEED_DATA, {
      taskId: rawTaskId
    })
      .then(res => res.json())
      .then(res => {
        const result = res.data.result

        // 确认任务集合所在键名
        const taskCollectionContentKeyName = Object.keys(result).find(
          keyName => /Vos?$/.test(keyName)
        )

        result[taskCollectionContentKeyName].forEach(taskCollection => {
          Array(taskCollection.maxTimes - taskCollection.times)
            .fill(true)
            .forEach((_, index) => {
              taskList.unshift({
                taskName: taskCollection.taskName,
                taskId: taskCollection.taskId,
                waitDuration: taskCollection.waitDuration,
                itemId: taskCollection.productInfoVos[index].itemId
              })
            })
        })
      })

  // 主流程
  const main = () => {
    // 检测浏览器 UA
    if (!~navigator.userAgent.indexOf('jdapp')) {
      return console.error('请确保已设置正确的浏览器 User-Agent.')
    }

    // 先获取基础信息再进行主流程
    Promise.all([
      request(API.GET_HOME_DATA),
      request(API.GET_TASK_DATA),
    ]).then(([homeData, taskData]) =>
      Promise.all([homeData.json(), taskData.json()])
    ).then(async ([homeData, taskData]) => {
      // 存储任务凭据
      secretp = homeData.data.result.homeMainInfo.secretp

      // 批量生成任务
      for (const taskCollection of taskData.data.result.taskVos) {
        // 跳过部分邀请任务
        if (/助力|商圈|精选会员/.test(taskCollection.taskName)) continue

        // 针对甄选优品任务的处理
        if (taskCollection['productInfoVos']) {
          await processFeedTask(taskCollection.taskId)
          continue
        }

        // 确认任务合辑所在键名
        const taskCollectionContentKeyName = Object.keys(taskCollection).find(
          (keyName) =>
            /Vos?$/.test(keyName) &&
            !['productInfoVos', 'scoreRuleVos'].includes(keyName)
        )

        // 获取任务合辑内容
        taskCollectionContent = taskCollection[taskCollectionContentKeyName]

        if (!taskCollectionContent) return

        Array(taskCollection.maxTimes - taskCollection.times)
          .fill(true)
          .forEach((_, index) => {
            const content = taskCollectionContent instanceof Array && taskCollectionContent[index]
            taskList.push({
              taskName: content ? content.title || content.shopName: taskCollection.taskName,
              taskId: taskCollection.taskId,
              waitDuration: taskCollection.waitDuration,
              itemId: content ? content.itemId : taskCollectionContent.itemId
            })
          })
      }

      console.log('任务列表：', taskList)

      // 开始收取分数
      for (const task of taskList)
        await scoreCollector(task, task.waitDuration ? 1 : undefined)

      alert('任务完成')
    })
  }

  // 执行主流程
  main()
})()
