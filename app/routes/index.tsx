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

  let metrics = getMetrics(state, now)
  let progress = getProgress(state, now)
  let agenda = getTodayAgenda(state)
  let todayRecord = getDailyRecord(state, toDateKey(new Date()))
  let recordStatus = todayRecord
    ? `今日の記録: ${formatNumber(todayRecord.amount, 2)} ${progress.unit}`
    : '未記録'
  let driftPrefix = progress.drift >= 0 ? '+' : '-'
  let driftLabel =
    progress.drift >= 0
      ? `${driftPrefix}${formatNumber(progress.drift, 2)} ${progress.unit}進んでいます（順調！ / ${driftPrefix}${formatNumber(progress.driftPercent, 1)}%）`
      : `-${formatNumber(Math.abs(progress.drift), 2)} ${progress.unit}遅れています（危険！ / -${formatNumber(Math.abs(progress.driftPercent), 1)}%）`
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
              <p className="kicker">PLAN VS ACTUAL</p>
              <h2>予定との乖離度</h2>
              <p className={`drift ${progress.drift >= 0 ? 'good' : 'bad'}`}>{driftLabel}</p>
              <div className="dual-track">
                <div className="track-label">
                  <span>予定</span>
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
    alarmTime: '07:00',
    lastSpokenDate: '',
    planStartedAt: new Date().toISOString(),
    initialDailyQuota: 0,
    todayDoneAmount: '',
    taskName: '',
    taskAmount: '',
    taskUnit: '',
    taskStartDate: toDateKey(new Date()),
    tasks: [] as Task[],
    doneEvents: {} as Record<string, boolean>,
    dailyLogs: [] as DailyLog[],
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
    taskStartDate: current.taskStartDate || toDateKey(new Date()),
    initialDailyQuota: Number(current.initialDailyQuota) || 0,
  }

  if (!isValidDate(next.planStartedAt)) {
    next.planStartedAt = new Date().toISOString()
  }

  if (!next.initialDailyQuota) {
    next.initialDailyQuota = computeInitialDailyQuota(next)
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
  let drift = actual - expected
  let driftPercent = total > 0 ? (drift / total) * 100 : 0

  return {
    total,
    actual,
    expected,
    drift,
    driftPercent,
    actualPercent,
    expectedPercent,
    unit: data.todoUnit.trim() || '単位',
  }
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

  return {
    items,
    totalByUnit: sumByUnit(items),
    remainingByUnit: sumByUnit(pending),
    newCount: items.filter((item) => item.offset === 0).length,
    reviewCount: items.filter((item) => item.offset > 0).length,
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
  let startMs = new Date(data.planStartedAt).getTime()
  let examMs = new Date(data.examAt).getTime()

  if (!Number.isFinite(startMs) || !Number.isFinite(examMs) || examMs <= startMs) {
    return 0
  }

  let totalDays = (examMs - startMs) / DAY_MS
  let elapsedDays = clamp((now - startMs) / DAY_MS, 0, totalDays)
  let quota = Number(data.initialDailyQuota) || 0

  return quota * elapsedDays
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
  alarmTime: string
  lastSpokenDate: string
  planStartedAt: string
  initialDailyQuota: number
  todayDoneAmount: string
  taskName: string
  taskAmount: string
  taskUnit: string
  taskStartDate: string
  tasks: Task[]
  doneEvents: Record<string, boolean>
  dailyLogs: DailyLog[]
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
  drift: number
  driftPercent: number
  actualPercent: number
  expectedPercent: number
  unit: string
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
