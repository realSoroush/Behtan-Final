import { createContext } from 'react';

// Preview supplies embedded bytes; production serves versioned assets locally.
export const CompanionAssets = createContext({
  rive: '/mascot/behtan-companion.riv', fallback: '/mascot/behtan-rest.svg', wasm: '',
});
