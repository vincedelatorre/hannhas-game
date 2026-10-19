// Quality tiers. Every feature reads its budget from here so the game stays at
// 60fps on a laptop and 30fps on a tablet. Override with ?q=low|medium|high|ultra.
export const TIERS = {
  low:    { name: 'low', caustics: false,    pixelRatio: 1.0,  shadowMap: 1024, cascades: 2, ao: false, bloom: false, godrays: false, contactShadows: false, aa: 'fxaa', palmsHero: 'lod', jungleDensity: 0.45, grass: 0,    waterRefraction: false },
  medium: { name: 'medium', caustics: true, pixelRatio: 1.25, shadowMap: 2048, cascades: 3, ao: false, bloom: true,  godrays: false, contactShadows: false, aa: 'smaa', palmsHero: 'hero', jungleDensity: 0.7, grass: 0.5, waterRefraction: true },
  high:   { name: 'high', caustics: true,   pixelRatio: 1.5,  shadowMap: 2048, cascades: 3, ao: true,  bloom: true,  godrays: false, contactShadows: false, aa: 'smaa', palmsHero: 'hero', jungleDensity: 1.0, grass: 1.0, waterRefraction: true },
  ultra:  { name: 'ultra', caustics: true,  pixelRatio: 2.0,  shadowMap: 4096, cascades: 4, ao: true,  bloom: true,  godrays: false, contactShadows: true,  aa: 'smaa', palmsHero: 'hero', jungleDensity: 1.0, grass: 1.0, waterRefraction: true },
};

export function pickQuality() {
  const forced = new URLSearchParams(location.search).get('q');
  if (forced && TIERS[forced]) return TIERS[forced];
  try { const saved = localStorage.getItem('hg.quality'); if (saved && TIERS[saved]) return TIERS[saved]; } catch (e) { /* storage blocked */ }
  const touch = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(screen.width, screen.height) < 900;
  const cores = navigator.hardwareConcurrency || 4;
  if (touch && small) return TIERS.low;
  if (touch || cores <= 4) return TIERS.medium;
  return TIERS.high;
}

export function saveQuality(name) { try { localStorage.setItem('hg.quality', name); } catch (e) { /* storage blocked */ } }
