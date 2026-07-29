import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'

// ============ Migration ============
const DATA_VERSION = 2

function migrateToLatest(data) {
  if (!data) return null
  if (!data.version || data.version < 2) {
    if (data.timetable) data.timetable = data.timetable.map(i => ({ room: '', ...i }))
    if (data.homework) data.homework = data.homework.map(i => ({ notes: '', color: '', ...i }))
    data.version = 2
  }
  if (data.homework) data.homework = data.homework.map(i => ({ color: '', ...i }))
  return data
}

// ============ Settings Store ============
export const useSettingsStore = defineStore('settings', () => {
  const theme = ref(localStorage.getItem('theme') || 'light')
  const accent = ref(localStorage.getItem('accent') || '#FF6B35')

  function toggleTheme() { theme.value = theme.value === 'dark' ? 'light' : 'dark' }
  function setAccent(color) { accent.value = color }

  // ปรับความสว่างสี hex (pct ติดลบ = เข้มขึ้น)
  function shade(hex, pct) {
    const n = parseInt(hex.slice(1), 16)
    const f = c => Math.round(Math.max(0, Math.min(255,
      pct < 0 ? c * (1 + pct / 100) : c + (255 - c) * pct / 100)))
    const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255)
    return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('')
  }
  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16)
    return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`
  }

  // 🌙 Dark Mode มืดจริงทั้งเว็บ — ใส่ class ที่ <body> โดยตรง
  watch(theme, v => {
    document.body.classList.toggle('dark', v === 'dark')
    localStorage.setItem('theme', v)
  }, { immediate: true })

  // 🎨 สีธีมทั้งเว็บผ่าน CSS Variables
  watch(accent, v => {
    const s = document.documentElement.style
    s.setProperty('--primary', v)
    s.setProperty('--primary-hover', shade(v, -18))
    s.setProperty('--primary-rgb', hexToRgb(v))
    localStorage.setItem('accent', v)
  }, { immediate: true })

  return { theme, accent, toggleTheme, setAccent }
})


// ============ Timetable Store ============
export const useTimetableStore = defineStore('timetable', () => {
  const classes = ref([])
  const days = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์']

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  const COLORS = ['#FF6B6B','#4ECDC4','#45B7D1','#96CEB4','#FFEAA7','#DDA0DD','#98D8C8','#F7DC6F','#BB8FCE','#85C1E9']
  const randomColor = () => COLORS[Math.floor(Math.random() * COLORS.length)]

  function addClass(e) {
    classes.value.push({
      id: uid(), subject: e.subject||'', code: e.code||'', day: e.day||'จันทร์',
      startTime: e.startTime||'08:00', endTime: e.endTime||'09:00',
      room: e.room||'', color: e.color||randomColor(),
    })
  }
  function removeClass(id) { classes.value = classes.value.filter(c => c.id !== id) }
  function updateClass(id, data) {
    const i = classes.value.findIndex(c => c.id === id)
    if (i !== -1) classes.value[i] = { ...classes.value[i], ...data }
  }
  const classesByDay = computed(() => {
    const m = {}; days.forEach(d => m[d] = [])
    classes.value.forEach(c => { if (m[c.day]) m[c.day].push(c) })
    Object.values(m).forEach(a => a.sort((x, y) => x.startTime.localeCompare(y.startTime)))
    return m
  })

  return { classes, days, addClass, removeClass, updateClass, classesByDay }
})

// ============ Homework Store ============
export const useHomeworkStore = defineStore('homework', () => {
  const tasks = ref([])
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

  function addTask(t) {
    tasks.value.push({
      id: uid(), subject: t.subject||'', title: t.title||'',
      dueDate: t.dueDate||'', notes: t.notes||'', color: t.color||'',
      done: false, createdAt: new Date().toISOString(),
    })
  }
  function removeTask(id) { tasks.value = tasks.value.filter(t => t.id !== id) }
  function toggleDone(id) { const t = tasks.value.find(t => t.id === id); if (t) t.done = !t.done }
  function updateTask(id, data) {
    const i = tasks.value.findIndex(t => t.id === id)
    if (i !== -1) tasks.value[i] = { ...tasks.value[i], ...data }
  }
  const pending = computed(() =>
    tasks.value.filter(t => !t.done).sort((a, b) => (a.dueDate||'9').localeCompare(b.dueDate||'9'))
  )
  const completed = computed(() => tasks.value.filter(t => t.done))

  return { tasks, addTask, removeTask, toggleDone, updateTask, pending, completed }
})

// ============ Save / Load / Export / Import ============
const STORAGE_KEY = 'my-kmitl-data'

export function buildExportData(tt, hw) {
  return { version: DATA_VERSION, exportedAt: new Date().toISOString(), timetable: tt.classes, homework: hw.tasks }
}
export function saveToLocal(tt, hw) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(buildExportData(tt, hw)))
}
export function loadFromLocal(tt, hw) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY); if (!raw) return false
    let d = migrateToLatest(JSON.parse(raw))
    if (d.timetable) tt.classes = d.timetable
    if (d.homework) hw.tasks = d.homework
    return true
  } catch { return false }
}
export function importFromJSON(json, tt, hw) {
  let d = migrateToLatest(JSON.parse(json))
  if (d.timetable) tt.classes = d.timetable
  if (d.homework) hw.tasks = d.homework
  saveToLocal(tt, hw)
}
export function exportToFile(tt, hw) {
  const blob = new Blob([JSON.stringify(buildExportData(tt, hw), null, 2)], { type: 'application/json' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
  a.download = `my-kmitl-backup-${new Date().toISOString().slice(0,10)}.json`
  a.click(); URL.revokeObjectURL(a.href)
}
export function startAutosave(tt, hw, ms = 30000) {
  watch([() => [...tt.classes], () => [...hw.tasks]], () => saveToLocal(tt, hw), { deep: true })
  const timer = setInterval(() => saveToLocal(tt, hw), ms)
  return () => clearInterval(timer)
}