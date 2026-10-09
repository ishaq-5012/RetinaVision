import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/hooks/useAuth';
import { ProtectedRoute, RoleRoute } from '@/components/ProtectedRoute';
import { LandingPage } from '@/pages/LandingPage';
import { LoginPage, RegisterPage } from '@/pages/AuthPages';
import { PatientDashboard } from '@/pages/PatientDashboard';
import { UploadPage } from '@/pages/UploadPage';
import { ScanHistoryPage } from '@/pages/ScanHistoryPage';
import { PredictionResultPage } from '@/pages/PredictionResultPage';
import { ExplainableAIPage } from '@/pages/ExplainableAIPage';
import { DoctorDashboard } from '@/pages/DoctorDashboard';
import { AnalyticsDashboard } from '@/pages/AnalyticsDashboard';
import { CareTeamPage } from '@/pages/CareTeamPage';
import { ResearchHubPage } from '@/pages/ResearchHubPage';
import { RoleHome } from '@/components/RoleHome';
import { Toaster } from '@/components/ui/sonner';
import { GlobalFX } from '@/components/GlobalFX';
import './App.css';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <GlobalFX />
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/home" element={<RoleHome />} />
            {/* Scan results: access is enforced by the database (owner, linked doctor) */}
            <Route path="/result/:id" element={<PredictionResultPage />} />
            <Route path="/explain/:id" element={<ExplainableAIPage />} />

            <Route element={<RoleRoute allow={['patient']} />}>
              <Route path="/dashboard" element={<PatientDashboard />} />
              <Route path="/care" element={<CareTeamPage />} />
            </Route>
            <Route element={<RoleRoute allow={['doctor']} />}>
              <Route path="/doctor" element={<DoctorDashboard />} />
            </Route>
            <Route element={<RoleRoute allow={['researcher']} />}>
              <Route path="/research" element={<ResearchHubPage />} />
            </Route>
            <Route element={<RoleRoute allow={['patient', 'doctor']} />}>
              <Route path="/upload" element={<UploadPage />} />
              <Route path="/history" element={<ScanHistoryPage />} />
              <Route path="/analytics" element={<AnalyticsDashboard />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster />
    </AuthProvider>
  );
}

export default App;
