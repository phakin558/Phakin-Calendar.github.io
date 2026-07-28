import { defineComponent, ref, computed, onMounted } from 'vue'
import {
  useSettingsStore, useTimetableStore, useHomeworkStore,
  loadFromLocal, startAutosave, exportToFile, importFromJSON,
} from './stores.js'

// ===== Grid config =====
const GRID_START = 8 * 60      // 08:00
const GRID_END = 18 * 60       // 18:00
const STEP = 30                // 30 นาที/ช่อง
const N_SLOTS = (GRID_END - GRID_START) / STEP

const DAY_COLORS = {
  'จันทร์': '#FFD93D', 'อังคาร': '#FF6BC1', 'พุธ': '#4CAF50',
  'พฤหัสบดี': '#FF8C42', 'ศุกร์': '#B983FF', 'เสาร์': '#5B6CF9', 'อาทิตย์': '#FF5A5A',
}

const timeToMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
const minToTime = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi))

export default defineComponent({
  setup() {
        // ===== Theme Customizer =====
    const showThemePanel = ref(false)
    const PRESETS = ['#FF6B35', '#E64980', '#7048E8', '#1C7ED6', '#0CA678', '#F59F00', '#FF3B30', '#12B886']

    const settings = useSettingsStore()
    const timetable = useTimetableStore()
    const homework = useHomeworkStore()

    const activeTab = ref('timetable')
    const viewMode = ref('grid')   // 'grid' | 'list'

    // ===== Slot labels: "8:00 - 8:30" ... =====
    const slotLabels = computed(() => {
      const out = []
      for (let m = GRID_START; m < GRID_END; m += STEP)
        out.push(`${minToTime(m)} - ${minToTime(m + STEP)}`)
      return out
    })

    // ===== Grid block position =====
    function blockStyle(c) {
      const s = clamp(timeToMin(c.startTime), GRID_START, GRID_END - STEP)
      const e = clamp(timeToMin(c.endTime), s + STEP, GRID_END)
      const total = GRID_END - GRID_START
      return {
        left: ((s - GRID_START) / total * 100) + '%',
        width: ((e - s) / total * 100) + '%',
        background: c.color,
      }
    }

    // ===== Drag & Drop =====
    const dragging = ref(null)         // { id, duration, offsetMin }
    const hoverCell = ref(null)        // 'day-idx' สำหรับ highlight

    function onDragStart(ev, c) {
      const duration = timeToMin(c.endTime) - timeToMin(c.startTime)
      const rect = ev.currentTarget.getBoundingClientRect()
      const ratio = (ev.clientX - rect.left) / rect.width
      dragging.value = {
        id: c.id, duration,
        offsetMin: Math.floor(ratio * duration / STEP) * STEP,
      }
      ev.dataTransfer.effectAllowed = 'move'
      ev.dataTransfer.setData('text/plain', c.id)
    }
    function onDragEnd() { dragging.value = null; hoverCell.value = null }
    function onDragOverCell(day, i) { hoverCell.value = `${day}-${i}` }
    function onDrop(day, slotIdx) {
      if (!dragging.value) return
      const d = dragging.value
      let start = GRID_START + slotIdx * STEP - d.offsetMin
      start = clamp(start, GRID_START, GRID_END - d.duration)
      timetable.updateClass(d.id, {
        day,
        startTime: minToTime(start),
        endTime: minToTime(start + d.duration),
      })
      onDragEnd()
    }

    // ===== Class Form =====
    const showClassForm = ref(false)
    const editingClassId = ref(null)
    const cf = ref(emptyCF())
    function emptyCF() { return { subject:'', code:'', day:'จันทร์', startTime:'08:00', endTime:'09:00', room:'', color:'#4ECDC4' } }
    function submitClass() {
      if (!cf.value.subject) return
      editingClassId.value
        ? timetable.updateClass(editingClassId.value, { ...cf.value })
        : timetable.addClass({ ...cf.value })
      cancelCF()
    }
    function editClass(c) {
      editingClassId.value = c.id
      cf.value = { subject:c.subject, code:c.code, day:c.day, startTime:c.startTime, endTime:c.endTime, room:c.room, color:c.color }
      showClassForm.value = true
    }
    function cancelCF() { showClassForm.value = false; editingClassId.value = null; cf.value = emptyCF() }

    // ดับเบิลคลิกช่องว่าง = เพิ่มวิชาที่วัน/เวลานั้น
    function addAt(day, slotIdx) {
      const start = GRID_START + slotIdx * STEP
      cf.value = { ...emptyCF(), day, startTime: minToTime(start), endTime: minToTime(Math.min(start + 90, GRID_END)) }
      editingClassId.value = null
      showClassForm.value = true
    }

    // ===== Task Form =====
    const showTaskForm = ref(false)
    const editingTaskId = ref(null)
    const tf = ref(emptyTF())
    function emptyTF() { return { subject:'', title:'', dueDate:'', notes:'' } }
    function submitTask() {
      if (!tf.value.title) return
      editingTaskId.value
        ? homework.updateTask(editingTaskId.value, { ...tf.value })
        : homework.addTask({ ...tf.value })
      cancelTF()
    }
    function editTask(t) {
      editingTaskId.value = t.id
      tf.value = { subject:t.subject, title:t.title, dueDate:t.dueDate, notes:t.notes }
      showTaskForm.value = true
    }
    function cancelTF() { showTaskForm.value = false; editingTaskId.value = null; tf.value = emptyTF() }

    // ===== Import / Export =====
    function handleExport() { exportToFile(timetable, homework) }
    function handleImport() {
      const input = document.createElement('input'); input.type = 'file'; input.accept = '.json'
      input.onchange = e => {
        const f = e.target.files[0]; if (!f) return
        const r = new FileReader()
        r.onload = ev => {
          try { importFromJSON(ev.target.result, timetable, homework); alert('นำเข้าสำเร็จ!') }
          catch { alert('ไฟล์ไม่ถูกต้อง') }
        }
        r.readAsText(f)
      }
      input.click()
    }

    // ===== Helpers =====
    function fmtDate(d) {
      if (!d) return 'ไม่ระบุ'
      return new Date(d).toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'numeric' })
    }
    function isOverdue(d) { return d && new Date(d) < new Date(new Date().toDateString()) }

    onMounted(() => { loadFromLocal(timetable, homework); startAutosave(timetable, homework) })

    return {
      settings, timetable, homework, activeTab, viewMode,
      slotLabels, blockStyle, DAY_COLORS,
      dragging, hoverCell, onDragStart, onDragEnd, onDragOverCell, onDrop, addAt,
      showClassForm, editingClassId, cf, submitClass, editClass, cancelCF,
      showTaskForm, editingTaskId, tf, submitTask, editTask, cancelTF,
      handleExport, handleImport, fmtDate, isOverdue,
    }
  },

  template: /* html */ `
<div class="app" :class="settings.theme">

  <header>
    <div class="header-inner">
      <h1>🎓 MY KMITL</h1>
            <div class="header-actions">
        <button class="icon-btn" @click="showThemePanel = !showThemePanel" title="ปรับแต่งธีม">🎨</button>
        <button class="icon-btn" @click="settings.toggleTheme">
          {{ settings.theme === 'dark' ? '☀️' : '🌙' }}
        </button>
        <button class="sm-btn" @click="handleExport">📤 Export</button>
        <button class="sm-btn" @click="handleImport">📥 Import</button>

        <div class="theme-panel" v-if="showThemePanel">
          <h4>🎨 สีธีมของเว็บ</h4>
          <div class="swatches">
            <div v-for="c in PRESETS" :key="c"
                 class="swatch"
                 :class="{ selected: settings.accent === c }"
                 :style="{ background: c }"
                 @click="settings.setAccent(c)"></div>
          </div>
          <div class="custom-row">
            <span>สีกำหนดเอง:</span>
            <input type="color" :value="settings.accent"
                   @input="settings.setAccent($event.target.value)">
          </div>
        </div>
      </div>

  </header>

  <nav class="tabs">
    <button :class="{ active: activeTab === 'timetable' }" @click="activeTab = 'timetable'">📅 ตารางเรียน</button>
    <button :class="{ active: activeTab === 'homework' }" @click="activeTab = 'homework'">📝 การบ้าน</button>
  </nav>

  <main>
    <!-- ============ TIMETABLE ============ -->
    <section v-if="activeTab === 'timetable'">
      <div class="section-header">
        <h2>ตารางเรียน</h2>
        <div style="display:flex; gap:0.5rem; align-items:center;">
          <div class="view-toggle">
            <button :class="{ active: viewMode === 'grid' }" @click="viewMode = 'grid'">🗓️ ตาราง</button>
            <button :class="{ active: viewMode === 'list' }" @click="viewMode = 'list'">📋 รายการ</button>
          </div>
          <button class="primary-btn" v-if="!showClassForm" @click="showClassForm = true">+ เพิ่มวิชา</button>
        </div>
      </div>

      <!-- Form -->
      <div class="form-card" v-if="showClassForm">
        <h3>{{ editingClassId ? 'แก้ไขวิชา' : 'เพิ่มวิชาใหม่' }}</h3>
        <div class="form-grid">
          <div class="field"><label>ชื่อวิชา *</label><input v-model="cf.subject" placeholder="เช่น Programming Fun"></div>
          <div class="field"><label>รหัสวิชา</label><input v-model="cf.code" placeholder="เช่น 06016001"></div>
          <div class="field"><label>วัน</label>
            <select v-model="cf.day"><option v-for="d in timetable.days" :key="d">{{ d }}</option></select>
          </div>
          <div class="field"><label>เริ่ม</label><input type="time" v-model="cf.startTime" step="1800"></div>
          <div class="field"><label>สิ้นสุด</label><input type="time" v-model="cf.endTime" step="1800"></div>
          <div class="field"><label>ห้องเรียน</label><input v-model="cf.room" placeholder="เช่น [224] จุฬาภรณ 1"></div>
          <div class="field"><label>สี</label><input type="color" v-model="cf.color"></div>
        </div>
        <div class="form-actions">
          <button class="primary-btn" @click="submitClass">{{ editingClassId ? 'บันทึก' : 'เพิ่ม' }}</button>
          <button class="ghost-btn" @click="cancelCF">ยกเลิก</button>
        </div>
      </div>

      <!-- ======= GRID VIEW ======= -->
      <div v-if="viewMode === 'grid'">
        <div class="grid-wrap">
          <div class="grid-inner">
            <div class="grid-header">
              <div class="grid-corner"></div>
              <div class="grid-timelabel" v-for="(s, i) in slotLabels" :key="i">{{ s }}</div>
            </div>
            <div class="grid-row" v-for="day in timetable.days" :key="day">
              <div class="grid-daylabel" :style="{ background: DAY_COLORS[day] }">{{ day }}</div>
              <div class="grid-track">
                <div v-for="(s, i) in slotLabels" :key="i"
                     class="grid-cell"
                     :class="{ 'drop-hover': hoverCell === day + '-' + i }"
                     @dragover.prevent="onDragOverCell(day, i)"
                     @dragleave="hoverCell = null"
                     @drop.prevent="onDrop(day, i)"
                     @dblclick="addAt(day, i)"></div>
                <div v-for="c in timetable.classesByDay[day]" :key="c.id"
                     class="grid-block"
                     :class="{ 'is-dragging': dragging && dragging.id === c.id }"
                     :style="blockStyle(c)"
                     draggable="true"
                     @dragstart="onDragStart($event, c)"
                     @dragend="onDragEnd"
                     @dblclick.stop="editClass(c)">
                  <span class="gb-title">{{ c.subject }}</span>
                  <span class="gb-sub">{{ c.startTime }}–{{ c.endTime }}<template v-if="c.room"> · {{ c.room }}</template></span>
                  <button class="gb-del" @click.stop="timetable.removeClass(c.id)">✕</button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <p class="grid-hint">💡 ลากบล็อกเพื่อย้ายวัน/เวลา · ดับเบิลคลิกช่องว่างเพื่อเพิ่มวิชา · ดับเบิลคลิกบล็อกเพื่อแก้ไข · ชี้ที่บล็อกแล้วกด ✕ เพื่อลบ</p>
      </div>

      <!-- ======= LIST VIEW ======= -->
      <div class="timetable" v-else>
        <template v-for="day in timetable.days" :key="day">
          <div class="day-row" v-if="timetable.classesByDay[day]?.length">
            <div class="day-label">{{ day }}</div>
            <div class="day-classes">
              <div v-for="c in timetable.classesByDay[day]" :key="c.id"
                   class="class-card" :style="{ borderLeftColor: c.color }">
                <div class="class-info">
                  <strong>{{ c.subject }}</strong>
                  <span class="class-meta">
                    🕐 {{ c.startTime }} – {{ c.endTime }}
                    <span v-if="c.room"> · 📍 {{ c.room }}</span>
                    <span v-if="c.code"> · {{ c.code }}</span>
                  </span>
                </div>
                <div class="card-actions">
                  <button @click="editClass(c)">✏️</button>
                  <button @click="timetable.removeClass(c.id)">🗑️</button>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>

      <div v-if="timetable.classes.length === 0" class="empty">
        ยังไม่มีวิชาเรียน — ดับเบิลคลิกช่องว่างในตาราง หรือกด <strong>+ เพิ่มวิชา</strong> เพื่อเริ่มต้น!
      </div>
    </section>

    <!-- ============ HOMEWORK ============ -->
      <section v-if="activeTab === 'homework'" class="narrow">

      <div class="section-header">
        <h2>การบ้าน & งาน</h2>
        <button class="primary-btn" v-if="!showTaskForm" @click="showTaskForm = true">+ เพิ่มงาน</button>
      </div>

      <div class="form-card" v-if="showTaskForm">
        <h3>{{ editingTaskId ? 'แก้ไขงาน' : 'เพิ่มงานใหม่' }}</h3>
        <div class="form-grid">
          <div class="field"><label>ชื่องาน *</label><input v-model="tf.title" placeholder="เช่น ส่ง Lab Report"></div>
          <div class="field"><label>วิชา</label><input v-model="tf.subject" placeholder="เช่น Physics 1"></div>
          <div class="field"><label>กำหนดส่ง</label><input type="date" v-model="tf.dueDate"></div>
          <div class="field full"><label>หมายเหตุ</label><textarea v-model="tf.notes" rows="2" placeholder="โน้ตเพิ่มเติม..."></textarea></div>
        </div>
        <div class="form-actions">
          <button class="primary-btn" @click="submitTask">{{ editingTaskId ? 'บันทึก' : 'เพิ่ม' }}</button>
          <button class="ghost-btn" @click="cancelTF">ยกเลิก</button>
        </div>
      </div>

      <div class="task-section" v-if="homework.pending.length">
        <h3>📌 ยังไม่เสร็จ ({{ homework.pending.length }})</h3>
        <div v-for="t in homework.pending" :key="t.id"
             class="task-card" :class="{ overdue: isOverdue(t.dueDate) }">
          <div class="task-check" @click="homework.toggleDone(t.id)">☐</div>
          <div class="task-info">
            <strong>{{ t.title }}</strong>
            <span class="task-meta">
              <span v-if="t.subject">📚 {{ t.subject }}</span>
              <span :class="{ 'overdue-text': isOverdue(t.dueDate) }">📅 {{ fmtDate(t.dueDate) }}</span>
            </span>
            <span v-if="t.notes" class="task-notes">{{ t.notes }}</span>
          </div>
          <div class="card-actions">
            <button @click="editTask(t)">✏️</button>
            <button @click="homework.removeTask(t.id)">🗑️</button>
          </div>
        </div>
      </div>

      <div class="task-section" v-if="homework.completed.length">
        <h3>✅ เสร็จแล้ว ({{ homework.completed.length }})</h3>
        <div v-for="t in homework.completed" :key="t.id" class="task-card done">
          <div class="task-check" @click="homework.toggleDone(t.id)">☑</div>
          <div class="task-info"><strong>{{ t.title }}</strong>
            <span class="task-meta"><span v-if="t.subject">📚 {{ t.subject }}</span></span>
          </div>
          <div class="card-actions"><button @click="homework.removeTask(t.id)">🗑️</button></div>
        </div>
      </div>

      <div v-if="homework.tasks.length === 0" class="empty">
        ยังไม่มีการบ้าน กด <strong>+ เพิ่มงาน</strong> เพื่อเริ่มต้น! 🎉
      </div>
    </section>
  </main>

  <footer><p>MY KMITL — Student Planner 💛</p></footer>
</div>
  `,
})
