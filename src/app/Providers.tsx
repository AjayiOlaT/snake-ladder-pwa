'use client';

import React from 'react';
import { NotificationAPIProvider } from '@notificationapi/react';

export default function Providers({ children }: { children: React.ReactNode }) {
  // If the user hasn't logged in yet, we can default the userId to something or conditionally render it
  // But based on Pingram's SDK, this userId must match whatever we pass from the Edge Function
  const temporaryUserId = "techborteam.excel001@gmail.com"; 

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
