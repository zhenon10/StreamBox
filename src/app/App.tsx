import { useCallback, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { NavigationProvider } from '@/ui/navigation/NavigationProvider';
import { HomePage } from '@/ui/pages/HomePage';
import { ChannelsPage } from '@/ui/pages/ChannelsPage';
import { PlayerPage } from '@/ui/pages/PlayerPage';
import { SettingsPage } from '@/ui/pages/SettingsPage';
import { FavoritesPage, HistoryPage } from '@/ui/pages/FavoritesHistoryPage';
import { AppProviders } from '@/app/AppProviders';
import { AppErrorBoundary } from '@/ui/components/AppErrorBoundary';
import { CrashScreen } from '@/ui/components/CrashScreen';
import { DeveloperOverlay } from '@/ui/dev/DeveloperOverlay';
import { services, TOKENS } from '@/application/di/container';

function AppRoutes(): ReactNode {
  const navigate = useNavigate();

  const handleBack = useCallback(() => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  }, [navigate]);

  return (
    <NavigationProvider onBack={handleBack}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/channels" element={<ChannelsPage />} />
        <Route path="/player/:channelId" element={<PlayerPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/favorites" element={<FavoritesPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <DeveloperOverlay />
    </NavigationProvider>
  );
}

export function App(): ReactNode {
  return (
    <AppErrorBoundary
      fallback={(error, recover) => (
        <CrashScreen
          message={error.message}
          onRecover={recover}
          onExit={() => services.resolve(TOKENS.platformContext).platform.exitApp()}
        />
      )}
    >
      <AppProviders>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AppProviders>
    </AppErrorBoundary>
  );
}
