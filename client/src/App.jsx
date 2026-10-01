import { AuthScreen } from './components/AuthScreen.jsx';
import { ChatApp } from './components/ChatApp.jsx';
import { useAuth } from './hooks/useAuth.jsx';
import { SocketProvider } from './hooks/useSocket.jsx';

export function App() {
  const { user, loading, revalidate } = useAuth();

  if (loading) {
    return (
      <div className="splash" role="status">
        Loading Huddle…
      </div>
    );
  }
  if (!user) return <AuthScreen />;

  // The socket lives exactly as long as the session: logging out unmounts it.
  return (
    <SocketProvider onAuthLost={revalidate}>
      <ChatApp />
    </SocketProvider>
  );
}
