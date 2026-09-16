// Blocking anti-FOUC theme init. Must run as a literal inline <script> in <head>,
// before first paint — a useEffect or deferred next/script strategy would flash the
// server-rendered dark theme for light-mode visitors on load.
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem('or-theme');if(t)document.documentElement.dataset.theme=t;}catch(e){}`;
