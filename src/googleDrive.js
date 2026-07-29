// ============================================================
// Google Drive Sync (แทนที่ระบบ Export / Import เดิม)
// ============================================================
// วิธีตั้งค่า (ทำครั้งเดียว):
// 1. ไปที่ https://console.cloud.google.com/apis/credentials
// 2. สร้างโปรเจกต์ใหม่ (หรือใช้โปรเจกต์เดิม)
// 3. เมนู "APIs & Services" > "Library" > ค้นหา "Google Drive API" > กด Enable
// 4. เมนู "Credentials" > "+ Create Credentials" > "OAuth client ID"
//    - Application type: Web application
//    - Authorized JavaScript origins: ใส่โดเมนที่ deploy จริง เช่น
//        https://phakin558.github.io
//      และถ้า dev ในเครื่องด้วย ใส่เพิ่ม เช่น http://localhost:5173
// 5. คัดลอก "Client ID" ที่ได้ มาแทนที่ CLIENT_ID ด้านล่างนี้
//
// สโคป 'drive.file' หมายความว่าแอปนี้เข้าถึงได้เฉพาะไฟล์ที่แอปสร้างเอง
// (ไม่ใช่ทั้ง Drive ของผู้ใช้) ปลอดภัยกับผู้ใช้มากที่สุด
// ============================================================

const CLIENT_ID = 'YOUR_CLIENT_ID.apps.googleusercontent.com' // <-- แก้ตรงนี้
const SCOPES = 'https://www.googleapis.com/auth/drive.file'
const FILE_NAME = 'my-kmitl-backup.json'
const TOKEN_KEY = 'gd_access_token'

let tokenClient = null
let accessToken = sessionStorage.getItem(TOKEN_KEY) || null
let fileId = null
let gisLoaded = false

// ---- สถานะ (reactive แบบง่าย ผ่าน listener) ----
let status = {
  configured: CLIENT_ID !== 'YOUR_CLIENT_ID.apps.googleusercontent.com',
  signedIn: !!accessToken,
  syncing: false,
  lastSynced: null,
  error: null,
}
const listeners = new Set()
function emit() { listeners.forEach(fn => fn({ ...status })) }
function setStatus(patch) { status = { ...status, ...patch }; emit() }
export function getDriveStatus() { return { ...status } }
export function onDriveStatusChange(fn) {
  listeners.add(fn)
  fn({ ...status })
  return () => listeners.delete(fn)
}

function loadGisScript() {
  return new Promise((resolve, reject) => {
    if (gisLoaded && window.google?.accounts?.oauth2) return resolve()
    const existing = document.querySelector('script[data-gis]')
    if (existing) { existing.addEventListener('load', resolve); return }
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.defer = true
    s.dataset.gis = 'true'
    s.onload = () => { gisLoaded = true; resolve() }
    s.onerror = () => reject(new Error('โหลด Google Identity Services ไม่สำเร็จ'))
    document.head.appendChild(s)
  })
}

export async function initGoogleDrive() {
  if (!status.configured) return // ยังไม่ได้ใส่ CLIENT_ID
  await loadGisScript()
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: () => {}, // จะถูกเซตใหม่ทุกครั้งตอนขอ token ใน signIn()
  })
}

export function signIn() {
  return new Promise((resolve, reject) => {
    if (!tokenClient) return reject(new Error('ยังไม่ได้เรียก initGoogleDrive()'))
    tokenClient.callback = (resp) => {
      if (resp.error) { setStatus({ error: resp.error }); return reject(resp) }
      accessToken = resp.access_token
      sessionStorage.setItem(TOKEN_KEY, accessToken)
      setStatus({ signedIn: true, error: null })
      resolve(accessToken)
    }
    tokenClient.requestAccessToken({ prompt: accessToken ? '' : 'consent' })
  })
}

export function signOut() {
  if (accessToken && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(accessToken, () => {})
  }
  accessToken = null
  fileId = null
  sessionStorage.removeItem(TOKEN_KEY)
  setStatus({ signedIn: false, lastSynced: null })
}

async function authFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${accessToken}` },
  })
  if (res.status === 401) {
    // token หมดอายุ -> ให้ผู้ใช้เชื่อมต่อใหม่
    signOut()
    throw new Error('เซสชัน Google หมดอายุ กรุณาเชื่อมต่อใหม่')
  }
  return res
}

async function findFile() {
  const q = encodeURIComponent(`name='${FILE_NAME}' and trashed=false`)
  const res = await authFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&spaces=drive`)
  const data = await res.json()
  return data.files?.[0]?.id || null
}

export async function saveToDrive(dataObj) {
  if (!accessToken) return
  setStatus({ syncing: true })
  try {
    if (!fileId) fileId = await findFile()
    const metadata = { name: FILE_NAME, mimeType: 'application/json' }
    const boundary = 'my_kmitl_boundary_xyz'
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(dataObj)}\r\n--${boundary}--`

    const url = fileId
      ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
      : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`

    const res = await authFetch(url, {
      method: fileId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    })
    if (!res.ok) throw new Error(await res.text())
    const saved = await res.json()
    fileId = saved.id
    setStatus({ syncing: false, lastSynced: new Date(), error: null })
  } catch (e) {
    setStatus({ syncing: false, error: String(e.message || e) })
  }
}

export async function loadFromDrive() {
  if (!accessToken) return null
  setStatus({ syncing: true })
  try {
    fileId = await findFile()
    if (!fileId) { setStatus({ syncing: false }); return null }
    const res = await authFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`)
    if (!res.ok) throw new Error(await res.text())
    const json = await res.json()
    setStatus({ syncing: false, lastSynced: new Date(), error: null })
    return json
  } catch (e) {
    setStatus({ syncing: false, error: String(e.message || e) })
    return null
  }
}
