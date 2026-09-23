(() => {
  const storageKey = 'GRPGI_GRAPHICS_MODE';
  let mode = 'full';
  try {
    if (localStorage.getItem(storageKey) === 'lite') mode = 'lite';
  } catch {}
  document.documentElement.dataset.graphicsMode = mode;
})();
