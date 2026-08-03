# Agora Admin Panel

React-админка для управления поставщиками и офферами Agora.

- **Репозиторий:** https://github.com/Rauan228/agota-admin-panel  
- **Backend API:** https://github.com/Rauan228/agora-backend  

## Стек

- Vite + React 19 + TypeScript  
- React Router  
- Auth: Sanctum Bearer token (`localStorage`)  

## Локально

Нужен запущенный backend на `:8000`.

```bash
cp .env.example .env
# VITE_API_URL=http://127.0.0.1:8000

npm install
npm run dev
```

Открой http://localhost:5173  

Логин (после `php artisan migrate --seed` на бэке):  
`admin@agora.local` / `password`

## Vercel

1. Import this repo  
2. Framework: Vite  
3. Env: `VITE_API_URL=https://your-api-domain.com`  
4. SPA rewrite уже в `vercel.json`  
5. На backend: `ADMIN_FRONTEND_URL=https://your-admin.vercel.app`

## Структура

```text
src/
  api/         HTTP client
  auth/        AuthContext + token
  components/  Layout, ProtectedRoute
  pages/       Login, Offers, Suppliers + forms
  types.ts
```
