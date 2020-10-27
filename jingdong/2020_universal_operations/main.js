(() => {
  // 请求间隔，单位：毫秒（不能小于 2000 毫秒）
  const REQUEST_INTERVAL = 3000

  // 主流程执行次数
  const MAIN_FLOW_MAX_COUNT = 3

  // API 名称映射表
  const API = {
    GET_HOME_DATA: 'stall_getHomeData', // 获取任务凭据
    GET_TASK_DATA: 'stall_getTaskDetail', // 获取普通任务列表
    GET_FEED_DATA: 'stall_getFeedDetail', // 获取甄选优品任务列表
    GET_ALL_SHOP: 'stall_myShop', // 获取我全部的门店
    COLLECT_SCORE: 'stall_collectScore', // 领取分数
    COLLECT_PRODUCE_SCORE: 'stall_collectProduceScore'  // 收取生成的分数
  }

  // 任务凭据
  let secretp = ''
  // 任务列表
  let taskList = []
  // 主流程执行次数
  let mainFlowCount = 0

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
  const scoreCollector = (task, actionType, lastResolve, additional = {}) =>
    request(API.COLLECT_SCORE, Object.assign({
      taskId: task.taskId,
      itemId: task.itemId,
      actionType,
      ss: JSON.stringify({ secretp })
    }, additional))
      .then(res => res.json())
      .then(res => {
        console.log((actionType ? '领取' : '执行') + '任务：', task, '，调用结果：', res.data || res)

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

        // 确认任务集合内容所在键名
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
  const mainFlow = () =>
    Promise.all([
      // 先获取基础信息再进行主流程
      request(API.GET_HOME_DATA),
      request(API.GET_TASK_DATA),
    ]).then(([homeData, taskData]) =>
      Promise.all([homeData.json(), taskData.json()])
    ).then(async ([homeData, taskData]) => {
      // 存储任务凭据
      secretp = homeData.data.result.homeMainInfo.secretp

      // 批量生成主流程任务
      for (const taskCollection of taskData.data.result.taskVos) {
        // 跳过部分邀请任务
        if (/助力|商圈|会员/.test(taskCollection.taskName)) continue

        // 针对甄选优品任务的处理
        if (taskCollection['productInfoVos']) {
          await processFeedTask(taskCollection.taskId)
          continue
        }

        // 确认任务集合内容所在键名
        const taskCollectionContentKeyName = Object.keys(taskCollection).find(
          keyName =>
            !['productInfoVos', 'scoreRuleVos'].includes(keyName) &&
            /Vos?$/.test(keyName)
        )

        // 获取任务集合内容
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

      console.warn('任务列表：', taskList)

      // 开始收取分数
      for (const task of taskList)
        await scoreCollector(task, task.waitDuration ? 1 : undefined)

      // 更新主流程执行次数
      mainFlowCount++
      console.warn('主流程已完成' + mainFlowCount + '次，还有' + (MAIN_FLOW_MAX_COUNT - mainFlowCount) + '次待执行')

      // 延迟 REQUEST_INTERVAL，避免请求过于频繁
      return new Promise(resolve => setTimeout(resolve, REQUEST_INTERVAL))
    })

  // 营业版图任务处理
  const processBusinessMapTask = () =>
    request(API.GET_ALL_SHOP)
      .then(res => res.json())
      .then(async (res) => {
        const shops = res.data.result.shopList

        // 清空主流程的任务列表
        taskList = []
        
        // 批量生成营业版图任务
        for (let shop of shops) {
          console.log(`正在获取【${shop.name}】门店的任务`)

          await request(API.GET_TASK_DATA, {
            shopSign: shop.shopId
          })
            .then(res => res.json())
            .then(res => {
              const taskCollections = res.data.result.taskVos

              taskCollections.forEach(taskCollection => {
                // 确认任务集合内容所在键名
                const taskCollectionContentKeyName = Object.keys(taskCollection).find(
                  keyName => !['scoreRuleVos'].includes(keyName) && /Vos?$/.test(keyName)
                )

                const taskCollectionContent = taskCollection[taskCollectionContentKeyName]

                Array(taskCollection.maxTimes - taskCollection.times)
                  .fill(true)
                  .forEach((_, index) => {
                    taskList.unshift({
                      taskName: `【${shop.name}】${taskCollection.taskName}`,
                      taskId: taskCollection.taskId,
                      shopSign: shop.shopId,
                      waitDuration: taskCollection.waitDuration,
                      itemId: taskCollectionContent instanceof Array
                        ? taskCollectionContent[index].itemId
                        : taskCollectionContent.itemId
                    })
                  })
              })

              // 延迟 REQUEST_INTERVAL，避免请求过于频繁
              return new Promise(resolve => setTimeout(resolve, REQUEST_INTERVAL))
            })
        }

        console.warn('营业版图任务列表：', taskList)

        // 开始收取分数
        for (const task of taskList)
          await scoreCollector(task, task.waitDuration ? 1 : undefined, undefined, { shopSign: task.shopSign })
      })

  // 收取生成的金币
  const collectProduceScore = () => 
    request(API.COLLECT_PRODUCE_SCORE, {
      ss: JSON.stringify({ secretp })
    })
      .then(res => res.json())
      .then(res => {
        console.warn('收取金币 ' + res.data.result.produceScore + ' 枚金币。')
      })

  // 流程串联
  const flows = async () => {
    // 检测浏览器 UA
    if (!~navigator.userAgent.indexOf('jdapp')) {
      return console.error('请确保已设置正确的浏览器 User-Agent.')
    }

    // 循环执行主流程
    for (let i = 0; i < MAIN_FLOW_MAX_COUNT; i++) {
      await mainFlow()
    }

    // 收取生成的金币
    await collectProduceScore()

    // 针对营业版图任务的处理
    await processBusinessMapTask()

    alert('任务完成')
  }

  // 启动
  flows()
})()
