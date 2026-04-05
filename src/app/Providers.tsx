'use client';

import React, { useState, useEffect } from 'react';
import { NotificationAPIProvider } from '@notificationapi/react';

export default function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const temporaryUserId = "techborteam.excel001@gmail.com";

  // On the server (and first client render), skip the NotificationAPI provider entirely
  // to prevent hydration mismatches from browser-only APIs it accesses internally.
  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <NotificationAPIProvider
      userId={temporaryUserId}
      clientId="o5ophu4m73vc39cnn3tc2oukkr"
      webPushOptInMessage={true}
    >
      {children}
    </NotificationAPIProvider>
  );
}
