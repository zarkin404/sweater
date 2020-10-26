(() => {
  // 请求间隔，单位：毫秒（不建议小于 2000 毫秒）
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

  // 并发执行函数生成器
  const concurrentGenerator = (func, maxConcurrentCount) => {
    // 等待中的任务队列
    const pendingTaskQueue = []
    // 当前并发任务数
    let currentTaskCount = 0

    // 创建任务
    const createTask = (caller, args, resolve, reject) => () => {
      //更新当前并发任务数
      currentTaskCount++

      caller(...args)
        .then(resolve)
        .catch(reject)
        .finally(() => {
          //更新当前并发任务数
          currentTaskCount--

          // 检查任务队列中是否有未执行的任务，有则取出来执行
          const task = pendingTaskQueue.pop()
          typeof task === 'function' ? task() : console.warn('队列空闲')
        })
    }

    return (...args) => (new Promise((resolve, reject) => {
      const task = createTask(func, args, resolve, reject)
      currentTaskCount < maxConcurrentCount
        ? task()  // 空闲，则直接执行
        : pendingTaskQueue.unshift(task)  // 繁忙，则放入队列等待执行
    }))
  }

  // 测试并发执行函数生成器
  // const concurrentGeneratorTester = (_, index) =>
  //   new Promise(resolve => {
  //     const timeout = Math.floor(Math.random() * 6)
  //     setTimeout(resolve, timeout * 1000)
  //     console.log(index, timeout)
  //   })
  // const targetFunc = concurrentGenerator(concurrentGeneratorTester, 2, 2000)
  // Array(10).fill(true).forEach(targetFunc)

  // 请求函数
  const _request = (functionId, body = {}) =>
    fetch('https://api.m.jd.com/client.action', {
      body: `functionId=${functionId}&body=${JSON.stringify(body)}&client=wh5`,
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      method: 'POST',
      credentials: 'include',
    }).then(res => (new Promise(resolve => {
      // 应用每个任务之间的执行间隔
      setTimeout(resolve, REQUEST_INTERVAL, res)
    })))

  // 生成支持并发的请求函数
  const request = concurrentGenerator(_request, 1)

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
            // 如果是领取任务，则延迟 (waitDuration + REQUEST_INTERVAL) 秒再继续执行任务
            setTimeout(scoreCollector, (task.waitDuration + REQUEST_INTERVAL) * 1000, task, undefined, resolve)
          } else {
            // 如果是领取任务后的执行任务，或者执行普通任务，则延迟 REQUEST_INTERVAL 秒再返回
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
        const viewProductVos = res.data.result.viewProductVos
        viewProductVos.forEach(collection => {
          Array(collection.maxTimes - collection.times)
            .fill(true)
            .forEach((_, index) => {
              const content = collection.productInfoVos[index]
              taskList.push({
                taskName: collection.taskName,
                taskId: collection.taskId,
                waitDuration: collection.waitDuration,
                itemId: content.itemId
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
        if (/助力/.test(taskCollection.taskName)) continue

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
    })
  }

  // 执行主流程
  main()
})()
