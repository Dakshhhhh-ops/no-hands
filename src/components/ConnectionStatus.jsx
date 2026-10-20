import React from 'react';
import { Wifi, WifiOff, Cloud, CloudOff, Loader2 } from 'lucide-react';

export function ConnectionStatus() {
  const [isOnline, setIsOnline] = React.useState(true);
  const [wasOffline, setWasOffline] = React.useState(false);

  React.useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (wasOffline) setWasOffline(false);
    };
    const handleOffline = () => {
      setIsOnline(false);
      setWasOffline(true);
    };

    setIsOnline(navigator.onLine);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [wasOffline]);

  if (isOnline && !wasOffline) return null;

  return React.createElement('div', { className: 'va-connection-status ' + (isOnline ? 'online' : 'offline'), role: 'status', 'aria-live': 'polite' },
    isOnline ? React.createElement(React.Fragment, null,
      React.createElement(Cloud, { size: 14 }),
      React.createElement('span', null, 'Back online'),
      React.createElement(Loader2, { size: 12, className: 'va-spin' })
    ) : React.createElement(React.Fragment, null,
      React.createElement(WifiOff, { size: 14 }),
      React.createElement('span', null, 'Offline — cached data only')
    )
  );
}

export function AutoSaveIndicator({ isSaving, lastSaved }) {
  if (!lastSaved && !isSaving) return null;

  return React.createElement('div', { className: 'va-autosave-indicator ' + (isSaving ? 'saving' : 'saved'), role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' },
    React.createElement(Loader2, { size: 12, className: isSaving ? 'va-spin' : '' }),
    React.createElement('span', null, isSaving ? 'Saving…' : 'Saved ' + formatTime(lastSaved))
  );
}

function formatTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default ConnectionStatus;