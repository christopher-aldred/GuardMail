import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './index.css';
import { AuthProvider, useAuth } from './auth/AuthContext';
import App from './App';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { DocsPage } from './pages/DocsPage';
import { OpenClawPage } from './pages/OpenClawPage';
import { HermesPage } from './pages/HermesPage';
import { SendReceiveAiAgentPage } from './pages/SendReceiveAiAgentPage';
import { AiEmailUseCasesPage } from './pages/AiEmailUseCasesPage';
import { PromptInjectionDangersPage } from './pages/PromptInjectionDangersPage';
import { AiBusinessSupportPage } from './pages/AiBusinessSupportPage';
import { RestApiPage } from './pages/RestApiPage';
import { InboxPage } from './pages/InboxPage';
import { SpamPage } from './pages/SpamPage';
import { QuarantinePage } from './pages/QuarantinePage';
import { ComposePage } from './pages/ComposePage';
import { EmailDetailPage } from './pages/EmailDetailPage';
import { SettingsPage } from './pages/SettingsPage';
import { ApiPage } from './pages/ApiPage';
import { AdminPage } from './pages/AdminPage';
import { SentPage } from './pages/SentPage';
import { ScanningPage } from './pages/ScanningPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { ContactPage } from './pages/ContactPage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/" replace />;
  return <>{children}</>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/docs" element={<DocsPage />} />
          <Route path="/docs/openclaw" element={<OpenClawPage />} />
          <Route path="/docs/hermes" element={<HermesPage />} />
          <Route path="/docs/send-receive-ai-agent" element={<SendReceiveAiAgentPage />} />
          <Route path="/docs/ai-email-use-cases" element={<AiEmailUseCasesPage />} />
          <Route path="/docs/prompt-injection-dangers" element={<PromptInjectionDangersPage />} />
          <Route path="/docs/ai-business-support" element={<AiBusinessSupportPage />} />
          <Route path="/docs/api" element={<RestApiPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/app" element={<RequireAuth><App /></RequireAuth>}>
            <Route index element={<Navigate to="/app/inbox" replace />} />
            <Route path="inbox" element={<InboxPage />} />
            <Route path="scanning" element={<ScanningPage />} />
            <Route path="sent" element={<SentPage />} />
            <Route path="spam" element={<SpamPage />} />
            <Route path="quarantine" element={<QuarantinePage />} />
            <Route path="compose" element={<ComposePage />} />
            <Route path="emails/:id" element={<EmailDetailPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="api" element={<ApiPage />} />
            <Route path="admin" element={<AdminPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>,
);
