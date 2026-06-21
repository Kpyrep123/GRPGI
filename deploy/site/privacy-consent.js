(() => {
  const KEY = 'grpg.site.privacyConsent.v1';
  const box = document.getElementById('site-privacy-consent');
  const gated = Array.from(document.querySelectorAll('.consent-gated'));
  function accepted() {
    try { return sessionStorage.getItem(KEY) === 'yes'; } catch { return false; }
  }
  function setAccepted(value) {
    try { value ? sessionStorage.setItem(KEY, 'yes') : sessionStorage.removeItem(KEY); } catch {}
  }
  function render() {
    const ok = accepted() || Boolean(box?.checked);
    gated.forEach(link => {
      link.classList.toggle('disabled', !ok);
      link.setAttribute('aria-disabled', ok ? 'false' : 'true');
    });
  }
  if (box) {
    box.checked = accepted();
    box.addEventListener('change', () => { setAccepted(box.checked); render(); });
  }
  document.addEventListener('click', event => {
    const link = event.target.closest?.('.consent-gated');
    if (!link) return;
    if (accepted() || box?.checked) return;
    event.preventDefault();
    alert('Сначала подтвердите согласие с политикой обработки персональных данных.');
    box?.focus();
  });
  render();
})();
