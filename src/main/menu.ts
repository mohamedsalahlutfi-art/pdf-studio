import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import type { Language, MenuCommand } from '../shared/types'

const labels = {
  en: {
    file: 'File', open: 'Open…', save: 'Save', saveAs: 'Save As…', closeTab: 'Close Tab',
    edit: 'Edit', undo: 'Undo', redo: 'Redo',
    view: 'View', zoomIn: 'Zoom In', zoomOut: 'Zoom Out', zoomReset: 'Actual Size', fitWidth: 'Fit Width',
    sidebar: 'Toggle Thumbnails', theme: 'Toggle Dark Mode', invert: 'Dark Pages',
    page: 'Pages', rotateCw: 'Rotate Clockwise', rotateCcw: 'Rotate Counterclockwise',
    deletePages: 'Delete Pages', duplicate: 'Duplicate Pages', extract: 'Extract Pages to New File',
    insertFile: 'Insert from File…', insertBlank: 'Insert Blank Page', split: 'Split Document…',
    mergeAll: 'Merge All Open Files', labels: 'Page Numbering…', selectAll: 'Select All Pages',
    saveHint: 'Save (to Downloads)'
  },
  ar: {
    file: 'ملف', open: 'فتح…', save: 'حفظ', saveAs: 'حفظ باسم…', closeTab: 'إغلاق التبويب',
    edit: 'تحرير', undo: 'تراجع', redo: 'إعادة',
    view: 'عرض', zoomIn: 'تكبير', zoomOut: 'تصغير', zoomReset: 'الحجم الفعلي', fitWidth: 'ملاءمة العرض',
    sidebar: 'إظهار/إخفاء المصغرات', theme: 'الوضع الليلي', invert: 'صفحات داكنة',
    page: 'الصفحات', rotateCw: 'تدوير مع عقارب الساعة', rotateCcw: 'تدوير عكس عقارب الساعة',
    deletePages: 'حذف الصفحات', duplicate: 'تكرار الصفحات', extract: 'استخراج الصفحات لملف جديد',
    insertFile: 'إدراج من ملف…', insertBlank: 'إدراج صفحة فارغة', split: 'تقسيم المستند…',
    mergeAll: 'دمج كل الملفات المفتوحة', labels: 'ترقيم الصفحات…', selectAll: 'تحديد كل الصفحات',
    saveHint: 'حفظ (في التنزيلات)'
  }
} satisfies Record<Language, Record<string, string>>

export function buildMenu(win: BrowserWindow, language: Language, isDev: boolean): void {
  const l = labels[language]
  const item = (label: string, command: MenuCommand, accelerator?: string): MenuItemConstructorOptions => ({
    label,
    accelerator,
    click: () => win.webContents.send('menu', command)
  })

  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
    {
      label: l.file,
      submenu: [
        item(l.open, 'open', 'CmdOrCtrl+O'),
        item(l.saveHint, 'save', 'CmdOrCtrl+S'),
        item(l.saveAs, 'save-as', 'CmdOrCtrl+Shift+S'),
        { type: 'separator' },
        item(l.closeTab, 'close-tab', 'CmdOrCtrl+W'),
        ...(process.platform === 'darwin' ? [] : [{ type: 'separator' as const }, { role: 'quit' as const }])
      ]
    },
    {
      label: l.edit,
      submenu: [
        item(l.undo, 'undo', 'CmdOrCtrl+Z'),
        item(l.redo, 'redo', process.platform === 'darwin' ? 'Cmd+Shift+Z' : 'Ctrl+Y'),
        { type: 'separator' },
        { role: 'copy' },
        item(l.selectAll, 'select-all', 'CmdOrCtrl+A')
      ]
    },
    {
      label: l.view,
      submenu: [
        item(l.zoomIn, 'zoom-in', 'CmdOrCtrl+='),
        item(l.zoomOut, 'zoom-out', 'CmdOrCtrl+-'),
        item(l.zoomReset, 'zoom-reset', 'CmdOrCtrl+0'),
        item(l.fitWidth, 'fit-width', 'CmdOrCtrl+2'),
        { type: 'separator' },
        item(l.sidebar, 'toggle-sidebar', 'F4'),
        item(l.theme, 'toggle-theme', 'CmdOrCtrl+Shift+D'),
        item(l.invert, 'toggle-invert', 'CmdOrCtrl+Shift+I'),
        ...(isDev ? [{ type: 'separator' as const }, { role: 'toggleDevTools' as const }, { role: 'reload' as const }] : [])
      ]
    },
    {
      label: l.page,
      submenu: [
        item(l.rotateCw, 'rotate-cw', 'CmdOrCtrl+R'),
        item(l.rotateCcw, 'rotate-ccw', 'CmdOrCtrl+Shift+R'),
        { type: 'separator' },
        item(l.insertFile, 'insert-file', 'CmdOrCtrl+I'),
        item(l.insertBlank, 'insert-blank', 'CmdOrCtrl+Shift+N'),
        item(l.duplicate, 'duplicate-pages', 'CmdOrCtrl+D'),
        item(l.deletePages, 'delete-pages'),
        { type: 'separator' },
        item(l.extract, 'extract-pages', 'CmdOrCtrl+E'),
        item(l.split, 'split'),
        item(l.mergeAll, 'merge-all', 'CmdOrCtrl+M'),
        { type: 'separator' },
        item(l.labels, 'page-labels')
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
