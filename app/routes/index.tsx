import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { TriangleAlertIcon } from 'lucide-react'

const STORE_KEY = 'exam-countdown-v1'
const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000
const DEFAULT_SLEEP_HOURS = '7'
const DEFAULT_TODO_AMOUNT = '300'
const DEFAULT_TODO_UNIT = 'ページ'

export default function Page() {
  let [data, setData] = useState(getDefaultData)
  let [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let stored = window.localStorage.getItem(STORE_KEY)

    if (stored) {
      setData({
        ...getDefaultData(),
        ...JSON.parse(stored),
      })
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(data))
  }, [data])

  useEffect(() => {
    let frame = 0
    let tick = () => {
      setNow(Date.now())
      frame = window.requestAnimationFrame(tick)
    }

    frame = window.requestAnimationFrame(tick)

    return () => window.cancelAnimationFrame(frame)
  }, [])

  let metrics = getMetrics(data, now)
  let statusText = metrics.ended
    ? '終了しました。試験日時を未来に設定してください。'
    : '残り時間は今この瞬間も削られています。'

  function update(name, value) {
    setData((current) => ({
      ...current,
      [name]: value,
    }))
  }

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
                value={data.examAt}
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
                  value={data.sleepHours}
                  onChange={(event) =>
                    update('sleepHours', event.target.value)
                  }
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
                  value={data.todoAmount}
                  onChange={(event) =>
                    update('todoAmount', event.target.value)
                  }
                />
                <input
                  className="control"
                  type="text"
                  value={data.todoUnit}
                  placeholder="ページ"
                  onChange={(event) => update('todoUnit', event.target.value)}
                />
              </div>
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
            <strong>{formatTarget(data.examAt)}</strong>
          </div>

          <div className="timer-grid">
            <Metric
              label="試験までの残り日数"
              value={metrics.ended ? '0.000000' : formatNumber(metrics.days, 6)}
              unit="日"
            />
            <Metric
              label="試験までの総残り時間"
              value={
                metrics.ended ? '0.0000' : formatNumber(metrics.totalHours, 4)
              }
              unit="時間"
            />
            <Metric
              label="睡眠を除いた有効残り時間"
              value={
                metrics.ended
                  ? '0.0000'
                  : formatNumber(metrics.effectiveHours, 4)
              }
              unit="時間"
            />
          </div>

          <section className="quota-panel border border-zinc-800 bg-zinc-950/80 p-6">
            <p className="text-sm font-bold text-zinc-400">TODAY'S QUOTA</p>
            <h2 className="mt-3 text-2xl font-black leading-tight text-white sm:text-3xl">
              {metrics.ended
                ? '終了しました'
                : `試験に間に合わせるには、1日あたり ${formatNumber(
                    metrics.quota,
                    2,
                  )} ${metrics.unit} の消化が必要です`}
            </h2>
            <p className="mt-4 text-base text-zinc-400">
              入力内容は自動保存されます。ページを閉じても、次回そのまま再開できます。
            </p>
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
        <div className="burn-bar h-full rounded bg-red-500"></div>
      </div>
    </article>
  )
}

function getDefaultData() {
  let date = new Date()
  date.setDate(date.getDate() + 45)
  date.setHours(9, 0, 0, 0)

  return {
    examAt: toInputValue(date),
    sleepHours: DEFAULT_SLEEP_HOURS,
    todoAmount: DEFAULT_TODO_AMOUNT,
    todoUnit: DEFAULT_TODO_UNIT,
  }
}

function getMetrics(data, now) {
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

function toInputValue(date) {
  let offsetMs = date.getTimezoneOffset() * 60 * 1000
  let local = new Date(date.getTime() - offsetMs)

  return local.toISOString().slice(0, 16)
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

const pageStyles = `
  .input-panel,
  .metric,
  .quota-panel,
  .deadline-strip {
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

  @media (min-width: 760px) {
    .timer-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .metric-value {
      font-size: 4.5rem;
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
`

type FieldProps = {
  label: string
  children: ReactNode
}

type MetricProps = {
  label: string
  value: string
  unit: string
}
