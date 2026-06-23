import { NhostClient } from '@nhost/nhost-js';

const envSubdomain = import.meta.env.VITE_NHOST_SUBDOMAIN || '';
const envRegion = import.meta.env.VITE_NHOST_REGION || '';

export let nhost = null;

if (envSubdomain && envRegion) {
  try {
    nhost = new NhostClient({
      subdomain: envSubdomain,
      region: envRegion
    });
  } catch (e) {
    console.error("Initialization of Nhost client failed:", e);
  }
}
