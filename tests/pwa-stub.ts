import { useState } from 'react';
export function useRegisterSW() {
  return { needRefresh: useState(false), updateServiceWorker: async () => {} };
}
