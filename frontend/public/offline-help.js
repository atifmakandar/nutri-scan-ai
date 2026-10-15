/* Local-only progressive enhancement. No account, network or storage access. */
(() => {
  const languages = new Set(['en', 'hi', 'mr']);
  const links = document.querySelectorAll('[data-language]');
  const sections = document.querySelectorAll('[data-help]');
  const select = (language, focus = false) => {
    if (!languages.has(language)) return;
    document.documentElement.lang = language;
    sections.forEach((section) => { section.hidden = section.dataset.help !== language; });
    links.forEach((link) => {
      if (link.dataset.language === language) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
    if (focus) document.querySelector(`#title-${language}`).focus();
  };
  links.forEach((link) => link.addEventListener('click', (event) => {
    event.preventDefault();
    select(link.dataset.language, true);
  }));
  // Only a fixed public language fragment is read, never private URL parameters.
  select(languages.has(location.hash.slice(6)) ? location.hash.slice(6) : 'en');
  const messages = {
    en: ['No connection detected. Public help remains available.', 'Connection detected. Open the app and sign in; server availability is not confirmed.'],
    hi: ['कनेक्शन नहीं मिला। सार्वजनिक सहायता उपलब्ध है।', 'कनेक्शन मिला। ऐप खोलें और साइन इन करें; सर्वर की उपलब्धता की पुष्टि नहीं हुई है।'],
    mr: ['जोडणी आढळली नाही. सार्वजनिक मदत उपलब्ध आहे.', 'जोडणी आढळली. ॲप उघडा आणि साइन इन करा; सर्व्हर उपलब्ध असल्याची खात्री झालेली नाही.'],
  };
  const connection = () => document.querySelectorAll('[data-connection]').forEach((element) => {
    element.textContent = messages[element.dataset.connection][navigator.onLine === false ? 0 : 1];
  });
  window.addEventListener('online', connection);
  window.addEventListener('offline', connection);
  connection();
})();
