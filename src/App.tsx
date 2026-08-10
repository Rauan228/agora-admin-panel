import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { Layout } from './components/Layout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { LeadFormPage } from './pages/LeadFormPage'
import { LeadsPage } from './pages/LeadsPage'
import { LoginPage } from './pages/LoginPage'
import { OfferFormPage } from './pages/OfferFormPage'
import { OffersPage } from './pages/OffersPage'
import { SupplierFormPage } from './pages/SupplierFormPage'
import { SuppliersPage } from './pages/SuppliersPage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Navigate to="/offers" replace />} />
            <Route path="/offers" element={<OffersPage />} />
            <Route path="/offers/new" element={<OfferFormPage />} />
            <Route path="/offers/:id" element={<OfferFormPage />} />
            <Route path="/suppliers" element={<SuppliersPage />} />
            <Route path="/suppliers/new" element={<SupplierFormPage />} />
            <Route path="/suppliers/:id" element={<SupplierFormPage />} />
            <Route path="/leads" element={<LeadsPage />} />
            <Route path="/leads/new" element={<LeadFormPage />} />
            <Route path="/leads/:id" element={<LeadFormPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/offers" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
