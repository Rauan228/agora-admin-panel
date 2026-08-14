import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 rounded-lg text-sm font-medium transition ${
    isActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
  }`

export function Layout() {
  const { user, logout } = useAuth()

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl dash-nav-inner items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-6">
            <NavLink to="/" className="text-lg font-semibold tracking-tight dash-brand">
              Agora Admin
            </NavLink>
            <nav className="flex gap-1">
              <NavLink to="/" end className={linkClass}>
                Сводка
              </NavLink>
              <NavLink to="/offers" className={linkClass}>
                Офферы
              </NavLink>
              <NavLink to="/suppliers" className={linkClass}>
                Поставщики
              </NavLink>
              <NavLink to="/ai" className={linkClass}>
                ИИ-подбор
              </NavLink>
              <NavLink to="/ai/sessions" className={linkClass}>
                Чаты
              </NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-500">{user?.email}</span>
            <button
              type="button"
              onClick={() => logout()}
              className="rounded-lg border px-3 py-1.5 hover:bg-slate-50"
            >
              Выйти
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 ai-main dash-main">
        <Outlet />
      </main>
    </div>
  )
}
