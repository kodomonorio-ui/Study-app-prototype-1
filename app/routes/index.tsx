import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { TriangleAlertIcon } from 'lucide-react'

const STORE_KEY = 'exam-countdown-v1'
const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000
const REVIEW_STEPS = [
  { offset: 0, label: '初学' },
  { offset: 1, label: '第1回復習' },
  { offset: 3, label: '第2回復習' },
  { offset: 7, label: '第3回復習' },
  { offset: 14, label: '第4回復習' },
]

export default function Page() {
  let [state, setState] = useState<State>(getDefaultState)
  let [now, setNow] = useState(() => Date.now())
  let [flash, setFlash] = useState(0)

  useEffect(() => {
    let stored = window.localStorage.getItem(STORE_KEY)

    if (!stored) {
      return
    }

    let parsed = JSON.parse(stored)
    let next = normalizeState({
      ...getDefaultState(),
      ...parsed,
    })

    setState(next)
  }, [])

  useEffect(() => {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(state))
  }, [state])

  useEffect(() => {
    let frame = 0

    let tick = () => {
      setNow(Date.now())
      frame = window.requestAnimationFrame(tick)
    }

    frame = window.requestAnimationFrame(tick)

    return () => window.cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    let alarm = state.alarmTime

    if (!alarm) {
      return
    }

    let today = toDateKey(new Date())
    let hh = String(new Date(now).getHours()).padStart(2, '0')
    let mm = String(new Date(now).getMinutes()).padStart(2, '0')

    if (`${hh}:${mm}` === alarm && state.lastSpokenDate !== today) {
      speakToday(state, () => {
        setState((current) => ({
          ...current,
          lastSpokenDate: today,
        }))
      })
    }
  }, [now, state])

  useEffect(() => {
    if (!flash) {
      return
    }

    let timer = window.setTimeout(() => {
      setFlash(0)
    }, 900)

    return () => window.clearTimeout(timer)
  }, [flash])

  useEffect(() => {
    let todayKey = toDateKey(new Date(now))
    let next = normalizeCriticalBuffer(state, todayKey)

    if (!isSameBufferSnapshot(state, next)) {
      setState(next)
    }
  }, [now, state.tasks, state.doneEvents, state.dailyLimit, state.todoAmount, state.todoUnit])

  let metrics = getMetrics(state, now)
  let progress = getProgress(state, now)
  let future = getFutureSimulation(state, now, progress, metrics)
  let agenda = getTodayAgenda(state)
  let todayRecord = getDailyRecord(state, toDateKey(new Date()))
  let recordStatus = todayRecord
    ? `今日の記録: ${formatNumber(todayRecord.amount, 2)} ${progress.unit}`
    : '未記録'
  let debtLabel =
    progress.debt >= 0
      ? `現在、計画より【 +${formatNumber(progress.debt, 1)} ${progress.unit} 】貯金があります。この調子を維持してください。`
      : `現在、累計で【 ${formatNumber(Math.abs(progress.debt), 1)} ${progress.unit} 】の借金（未消化タスク）があります。未来のあなたが詰みかけています。`
  let statusText = metrics.ended
    ? '終了しました。試験日時を未来に設定してください。'
    : '残り時間は今この瞬間も削られています。'

  function update(name: keyof State, value: any) {
    setState((current) => ({
      ...current,
      [name]: value,
    }))
  }

  function recordTodayActual() {
    let amount = Number(state.todayDoneAmount)

    if (!Number.isFinite(amount) || amount < 0) {
      return
    }

    let today = toDateKey(new Date())
    let nextLogs = state.dailyLogs.filter((log) => log.date !== today)

    nextLogs.push({
      date: today,
      amount,
      updatedAt: new Date().toISOString(),
    })

    nextLogs.sort((a, b) => a.date.localeCompare(b.date))

    setState((current) => ({
      ...current,
      dailyLogs: nextLogs,
    }))

    setFlash(Date.now())
  }

  function addTask() {
    let name = state.taskName.trim()
    let amount = Number(state.taskAmount) || 0
    let unit = state.taskUnit.trim() || state.todoUnit.trim() || '単位'
    let startDate = state.taskStartDate || toDateKey(new Date())

    if (!name || amount <= 0) {
      return
    }

    let task = {
      id: `todo-${Date.now()}`,
      name,
      amount,
      unit,
      startDate,
      schedule: REVIEW_STEPS.map((step) => ({
        ...step,
        date: addDays(startDate, step.offset),
      })),
    }

    setState((current) => ({
      ...current,
      tasks: [...current.tasks, task],
      taskName: '',
      taskAmount: '',
      taskUnit: '',
      taskStartDate: toDateKey(new Date()),
    }))
  }

  function removeTask(id) {
    setState((current) => ({
      ...current,
      tasks: current.tasks.filter((task) => task.id !== id),
      doneEvents: Object.fromEntries(
        Object.entries(current.doneEvents).filter(([key]) => !key.startsWith(`${id}:`)),
      ),
    }))
  }

  function toggleDone(key, done) {
    setState((current) => {
      let next = {
        ...current,
        doneEvents: { ...current.doneEvents },
      }

      if (done) {
        next.doneEvents[key] = true
      } else {
        delete next.doneEvents[key]
      }

      return next
    })
  }

  function clearTodayRecord() {
    let today = toDateKey(new Date())

    setState((current) => ({
      ...current,
      dailyLogs: current.dailyLogs.filter((log) => log.date !== today),
      todayDoneAmount: '',
    }))
  }

  function handleSpeak() {
    speakToday(state, () => {
      setState((current) => ({
        ...current,
        lastSpokenDate: toDateKey(new Date()),
      }))
    })
  }

  function addAllowedChannel() {
    let parsed = parseChannelInput(state.channelInput, state.channelName)

    if (!parsed) {
      return
    }

    setState((current) => {
      let nextChannels = current.allowedChannels.filter(
        (channel) => channel.channelId !== parsed.channelId,
      )

      nextChannels.unshift(parsed)

      return {
        ...current,
        allowedChannels: nextChannels,
        selectedChannelId: parsed.channelId,
        channelInput: '',
        channelName: '',
      }
    })
  }

  function selectChannel(channelId: string) {
    setState((current) => ({
      ...current,
      selectedChannelId: channelId,
    }))
  }

  function removeAllowedChannel(channelId: string) {
    setState((current) => {
      let nextChannels = current.allowedChannels.filter(
        (channel) => channel.channelId !== channelId,
      )
      let nextSelected = current.selectedChannelId === channelId
        ? nextChannels[0]?.channelId || ''
        : current.selectedChannelId

      return {
        ...current,
        allowedChannels: nextChannels,
        selectedChannelId: nextSelected,
      }
    })
  }

  let selectedChannel = state.allowedChannels.find(
    (channel) => channel.channelId === state.selectedChannelId,
  )
  let selectedPlaylistId = selectedChannel ? toUploadPlaylistId(selectedChannel.channelId) : ''
  let playerSrc = selectedPlaylistId
    ? `https://www.youtube.com/embed/videoseries?list=${selectedPlaylistId}&rel=0&modestbranding=1`
    : ''

  let rootClass = flash ? 'record-flash' : ''

  return (
    <main className="min-h-screen bg-[#07080d] text-zinc-100">
      <style>{pageStyles}</style>

      <section className="mx-auto grid min-h-screen w-full max-w-7xl gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[360px_1fr] lg:px-8">
        <aside className="input-panel self-start border border-zinc-800 bg-zinc-950/90 p-5 shadow-2xl shadow-black/40 lg:sticky lg:top-6">
          <div className="mb-6 flex items-center gap-3 border-b border-zinc-800 pb-5">
            <span className="grid size-11 place-items-center rounded bg-red-500/15 text-red-400">
              <TriangleAlertIcon className="size-6" />
            </span>
            <div>
              <p className="text-sm font-bold text-red-300">EXAM DEADLINE</p>
              <h1 className="text-2xl font-black text-white">
                試験カウントダウン
              </h1>
            </div>
          </div>

          <div className="grid gap-5">
            <Field label="試験の本番日時">
              <input
                className="control"
                type="datetime-local"
                value={state.examAt}
                onChange={(event) => update('examAt', event.target.value)}
              />
            </Field>

            <Field label="1日あたりの平均睡眠時間">
              <div className="split-control">
                <input
                  className="control"
                  type="number"
                  min="0"
                  max="24"
                  step="0.5"
                  value={state.sleepHours}
                  onChange={(event) => update('sleepHours', event.target.value)}
                />
                <span>時間</span>
              </div>
            </Field>

            <Field label="長期ToDoの総量">
              <div className="todo-grid">
                <input
                  className="control"
                  type="number"
                  min="0"
                  step="0.1"
                  value={state.todoAmount}
                  onChange={(event) => update('todoAmount', event.target.value)}
                />
                <input
                  className="control"
                  type="text"
                  value={state.todoUnit}
                  placeholder="ページ"
                  onChange={(event) => update('todoUnit', event.target.value)}
                />
              </div>
            </Field>

            <Field label="1日の最大限界タスク量">
              <input
                className="control"
                type="number"
                min="1"
                step="1"
                value={state.dailyLimit}
                onChange={(event) => update('dailyLimit', event.target.value)}
              />
            </Field>

            <Field label="朝の読み上げ時刻">
              <input
                className="control"
                type="time"
                value={state.alarmTime}
                onChange={(event) => update('alarmTime', event.target.value)}
              />
            </Field>
          </div>

          <p
            className={`mt-6 border-l-4 px-4 py-3 text-sm font-bold ${
              metrics.ended
                ? 'border-red-500 bg-red-500/10 text-red-200'
                : 'border-orange-400 bg-orange-400/10 text-orange-100'
            }`}
          >
            {statusText}
          </p>
        </aside>

        <section className="grid content-start gap-5">
          <div className="deadline-strip border border-red-500/30 bg-red-950/25 px-5 py-4">
            <span>本番まで</span>
            <strong>{formatTarget(state.examAt)}</strong>
          </div>

          <div className="timer-grid">
            <Metric
              label="試験までの残り日数"
              value={metrics.ended ? '0.000000' : formatNumber(metrics.days, 6)}
              unit="日"
            />
            <Metric
              label="試験までの総残り時間"
              value={metrics.ended ? '0.0000' : formatNumber(metrics.totalHours, 4)}
              unit="時間"
            />
            <Metric
              label="睡眠を除いた有効残り時間"
              value={metrics.ended ? '0.0000' : formatNumber(metrics.effectiveHours, 4)}
              unit="時間"
            />
          </div>

          <section className="section-card">
            <p className="kicker">TODAY'S QUOTA</p>
            <h2 className="quota-title">
              {metrics.ended
                ? '終了しました'
                : `試験に間に合わせるには、1日あたり ${formatNumber(
                    metrics.quota,
                    2,
                  )} ${metrics.unit} の消化が必要です`}
            </h2>
          </section>

          <section className="section-card">
            <div className="section-head">
              <div>
                <p className="kicker">MORNING COMMAND</p>
                <h2>本日のタスクを聴く</h2>
              </div>
            </div>
            <div className="speech-actions">
              <button className="primary-button" type="button" onClick={handleSpeak}>
                本日のタスクを聴く
              </button>
              <p className="subtle">待機中</p>
            </div>
          </section>

          <section className="section-card">
            <div className="section-head">
              <div>
                <p className="kicker">TODAY'S INTEGRATED TODO</p>
                <h2>本日の統合ToDo</h2>
              </div>
              <strong className="summary-number">{formatAmountMap(agenda.totalByUnit, state.todoUnit)}</strong>
            </div>
            <div className="agenda-summary">
              <p className="subtle">新規 {agenda.newCount}件 / 復習 {agenda.reviewCount}件</p>
              <p className="subtle">
                未完了 {formatAmountMap(agenda.remainingByUnit, state.todoUnit)}
              </p>
            </div>
            <div className="due-list">
              {agenda.items.length === 0 ? (
                <p className="empty">今日の登録タスクはありません</p>
              ) : (
                agenda.items.map((item) => (
                  <label key={`${item.key}-${item.date}`} className={`due-item ${item.done ? 'done' : ''}`}>
                    <input
                      type="checkbox"
                      checked={item.done}
                      onChange={(event) => toggleDone(item.key, event.target.checked)}
                    />
                    <div>
                      <p className="due-title">
                        {item.name} / {item.label}
                      </p>
                      <p className="due-meta">
                        {formatNumber(item.amount, 2)} {item.unit} / {item.date}
                      </p>
                    </div>
                  </label>
                ))
              )}
            </div>
          </section>

          <section className="dashboard-grid">
            <article id="recordCard" className={`section-card ${rootClass}`}>
              <p className="kicker">DISPLACEMENT X</p>
              <h2>絶対的達成度</h2>
              <p className="progress-value">{formatNumber(progress.actualPercent, 1)}%</p>
              <div className="progress-track">
                <span id="achievementBar" style={{ width: `${clamp(progress.actualPercent, 0, 100)}%` }} />
              </div>
              <form
                className="record-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  recordTodayActual()
                }}
              >
                <label>
                  本日の実績
                  <span className="log-grid">
                    <input
                      className="control"
                      id="todayDoneAmount"
                      type="number"
                      min="0"
                      step="0.1"
                      value={state.todayDoneAmount}
                      onChange={(event) => update('todayDoneAmount', event.target.value)}
                    />
                    <span id="todayDoneUnit" className="unit-text">
                      {progress.unit}
                    </span>
                  </span>
                </label>
                <button className="primary-button" type="submit">
                  本日の実績を記録
                </button>
              </form>
              <p id="recordStatus" className="subtle" style={{ marginTop: 12 }}>
                {recordStatus}
              </p>
              <button className="ghost-button" type="button" onClick={clearTodayRecord} style={{ marginTop: 10 }}>
                今日を0に戻す
              </button>
            </article>

            <article className="section-card">
              <p className="kicker">CURRENT TASK DEBT</p>
              <h2>現在のタスク借金（累積の遅れ）</h2>
              <p className={`drift ${progress.debt >= 0 ? 'good' : 'bad'}`}>{debtLabel}</p>
              <div className="dual-track">
                <div className="track-label">
                  <span>理想</span>
                  <div className="progress-track expected">
                    <span id="expectedBar" style={{ width: `${clamp(progress.expectedPercent, 0, 100)}%` }} />
                  </div>
                </div>
                <div className="track-label">
                  <span>実績</span>
                  <div className="progress-track">
                    <span id="actualBar" style={{ width: `${clamp(progress.actualPercent, 0, 100)}%` }} />
                  </div>
                </div>
              </div>
              <p className="subtle" style={{ marginTop: 14 }}>
                累積 {formatNumber(progress.actual, 2)} / {formatNumber(progress.total, 2)} {progress.unit}
              </p>
            </article>
          </section>

          <section className={`section-card future-sim ${future.safe ? 'good' : 'bad'}`}>
            <div className="section-head">
              <div>
                <p className="kicker">FUTURE SIMULATION</p>
                <h2>等速度運動による未来予測</h2>
              </div>
            </div>
            <p className={`future-text ${future.safe ? 'good' : 'bad'}`}>{future.message}</p>
            <div className="future-meta">
              <span>直近3日平均: {formatNumber(future.speed, 1)} {progress.unit}/日</span>
              <span>試験当日予測: {formatNumber(future.predictedTotal, 1)} {progress.unit}</span>
            </div>
          </section>

          <section className={`section-card buffer-card ${state.bufferNotice.mode}`}>
            <div className="section-head">
              <div>
                <p className="kicker">CRITICAL BUFFER</p>
                <h2>パンク回避システム</h2>
              </div>
            </div>
            <p className="buffer-text">{state.bufferNotice.message}</p>
            <div className="buffer-meta">
              <span>限界キャパ: {formatNumber(state.bufferNotice.capacity, 0)} {state.todoUnit || '単位'}</span>
              <span>負荷率: {formatNumber(state.bufferNotice.load, 1)}%</span>
              <span>自動分散: {state.bufferNotice.movedCount}件</span>
            </div>
          </section>

          <section className="section-card">
            <div className="section-head">
              <div>
                <p className="kicker">FORGETTING CURVE</p>
                <h2>忘却曲線ToDo登録</h2>
              </div>
            </div>
            <form
              className="task-form"
              onSubmit={(event) => {
                event.preventDefault()
                addTask()
              }}
            >
              <div className="task-grid">
                <input
                  className="control"
                  type="text"
                  placeholder="参考書・単語帳など"
                  value={state.taskName}
                  onChange={(event) => update('taskName', event.target.value)}
                />
                <input
                  className="control"
                  type="number"
                  min="0"
                  step="0.1"
                  placeholder="量"
                  value={state.taskAmount}
                  onChange={(event) => update('taskAmount', event.target.value)}
                />
                <input
                  className="control"
                  type="text"
                  placeholder="単位"
                  value={state.taskUnit}
                  onChange={(event) => update('taskUnit', event.target.value)}
                />
              </div>
              <div className="task-grid">
                <input
                  className="control"
                  type="date"
                  value={state.taskStartDate}
                  onChange={(event) => update('taskStartDate', event.target.value)}
                />
                <button className="primary-button" type="submit">
                  登録
                </button>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => update('taskStartDate', toDateKey(new Date()))}
                >
                  今日
                </button>
              </div>
            </form>
            <div className="task-list">
              {state.tasks.length === 0 ? (
                <p className="empty">登録済みToDoはありません</p>
              ) : (
                state.tasks
                  .slice()
                  .reverse()
                  .map((task) => (
                    <article key={task.id} className="task-item">
                      <div>
                        <p className="task-title">{task.name}</p>
                        <p className="task-meta">
                          {formatNumber(Number(task.amount) || 0, 2)} {task.unit} / 開始 {task.startDate}
                        </p>
                      </div>
                      <div className="schedule">
                        {task.schedule.map((event) => (
                          <span
                            key={`${task.id}-${event.offset}`}
                            className={`badge ${event.date === toDateKey(new Date()) ? 'today' : ''}`}
                          >
                            {event.label} {formatShortDate(event.date)}
                          </span>
                        ))}
                      </div>
                      <button className="danger-button" type="button" onClick={() => removeTask(task.id)}>
                        削除
                      </button>
                    </article>
                  ))
              )}
            </div>
          </section>

          <section className="section-card">
            <div className="section-head">
              <div>
                <p className="kicker">STUDY TUBE</p>
                <h2>許可チャンネル空間</h2>
              </div>
            </div>

            <form
              className="channel-form"
              onSubmit={(event) => {
                event.preventDefault()
                addAllowedChannel()
              }}
            >
              <input
                className="control"
                type="text"
                placeholder="YouTubeのチャンネルURL または UC... ID"
                value={state.channelInput}
                onChange={(event) => update('channelInput', event.target.value)}
              />
              <div className="channel-grid">
                <input
                  className="control"
                  type="text"
                  placeholder="表示名（任意）"
                  value={state.channelName}
                  onChange={(event) => update('channelName', event.target.value)}
                />
                <button className="primary-button" type="submit">
                  許可チャンネル登録
                </button>
              </div>
            </form>

            <div className="channel-tabs">
              {state.allowedChannels.length === 0 ? (
                <p className="empty">まだ許可チャンネルがありません</p>
              ) : (
                state.allowedChannels.map((channel) => (
                  <button
                    key={channel.id}
                    type="button"
                    className={`channel-tab ${
                      channel.channelId === state.selectedChannelId ? 'active' : ''
                    }`}
                    onClick={() => selectChannel(channel.channelId)}
                  >
                    <span>{channel.name}</span>
                    <span className="channel-mini">{channel.channelId}</span>
                  </button>
                ))
              )}
            </div>

            {selectedChannel ? (
              <div className="player-shell">
                <div className="player-meta">
                  <span>{selectedChannel.name}</span>
                  <span>Playlist: {selectedPlaylistId}</span>
                  <span>Uploader only</span>
                </div>
                <iframe
                  className="study-frame"
                  src={playerSrc}
                  title={`${selectedChannel.name} - YouTube playlist`}
                  allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => removeAllowedChannel(selectedChannel.channelId)}
                  style={{ marginTop: 12 }}
                >
                  このチャンネルを外す
                </button>
              </div>
            ) : (
              <p className="subtle" style={{ marginTop: 12 }}>
                チャンネルを登録すると、そのアップロード一覧だけを再生できます。
              </p>
            )}
          </section>
        </section>
      </section>
    </main>
  )
}

function Field({ label, children }: FieldProps) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-bold text-zinc-300">{label}</span>
      {children}
    </label>
  )
}

function Metric({ label, value, unit }: MetricProps) {
  return (
    <article className="metric border border-zinc-800 bg-zinc-950/80 p-5">
      <p className="text-sm font-bold text-zinc-400">{label}</p>
      <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-1">
        <span className="pb-2 text-lg font-black text-zinc-300">あと</span>
        <strong className="metric-value font-black tabular-nums text-red-500">
          {value}
        </strong>
        <span className="pb-2 text-2xl font-black text-orange-300">
          {unit}
        </span>
      </div>
      <div className="mt-4 h-1 overflow-hidden rounded bg-zinc-800">
        <div className="burn-bar h-full rounded bg-red-500" />
      </div>
    </article>
  )
}

function getDefaultState(): State {
  let date = new Date()
  date.setDate(date.getDate() + 45)
  date.setHours(9, 0, 0, 0)

  return normalizeState({
    examAt: toInputValue(date),
    sleepHours: '7',
    todoAmount: '300',
    todoUnit: 'ページ',
    dailyLimit: '20',
    alarmTime: '07:00',
    lastSpokenDate: '',
    planStartedAt: new Date().toISOString(),
    initialDailyQuota: 0,
    todayDoneAmount: '',
    taskName: '',
    taskAmount: '',
    taskUnit: '',
    taskStartDate: toDateKey(new Date()),
    channelInput: '',
    channelName: '',
    selectedChannelId: '',
    allowedChannels: [] as AllowedChannel[],
    tasks: [] as Task[],
    doneEvents: {} as Record<string, boolean>,
    dailyLogs: [] as DailyLog[],
    bufferNotice: {
      mode: 'safe',
      capacity: 20,
      load: 0,
      movedCount: 0,
      date: toDateKey(new Date()),
      message: '【安全】本日の総タスク量は限界キャパシティ内に収まっています。現在の負荷率: 0.0%',
    },
  })
}

function normalizeState(current: State): State {
  let next = {
    ...current,
    tasks: Array.isArray(current.tasks) ? current.tasks : [],
    doneEvents: current.doneEvents && typeof current.doneEvents === 'object' ? current.doneEvents : {},
    dailyLogs: normalizeDailyLogs(current.dailyLogs),
    todayDoneAmount: current.todayDoneAmount ?? '',
    taskName: current.taskName ?? '',
    taskAmount: current.taskAmount ?? '',
    taskUnit: current.taskUnit ?? '',
    dailyLimit: current.dailyLimit || '20',
    taskStartDate: current.taskStartDate || toDateKey(new Date()),
    channelInput: current.channelInput ?? '',
    channelName: current.channelName ?? '',
    selectedChannelId: current.selectedChannelId ?? '',
    allowedChannels: normalizeAllowedChannels(current.allowedChannels),
    initialDailyQuota: Number(current.initialDailyQuota) || 0,
    bufferNotice: normalizeBufferNotice(current.bufferNotice, Number(current.dailyLimit) || 20),
  }

  if (!isValidDate(next.planStartedAt)) {
    next.planStartedAt = new Date().toISOString()
  }

  if (!next.initialDailyQuota) {
    next.initialDailyQuota = computeInitialDailyQuota(next)
  }

  if (!next.selectedChannelId && next.allowedChannels.length > 0) {
    next.selectedChannelId = next.allowedChannels[0].channelId
  }

  return next
}

function normalizeDailyLogs(value: any): DailyLog[] {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item && typeof item.date === 'string')
      .map((item) => ({
        date: item.date,
        amount: Number(item.amount) || 0,
        updatedAt: item.updatedAt || '',
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }

  if (value && typeof value === 'object') {
    return Object.entries(value)
      .map(([date, item]) => ({
        date,
        amount: Number((item as any) && (item as any).amount) || 0,
        updatedAt: ((item as any) && (item as any).updatedAt) || '',
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }

  return []
}

function normalizeAllowedChannels(value: any): AllowedChannel[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((item) => item && typeof item.channelId === 'string')
    .map((item, index) => ({
      id: typeof item.id === 'string' && item.id ? item.id : `channel-${index}`,
      name:
        typeof item.name === 'string' && item.name
          ? item.name
          : item.channelId,
      channelId: item.channelId,
    }))
}

function parseChannelInput(channelInput: string, channelName: string) {
  let trimmed = channelInput.trim()
  let match = trimmed.match(/(UC[a-zA-Z0-9_-]{8,})/)

  if (!match) {
    return null
  }

  let channelId = match[1]
  let name = channelName.trim() || `Channel ${channelId.slice(-6)}`

  return {
    id: makeChannelId(channelId),
    name,
    channelId,
  }
}

function toUploadPlaylistId(channelId: string) {
  if (!channelId.startsWith('UC')) {
    return channelId
  }

  return `UU${channelId.slice(2)}`
}

function makeChannelId(channelId: string) {
  return `channel-${channelId}`
}

function normalizeBufferNotice(value: any, capacity: number): BufferNotice {
  let safeCapacity = Number.isFinite(capacity) && capacity > 0 ? capacity : 20
  let todayKey = toDateKey(new Date())

  if (!value || typeof value !== 'object') {
    return {
      mode: 'safe',
      capacity: safeCapacity,
      load: 0,
      movedCount: 0,
      date: todayKey,
      message: `【安全】本日の総タスク量は限界キャパシティ内に収まっています。現在の負荷率: 0.0%`,
    }
  }

  return {
    mode: (value.mode === 'adjusted' || value.mode === 'overflow'
      ? value.mode
      : 'safe') as BufferNotice['mode'],
    capacity: Number(value.capacity) || safeCapacity,
    load: Number(value.load) || 0,
    movedCount: Number(value.movedCount) || 0,
    date: typeof value.date === 'string' ? value.date : todayKey,
    message:
      typeof value.message === 'string' && value.message
        ? value.message
        : `【安全】本日の総タスク量は限界キャパシティ内に収まっています。現在の負荷率: 0.0%`,
  }
}

function isSameBufferSnapshot(current: State, next: State) {
  return (
    serializeTaskPlan(current.tasks) === serializeTaskPlan(next.tasks) &&
    current.bufferNotice.mode === next.bufferNotice.mode &&
    current.bufferNotice.capacity === next.bufferNotice.capacity &&
    current.bufferNotice.load === next.bufferNotice.load &&
    current.bufferNotice.movedCount === next.bufferNotice.movedCount &&
    current.bufferNotice.message === next.bufferNotice.message &&
    current.bufferNotice.date === next.bufferNotice.date
  )
}

function serializeTaskPlan(tasks: Task[]) {
  return JSON.stringify(
    tasks.map((task) => ({
      id: task.id,
      schedule: task.schedule.map((event) => ({
        offset: event.offset,
        date: event.date,
      })),
    })),
  )
}

function normalizeCriticalBuffer(data: State, todayKey: string): State {
  let limit = Math.max(1, Number(data.dailyLimit) || 20)
  let nextTasks = cloneTasks(data.tasks)
  let movedCount = 0
  let dayMap = new Map<string, BufferEventRef[]>()
  let currentKey = todayKey
  let maxKey = todayKey

  nextTasks.forEach((task, taskIndex) => {
    task.schedule.forEach((event, eventIndex) => {
      let eventKey = `${task.id}:${event.offset}`
      if (data.doneEvents[eventKey] || event.date < todayKey) {
        return
      }

      let ref: BufferEventRef = {
        taskIndex,
        eventIndex,
        taskId: task.id,
        offset: event.offset,
        amount: Number(task.amount) || 0,
        date: event.date,
      }

      pushDayBucket(dayMap, event.date, ref)

      if (event.date > maxKey) {
        maxKey = event.date
      }
    })
  })

  while (currentKey <= maxKey) {
    let bucket = (dayMap.get(currentKey) || []).slice()
    bucket.sort(compareBufferPriority)

    let total = sumBufferAmount(bucket)
    while (total > limit && bucket.length > 0) {
      let moved = bucket.pop()!
      let nextDate = addDays(currentKey, 1)
      let task = nextTasks[moved.taskIndex]
      task.schedule[moved.eventIndex].date = nextDate
      moved.date = nextDate
      pushDayBucket(dayMap, nextDate, moved)
      movedCount += 1
      total -= moved.amount
      if (nextDate > maxKey) {
        maxKey = nextDate
      }
    }

    dayMap.set(currentKey, bucket)
    currentKey = addDays(currentKey, 1)
  }

  let todayItems = (dayMap.get(todayKey) || []).slice().sort(compareBufferPriority)
  let todayTotal = sumBufferAmount(todayItems)
  let load = limit > 0 ? (todayTotal / limit) * 100 : 0
  let safeUnit = data.todoUnit.trim() || '単位'

  if (movedCount > 0) {
    return {
      ...data,
      tasks: nextTasks,
      bufferNotice: {
        mode: 'adjusted',
        capacity: limit,
        load,
        movedCount,
        date: todayKey,
        message: `【防壁発動】本日の復習タスクが限界キャパ（${formatNumber(limit, 0)} ${safeUnit}）を超えたため、${movedCount}件のタスクを翌日以降に自動で安全分散しました。システムはあなたのオーバーヒートを防止しています。`,
      },
    }
  }

  if (todayTotal > limit) {
    return {
      ...data,
      bufferNotice: {
        mode: 'overflow',
        capacity: limit,
        load,
        movedCount: 0,
        date: todayKey,
        message: `【警告】本日の総タスク量が限界キャパ（${formatNumber(limit, 0)} ${safeUnit}）を超えています。これ以上の安全分散ができません。`,
      },
    }
  }

  if (
    data.bufferNotice.mode === 'adjusted' &&
    data.bufferNotice.date === todayKey &&
    data.bufferNotice.capacity === limit
  ) {
    return data
  }

  return {
    ...data,
    bufferNotice: {
      mode: 'safe',
      capacity: limit,
      load,
      movedCount: 0,
      date: todayKey,
      message: `【安全】本日の総タスク量は限界キャパシティ内に収まっています。現在の負荷率: ${formatNumber(load, 1)}%`,
    },
  }
}

function cloneTasks(tasks: Task[]): Task[] {
  return tasks.map((task) => ({
    ...task,
    schedule: task.schedule.map((event) => ({
      ...event,
    })),
  }))
}

function pushDayBucket(map: Map<string, BufferEventRef[]>, date: string, ref: BufferEventRef) {
  let bucket = map.get(date)
  if (!bucket) {
    bucket = []
    map.set(date, bucket)
  }

  bucket.push(ref)
}

function compareBufferPriority(a: BufferEventRef, b: BufferEventRef) {
  if (a.offset !== b.offset) {
    return a.offset - b.offset
  }

  if (a.taskIndex !== b.taskIndex) {
    return a.taskIndex - b.taskIndex
  }

  return a.eventIndex - b.eventIndex
}

function sumBufferAmount(items: BufferEventRef[]) {
  return items.reduce((sum, item) => sum + item.amount, 0)
}

function getMetrics(data: State, now: number) {
  let examMs = new Date(data.examAt).getTime()
  let diffMs = examMs - now
  let ended = !Number.isFinite(examMs) || diffMs <= 0
  let safeDiff = ended ? 0 : diffMs
  let days = safeDiff / DAY_MS
  let totalHours = safeDiff / HOUR_MS
  let sleepHours = Number(data.sleepHours) || 0
  let todoAmount = Number(data.todoAmount) || 0
  let effectiveHours = Math.max(0, totalHours - days * sleepHours)
  let quota = days > 0 ? todoAmount / days : 0
  let unit = data.todoUnit.trim() || '単位'

  return {
    days,
    totalHours,
    effectiveHours,
    quota,
    unit,
    ended,
  }
}

function getProgress(data: State, now: number): Progress {
  let total = Number(data.todoAmount) || 0
  let actual = data.dailyLogs.reduce((sum, log) => {
    return sum + (Number(log.amount) || 0)
  }, 0)
  let expected = computeIdealAccumulated(data, now)
  let actualPercent = total > 0 ? (actual / total) * 100 : 0
  let expectedPercent = total > 0 ? (expected / total) * 100 : 0
  let debt = actual - expected
  let debtPercent = total > 0 ? (debt / total) * 100 : 0

  return {
    total,
    actual,
    expected,
    debt,
    debtPercent,
    actualPercent,
    expectedPercent,
    unit: data.todoUnit.trim() || '単位',
  }
}

function getFutureSimulation(
  data: State,
  now: number,
  progress: Progress,
  metrics: ReturnType<typeof getMetrics>,
) {
  let total = Number(data.todoAmount) || 0
  let speed = getCurrentSpeed(data, now)
  let predictedTotal = progress.actual + speed * Math.max(metrics.days, 0)
  let unfinished = total - predictedTotal

  if (unfinished > 0) {
    return {
      safe: false,
      speed,
      predictedTotal,
      unfinished,
      buffer: 0,
      message: `【警告】現在のペース（直近3日平均: ${formatNumber(speed, 1)} ${progress.unit}/日）を続けると、試験当日に【 ${formatNumber(unfinished, 1)} ${progress.unit} 】未完了で終わります。現在の速度では未来のあなたを救えません。`,
    }
  }

  return {
    safe: true,
    speed,
    predictedTotal,
    unfinished,
    buffer: Math.abs(unfinished),
    message: `【順調】現在のペース（直近3日平均: ${formatNumber(speed, 1)} ${progress.unit}/日）を維持すれば、試験日までにすべて完了します。（予測バッファ: ＋${formatNumber(Math.abs(unfinished), 1)} ${progress.unit}）`,
  }
}

function getCurrentSpeed(data: State, now: number) {
  let todayMs = startOfDateKey(toDateKey(new Date(now))).getTime()
  let startMs = startOfDateKey(toDateKey(new Date(data.planStartedAt))).getTime()

  if (!Number.isFinite(todayMs) || !Number.isFinite(startMs) || todayMs < startMs) {
    return Number(data.initialDailyQuota) || 0
  }

  let daysSinceStart = Math.floor((todayMs - startMs) / DAY_MS) + 1
  let recentStartMs = todayMs - 2 * DAY_MS
  let recentTotal = data.dailyLogs
    .filter((log) => {
      let logMs = startOfDateKey(log.date).getTime()
      return logMs >= recentStartMs && logMs <= todayMs
    })
    .reduce((sum, log) => sum + (Number(log.amount) || 0), 0)

  if (daysSinceStart < 3) {
    return getAllDaysAverageSpeed(data, daysSinceStart)
  }

  return recentTotal / 3
}

function getAllDaysAverageSpeed(data: State, daysSinceStart: number) {
  let total = data.dailyLogs.reduce((sum, log) => {
    return sum + (Number(log.amount) || 0)
  }, 0)

  if (total <= 0) {
    return Number(data.initialDailyQuota) || 0
  }

  return total / Math.max(1, daysSinceStart)
}

function getTodayAgenda(data: State): TodayAgenda {
  let today = toDateKey(new Date())
  let items: AgendaItem[] = []

  data.tasks.forEach((task) => {
    task.schedule.forEach((event) => {
      if (event.date !== today) {
        return
      }

      let key = `${task.id}:${event.offset}`
      items.push({
        ...event,
        key,
        taskId: task.id,
        name: task.name,
        amount: Number(task.amount) || 0,
        unit: task.unit || data.todoUnit || '単位',
        done: Boolean(data.doneEvents[key]),
      })
    })
  })

  let pending = items.filter((item) => !item.done)
  let sortedItems = items.slice().sort((a, b) => {
    if (a.offset !== b.offset) {
      return a.offset - b.offset
    }

    return a.taskId.localeCompare(b.taskId)
  })

  return {
    items: sortedItems,
    totalByUnit: sumByUnit(items),
    remainingByUnit: sumByUnit(pending),
    newCount: sortedItems.filter((item) => item.offset === 0).length,
    reviewCount: sortedItems.filter((item) => item.offset > 0).length,
  }
}

function getDailyRecord(data: State, dateKey: string): DailyLog | null {
  for (let index = data.dailyLogs.length - 1; index >= 0; index -= 1) {
    if (data.dailyLogs[index].date === dateKey) {
      return data.dailyLogs[index]
    }
  }

  return null
}

function recordTodayActual(data: State, nextAmount: any): State {
  let amount = Number(nextAmount)

  if (!Number.isFinite(amount) || amount < 0) {
    return data
  }

  let today = toDateKey(new Date())
  let nextLogs = data.dailyLogs.filter((log) => log.date !== today)

  nextLogs.push({
    date: today,
    amount,
    updatedAt: new Date().toISOString(),
  })

  nextLogs.sort((a, b) => a.date.localeCompare(b.date))

  return {
    ...data,
    dailyLogs: nextLogs,
  }
}

function speakToday(data: State, onDone?: () => void) {
  let canSpeak =
    'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window

  if (!canSpeak) {
    return
  }

  let agenda = getTodayAgenda(data)
  let metrics = getMetrics(data, Date.now())
  let todoText = formatAmountMap(agenda.remainingByUnit, data.todoUnit)
  let quotaText = `${formatNumber(metrics.quota, 2)} ${metrics.unit}`
  let text = `おはようございます。今日の変位目標を達成するために、本日消化すべきタスクは${todoText}です。試験に間に合わせる最低ノルマは${quotaText}です。サボると未来の自分が詰みます。頑張りましょう。`
  let utterance = new SpeechSynthesisUtterance(text)

  utterance.lang = 'ja-JP'
  utterance.rate = 1.02
  utterance.pitch = 0.95
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utterance)

  if (onDone) {
    onDone()
  }
}

function computeInitialDailyQuota(data: State) {
  let startMs = new Date(data.planStartedAt).getTime()
  let examMs = new Date(data.examAt).getTime()
  let total = Number(data.todoAmount) || 0

  if (!Number.isFinite(startMs) || !Number.isFinite(examMs) || examMs <= startMs) {
    return 0
  }

  let remainingDays = (examMs - startMs) / DAY_MS

  return remainingDays > 0 ? total / remainingDays : 0
}

function computeIdealAccumulated(data: State, now: number) {
  let startKey = toDateKey(new Date(data.planStartedAt))
  let todayKey = toDateKey(new Date(now))
  let startMs = startOfDateKey(startKey).getTime()
  let todayMs = startOfDateKey(todayKey).getTime()

  if (!Number.isFinite(startMs) || !Number.isFinite(todayMs) || todayMs < startMs) {
    return 0
  }

  let elapsedDays = Math.floor((todayMs - startMs) / DAY_MS)
  let quota = Number(data.initialDailyQuota) || 0

  return quota * (elapsedDays + 1)
}

function sumByUnit(items: Array<{ unit?: string; amount?: number }>) {
  return items.reduce((map, item) => {
    let unit = item.unit || '単位'
    let amount = Number(item.amount) || 0
    map[unit] = (map[unit] || 0) + amount
    return map
  }, {} as Record<string, number>)
}

function formatAmountMap(map: Record<string, number>, fallbackUnit: string) {
  let entries = Object.entries(map).filter((entry) => Number(entry[1]) > 0)

  if (entries.length === 0) {
    return `0 ${fallbackUnit || '単位'}`
  }

  return entries
    .map(([unit, amount]) => `${formatNumber(amount, 2)} ${unit}`)
    .join(' + ')
}

function addDays(dateKey, days) {
  let date = startOfDateKey(dateKey)
  date.setDate(date.getDate() + days)
  return toDateKey(date)
}

function startOfDateKey(dateKey) {
  let parts = dateKey.split('-').map(Number)
  return new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0)
}

function toDateKey(date) {
  let year = date.getFullYear()
  let month = String(date.getMonth() + 1).padStart(2, '0')
  let day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function toInputValue(date) {
  let offsetMs = date.getTimezoneOffset() * 60 * 1000
  let local = new Date(date.getTime() - offsetMs)
  return local.toISOString().slice(0, 16)
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function isValidDate(value) {
  return Number.isFinite(new Date(value).getTime())
}

function formatNumber(value, digits) {
  return new Intl.NumberFormat('ja-JP', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

function formatTarget(value) {
  let date = new Date(value)

  if (!Number.isFinite(date.getTime())) {
    return '未設定'
  }

  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatShortDate(dateKey) {
  let date = startOfDateKey(dateKey)
  return new Intl.DateTimeFormat('ja-JP', {
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

const pageStyles = `
  .input-panel,
  .metric,
  .section-card,
  .deadline {
    border-radius: 8px;
  }

  .control {
    min-height: 46px;
    width: 100%;
    border: 1px solid rgb(63 63 70);
    border-radius: 6px;
    background: rgb(24 24 27);
    padding: 0 12px;
    color: white;
    outline: none;
  }

  .control:focus {
    border-color: rgb(248 113 113);
    box-shadow: 0 0 0 3px rgb(239 68 68 / 0.18);
  }

  .split-control {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 10px;
  }

  .split-control span {
    color: rgb(212 212 216);
    font-weight: 800;
  }

  .todo-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(92px, 0.6fr);
    gap: 10px;
  }

  .task-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(90px, 0.7fr) minmax(88px, 0.65fr);
    gap: 10px;
  }

  .log-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
  }

  .record-form {
    display: grid;
    gap: 10px;
    margin-top: 16px;
  }

  .deadline-strip {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .deadline-strip span {
    color: rgb(254 202 202);
    font-weight: 900;
  }

  .deadline-strip strong {
    color: white;
    font-size: 1.1rem;
  }

  .timer-grid {
    display: grid;
    gap: 16px;
  }

  .metric-value {
    font-size: 3rem;
    line-height: 0.9;
    text-shadow: 0 0 18px rgb(239 68 68 / 0.65);
    animation: danger-pulse 850ms ease-in-out infinite;
  }

  .burn-bar {
    animation: burn 1200ms linear infinite;
    transform-origin: left;
  }

  .quota-title {
    margin-top: 12px;
    color: #fff;
    font-size: 1.55rem;
    font-weight: 1000;
    line-height: 1.35;
  }

  .summary-number {
    color: #fb923c;
    font-size: 2rem;
    font-weight: 1000;
    line-height: 1;
  }

  .speech-actions {
    display: grid;
    grid-template-columns: minmax(180px, 0.8fr) minmax(0, 1fr);
    align-items: end;
    gap: 10px;
  }

  .agenda-summary {
    display: grid;
    gap: 10px;
    margin-bottom: 14px;
  }

  .due-list,
  .task-list {
    display: grid;
    gap: 10px;
  }

  .due-item,
  .task-item {
    border: 1px solid #27272a;
    border-radius: 8px;
    background: rgba(24, 24, 27, 0.78);
    padding: 12px;
  }

  .due-item {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    gap: 12px;
  }

  .due-item.done {
    border-color: rgba(34, 197, 94, 0.35);
    background: rgba(20, 83, 45, 0.18);
  }

  .due-title,
  .task-title {
    color: #fff;
    font-weight: 900;
    line-height: 1.35;
  }

  .due-meta,
  .task-meta {
    margin-top: 4px;
    color: #a1a1aa;
    font-size: 0.84rem;
    font-weight: 800;
  }

  .empty {
    border: 1px dashed #3f3f46;
    border-radius: 8px;
    padding: 16px;
    color: #a1a1aa;
    font-weight: 800;
  }

  .task-form {
    display: grid;
    gap: 10px;
    margin-bottom: 16px;
  }

  .schedule {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .badge {
    border: 1px solid #3f3f46;
    border-radius: 6px;
    padding: 6px 8px;
    color: #d4d4d8;
    font-size: 0.78rem;
    font-weight: 900;
  }

  .badge.today {
    border-color: rgba(251, 146, 60, 0.55);
    background: rgba(251, 146, 60, 0.12);
    color: #fed7aa;
  }

  .progress-value {
    margin-top: 10px;
    color: #fff;
    font-size: 2rem;
    font-weight: 1000;
    line-height: 1;
  }

  .progress-track {
    position: relative;
    height: 12px;
    margin-top: 14px;
    overflow: hidden;
    border-radius: 999px;
    background: #27272a;
  }

  .progress-track span {
    display: block;
    width: 0%;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #dc2626, #fb923c);
    transition: width 180ms ease;
  }

  .dual-track {
    display: grid;
    gap: 8px;
    margin-top: 14px;
  }

  .track-label {
    display: grid;
    grid-template-columns: 64px minmax(0, 1fr);
    align-items: center;
    gap: 10px;
    color: #a1a1aa;
    font-size: 0.82rem;
    font-weight: 900;
  }

  .expected span {
    background: #52525b;
  }

  .drift {
    margin-top: 10px;
    font-size: 1.25rem;
    font-weight: 1000;
  }

  .drift.good {
    color: #86efac;
  }

  .drift.bad {
    color: #f87171;
  }

  .future-sim.good {
    border-color: rgba(34, 197, 94, 0.3);
    box-shadow:
      0 0 0 1px rgba(34, 197, 94, 0.08),
      0 24px 60px rgba(0, 0, 0, 0.35);
  }

  .future-sim.bad {
    border-color: rgba(239, 68, 68, 0.35);
    box-shadow:
      0 0 0 1px rgba(239, 68, 68, 0.08),
      0 24px 60px rgba(0, 0, 0, 0.35);
  }

  .future-text {
    margin-top: 8px;
    font-size: 1.15rem;
    font-weight: 900;
    line-height: 1.6;
  }

  .future-text.good {
    color: #86efac;
  }

  .future-text.bad {
    color: #f87171;
    animation: danger-pulse 900ms ease-in-out infinite;
  }

  .future-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 12px 18px;
    margin-top: 14px;
    color: #a1a1aa;
    font-size: 0.88rem;
    font-weight: 800;
  }

  .buffer-card.safe {
    border-color: rgba(34, 197, 94, 0.3);
  }

  .buffer-card.adjusted {
    border-color: rgba(59, 130, 246, 0.4);
    box-shadow:
      0 0 0 1px rgba(59, 130, 246, 0.08),
      0 24px 60px rgba(0, 0, 0, 0.35);
  }

  .buffer-card.overflow {
    border-color: rgba(239, 68, 68, 0.4);
  }

  .buffer-text {
    margin-top: 8px;
    font-size: 1.08rem;
    font-weight: 900;
    line-height: 1.6;
  }

  .buffer-card.safe .buffer-text {
    color: #86efac;
  }

  .buffer-card.adjusted .buffer-text {
    color: #93c5fd;
  }

  .buffer-card.overflow .buffer-text {
    color: #f87171;
    animation: danger-pulse 900ms ease-in-out infinite;
  }

  .buffer-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 12px 18px;
    margin-top: 14px;
    color: #a1a1aa;
    font-size: 0.88rem;
    font-weight: 800;
  }

  .channel-form {
    display: grid;
    gap: 10px;
    margin-top: 10px;
  }

  .channel-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
  }

  .channel-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 14px;
  }

  .channel-tab {
    display: grid;
    gap: 4px;
    border: 1px solid #334155;
    border-radius: 8px;
    background: rgba(15, 23, 42, 0.8);
    padding: 10px 12px;
    min-width: 180px;
    text-align: left;
  }

  .channel-tab.active {
    border-color: rgba(56, 189, 248, 0.7);
    background: rgba(8, 47, 73, 0.75);
    box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.12);
  }

  .channel-tab span:first-child {
    color: #e2e8f0;
    font-weight: 900;
  }

  .channel-mini {
    color: #94a3b8;
    font-size: 0.78rem;
    font-weight: 700;
    word-break: break-all;
  }

  .player-shell {
    margin-top: 14px;
    border: 1px solid #334155;
    border-radius: 8px;
    background: rgba(2, 6, 23, 0.9);
    padding: 12px;
  }

  .player-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 16px;
    margin-bottom: 10px;
    color: #94a3b8;
    font-size: 0.82rem;
    font-weight: 800;
  }

  .player-meta span:first-child {
    color: #7dd3fc;
  }

  .study-frame {
    width: 100%;
    aspect-ratio: 16 / 9;
    border: 0;
    border-radius: 8px;
    background: #020617;
  }

  .record-flash {
    animation: record-flash 900ms ease;
    border-color: rgba(34, 197, 94, 0.75) !important;
    box-shadow:
      0 0 0 1px rgba(34, 197, 94, 0.15),
      0 0 34px rgba(34, 197, 94, 0.22),
      0 24px 60px rgba(0, 0, 0, 0.35);
  }

  @media (min-width: 760px) {
    .timer-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .dashboard-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .metric-value {
      font-size: 4rem;
    }
  }

  @media (max-width: 560px) {
    .task-grid,
    .todo-grid {
      grid-template-columns: 1fr;
    }

    .speech-actions {
      grid-template-columns: 1fr;
    }
  }

  @keyframes danger-pulse {
    0%,
    100% {
      transform: translateY(0);
      filter: brightness(1);
    }

    50% {
      transform: translateY(-1px);
      filter: brightness(1.25);
    }
  }

  @keyframes burn {
    0% {
      transform: scaleX(1);
      opacity: 1;
    }

    100% {
      transform: scaleX(0.18);
      opacity: 0.45;
    }
  }

  @keyframes record-flash {
    0% {
      transform: scale(1);
      filter: brightness(1);
    }

    35% {
      transform: scale(1.01);
      filter: brightness(1.3);
    }

    100% {
      transform: scale(1);
      filter: brightness(1);
    }
  }
`

type Task = {
  id: string
  name: string
  amount: number
  unit: string
  startDate: string
  schedule: Array<{
    offset: number
    label: string
    date: string
  }>
}

type DailyLog = {
  date: string
  amount: number
  updatedAt: string
}

type State = {
  examAt: string
  sleepHours: string
  todoAmount: string
  todoUnit: string
  dailyLimit: string
  alarmTime: string
  lastSpokenDate: string
  planStartedAt: string
  initialDailyQuota: number
  todayDoneAmount: string
  taskName: string
  taskAmount: string
  taskUnit: string
  taskStartDate: string
  channelInput: string
  channelName: string
  selectedChannelId: string
  allowedChannels: AllowedChannel[]
  tasks: Task[]
  doneEvents: Record<string, boolean>
  dailyLogs: DailyLog[]
  bufferNotice: BufferNotice
}

type AgendaItem = {
  offset: number
  label: string
  date: string
  key: string
  taskId: string
  name: string
  amount: number
  unit: string
  done: boolean
}

type TodayAgenda = {
  items: AgendaItem[]
  totalByUnit: Record<string, number>
  remainingByUnit: Record<string, number>
  newCount: number
  reviewCount: number
}

type Progress = {
  total: number
  actual: number
  expected: number
  debt: number
  debtPercent: number
  actualPercent: number
  expectedPercent: number
  unit: string
}

type BufferNotice = {
  mode: 'safe' | 'adjusted' | 'overflow'
  capacity: number
  load: number
  movedCount: number
  date: string
  message: string
}

type BufferEventRef = {
  taskIndex: number
  eventIndex: number
  taskId: string
  offset: number
  amount: number
  date: string
}

type AllowedChannel = {
  id: string
  name: string
  channelId: string
}

type FieldProps = {
  label: string
  children: ReactNode
}

type MetricProps = {
  label: string
  value: string
  unit: string
}
