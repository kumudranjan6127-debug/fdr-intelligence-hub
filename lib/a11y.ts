// Keys for the per-browser accessibility preferences set in the top bar (components/gov-controls.tsx).
export const SIZE_KEY = "a11y-text";
export const CONTRAST_KEY = "a11y-contrast";

/** Inline script for the root layout: applies a saved text size or contrast before first paint. */
export const A11Y_BOOT = `try{var d=document.documentElement,s=localStorage.getItem("${SIZE_KEY}"),c=localStorage.getItem("${CONTRAST_KEY}");if(s)d.dataset.text=s;if(c)d.dataset.contrast=c}catch(e){}`;
