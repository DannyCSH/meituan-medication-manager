import React, { useEffect, useMemo, useState } from 'react'

type TabKey = 'dashboard' | 'checkin' | 'plan' | 'inventory' | 'assistant'
type TaskStatus = 'pending' | 'done' | 'snoozed' | 'missed'
type LogAction = 'done' | 'snoozed' | 'missed'
type RiskLevel = 'normal' | 'warning' | 'danger'
type NoteType = 'feeling' | 'missedReason'

type Medication = { id: string; displayName: string; exampleName: string; doseText: string; frequencyText: string; dailyUsage: number; stockCount: number; lowStockThreshold: number; note: string }
type MedicationTask = { id: string; medicationId: string; date: string; time: string; consumeCount: number; status: TaskStatus; completedAt?: string; snoozedUntil?: string }
type AdherenceLog = { id: string; taskId: string; medicationId: string; action: LogAction; timestamp: string }
type DailyNote = { id: string; type: NoteType; label: string; detail?: string; timestamp: string }
type DayRecord = { date: string; planned: number; done: number; snoozed: number; missed: number }
type AppState = { user: { name: string; age: number; chronicDiseases: string[]; familyCareEnabled: boolean }; medications: Medication[]; tasks: MedicationTask[]; logs: AdherenceLog[]; dailyNotes: DailyNote[]; weekRecords: DayRecord[]; followUpDate: string; assistantOutput: string; futureModal: string | null }
type AppContext = { state: AppState; metrics: { total: number; done: number; pending: number; lowStock: number; weekPlanned: number; weekDone: number }; followUpDaysLeft: number; updateTaskStatus: (taskId: string, action: LogAction) => void; addDailyNote: (type: NoteType, label: string, detail?: string) => void; calibrateStock: (medicationId: string, value: number) => void; resetDemo: () => void; generateSummary: () => string; generateQuestions: () => string; runAssistantDemo: (kind: 'plan' | 'summary' | 'questions' | 'refuse') => void; setActiveTab: (tab: TabKey) => void; setState: React.Dispatch<React.SetStateAction<AppState>>; updateDayRecord: (date: string, patch: Partial<Omit<DayRecord, 'date'>>) => void }

const STORAGE_KEY = 'meituan-medication-manager-demo-v5'
const today = new Date().toISOString().slice(0, 10)
const addDays = (days: number) => { const date = new Date(); date.setDate(date.getDate() + days); return date.toISOString().slice(0, 10) }
const dateKey = (offset: number) => { const date = new Date(); date.setDate(date.getDate() + offset); return date.toISOString().slice(0, 10) }
const shortDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
const friendlyDate = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })
const feelingOptions = ['今天正常', '头晕', '胃不舒服', '心慌', '乏力', '睡不好', '低血糖感', '水肿', '咳嗽', '担心副作用']
const missedReasonOptions = ['忘记了', '外出没带药', '饭点变化', '不确定是否已经吃过', '药快没了', '担心吃了不舒服']

function defaultWeekRecords(): DayRecord[] {
  return [
    { date: dateKey(-6), planned: 4, done: 3, snoozed: 1, missed: 0 },
    { date: dateKey(-5), planned: 4, done: 4, snoozed: 0, missed: 0 },
    { date: dateKey(-4), planned: 4, done: 3, snoozed: 0, missed: 1 },
    { date: dateKey(-3), planned: 4, done: 4, snoozed: 0, missed: 0 },
    { date: dateKey(-2), planned: 4, done: 3, snoozed: 1, missed: 0 },
    { date: dateKey(-1), planned: 4, done: 3, snoozed: 0, missed: 1 },
    { date: dateKey(0), planned: 4, done: 0, snoozed: 0, missed: 0 },
  ]
}

function normalizeWeekRecords(records?: DayRecord[]): DayRecord[] {
  const existing = new Map((records ?? []).map(day => [day.date, day]))
  return defaultWeekRecords().map(day => existing.get(day.date) ?? day)
}

function normalizeTasks(tasks?: MedicationTask[]): MedicationTask[] {
  const baseTasks = defaultState().tasks
  const existingTodayTasks = (tasks ?? []).filter(task => task.date === today)
  return baseTasks.map(baseTask => existingTodayTasks.find(task => task.id === baseTask.id) ?? baseTask)
}

function hydrateState(raw: string | null): AppState {
  const base = defaultState()
  if (!raw) return base
  const saved = JSON.parse(raw) as Partial<AppState>
  return { ...base, ...saved, weekRecords: normalizeWeekRecords(saved.weekRecords), tasks: normalizeTasks(saved.tasks) }
}

const defaultState = (): AppState => ({
  user: { name: '张阿姨', age: 58, chronicDiseases: ['高血压', '2 型糖尿病'], familyCareEnabled: false },
  medications: [
    { id: 'med-a', displayName: '降压药 A', exampleName: '示例：苯磺酸氨氯地平片', doseText: '每次 1 片', frequencyText: '每日 1 次，早 8:00', dailyUsage: 1, stockCount: 12, lowStockThreshold: 7, note: '演示样例，请以处方为准，以医生处方或药师指导为准。' },
    { id: 'med-b', displayName: '降糖药 B', exampleName: '示例：二甲双胍缓释片', doseText: '每次 1 片', frequencyText: '每日 2 次，早晚饭后', dailyUsage: 2, stockCount: 10, lowStockThreshold: 7, note: '演示样例，请以处方为准，以医生处方或药师指导为准。' },
    { id: 'med-c', displayName: '调脂药 C', exampleName: '示例：阿托伐他汀钙片', doseText: '每次 1 片', frequencyText: '每日 1 次，睡前', dailyUsage: 1, stockCount: 20, lowStockThreshold: 7, note: '演示样例，请以处方为准，以医生处方或药师指导为准。' },
  ],
  tasks: [
    { id: 'task-a-1', medicationId: 'med-a', date: today, time: '08:00', consumeCount: 1, status: 'pending' },
    { id: 'task-b-1', medicationId: 'med-b', date: today, time: '08:30', consumeCount: 1, status: 'pending' },
    { id: 'task-b-2', medicationId: 'med-b', date: today, time: '19:00', consumeCount: 1, status: 'pending' },
    { id: 'task-c-1', medicationId: 'med-c', date: today, time: '21:30', consumeCount: 1, status: 'pending' },
  ],
  logs: [],
  dailyNotes: [
    { id: 'note-1', type: 'feeling', label: '胃不舒服', timestamp: new Date().toISOString() },
    { id: 'note-2', type: 'missedReason', label: '外出没带药', timestamp: new Date().toISOString() },
  ],
  weekRecords: defaultWeekRecords(),
  followUpDate: addDays(12),
  assistantOutput: '想整理什么内容？我可以帮您把记录写清楚，但不会替医生做决定。',
  futureModal: null,
})

const tabs: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: 'dashboard', label: '首页', icon: '🏡' }, { key: 'checkin', label: '打卡', icon: '✅' }, { key: 'plan', label: '计划', icon: '📋' }, { key: 'inventory', label: '库存', icon: '💊' }, { key: 'assistant', label: '助手', icon: '💬' },
]
function getDaysLeft(stockCount: number, dailyUsage: number) { return dailyUsage <= 0 ? Number.POSITIVE_INFINITY : Math.floor(stockCount / dailyUsage) }
function getInventoryLevel(daysLeft: number): RiskLevel { if (daysLeft <= 3) return 'danger'; if (daysLeft <= 7) return 'warning'; return 'normal' }
function getFollowUpDaysLeft(followUpDate: string) { const target = new Date(`${followUpDate}T00:00:00`); const now = new Date(); now.setHours(0, 0, 0, 0); return Math.ceil((target.getTime() - now.getTime()) / 86_400_000) }
function formatTime(iso?: string) { return iso ? new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '' }
function classNames(...values: Array<string | false | undefined>) { return values.filter(Boolean).join(' ') }
function countNotes(notes: DailyNote[], type: NoteType) { return notes.filter(note => note.type === type).reduce<Record<string, number>>((acc, note) => ({ ...acc, [note.label]: (acc[note.label] || 0) + 1 }), {}) }
function formatCounts(counts: Record<string, number>) { const entries = Object.entries(counts); return entries.length ? entries.map(([label, count]) => `${label} ${count} 次`).join('，') : '暂无记录' }

export function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard')
  const [toast, setToast] = useState('')
  const [state, setState] = useState<AppState>(() => { try { return hydrateState(localStorage.getItem(STORAGE_KEY)) } catch { return defaultState() } })
  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(state)), [state])
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 2800); return () => window.clearTimeout(timer) }, [toast])
  const metrics = useMemo(() => { const total = state.tasks.length; const done = state.tasks.filter(task => task.status === 'done').length; const pending = state.tasks.filter(task => task.status === 'pending').length; const lowStock = state.medications.filter(med => getDaysLeft(med.stockCount, med.dailyUsage) <= med.lowStockThreshold).length; const weekPlanned = state.weekRecords.reduce((sum, day) => sum + day.planned, 0); const weekDone = state.weekRecords.reduce((sum, day) => sum + day.done, 0); return { total, done, pending, lowStock, weekPlanned, weekDone } }, [state])
  const followUpDaysLeft = getFollowUpDaysLeft(state.followUpDate)
  function showToast(message: string) { setToast(message) }
  function lowestStockMedication(items = state.medications) { return [...items].sort((a, b) => getDaysLeft(a.stockCount, a.dailyUsage) - getDaysLeft(b.stockCount, b.dailyUsage))[0] }
  function refillLine() { const medication = lowestStockMedication(); if (!medication) return '当前没有需要特别关注的药量记录。'; const daysLeft = getDaysLeft(medication.stockCount, medication.dailyUsage); return `${medication.displayName} 的记录药量预计还够 ${daysLeft} 天，可在复诊时请医生评估下一步安排。` }
  function updateTaskStatus(taskId: string, action: LogAction) {
    setState(current => {
      const task = current.tasks.find(item => item.id === taskId); if (!task) return current
      const medication = current.medications.find(item => item.id === task.medicationId); if (!medication) return current
      if (task.status === 'done' && action === 'done') { showToast('这次服药已经记好啦，不会重复扣库存。'); return current }
      if (action !== 'done' && task.status !== 'pending') { showToast('这条记录已经处理过啦，不会重复记录。'); return current }
      if (action === 'done' && medication.stockCount <= 0) { showToast('这里显示已经没有库存了，请先核对一下家里的实际药量。'); return current }
      const timestamp = new Date().toISOString()
      const nextTasks = current.tasks.map(item => item.id !== taskId ? item : action === 'done' ? { ...item, status: 'done' as const, completedAt: timestamp, snoozedUntil: undefined } : action === 'snoozed' ? { ...item, status: 'snoozed' as const, snoozedUntil: '30 分钟后' } : { ...item, status: 'missed' as const })
      const nextMedications = current.medications.map(item => item.id === medication.id && action === 'done' ? { ...item, stockCount: Math.max(0, item.stockCount - task.consumeCount) } : item)
      const nextLogs = [...current.logs, { id: `log-${Date.now()}`, taskId, medicationId: medication.id, action, timestamp }]
      if (action === 'done') showToast('好嘞，已记录今天的服药啦。')
      if (action === 'snoozed') showToast('已经帮您延后 30 分钟，这次不扣库存。')
      if (action === 'missed') showToast('已记下漏服，请别自行补服双倍剂量。')
      const nextWeekRecords = current.weekRecords.map(day => day.date === today && action === 'done' && task.status !== 'done' ? { ...day, done: Math.min(day.planned, day.done + 1) } : day.date === today && action === 'missed' && task.status === 'pending' ? { ...day, missed: day.missed + 1 } : day.date === today && action === 'snoozed' && task.status === 'pending' ? { ...day, snoozed: day.snoozed + 1 } : day)
      return { ...current, tasks: nextTasks, medications: nextMedications, logs: nextLogs, weekRecords: nextWeekRecords }
    })
  }
  function addDailyNote(type: NoteType, label: string, detail?: string) { setState(current => ({ ...current, dailyNotes: [...current.dailyNotes, { id: `note-${Date.now()}`, type, label, detail, timestamp: new Date().toISOString() }] })); showToast(type === 'feeling' ? '今天的小感受已经记下啦。' : '这次漏服原因已经记下啦。') }
  function updateDayRecord(date: string, patch: Partial<Omit<DayRecord, 'date'>>) {
    setState(current => ({ ...current, weekRecords: current.weekRecords.map(day => day.date === date ? { ...day, ...patch, done: Math.min(patch.done ?? day.done, patch.planned ?? day.planned) } : day) }))
  }
  function calibrateStock(medicationId: string, value: number) { setState(current => ({ ...current, medications: current.medications.map(item => item.id === medicationId ? { ...item, stockCount: Math.max(0, value) } : item) })); showToast('药量记录已更新。') }
  function resetDemo() { if (!window.confirm('当前记录将被清除，确定要恢复默认示例吗？')) return; const next = defaultState(); setState(next); localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setActiveTab('dashboard'); showToast('已恢复默认示例。') }
  function localSummary() {
    const planned = state.weekRecords.reduce((sum, day) => sum + day.planned, 0)
    const done = state.weekRecords.reduce((sum, day) => sum + day.done, 0)
    const missed = state.weekRecords.reduce((sum, day) => sum + day.missed, 0)
    const snoozed = state.weekRecords.reduce((sum, day) => sum + day.snoozed, 0)
    const rate = planned > 0 ? Math.round((done / planned) * 100) : 0
    return `近 7 天记录：计划 ${planned} 次，完成 ${done} 次，漏服 ${missed} 次，延后 ${snoozed} 次，完成率约 ${rate}%。\n${refillLine()}\n最近记录的小感受：${formatCounts(countNotes(state.dailyNotes, 'feeling'))}。\n记录过的漏服原因：${formatCounts(countNotes(state.dailyNotes, 'missedReason'))}。\n本摘要仅整理您的记录，不构成诊断、处方或治疗建议。`
  }
  function localQuestions() {
    const missed = state.weekRecords.reduce((sum, day) => sum + day.missed, 0)
    return `复诊时可向医生咨询：\n1. ${refillLine()}\n2. 近 7 天有 ${missed} 次漏服记录，其中原因包括：${formatCounts(countNotes(state.dailyNotes, 'missedReason'))}，是否需要调整提醒方式？\n3. 近期记录的小感受包括：${formatCounts(countNotes(state.dailyNotes, 'feeling'))}，是否需要向医生说明？\n\n本清单仅整理您的记录，不构成诊断、处方或治疗建议。`
  }
  function generateSummary() { const output = localSummary(); setState(current => ({ ...current, assistantOutput: output })); showToast('用药记录摘要已经整理好啦。'); return output }
  function generateQuestions() { const output = localQuestions(); setState(current => ({ ...current, assistantOutput: output })); showToast('列出复诊想问的事已经整理好啦。'); return output }
  function runAssistantDemo(kind: 'plan' | 'summary' | 'questions' | 'refuse') {
    if (kind === 'summary') { generateSummary(); return }
    if (kind === 'questions') { generateQuestions(); return }
    const output = kind === 'plan'
      ? '口述内容：医生让我早上吃降压药 A，早晚饭后吃降糖药 B。\n\n整理后的待核对计划：\n- 降压药 A：每日 1 次，早 8:00，等您核对处方。\n- 降糖药 B：每日 2 次，早晚饭后，等您核对处方。\n\n温馨提示：保存前请先核对医生处方。'
      : '我不能判断您是否可以停药、换药或调整剂量。请带近期记录咨询医生或药师，并以处方为准。如出现明显不适或紧急情况，请及时就医或拨打急救电话。'
    setState(current => ({ ...current, assistantOutput: output }))
  }
  const context: AppContext = { state, metrics, followUpDaysLeft, updateTaskStatus, addDailyNote, calibrateStock, resetDemo, generateSummary, generateQuestions, runAssistantDemo, setActiveTab, setState, updateDayRecord }
  return <main className="min-h-screen bg-[#fbf8f3] pb-28 text-[#4a3f35]"><div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:px-8"><AppHeader state={state} resetDemo={resetDemo} /><TabNav activeTab={activeTab} onChange={setActiveTab} /><section className="mt-6">{activeTab === 'dashboard' && <DashboardPage {...context} />}{activeTab === 'checkin' && <CheckInPage {...context} />}{activeTab === 'plan' && <MedicationPlanPage {...context} />}{activeTab === 'inventory' && <InventoryPage {...context} />}{activeTab === 'assistant' && <AssistantPage {...context} />}</section><SafetyNotice /></div>{toast && <div className="fixed bottom-24 left-1/2 z-50 max-w-[92vw] -translate-x-1/2 rounded-2xl bg-[#6f7f5f] px-5 py-3 text-center text-base font-semibold text-white shadow-xl shadow-amber-200/40">{toast}</div>}{state.futureModal && <Modal title="说明" onClose={() => setState(current => ({ ...current, futureModal: null }))}>{state.futureModal}</Modal>}</main>
}

function AppHeader({ state, resetDemo }: { state: AppState; resetDemo: () => void }) { return <header className="rounded-[2rem] bg-[#fffaf2] p-6 shadow-lg shadow-amber-100/50"><div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-base font-semibold text-[#7c6f64]">{friendlyDate}</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-[#4a3f35] sm:text-4xl">{state.user.name}，今天也慢慢来</h1><p className="mt-3 max-w-3xl text-lg leading-8 text-[#6d6257]">我会帮您记着今天的药、库存和复诊时间。用药决定还是听医生和药师的。</p></div><button onClick={resetDemo} className="min-h-12 rounded-2xl bg-[#e9dcc8] px-5 py-3 text-base font-bold text-[#5b4b3d] shadow-sm hover:bg-[#dfcfb7]">恢复默认数据（将清除记录）</button></div><div className="mt-5 flex flex-wrap gap-2 text-sm font-semibold">{['仅作记录', '不改药', '不替代医生', '演示数据'].map(label => <span key={label} className="rounded-full bg-[#f2eadf] px-3 py-1 text-[#6f5f50]">{label}</span>)}</div></header> }
function TabNav({ activeTab, onChange }: { activeTab: TabKey; onChange: (tab: TabKey) => void }) { return <nav className="fixed inset-x-3 bottom-3 z-30 rounded-[1.6rem] bg-[#fffaf2]/95 p-2 shadow-2xl shadow-amber-200/50 backdrop-blur md:sticky md:top-3 md:bottom-auto md:mt-5"><div className="grid grid-cols-5 gap-1">{tabs.map(tab => <button key={tab.key} onClick={() => onChange(tab.key)} className={classNames('min-h-12 rounded-2xl px-2 py-2 text-sm font-bold transition sm:text-base', activeTab === tab.key ? 'bg-[#d8c39f] text-[#4a3f35]' : 'text-[#7c6f64] hover:bg-[#f2eadf]')}><span className="block text-lg" aria-hidden="true">{tab.icon}</span>{tab.label}</button>)}</div></nav> }
function DashboardPage({ state, metrics, followUpDaysLeft, setActiveTab, setState, updateDayRecord }: AppContext) { const lowStockMedication = state.medications.find(med => getDaysLeft(med.stockCount, med.dailyUsage) <= med.lowStockThreshold); const nextTask = state.tasks.find(task => task.status === 'pending') ?? state.tasks[0]; const nextMedication = state.medications.find(item => item.id === nextTask?.medicationId); return <div className="space-y-6"><Card className="bg-gradient-to-br from-[#f4eadb] to-[#fff8ec]"><div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]"><div><p className="text-base font-semibold text-[#7c6f64]">今天还需要关注</p><p className="mt-2 text-5xl font-bold text-[#4a3f35]">{metrics.pending} 项</p><p className="mt-3 text-lg leading-8 text-[#6d6257]">完成一项，我会帮您记下来，也会同步更新药量记录。</p></div><div className="rounded-[1.5rem] bg-white/70 p-5"><p className="text-base font-semibold text-[#7c6f64]">下一次用药</p><h2 className="mt-2 text-3xl font-bold text-[#4a3f35]">{nextTask?.time} · {nextMedication?.displayName}</h2><button onClick={() => setActiveTab('checkin')} className="mt-5 min-h-12 rounded-2xl bg-[#8b9b74] px-5 py-3 text-lg font-bold text-white shadow-md shadow-lime-100">去打卡</button></div></div></Card><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><MetricCard title="今日已记" value={`${metrics.done}/${metrics.total}`} tone="sage" /><MetricCard title="近 7 天记录" value={`${metrics.weekDone}/${metrics.weekPlanned}`} tone="cream" /><MetricCard title="库存提醒" value={`${metrics.lowStock} 个`} tone={metrics.lowStock > 0 ? 'peach' : 'sage'} /><MetricCard title="下次复诊" value={followUpDaysLeft >= 0 ? `${followUpDaysLeft} 天` : `已过 ${Math.abs(followUpDaysLeft)} 天`} tone={followUpDaysLeft <= 7 ? 'peach' : 'cream'} /></div>{followUpDaysLeft < 0 && <Alert tone="danger" title="复诊日期已过">请手动更新复诊计划。本提示只帮您整理记录，不是医疗建议。</Alert>}{lowStockMedication && <Alert tone="warning" title="温柔提醒">{lowStockMedication.displayName} 的记录药量预计还够 {getDaysLeft(lowStockMedication.stockCount, lowStockMedication.dailyUsage)} 天。下次复诊时，可请医生评估下一步安排。</Alert>}<WeekRecordPanel records={state.weekRecords} updateDayRecord={updateDayRecord} /><Card><h2 className="text-xl font-bold">从今天到下次复诊</h2><p className="mt-3 rounded-2xl bg-[#f7efe5] p-4 text-base font-semibold leading-8 text-[#6d6257]">复诊建档 → 每日用药 → 打卡记录 → 小感受记录 → 列出复诊想问的事</p><div className="mt-4 grid gap-3 md:grid-cols-3"><ActionRow label="去记录今天的药" onClick={() => setActiveTab('checkin')} /><ActionRow label="看看库存还够几天" onClick={() => setActiveTab('inventory')} /><ActionRow label="整理复诊前问题" onClick={() => setActiveTab('assistant')} /></div></Card><Card><h2 className="text-xl font-bold">家属关怀未来规划</h2><p className="mt-2 leading-7 text-[#6d6257]">当前页面不生成分享链接，不传输药名、剂量或健康数据。未来如实现，也只在用户主动授权后共享完成状态。</p><button onClick={() => setState(current => ({ ...current, futureModal: '家属关怀还没有启用。当前页面不共享任何数据；以后如实现，也只在用户主动授权后共享完成状态和异常标记，不共享药名、剂量和库存。' }))} className="mt-4 min-h-12 rounded-2xl bg-[#f2eadf] px-5 py-3 font-bold text-[#665746]">查看隐私边界说明</button></Card></div> }
function CheckInPage({ state, updateTaskStatus, addDailyNote }: AppContext) { return <div className="space-y-5"><SectionTitle title="今天的用药记录" subtitle="记过一次就不会重复扣药量；小感受和原因都可以不填。" />{[...state.tasks].sort((a, b) => a.time.localeCompare(b.time)).map(task => <TaskCard key={task.id} task={task} medication={state.medications.find(item => item.id === task.medicationId)!} onAction={updateTaskStatus} />)}<QuickNotePanel title="今天有想记录的小感受吗？可不选" options={feelingOptions} type="feeling" addDailyNote={addDailyNote} /><QuickNotePanel title="如果今天有漏服，可以顺手记一下原因；可不选" options={missedReasonOptions} type="missedReason" addDailyNote={addDailyNote} /><RecentNotes notes={state.dailyNotes} /></div> }
function TaskCard({ task, medication, onAction }: { task: MedicationTask; medication: Medication; onAction: (taskId: string, action: LogAction) => void }) { const statusMap: Record<TaskStatus, { label: string; className: string; detail: string }> = { pending: { label: '待记录', className: 'bg-[#eef3e8] text-[#5f7050]', detail: '等您确认' }, done: { label: '已完成', className: 'bg-[#e3eedc] text-[#4f6b3e]', detail: `完成时间 ${formatTime(task.completedAt)}` }, snoozed: { label: '稍后再说', className: 'bg-[#fff0d8] text-[#8a6336]', detail: '已延后 30 分钟，不扣库存' }, missed: { label: '今天漏服', className: 'bg-[#fde9df] text-[#945239]', detail: '请别自行补服双倍剂量' } }; const status = statusMap[task.status]; return <Card><div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="rounded-2xl bg-[#f2eadf] px-3 py-1 text-lg font-bold text-[#5b4b3d]">{task.time}</span><span className={classNames('rounded-full px-3 py-1 text-sm font-bold', status.className)}>{status.label}</span></div><h3 className="mt-3 text-2xl font-bold text-[#4a3f35]">{medication.displayName}</h3><p className="mt-2 text-base leading-7 text-[#6d6257]">{medication.exampleName} · {medication.doseText} · {status.detail}</p></div><div className="grid gap-2 sm:grid-cols-3 lg:w-[440px]"><button disabled={task.status === 'done' || medication.stockCount <= 0} onClick={() => onAction(task.id, 'done')} className="min-h-12 rounded-2xl bg-[#8b9b74] px-4 py-3 text-lg font-bold text-white disabled:cursor-not-allowed disabled:bg-[#d7d0c5]">已服用</button><button disabled={task.status !== 'pending'} onClick={() => onAction(task.id, 'snoozed')} className="min-h-12 rounded-2xl bg-[#f2eadf] px-4 py-3 text-lg font-bold text-[#665746] disabled:cursor-not-allowed disabled:bg-[#ddd6cc]">稍后</button><button disabled={task.status !== 'pending'} onClick={() => onAction(task.id, 'missed')} className="min-h-12 rounded-2xl border border-[#e8b89f] bg-[#fff4ee] px-4 py-3 text-lg font-bold text-[#8a4f37] disabled:cursor-not-allowed disabled:bg-[#eee8e2]">漏服</button></div></div>{task.status === 'missed' && <p className="mt-4 rounded-2xl bg-[#fff4ee] p-4 font-semibold leading-7 text-[#8a4f37]">已记下今天漏服了。请不要自行补服双倍剂量；如不确定怎么处理，请咨询医生或药师。</p>}<p className="mt-3 text-sm font-semibold text-[#8a7c6f]">演示样例，请以处方为准。</p></Card> }
function QuickNotePanel({ title, options, type, addDailyNote }: { title: string; options: string[]; type: NoteType; addDailyNote: (type: NoteType, label: string, detail?: string) => void }) {
  const [selected, setSelected] = useState<string[]>([])
  const [other, setOther] = useState('')
  const toggle = (option: string) => setSelected(current => current.includes(option) ? current.filter(item => item !== option) : [...current, option])
  const save = () => {
    selected.forEach(option => addDailyNote(type, option))
    if (other.trim()) addDailyNote(type, '其他', other.trim())
    setSelected([])
    setOther('')
  }
  return <Card><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><h3 className="text-xl font-bold">{title}</h3><span className="text-sm font-semibold text-[#8a7c6f]">可多选，选好后再保存</span></div><div className="mt-4 flex flex-wrap gap-2">{options.map(option => { const active = selected.includes(option); return <button key={option} type="button" onClick={() => toggle(option)} className={classNames('min-h-11 rounded-full px-4 py-2 font-semibold transition', active ? 'bg-[#8b9b74] text-white shadow-sm' : 'bg-[#f2eadf] text-[#665746] hover:bg-[#e9dcc8]')} aria-pressed={active}>{active ? '✓ ' : ''}{option}</button> })}</div><div className="mt-4 flex flex-col gap-2 sm:flex-row"><input value={other} onChange={event => setOther(event.target.value)} placeholder="其他，可自己写一句" className="min-h-12 flex-1 rounded-2xl border border-[#e4d8c9] bg-white px-4 py-3 text-base" /><button type="button" onClick={save} disabled={selected.length === 0 && !other.trim()} className="min-h-12 rounded-2xl bg-[#8b9b74] px-5 py-3 font-bold text-white disabled:cursor-not-allowed disabled:bg-[#d7d0c5]">保存选择</button></div></Card> }
function RecentNotes({ notes }: { notes: DailyNote[] }) { return <Card><h3 className="text-xl font-bold">最近记录</h3><p className="mt-2 leading-7 text-[#6d6257]">小感受：{formatCounts(countNotes(notes, 'feeling'))}</p><p className="mt-1 leading-7 text-[#6d6257]">漏服原因：{formatCounts(countNotes(notes, 'missedReason'))}</p><p className="mt-3 text-sm font-semibold text-[#8a7c6f]">这些只是您的记录，复诊时可向医生说明，不代表症状与药物存在因果关系。</p></Card> }
function MedicationPlanPage({ state }: AppContext) { return <div className="space-y-5"><SectionTitle title="用药计划" subtitle="这里是示例记录，不对应真实处方；真正用药请听医生和药师的。" /><div className="grid gap-5 lg:grid-cols-3">{state.medications.map(medication => <MedicationCard key={medication.id} medication={medication} />)}</div><Card><h3 className="text-xl font-bold">核对后再保存</h3><p className="mt-2 leading-7 text-[#6d6257]">整理出来的计划要先核对医生处方，再保存使用。本页面不提供诊断、处方或剂量调整建议。</p><button className="mt-4 min-h-12 rounded-2xl bg-[#8b9b74] px-5 py-3 text-lg font-bold text-white">我已核对处方</button></Card></div> }
function InventoryPage({ state, calibrateStock, setState }: AppContext) { return <div className="space-y-5"><SectionTitle title="库存续方" subtitle="剩余天数只是数量估算，不是医疗建议。" /><div className="grid gap-5 lg:grid-cols-3">{state.medications.map(medication => { const daysLeft = getDaysLeft(medication.stockCount, medication.dailyUsage); const level = getInventoryLevel(daysLeft); return <Card key={medication.id} className={classNames(level === 'danger' && 'bg-[#fff4ee]', level === 'warning' && 'bg-[#fff8ea]')}><div className="flex items-start justify-between gap-3"><div><h3 className="text-2xl font-bold">{medication.displayName}</h3><p className="mt-1 text-sm font-semibold text-[#8a7c6f]">演示样例，请以处方为准</p></div><InventoryBadge level={level} /></div><p className="mt-4 text-4xl font-bold text-[#4a3f35]">{daysLeft} 天</p><p className="mt-2 text-[#6d6257]">库存 {medication.stockCount} 片 / 每天大约用量 {medication.dailyUsage} 片</p><p className="mt-4 rounded-2xl bg-white/70 p-4 font-semibold leading-7 text-[#6d6257]">可在复诊时请医生评估下一步安排。本提示只展示数量估算。</p><label className="mt-4 block text-sm font-bold text-[#6d6257]" htmlFor={`stock-${medication.id}`}>修改家里还剩的药量</label><input id={`stock-${medication.id}`} min={0} max={365} type="number" value={medication.stockCount} onChange={event => calibrateStock(medication.id, Number(event.target.value))} className="mt-2 w-full rounded-2xl border border-[#e4d8c9] bg-white px-4 py-3 text-lg font-bold" /></Card> })}</div><Card><h3 className="text-xl font-bold">以后可以继续完善的服务</h3><p className="mt-2 leading-7 text-[#6d6257]">下面这些只是说明可以继续完善的方向，不会跳转到真实服务。</p><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{['续方准备清单', '线上零售购药提醒', '线上复诊预约', '消息通知触达'].map(label => <button key={label} onClick={() => setState(current => ({ ...current, futureModal: '当前为体验版，不接入真实美团、医疗、药房、支付或下单接口。该模块仅展示未来在合规前提下可能连接的服务方向。' }))} className="min-h-12 rounded-2xl bg-[#f2eadf] px-4 py-3 font-bold text-[#665746]">以后可做：{label}</button>)}</div></Card></div> }
function AssistantPage({ state, runAssistantDemo, generateSummary, generateQuestions, followUpDaysLeft }: AppContext) { const isExpired = followUpDaysLeft < 0; return <div className="space-y-5"><SectionTitle title="记录整理助手" subtitle="帮您把用药记录、小感受和复诊问题整理清楚。" /><div className="grid gap-3 lg:grid-cols-4"><button onClick={() => runAssistantDemo('plan')} className="min-h-14 rounded-2xl bg-[#8b9b74] px-5 py-4 text-lg font-bold text-white">整理口述计划</button><button onClick={() => void generateSummary()} className="min-h-14 rounded-2xl bg-[#d8c39f] px-5 py-4 text-lg font-bold text-[#4a3f35]">整理复诊摘要</button><button onClick={() => void generateQuestions()} className="min-h-14 rounded-2xl bg-[#fff0d8] px-5 py-4 text-lg font-bold text-[#7c5539]">列出复诊想问的事</button><button onClick={() => runAssistantDemo('refuse')} className="min-h-14 rounded-2xl bg-[#f2eadf] px-5 py-4 text-lg font-bold text-[#665746]">试问：能不能停药？</button></div>{isExpired && <Alert tone="warning" title="复诊日期已过">复诊日期已经过了，这里先展示历史记录。您可以重新设置下次复诊时间。</Alert>}<Card><div className="mb-3 flex flex-wrap gap-2"><span className="rounded-full bg-[#fff0d8] px-3 py-1 text-sm font-bold text-[#8a6336]">只整理记录</span><span className="rounded-full bg-[#eef3e8] px-3 py-1 text-sm font-bold text-[#5f7050]">用药请核对处方</span></div><div className="whitespace-pre-wrap rounded-2xl bg-[#fff8ea] p-5 text-lg leading-9 text-[#4a3f35]">{state.assistantOutput}</div></Card></div> }
function WeekRecordPanel({ records, updateDayRecord }: { records: DayRecord[]; updateDayRecord: (date: string, patch: Partial<Omit<DayRecord, 'date'>>) => void }) {
  const planned = records.reduce((sum, day) => sum + day.planned, 0)
  const done = records.reduce((sum, day) => sum + day.done, 0)
  const rate = planned > 0 ? Math.round((done / planned) * 100) : 0
  return <Card><div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-xl font-bold">近 7 天用药记录</h2><p className="mt-2 leading-7 text-[#6d6257]">根据本地记录计算：完成 {done}/{planned} 次，约 {rate}%。过去几天可以在这里补记；今天请到打卡页记录，避免重复计算。数据只保存在浏览器本地。</p></div><span className="rounded-full bg-[#eef3e8] px-4 py-2 font-bold text-[#526446]">本周完成率 {rate}%</span></div><div className="mt-4 grid gap-3 md:grid-cols-7">{records.map(day => { const isToday = day.date === today; return <div key={day.date} className={classNames('rounded-2xl p-3', isToday ? 'bg-[#eef3e8]' : 'bg-[#f7efe5]')}><p className="font-bold">{shortDate(day.date)}{isToday ? ' ? 今天' : ''}</p><p className="mt-1 text-sm text-[#6d6257]">完成 {day.done}/{day.planned}</p><div className="mt-2 flex gap-1"><button disabled={isToday} onClick={() => updateDayRecord(day.date, { done: Math.max(0, day.done - 1) })} className="min-h-9 flex-1 rounded-xl bg-white px-2 font-bold disabled:cursor-not-allowed disabled:bg-[#d7d0c5] disabled:text-[#8a7c6f]">-</button><button disabled={isToday} onClick={() => updateDayRecord(day.date, { done: Math.min(day.planned, day.done + 1) })} className="min-h-9 flex-1 rounded-xl bg-[#8b9b74] px-2 font-bold text-white disabled:cursor-not-allowed disabled:bg-[#d7d0c5]">+</button></div>{isToday && <p className="mt-2 text-xs font-semibold text-[#6d6257]">今天从打卡页记录</p>}</div> })}</div></Card>
}


function MetricCard({ title, value, tone }: { title: string; value: string; tone: 'sage' | 'cream' | 'peach' }) { const toneClass = { sage: 'bg-[#eef3e8] text-[#526446]', cream: 'bg-[#fff8ea] text-[#6b5a45]', peach: 'bg-[#fff0df] text-[#7c5539]' }[tone]; return <Card className={toneClass}><p className="text-base font-semibold opacity-80">{title}</p><p className="mt-2 text-4xl font-bold">{value}</p></Card> }
function MedicationCard({ medication }: { medication: Medication }) { return <Card><div className="flex flex-wrap gap-2"><span className="rounded-full bg-[#fff0d8] px-3 py-1 text-sm font-bold text-[#8a6336]">演示样例，请以处方为准</span><span className="rounded-full bg-[#eef3e8] px-3 py-1 text-sm font-bold text-[#5f7050]">示例已核对</span></div><h3 className="mt-4 text-2xl font-bold">{medication.displayName}</h3><p className="mt-1 font-semibold text-[#6d6257]">{medication.exampleName}</p><dl className="mt-4 space-y-2 text-base"><InfoRow label="剂量" value={medication.doseText} /><InfoRow label="频次" value={medication.frequencyText} /><InfoRow label="库存" value={`${medication.stockCount} 片`} /><InfoRow label="每天大约用量" value={`${medication.dailyUsage} 片`} /></dl><p className="mt-4 rounded-2xl bg-[#f7efe5] p-4 text-sm font-semibold leading-7 text-[#6d6257]">{medication.note}</p></Card> }
function InfoRow({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-4"><dt className="font-semibold text-[#8a7c6f]">{label}</dt><dd className="text-right font-bold text-[#4a3f35]">{value}</dd></div> }
function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) { return <div><h2 className="text-3xl font-bold text-[#4a3f35]">{title}</h2><p className="mt-2 text-base font-medium leading-7 text-[#6d6257]">{subtitle}</p></div> }
function Card({ children, className }: { children: React.ReactNode; className?: string }) { return <div className={classNames('rounded-[1.6rem] bg-[#fffaf2] p-6 shadow-lg shadow-amber-100/45', className)}>{children}</div> }
function Alert({ title, children, tone }: { title: string; children: React.ReactNode; tone: 'warning' | 'danger' }) { const classes = tone === 'danger' ? 'bg-[#fff4ee] text-[#8a4f37]' : 'bg-[#fff8ea] text-[#7c5539]'; return <div className={classNames('rounded-[1.6rem] p-5 font-semibold leading-7 shadow-sm', classes)}><strong className="block text-lg">{title}</strong><span>{children}</span></div> }
function ActionRow({ label, onClick }: { label: string; onClick: () => void }) { return <button onClick={onClick} className="min-h-12 rounded-2xl bg-[#f2eadf] px-4 py-3 text-left font-bold text-[#665746] hover:bg-[#e9dcc8]">{label}</button> }
function InventoryBadge({ level }: { level: RiskLevel }) { const map = { normal: ['库存安心', 'bg-[#e3eedc] text-[#4f6b3e]'], warning: ['快吃完了', 'bg-[#fff0d8] text-[#8a6336]'], danger: ['需要留意', 'bg-[#fde9df] text-[#945239]'] } as const; return <span className={classNames('rounded-full px-3 py-1 text-sm font-bold', map[level][1])}>{map[level][0]}</span> }
function SafetyNotice() { return <footer className="mt-8 rounded-[1.6rem] bg-[#f2eadf] p-6 text-[#5b4b3d]"><h2 className="text-xl font-bold">温馨提示</h2><p className="mt-3 leading-8">用药要听医生和药师的，这个小工具只是帮您记着、整理记录。当前页面为体验版，所有用药计划、打卡记录和复诊信息仅保存在浏览器本地中，不上传服务器，不接入真实医疗、药房或支付接口。产品不提供诊断、处方、停药、换药或剂量调整建议。出现胸痛、呼吸困难、意识异常、严重低血糖等紧急情况，请立即拨打急救电话。</p></footer> }
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) { return <div className="fixed inset-0 z-40 flex items-end justify-center bg-[#4a3f35]/40 p-3 sm:items-center"><div className="w-full max-w-lg rounded-[1.8rem] bg-[#fffaf2] p-6 shadow-2xl"><h2 className="text-2xl font-bold">{title}</h2><div className="mt-3 text-base font-semibold leading-8 text-[#6d6257]">{children}</div><button onClick={onClose} className="mt-5 min-h-12 w-full rounded-2xl bg-[#8b9b74] px-4 py-3 text-lg font-bold text-white">我知道了</button></div></div> }










